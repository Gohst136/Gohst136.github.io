package dev.gohst136.planetary.terrain;

import java.util.SplittableRandom;

/** Seeded improved-Perlin 3D gradient noise (range about [-1, 1]) and fractal helpers. Immutable, thread-safe. */
public final class Noise3 {
    private final int[] perm = new int[512];

    public Noise3(long seed) {
        int[] p = new int[256];
        for (int i = 0; i < 256; i++) p[i] = i;
        SplittableRandom r = new SplittableRandom(seed);
        for (int i = 255; i > 0; i--) { int j = r.nextInt(i + 1); int t = p[i]; p[i] = p[j]; p[j] = t; }
        for (int i = 0; i < 512; i++) perm[i] = p[i & 255];
    }

    public double noise(double x, double y, double z) {
        int xi = (int) Math.floor(x), yi = (int) Math.floor(y), zi = (int) Math.floor(z);
        double xf = x - xi, yf = y - yi, zf = z - zi;
        int X = xi & 255, Y = yi & 255, Z = zi & 255;
        double u = fade(xf), v = fade(yf), w = fade(zf);
        int a = perm[X] + Y, aa = perm[a] + Z, ab = perm[a + 1] + Z;
        int b = perm[X + 1] + Y, ba = perm[b] + Z, bb = perm[b + 1] + Z;
        return lerp(w,
                lerp(v, lerp(u, grad(perm[aa], xf, yf, zf), grad(perm[ba], xf - 1, yf, zf)),
                        lerp(u, grad(perm[ab], xf, yf - 1, zf), grad(perm[bb], xf - 1, yf - 1, zf))),
                lerp(v, lerp(u, grad(perm[aa + 1], xf, yf, zf - 1), grad(perm[ba + 1], xf - 1, yf, zf - 1)),
                        lerp(u, grad(perm[ab + 1], xf, yf - 1, zf - 1), grad(perm[bb + 1], xf - 1, yf - 1, zf - 1))));
    }

    /** Fractal sum, amplitude normalised to about [-1, 1]. */
    public double fbm(double x, double y, double z, int octaves) {
        double sum = 0, amp = 1, norm = 0;
        for (int i = 0; i < octaves; i++) {
            sum += amp * noise(x, y, z); norm += amp;
            x *= 2.0; y *= 2.0; z *= 2.0; amp *= 0.5;
        }
        return sum / norm;
    }

    /** Ridged multifractal in [0, 1]: sharp crests where the noise crosses zero. */
    public double ridged(double x, double y, double z, int octaves) {
        double sum = 0, amp = 1, norm = 0, weight = 1;
        for (int i = 0; i < octaves; i++) {
            double s = 1.0 - Math.abs(noise(x, y, z));
            s *= s;
            s *= weight;
            weight = Math.max(0.0, Math.min(1.0, s * 1.8));
            sum += s * amp; norm += amp;
            x *= 2.03; y *= 2.03; z *= 2.03; amp *= 0.5;
        }
        return sum / norm;
    }

    private static double fade(double t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    private static double lerp(double t, double a, double b) { return a + t * (b - a); }

    private static double grad(int hash, double x, double y, double z) {
        int h = hash & 15;
        double u = h < 8 ? x : y;
        double v = h < 4 ? y : (h == 12 || h == 14 ? x : z);
        return ((h & 1) == 0 ? u : -u) + ((h & 2) == 0 ? v : -v);
    }
}
