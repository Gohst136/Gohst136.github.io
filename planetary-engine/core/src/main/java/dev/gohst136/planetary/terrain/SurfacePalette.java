package dev.gohst136.planetary.terrain;

/** Colour helpers shared by samplers. All colours are linear-ish RGB in [0, 1]. */
public final class SurfacePalette {
    private SurfacePalette() {}

    public static double smooth(double a, double b, double x) {
        double t = Math.max(0.0, Math.min(1.0, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
    }

    public static void mix(double[] dst, double[] a, double[] b, double t) {
        for (int i = 0; i < 3; i++) dst[i] = a[i] + (b[i] - a[i]) * t;
    }

    /** Height-only fallback palette (water below 0, lowland green, rock, snow) for samplers without climate. */
    public static void byHeight(double h, double[] rgb) {
        if (h < 0) {
            double t = Math.max(0.0, Math.min(1.0, 1.0 + h / 3000.0));
            rgb[0] = 0.01 + 0.05 * t; rgb[1] = 0.07 + 0.31 * t; rgb[2] = 0.25 + 0.37 * t;
        } else if (h < 120) {
            double t = smooth(0, 120, h);
            rgb[0] = 0.76 + (0.20 - 0.76) * t; rgb[1] = 0.70 + (0.50 - 0.70) * t; rgb[2] = 0.50 + (0.15 - 0.50) * t;
        } else if (h < 2500) {
            double t = smooth(120, 2500, h);
            rgb[0] = 0.20 + 0.22 * t; rgb[1] = 0.50 - 0.12 * t; rgb[2] = 0.15 + 0.18 * t;
        } else {
            double t = smooth(2500, 4500, h);
            rgb[0] = 0.42 + 0.53 * t; rgb[1] = 0.38 + 0.58 * t; rgb[2] = 0.33 + 0.67 * t;
        }
    }
}
