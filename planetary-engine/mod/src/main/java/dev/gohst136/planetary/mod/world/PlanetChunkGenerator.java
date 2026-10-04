package dev.gohst136.planetary.mod.world;

import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.PlaneUnwrap;
import dev.gohst136.planetary.planet.VerticalMap;
import dev.gohst136.planetary.terrain.RealisticTerrain;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.server.level.WorldGenRegion;
import net.minecraft.world.level.LevelHeightAccessor;
import net.minecraft.world.level.NaturalSpawner;
import net.minecraft.world.level.NoiseColumn;
import net.minecraft.world.level.StructureManager;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.BiomeManager;
import net.minecraft.world.level.biome.BiomeSource;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.ChunkAccess;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.chunk.LevelChunkSection;
import net.minecraft.world.level.levelgen.GenerationStep;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.LegacyRandomSource;
import net.minecraft.world.level.levelgen.RandomState;
import net.minecraft.world.level.levelgen.WorldgenRandom;
import net.minecraft.world.level.levelgen.blending.Blender;
import net.minecraft.util.RandomSource;

import java.util.List;
import java.util.concurrent.CompletableFuture;

/**
 * Fills real chunks from the planet: each block column (x, z) of the vanilla plane maps to a sphere direction
 * ({@link PlaneUnwrap#inverse}), and {@link RealisticTerrain} gives height, rivers and climate there, the same function the
 * far-field mesh uses. Biomes come from {@link PlanetBiomeSource}, so vanilla vegetation features grow where the planet says
 * forest. Vertical mapping: {@link VerticalMap} (sea level Y 0, min_y -256, 1536 high).
 * No caves, no ore veins and no villages in this first version (structure sets still apply through the biome source).
 */
