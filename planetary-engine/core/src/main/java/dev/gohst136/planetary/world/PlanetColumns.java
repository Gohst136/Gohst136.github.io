package dev.gohst136.planetary.world;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.PlaneUnwrap;
import dev.gohst136.planetary.planet.VerticalMap;
import dev.gohst136.planetary.terrain.RealisticTerrain;

/**
 * THE single definition of what a block column of the real world looks like: ground height, water, surface and filler block. The chunk
 * generator fills real chunks from it, and the far "block skin" meshes (voxel LOD drawn with the game's own shaders) are built from it, so
 * the two cannot disagree. Pure and thread-safe; no Minecraft types (blocks are named by {@link Kind}).
 */
public final class PlanetColumns {
    private PlanetColumns() {}

    /** The blocks a planet column is made of (vanilla ids by name). */
    public enum Kind {
        GRASS_BLOCK("minecraft:grass_block"), DIRT("minecraft:dirt"), STONE("minecraft:stone"), SAND("minecraft:sand"), SANDSTONE("minecraft:sandstone"),
        GRAVEL("minecraft:gravel"), CLAY("minecraft:clay"), SNOW_BLOCK("minecraft:snow_block"), ICE("minecraft:ice"), WATER("minecraft:water"),
        BEDROCK("minecraft:bedrock"), ANDESITE("minecraft:andesite"), TUFF("minecraft:tuff"), BLACKSTONE("minecraft:blackstone");

        public final String id;
        Kind(String id) { this.id = id; }
    }

    /** One resolved block column of the vanilla plane. {@code waterTopY} is Integer.MIN_VALUE when dry. */
    public record Column(int groundY, int waterTopY, boolean river, boolean ocean, boolean moon, boolean frozenWater,
                         Kind top, Kind filler, RealisticTerrain.Surface surface) {}

    /** Home planet column at block (x, z), sampled at block centre with detail cell {@code cell} (1 = exactly what the generator does). */
    public static Column earth(RealisticTerrain terrain, double halfSpan, double px, double pz, double cell) {
        Vec3 d = PlaneUnwrap.inverse(px, pz, halfSpan);
        RealisticTerrain.Surface s = terrain.surface(d, cell);
        return earth(s);
    }

    public static Column earth(RealisticTerrain.Surface s) {
        int ground = (int) Math.floor(VerticalMap.toBlockY(s.height()));
        boolean ocean = s.height() < 0.0;
        boolean river = !ocean && s.river() > 0.7;
        int water = ocean ? Math.max(ground, VerticalMap.SEA_LEVEL) : (river ? ground + 1 : Integer.MIN_VALUE);
        Kind top = surfaceKind(s, ocean, river, false);
        return new Column(ground, water, river, ocean, false, ocean && s.temperature() < -8, top, fillerKind(top), s);
    }

    /** Moon column from an albedo surface (airless, no water). */
    public static Column moon(double height, double albedoG, double r, double g, double b) {
        int ground = (int) Math.floor(VerticalMap.toBlockYAirless(height));
        var s = new RealisticTerrain.Surface(height, -150.0, 0.0, 0.0, 1.0, r, g, b, false);
        Kind top = albedoG > 0.45 ? Kind.ANDESITE : (albedoG > 0.33 ? Kind.TUFF : Kind.BLACKSTONE);
        return new Column(ground, Integer.MIN_VALUE, false, false, true, false, top, Kind.STONE, s);
    }

    static Kind surfaceKind(RealisticTerrain.Surface s, boolean ocean, boolean river, boolean moon) {
        double h = s.height(), t = s.temperature(), m = s.moisture();
        if (ocean) {
            if (h > -6) return Kind.SAND;
            return h > -60 ? Kind.SAND : (m > 0.5 ? Kind.CLAY : Kind.GRAVEL);
        }
        if (river) return Kind.GRAVEL;
        if (h > 3400.0 || t < -12.0) return Kind.SNOW_BLOCK;
        if (h > 2200.0) return Kind.STONE;
        if (h < 4.0 && s.continental() < 0.045) return Kind.SAND;
        if (t > 14.0 && m < 0.2) return Kind.SAND;
        return Kind.GRASS_BLOCK;
    }

    static Kind fillerKind(Kind top) {
        switch (top) {
            case SAND: return Kind.SANDSTONE;
            case STONE: case SNOW_BLOCK: return Kind.STONE;
            case GRAVEL: case CLAY: return Kind.GRAVEL;
            default: return Kind.DIRT;
        }
    }
}
