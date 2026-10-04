package dev.gohst136.planetary.planet;

/**
 * Vertical mapping between planet heights (metres above sea level) and world block Y of the planet dimension
 * (min_y -256, height 1536, sea level 0). Land up to 800 m is 1:1; higher terrain is compressed smoothly to the build
 * limit (Everest-class peaks flatten out around Y 1270); the ocean floor is clamped at Y -250. Pure and monotonic.
 */
public final class VerticalMap {
    private VerticalMap() {}

    public static final int MIN_Y = -256, HEIGHT = 1536, SEA_LEVEL = 0;
    private static final double LINEAR_TOP = 800.0, EXTRA = 470.0, SCALE = 2500.0, FLOOR = -250.0;

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
}
