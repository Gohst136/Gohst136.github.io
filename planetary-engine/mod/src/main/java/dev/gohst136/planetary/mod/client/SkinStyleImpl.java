package dev.gohst136.planetary.mod.client;

import dev.gohst136.planetary.mod.world.PlanetBiomeSource;
import dev.gohst136.planetary.mod.world.PlanetChunkGenerator;
import dev.gohst136.planetary.skin.SkinStyle;
import dev.gohst136.planetary.world.PlanetColumns;
import dev.gohst136.planetary.world.PlanetColumns.Kind;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.block.model.BakedQuad;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.core.Direction;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.block.state.BlockState;
import net.neoforged.neoforge.client.model.data.ModelData;

/**
 * The far block skin looks like real chunks because it uses the game's own block models (sprites in the block atlas) and biome colours.
 * Slots: 3 per block kind (top, side, side overlay) plus water; {@link #rects} holds each slot's atlas rectangle for the shader.
 */
final class SkinStyleImpl implements SkinStyle {
    static final int SLOTS = 64;
    private static final int WATER_SLOT = Kind.values().length * 3;

    /** Atlas rectangle (u0, v0, u1, v1) per slot, shrunk by half a texel so that tiling never samples the neighbouring sprite. */
    final float[] rects = new float[SLOTS * 4];
    private final Registry<Biome> biomes;
    private final ConcurrentHashMap<ResourceKey<Biome>, int[]> colours = new ConcurrentHashMap<>();   // grass, water

    SkinStyleImpl(Minecraft mc) {
        this.biomes = mc.level.registryAccess().registryOrThrow(Registries.BIOME);
        TextureAtlas atlas = mc.getModelManager().getAtlas(TextureAtlas.LOCATION_BLOCKS);
        RandomSource rnd = RandomSource.create(42L);
        for (Kind k : Kind.values()) {
            if (k == Kind.WATER) continue;
            BlockState st = PlanetChunkGenerator.state(k);
            BakedModel model = mc.getBlockRenderer().getBlockModel(st);
            List<BakedQuad> up = model.getQuads(st, Direction.UP, rnd, ModelData.EMPTY, null);
            List<BakedQuad> side = model.getQuads(st, Direction.NORTH, rnd, ModelData.EMPTY, null);
            if (!up.isEmpty()) put(k.ordinal() * 3, up.get(0).getSprite());
            for (BakedQuad q : side) {
                if (q.isTinted()) put(k.ordinal() * 3 + 2, q.getSprite()); else put(k.ordinal() * 3 + 1, q.getSprite());
            }
        }
        put(WATER_SLOT, atlas.getSprite(ResourceLocation.withDefaultNamespace("block/water_still")));
    }

    private void put(int slot, TextureAtlasSprite sp) {
        float du = 0.5f * (sp.getU1() - sp.getU0()) / sp.contents().width(), dv = 0.5f * (sp.getV1() - sp.getV0()) / sp.contents().height();
        rects[slot * 4] = sp.getU0() + du; rects[slot * 4 + 1] = sp.getV0() + dv; rects[slot * 4 + 2] = sp.getU1() - du; rects[slot * 4 + 3] = sp.getV1() - dv;
    }

    /** Diagnostics: average colour of each top sprite and the grass / water colours of a few biomes (to calibrate the smooth planet's palette). */
    String dump() {
        StringBuilder sb = new StringBuilder("SPRITES (top face average RGB 0..255): ");
        Minecraft mc = Minecraft.getInstance();
        RandomSource rnd = RandomSource.create(42L);
        for (Kind k : Kind.values()) {
            if (k == Kind.WATER) continue;
            BlockState st = PlanetChunkGenerator.state(k);
            List<BakedQuad> up = mc.getBlockRenderer().getBlockModel(st).getQuads(st, Direction.UP, rnd, ModelData.EMPTY, null);
            if (up.isEmpty()) continue;
            var img = up.get(0).getSprite().contents().getOriginalImage();
            long r = 0, g = 0, b = 0; int n = 0;
            for (int y = 0; y < img.getHeight(); y++) for (int x = 0; x < img.getWidth(); x++) {
                int abgr = img.getPixelRGBA(x, y);
                r += abgr & 255; g += (abgr >> 8) & 255; b += (abgr >> 16) & 255; n++;
            }
            sb.append(String.format("%s=(%d,%d,%d) ", k.name(), r / n, g / n, b / n));
        }
        sb.append("| biome grass/water: ");
        for (ResourceKey<Biome> bk : List.of(Biomes.PLAINS, Biomes.FOREST, Biomes.DESERT, Biomes.SAVANNA, Biomes.TAIGA, Biomes.SNOWY_PLAINS, Biomes.JUNGLE, Biomes.OCEAN, Biomes.WARM_OCEAN, Biomes.COLD_OCEAN, Biomes.RIVER)) {
            Biome b = biomes.get(bk);
            if (b == null) continue;
            sb.append(String.format("%s=%06x/%06x ", bk.location().getPath(), b.getGrassColor(0, 0) & 0xFFFFFF, b.getWaterColor() & 0xFFFFFF));
        }
        return sb.toString();
    }

    @Override public int slotTop(Kind k) { return k.ordinal() * 3; }
    @Override public int slotSide(Kind k) { return k.ordinal() * 3 + 1; }
    @Override public int slotSideOverlay(Kind k) { return k == Kind.GRASS_BLOCK ? k.ordinal() * 3 + 2 : -1; }
    @Override public int slotWater() { return WATER_SLOT; }

    private int[] coloursOf(PlanetColumns.Column c) {
        ResourceKey<Biome> key = c.moon() ? Biomes.THE_VOID : PlanetBiomeSource.pick(c.surface());
        return colours.computeIfAbsent(key, k -> {
            Biome b = biomes.get(k);
            if (b == null) b = biomes.get(Biomes.PLAINS);
            return new int[]{b.getGrassColor(0.0, 0.0) & 0xFFFFFF, b.getWaterColor() & 0xFFFFFF};
        });
    }

    @Override public int tintTop(PlanetColumns.Column c) { return c.top() == Kind.GRASS_BLOCK ? coloursOf(c)[0] : 0xFFFFFF; }
    @Override public int tintOverlay(PlanetColumns.Column c) { return c.top() == Kind.GRASS_BLOCK ? coloursOf(c)[0] : 0xFFFFFF; }
    @Override public int tintWater(PlanetColumns.Column c) { return coloursOf(c)[1]; }
}
