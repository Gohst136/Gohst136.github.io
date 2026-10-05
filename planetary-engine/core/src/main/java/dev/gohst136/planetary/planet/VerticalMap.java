package dev.gohst136.planetary.planet;

/**
 * Vertical mapping between planet heights (metres above sea level) and world block Y of the planet dimension
 * (min_y -256, height 2288, sea level 0). Land up to 1800 m is 1:1; higher terrain is compressed smoothly to the build
 * limit (Everest-class peaks flatten out around Y 2000); the ocean floor is clamped at Y -250. Pure and monotonic.
 */
public final class VerticalMap {
    private VerticalMap() {}

    public static final int MIN_Y = -256, HEIGHT = 2288, SEA_LEVEL = 0;      // 143 sections: top block Y 2031 (the vanilla maximum)
    private static final double LINEAR_TOP = 1800.0, EXTRA = 220.0, SCALE = 3000.0, FLOOR = -250.0;

    public static double toBlockY(double heightMeters) {
        if (heightMeters <= LINEAR_TOP) return Math.max(FLOOR, heightMeters);
        return LINEAR_TOP + EXTRA * Math.tanh((heightMeters - LINEAR_TOP) / SCALE);
    }

    /** Inverse of {@link #toBlockY} on its invertible part (Y above the floor). */
    public static double toMeters(double blockY) {
        if (blockY <= LINEAR_TOP) return blockY;
        double t = Math.min(0.999999, (blockY - LINEAR_TOP) / EXTRA);
        return LINEAR_TOP + SCALE * 0.5 * Math.log((1 + t) / (1 - t));
    }

    /**
     * Airless bodies have no sea: deep craters get a smooth floor instead of a hard clamp (a 5 km deep basin becomes a 250 m deep one,
     * monotonic, so ordering of heights is preserved). Positive heights as {@link #toBlockY}.
     */
    public static double toBlockYAirless(double heightMeters) {
        if (heightMeters >= 0) return toBlockY(heightMeters);
        return FLOOR * Math.tanh(-heightMeters / 600.0);          // FLOOR is negative: -250 at the deepest
    }

    /** Inverse of {@link #toBlockYAirless} (heights clamped just above the floor so the inverse stays finite). */
    public static double toMetersAirless(double blockY) {
        if (blockY >= 0) return toMeters(blockY);
        double t = Math.min(0.9995, -blockY / -FLOOR);
        return -600.0 * 0.5 * Math.log((1 + t) / (1 - t));
    }
}
