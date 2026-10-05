package dev.gohst136.planetary.planet;

/**
 * Several bodies share the one real-chunk dimension: each body owns a region of the vanilla (x, z) plane. The home planet's six
 * cube-face squares fill |x| <= ~1.6e7 (centre offset 0); the Moon's fill 1.76e7 .. 2.64e7 (centre offset +2.2e7). Both lie inside
 * vanilla's +-3e7 world border. (A third body of Mars size would not fit: it is rendered as a mesh only.)
 */
public final class BodyPlane {
    private BodyPlane() {}

    public static final int HOME = 0, MOON = 1;
    private static final double MOON_OFFSET = 2.2e7, MOON_FROM = 1.68e7;

    public static int bodyAt(double x) { return x > MOON_FROM ? MOON : HOME; }

    /** Plane x of the body's centre. */
    public static double offsetX(int body) { return body == MOON ? MOON_OFFSET : 0.0; }

    public static String bodyId(int body) { return body == MOON ? "moon" : "earth"; }
    public static int bodyIndex(String id) { return "moon".equals(id) ? MOON : HOME; }
}
