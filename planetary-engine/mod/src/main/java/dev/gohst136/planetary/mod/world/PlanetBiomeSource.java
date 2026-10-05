package dev.gohst136.planetary.mod.world;

import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.PlaneUnwrap;
import dev.gohst136.planetary.terrain.RealisticTerrain;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderGetter;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.RegistryOps;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.BiomeSource;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.biome.Climate;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Stream;

/** Picks vanilla biomes from the planet's own climate model, so real chunks (and their vegetation features) match the mesh. */
public final class PlanetBiomeSource extends BiomeSource {
    public static final MapCodec<PlanetBiomeSource> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
            RegistryOps.retrieveGetter(Registries.BIOME),
            Codec.LONG.optionalFieldOf("seed", PlanetWorld.DEFAULT_SEED).forGetter(b -> b.seed)
    ).apply(i, i.stable(PlanetBiomeSource::new)));

    private final long seed;
    private final RealisticTerrain terrain;
    private final double half;
    private final Map<ResourceKey<Biome>, Holder<Biome>> biomes = new LinkedHashMap<>();

    public PlanetBiomeSource(HolderGetter<Biome> getter, long seed) {
        this.seed = seed;
        this.terrain = PlanetWorld.terrain(seed);
        this.half = PlanetWorld.halfSpan(seed);
        for (ResourceKey<Biome> k : java.util.List.of(
                Biomes.THE_VOID, Biomes.PLAINS, Biomes.SNOWY_PLAINS, Biomes.DESERT, Biomes.FOREST, Biomes.DARK_FOREST, Biomes.BIRCH_FOREST,
                Biomes.TAIGA, Biomes.SNOWY_TAIGA, Biomes.SAVANNA, Biomes.JUNGLE, Biomes.SPARSE_JUNGLE, Biomes.WINDSWEPT_HILLS,
                Biomes.WINDSWEPT_FOREST, Biomes.SAVANNA_PLATEAU, Biomes.SNOWY_SLOPES, Biomes.FROZEN_PEAKS, Biomes.STONY_PEAKS, Biomes.RIVER,
                Biomes.FROZEN_RIVER, Biomes.BEACH, Biomes.SNOWY_BEACH, Biomes.OCEAN, Biomes.DEEP_OCEAN, Biomes.COLD_OCEAN,
                Biomes.DEEP_COLD_OCEAN, Biomes.LUKEWARM_OCEAN, Biomes.DEEP_LUKEWARM_OCEAN, Biomes.WARM_OCEAN,
                Biomes.FROZEN_OCEAN, Biomes.DEEP_FROZEN_OCEAN, Biomes.MEADOW))
            biomes.put(k, getter.getOrThrow(k));
    }

    @Override protected MapCodec<? extends BiomeSource> codec() { return CODEC; }

    @Override protected Stream<Holder<Biome>> collectPossibleBiomes() { return biomes.values().stream(); }

    /**
     * Vanilla asks for every height quart of a column (2288 / 4 = 572 calls per (x, z)), but the planet's biome depends on
     * (x, z) only: a small per-thread cache turns ~6000 climate evaluations per chunk into 16.
     */
    private static final class ColumnCache extends java.util.LinkedHashMap<Long, ResourceKey<Biome>> {
        ColumnCache() { super(512, 0.75f, true); }
        @Override protected boolean removeEldestEntry(Map.Entry<Long, ResourceKey<Biome>> e) { return size() > 2048; }
    }
    private final ThreadLocal<ColumnCache> cache = ThreadLocal.withInitial(ColumnCache::new);
    static final java.util.concurrent.atomic.AtomicLong COLUMN_EVALS = new java.util.concurrent.atomic.AtomicLong();

    @Override
    public Holder<Biome> getNoiseBiome(int qx, int qy, int qz, Climate.Sampler sampler) {
        if (qx * 4 > 16_800_000) return biomes.get(Biomes.THE_VOID);              // the Moon: no atmosphere, no vegetation, no mobs
        long key = ((long) qx << 32) ^ (qz & 0xffffffffL);
        ColumnCache c = cache.get();
        ResourceKey<Biome> k = c.get(key);
        if (k == null) {
            Vec3 d = PlaneUnwrap.inverse(qx * 4 + 2, qz * 4 + 2, half);
            k = pick(terrain.surface(d, 4.0));
            c.put(key, k);
            COLUMN_EVALS.incrementAndGet();
        }
        Holder<Biome> h = biomes.get(k);
        if (h == null) {                                                    // a pick() result that is not registered must never reach the structure code as null
            if (WARNED.add(k)) System.out.println("[planetary] biome " + k.location() + " missing from the biome source list, using plains");
            h = biomes.get(Biomes.PLAINS);
        }
        return h;
    }
    private static final java.util.Set<ResourceKey<Biome>> WARNED = java.util.concurrent.ConcurrentHashMap.newKeySet();

    /**
     * Vanilla lowers a biome's temperature with ABSOLUTE height (above Y 80) and snows where it falls below 0.15, so a warm
     * lowland biome snows over on any plateau above ~500 m. Where the planet climate says "not cold", warm biomes that
     * would snow are replaced by their cold-tolerant neighbours' warm counterparts further down in {@link #pick}.
     */
    static ResourceKey<Biome> pick(RealisticTerrain.Surface s) {
        double h = s.height(), t = s.temperature(), m = s.moisture();
        if (s.river() > 0.7 && h >= -1.0) return t < -5 ? Biomes.FROZEN_RIVER : Biomes.RIVER;
        if (h < 0.0) {
            boolean deep = h < -180.0;
            if (t < -8) return deep ? Biomes.DEEP_FROZEN_OCEAN : Biomes.FROZEN_OCEAN;
            if (t > 24) return deep ? Biomes.DEEP_LUKEWARM_OCEAN : Biomes.WARM_OCEAN;
            if (t > 17) return deep ? Biomes.DEEP_LUKEWARM_OCEAN : Biomes.LUKEWARM_OCEAN;
            if (t > 7) return deep ? Biomes.DEEP_OCEAN : Biomes.OCEAN;
            return deep ? Biomes.DEEP_COLD_OCEAN : Biomes.COLD_OCEAN;
        }
        if (h < 4.0 && s.continental() < 0.045) return t < -4 ? Biomes.SNOWY_BEACH : Biomes.BEACH;
        if (h > 2800.0) return t < 0 ? Biomes.FROZEN_PEAKS : Biomes.STONY_PEAKS;
        // Vanilla lowers a biome's temperature with ABSOLUTE height and snows below 0.15: plains (0.8) snow above ~600 m, forest (0.7)
        // above ~520 m, jungle (0.95) above ~720 m. Warm uplands therefore get the hot biomes (temperature 2.0), which never snow;
        // RealisticTerrain colours the same region as savanna/desert so mesh and blocks agree (see WARM_UPLAND_FROM_M).
        if (h > RealisticTerrain.WARM_UPLAND_FROM_M && h <= 1500.0 && t > 5.0) return m < 0.2 ? Biomes.DESERT : Biomes.SAVANNA_PLATEAU;
        if (h > 1500.0) return t < -2 ? Biomes.SNOWY_SLOPES : (m > 0.5 ? Biomes.WINDSWEPT_FOREST : Biomes.WINDSWEPT_HILLS);
        if (t < -10) return Biomes.SNOWY_PLAINS;
        if (t < -3) return m > 0.4 ? Biomes.SNOWY_TAIGA : Biomes.SNOWY_PLAINS;
        if (t < 6) return m > 0.42 ? Biomes.TAIGA : Biomes.PLAINS;
        if (t > 18) {
            if (m < 0.2) return Biomes.DESERT;
            if (m < 0.45) return Biomes.SAVANNA;
            if (m > 0.75) return Biomes.JUNGLE;
            if (m > 0.6) return Biomes.SPARSE_JUNGLE;
            return Biomes.SAVANNA;
        }
        if (m < 0.18) return Biomes.DESERT;
        if (m > 0.72) return Biomes.DARK_FOREST;
        if (m > 0.55) return Biomes.FOREST;
        if (m > 0.46) return Biomes.BIRCH_FOREST;
        return m > 0.3 ? Biomes.PLAINS : Biomes.MEADOW;
    }
}
