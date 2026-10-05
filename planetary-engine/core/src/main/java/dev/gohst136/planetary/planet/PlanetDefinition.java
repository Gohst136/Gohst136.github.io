package dev.gohst136.planetary.planet;

/**
 * Data-driven planet description (datapack / other mods can later construct these).
 * Lengths in metres, times in seconds, gravity in m/s^2.
 */
public record PlanetDefinition(
        String id,
        long seed,
        double radius,
        double gravity,
        double seaLevel,        // metres above radius baseline
        double maxHeight,       // maximum terrain displacement above baseline (and below, for oceans: -maxDepth)
        double maxDepth,
        double dayLengthSeconds,
        double atmosphereHeight,
        int terrainOctaves) {

    /** Radius with pi*R/4 = 2^22 exactly: the cube-face squares of the vanilla plane are 2^23 blocks wide, so LOD cells are whole powers of two blocks (see PlaneUnwrap.halfSpan). */
    public static final double EARTH_RADIUS = 16_777_216.0 / Math.PI;           // 5340 km
    /** The Moon likewise: pi*R/4 = 2^20. */
    public static final double MOON_RADIUS = 4_194_304.0 / Math.PI;             // 1335 km

    /** An Earth-like default; vanilla blocks are 1 m. */
    public static PlanetDefinition earthlike(long seed) {
        return new PlanetDefinition("planetary:earthlike", seed, EARTH_RADIUS, 9.81, 0.0,
                8_800.0, 4_000.0, 86_400.0, 100_000.0, 22);
    }

    /** Realistic Earth-sized planet: continents, oceans, mountain belts, rivers and climate (see RealisticTerrain). */
    public static PlanetDefinition earth(long seed) {
        return new PlanetDefinition("planetary:earth", seed, EARTH_RADIUS, 9.81, 0.0,
                9_000.0, 5_600.0, 86_400.0, 100_000.0, 17);
    }

    /** Macro shape from 11 noise octaves (>= ~4 km wavelength); finer detail comes from a vanilla-worldgen layer. */
    public static PlanetDefinition earthlikeVanilla(long seed) {
        return new PlanetDefinition("planetary:earthlike_vanilla", seed, EARTH_RADIUS, 9.81, 0.0,
                9_100.0, 4_200.0, 86_400.0, 100_000.0, 11);
    }

    public double minRadius() { return radius - maxDepth; }
    public double maxRadius() { return radius + maxHeight; }
}