public final class PlanetChunkGenerator extends ChunkGenerator {
    public static final MapCodec<PlanetChunkGenerator> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
            BiomeSource.CODEC.fieldOf("biome_source").forGetter(g -> g.biomeSource),
            Codec.LONG.optionalFieldOf("seed", PlanetWorld.DEFAULT_SEED).forGetter(g -> g.seed)
    ).apply(i, i.stable(PlanetChunkGenerator::new)));

    /** Telemetry: chunks filled and total nanoseconds spent in fillFromNoise (all threads). */
    public static final java.util.concurrent.atomic.AtomicLong CHUNKS = new java.util.concurrent.atomic.AtomicLong(), CHUNK_NANOS = new java.util.concurrent.atomic.AtomicLong();

    public static String stats() {
        long n = CHUNKS.get();
        return "chunks filled=" + n + " avg=" + (n == 0 ? 0 : CHUNK_NANOS.get() / n / 1_000_000) + " ms/chunk, biome column evals=" + PlanetBiomeSource.COLUMN_EVALS.get();
    }

    public final long seed;
    private final RealisticTerrain terrain;
    private final double half;

    public PlanetChunkGenerator(BiomeSource biomeSource, long seed) {
        super(biomeSource);
        this.seed = seed;
        this.terrain = PlanetWorld.terrain(seed);
        this.half = PlanetWorld.halfSpan(seed);
    }

    @Override protected MapCodec<? extends ChunkGenerator> codec() { return CODEC; }

    /** One resolved block column. */
    private record Column(int groundY, int waterTopY, boolean river, boolean ocean, RealisticTerrain.Surface s) {}

    private Column column(int x, int z) {
        Vec3 d = PlaneUnwrap.inverse(x + 0.5, z + 0.5, half);
        RealisticTerrain.Surface s = terrain.surface(d, 1.0);
        int ground = (int) Math.floor(VerticalMap.toBlockY(s.height()));
        boolean ocean = s.height() < 0.0;
        boolean river = !ocean && s.river() > 0.7;
        int water = ocean ? Math.max(ground, VerticalMap.SEA_LEVEL) : (river ? ground + 1 : Integer.MIN_VALUE);
        return new Column(ground, water, river, ocean, s);
    }

    @Override
    public CompletableFuture<ChunkAccess> fillFromNoise(Blender blender, RandomState random, StructureManager structures, ChunkAccess chunk) {
        long t0 = System.nanoTime();
        Heightmap oceanFloor = chunk.getOrCreateHeightmapUnprimed(Heightmap.Types.OCEAN_FLOOR_WG);
        Heightmap surface = chunk.getOrCreateHeightmapUnprimed(Heightmap.Types.WORLD_SURFACE_WG);
        int minX = chunk.getPos().getMinBlockX(), minZ = chunk.getPos().getMinBlockZ();
        int minY = chunk.getMinBuildHeight(), maxY = chunk.getMaxBuildHeight() - 1;
        BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
        BlockState stone = Blocks.STONE.defaultBlockState(), water = Blocks.WATER.defaultBlockState();
        for (int lx = 0; lx < 16; lx++) {
            for (int lz = 0; lz < 16; lz++) {
                Column c = column(minX + lx, minZ + lz);
                int top = Math.max(minY + 1, Math.min(maxY, c.groundY()));
                BlockState topBlock = surfaceBlock(c), filler = fillerBlock(c);
                for (int y = minY; y <= top; y++) {
                    BlockState st = y == minY ? Blocks.BEDROCK.defaultBlockState() : (y == top ? topBlock : (y >= top - 3 ? filler : stone));
                    setBlock(chunk, lx, y, lz, st);
                }
                oceanFloor.update(lx, top, lz, topBlock);
                surface.update(lx, top, lz, topBlock);
                if (c.waterTopY() > top) {
                    int wt = Math.min(maxY, c.waterTopY());
                    for (int y = top + 1; y <= wt; y++) setBlock(chunk, lx, y, lz, (c.ocean() && y == wt && c.s().temperature() < -8) ? Blocks.ICE.defaultBlockState() : water);
                    surface.update(lx, wt, lz, water);
                }
            }
        }
        CHUNKS.incrementAndGet(); CHUNK_NANOS.addAndGet(System.nanoTime() - t0);
        return CompletableFuture.completedFuture(chunk);
    }

    private static void setBlock(ChunkAccess chunk, int lx, int y, int lz, BlockState st) {
        LevelChunkSection sec = chunk.getSection(chunk.getSectionIndex(y));
        sec.setBlockState(lx, y & 15, lz, st, false);
    }

    private static BlockState surfaceBlock(Column c) {
        var s = c.s();
        double h = s.height(), t = s.temperature(), m = s.moisture();
        if (c.ocean()) {
            if (h > -6) return Blocks.SAND.defaultBlockState();
            return h > -60 ? Blocks.SAND.defaultBlockState() : (m > 0.5 ? Blocks.CLAY.defaultBlockState() : Blocks.GRAVEL.defaultBlockState());
        }
        if (c.river()) return Blocks.GRAVEL.defaultBlockState();
        if (h > 3400.0 || t < -12.0) return Blocks.SNOW_BLOCK.defaultBlockState();
        if (h > 2200.0) return Blocks.STONE.defaultBlockState();
        if (h < 4.0 && s.continental() < 0.045) return Blocks.SAND.defaultBlockState();
        if (t > 14.0 && m < 0.2) return Blocks.SAND.defaultBlockState();
        return Blocks.GRASS_BLOCK.defaultBlockState();
    }

    private static BlockState fillerBlock(Column c) {
        BlockState top = surfaceBlock(c);
        if (top.is(Blocks.SAND)) return Blocks.SANDSTONE.defaultBlockState();
        if (top.is(Blocks.STONE) || top.is(Blocks.SNOW_BLOCK)) return Blocks.STONE.defaultBlockState();
        if (top.is(Blocks.GRAVEL) || top.is(Blocks.CLAY)) return Blocks.GRAVEL.defaultBlockState();
        return Blocks.DIRT.defaultBlockState();
    }

    @Override
    public int getBaseHeight(int x, int z, Heightmap.Types type, LevelHeightAccessor level, RandomState random) {
        Column c = column(x, z);
        int ground = Math.max(level.getMinBuildHeight() + 1, Math.min(level.getMaxBuildHeight() - 1, c.groundY()));
        boolean wantsWater = type == Heightmap.Types.WORLD_SURFACE || type == Heightmap.Types.WORLD_SURFACE_WG
                || type == Heightmap.Types.MOTION_BLOCKING || type == Heightmap.Types.MOTION_BLOCKING_NO_LEAVES;
        return (wantsWater && c.waterTopY() > ground ? c.waterTopY() : ground) + 1;
    }

    @Override
    public NoiseColumn getBaseColumn(int x, int z, LevelHeightAccessor level, RandomState random) {
        Column c = column(x, z);
        int min = level.getMinBuildHeight(), n = level.getHeight();
        BlockState[] states = new BlockState[n];
        for (int i = 0; i < n; i++) {
            int y = min + i;
            states[i] = y <= c.groundY() ? Blocks.STONE.defaultBlockState() : (y <= c.waterTopY() ? Blocks.WATER.defaultBlockState() : Blocks.AIR.defaultBlockState());
        }
        return new NoiseColumn(min, states);
    }

    @Override public void applyCarvers(WorldGenRegion region, long seed, RandomState random, BiomeManager biomes, StructureManager structures, ChunkAccess chunk, GenerationStep.Carving step) {}
    @Override public void buildSurface(WorldGenRegion region, StructureManager structures, RandomState random, ChunkAccess chunk) {}

    @Override
    public void spawnOriginalMobs(WorldGenRegion region) {
        var chunkPos = region.getCenter();
        Holder<Biome> biome = region.getBiome(chunkPos.getWorldPosition().atY(region.getMaxBuildHeight() - 1));
        WorldgenRandom rnd = new WorldgenRandom(new LegacyRandomSource(RandomSource.create().nextLong()));
        rnd.setDecorationSeed(region.getSeed(), chunkPos.getMinBlockX(), chunkPos.getMinBlockZ());
        NaturalSpawner.spawnMobsForChunkGeneration(region, biome, chunkPos, rnd);
    }

    @Override public int getGenDepth() { return VerticalMap.HEIGHT; }
    @Override public int getSeaLevel() { return VerticalMap.SEA_LEVEL; }
    @Override public int getMinY() { return VerticalMap.MIN_Y; }

    @Override
    public void addDebugScreenInfo(List<String> info, RandomState random, BlockPos pos) {
        Vec3 d = PlaneUnwrap.inverse(pos.getX() + 0.5, pos.getZ() + 0.5, half);
        info.add(String.format("Planetary: lat %.2f lon %.2f edge %.2f", Math.toDegrees(Math.asin(d.y())), Math.toDegrees(Math.atan2(d.z(), d.x())), PlaneUnwrap.edgeDistance(d)));
    }
}
