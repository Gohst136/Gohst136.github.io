package dev.gohst136.planetary.render;

/**
 * Minecraft's daylight, as closed formulas (LightTexture / Level.getSkyDarken of 1.21), so the smooth planet can be lit exactly like the block terrain
 * and the game's day clock can be driven from the planet's sun. Terrain in vanilla is not lit by the sun's direction: top faces get the sky light colour of the moment
 * (white at day, dim at night), nothing else.
 */
public final class VanillaDaylight {
    private VanillaDaylight() {}

    /** Level.getSkyDarken without rain: 1 at day, 0.2 at night; {@code sunSin} = sine of the sun's elevation (= cos of vanilla's celestial angle). */
    public static double skyDarken(double sunSin) {
        return 0.8 * Math.max(0.0, Math.min(1.0, 2.0 * sunSin + 0.2)) + 0.2;
    }

    /** The lightmap colour of (block light 0, sky light 15) for a given sky darkness and the brightness option (0..1), each channel 0..1. */
    public static double[] lightmapSky15(double skyDarken, double gamma) {
        double f1 = skyDarken * 0.95 + 0.05;
        double k = skyDarken * 0.65 + 0.35;
        double[] c = {k * f1, k * f1, 1.0 * f1};
        for (int i = 0; i < 3; i++) {
            double v = c[i] * 0.96 + 0.03;                                    // lerp towards 0.75 by 0.04
            double ng = 1.0 - Math.pow(1.0 - v, 4.0);
            v = v + (ng - v) * gamma;                                          // brightness option
            v = v * 0.96 + 0.03;
            c[i] = Math.max(0.0, Math.min(1.0, v));
        }
        return c;
    }

    /** Vanilla's celestial angle fraction for a day time in ticks (noon = 6000 -> 0). */
    public static double celestialFraction(long dayTime) {
        double d0 = ((dayTime / 24000.0 - 0.25) % 1.0 + 1.0) % 1.0;
        double d1 = 0.5 - Math.cos(d0 * Math.PI) / 2.0;
        return (d0 * 2.0 + d1) / 3.0;
    }

    /**
     * Day time (ticks, 0..23999) whose sky darkness equals the one of a sun at elevation sine {@code sunSin}. {@code afternoon} picks the second half of the day
     * (the sun going down); lighting does not care, the sky and sun disc of vanilla are not shown in planet mode.
     */
    public static long dayTimeForSunSin(double sunSin, boolean afternoon) {
        double target = Math.acos(Math.max(-1.0, Math.min(1.0, sunSin))) / (2.0 * Math.PI);       // celestial fraction with cos(2 pi f) = sunSin, in [0, 0.5]
        double lo = 0.0, hi = 0.5;                                                                  // d0 in [0, 0.5] <-> f in [0, 0.5]
        for (int i = 0; i < 50; i++) {
            double mid = 0.5 * (lo + hi), d1 = 0.5 - Math.cos(mid * Math.PI) / 2.0, f = (mid * 2.0 + d1) / 3.0;
            if (f < target) lo = mid; else hi = mid;
        }
        double d0 = 0.5 * (lo + hi);
        double t = afternoon ? 6000.0 + d0 * 24000.0 : 6000.0 - d0 * 24000.0;
        return Math.floorMod(Math.round(t), 24000L);
    }
}
