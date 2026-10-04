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

    public double minRadius() { return radius - maxDepth; }
    public double maxRadius() { return radius + maxHeight; }
}
