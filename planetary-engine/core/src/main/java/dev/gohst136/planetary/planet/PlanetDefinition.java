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

    /** An Earth-sized default; vanilla blocks are 1 m so this is a 6371 km world. */
    public static PlanetDefinition earthlike(long seed) {
        return new PlanetDefinition("planetary:earthlike", seed, 6_371_000.0, 9.81, 0.0,
                8_800.0, 4_000.0, 86_400.0, 100_000.0, 22);
    }

    /** Realistic Earth-sized planet: continents, oceans, mountain belts, rivers and climate (see RealisticTerrain). */
    public static PlanetDefinition earth(long seed) {
        return new PlanetDefinition("planetary:earth", seed, 6_371_000.0, 9.81, 0.0,
                9_000.0, 5_600.0, 86_400.0, 100_000.0, 17);
    }

    /** Macro shape from 11 noise octaves (>= ~4 km wavelength); finer detail comes from a vanilla-worldgen layer. */
    public static PlanetDefinition earthlikeVanilla(long seed) {
        return new PlanetDefinition("planetary:earthlike_vanilla", seed, 6_371_000.0, 9.81, 0.0,
                9_100.0, 4_200.0, 86_400.0, 100_000.0, 11);
    }

    public double minRadius() { return radius - maxDepth; }
    public double maxRadius() { return radius + maxHeight; }
}
