package dev.gohst136.planetary.terrain;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.PlanetDefinition;

/**
 * Seeded 3D value-noise fBm sampled on the unit sphere (no seams, no polar pinching).
 * Continents (low-frequency, sign-shaped) plus ridged mountains weighted by continent height.
 * Pure function of (seed, direction): any worker thread can reconstruct any region.
 */
public final class ProceduralTerrain implements TerrainSampler {
    private static final double BASE_FREQ = 1.5;   // noise periods across the unit sphere radius
    private static final double PERSISTENCE = 0.5;

    private final PlanetDefinition planet;
    private final long seed;
    private final int octaves;
    private final double ampNorm;

    public ProceduralTerrain(PlanetDefinition planet) {
        this.planet = planet;
        this.seed = planet.seed();
        this.octaves = planet.terrainOctaves();
        double s = 0, a = 1;
        for (int i = 0; i < octaves; i++) { s += a; a *= PERSISTENCE; }
        this.ampNorm = 1.0 / s;
    }

    @Override
    public double heightAt(Vec3 d) {
        double continent = 0, ridged = 0, amp = 1, f = BASE_FREQ;
        for (int i = 0; i < octaves; i++) {
            double n = noise(d.x() * f, d.y() * f, d.z() * f, seed + i * 0x9E3779B97F4A7C15L); // [-1,1]
            if (i < 3) continent += n * amp; else ridged += (1.0 - Math.abs(n)) * 2.0 * amp - amp;
            amp *= PERSISTENCE;
            f *= 2.0;
        }
        double c = continent * ampNorm * 2.2;                  // roughly [-1,1]
        c = Math.max(-1, Math.min(1, c));
        double land = Math.max(0, c);
        double h = c >= 0 ? c * planet.maxHeight() * 0.35 : c * planet.maxDepth();
        h += land * land * ridged * ampNorm * 2.5 * planet.maxHeight() * 0.65;
        return Math.max(-planet.maxDepth(), Math.min(planet.maxHeight(), h));
    }

    @Override
    public double unresolvedDetail(double cellSize) {
        // octave i has wavelength R/(BASE_FREQ*2^i); a mesh with cell size c resolves
        // wavelengths >= 2c. Sum the amplitude of octaves it cannot represent.
        double err = 0, amp = 1, f = BASE_FREQ;
        for (int i = 0; i < octaves; i++) {
            double wavelength = planet.radius() / f;
            if (wavelength < 2.0 * cellSize) err += amp;
            amp *= PERSISTENCE;
            f *= 2.0;
        }
        return err * ampNorm * planet.maxHeight() * 0.65 * 2.5;
    }

    // ---- value noise -------------------------------------------------------------------
    private static double noise(double x, double y, double z, long s) {
        long xi = (long) Math.floor(x), yi = (long) Math.floor(y), zi = (long) Math.floor(z);
        double fx = x - xi, fy = y - yi, fz = z - zi;
        double u = fade(fx), v = fade(fy), w = fade(fz);
        double c000 = hash(xi, yi, zi, s), c100 = hash(xi + 1, yi, zi, s);
        double c010 = hash(xi, yi + 1, zi, s), c110 = hash(xi + 1, yi + 1, zi, s);
        double c001 = hash(xi, yi, zi + 1, s), c101 = hash(xi + 1, yi, zi + 1, s);
        double c011 = hash(xi, yi + 1, zi + 1, s), c111 = hash(xi + 1, yi + 1, zi + 1, s);
        double x00 = lerp(c000, c100, u), x10 = lerp(c010, c110, u);
        double x01 = lerp(c001, c101, u), x11 = lerp(c011, c111, u);
        return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
    }

    private static double fade(double t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    private static double lerp(double a, double b, double t) { return a + (b - a) * t; }

    private static double hash(long x, long y, long z, long s) {
        long h = s ^ (x * 0x632BE59BD9B4E019L) ^ (y * 0x9E3779B97F4A7C15L) ^ (z * 0xC2B2AE3D27D4EB4FL);
        h ^= h >>> 33; h *= 0xFF51AFD7ED558CCDL; h ^= h >>> 33; h *= 0xC4CEB9FE1A85EC53L; h ^= h >>> 33;
        return ((h >>> 11) * 0x1.0p-53) * 2.0 - 1.0;
    }
}
