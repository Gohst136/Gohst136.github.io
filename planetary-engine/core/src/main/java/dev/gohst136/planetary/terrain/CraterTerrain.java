package dev.gohst136.planetary.terrain;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.PlanetDefinition;

import static dev.gohst136.planetary.terrain.SurfacePalette.smooth;

/**
 * Airless rocky body (Moon, Mercury-like): large dark basins ("maria"), highlands, and craters at several scales from a
 * deterministic jittered 3D grid on the unit sphere (so no seams and any region can be rebuilt on its own). Craters have a raised
 * rim, a bowl and an ejecta halo; their number per scale follows a power law, the way real size-frequency distributions do.
 * Pure function of (seed, direction, mesh cell size): detail below two cells is skipped (no aliasing, no LOD pops).
 */
public final class CraterTerrain implements TerrainSampler {
    private final PlanetDefinition planet;
    private final Noise3 n;
    private final double radius;
    private final double[] tint;
    private final double scale;                                  // vertical relief factor (1 = full-size relief)

    private static final int SCALES = 22;                  // crater diameters from 0.16 of the radius down by 1.7x per scale, to ~ 2 m on the Moon
    private static final double BASE_DIAMETER_FRACTION = 0.16, SHRINK = 1.7;

    public CraterTerrain(PlanetDefinition planet) { this(planet, 1.03, 1.0, 0.96, 1.0); }

    /** @param tintR/G/B colour multipliers of the grey albedo (Moon: nearly neutral, Mars-like: rust). */
    public CraterTerrain(PlanetDefinition planet, double tintR, double tintG, double tintB) { this(planet, tintR, tintG, tintB, 1.0); }

    /** @param reliefScale scales all heights: the real chunk dimension is 2288 blocks high, so a body that is meant to be walked on keeps its shape but with reduced relief. */
    public CraterTerrain(PlanetDefinition planet, double tintR, double tintG, double tintB, double reliefScale) {
        this.scale = reliefScale;
        this.planet = planet; this.n = new Noise3(planet.seed() ^ 0x4D6F6F6EL); this.radius = planet.radius();
        this.tint = new double[]{tintR, tintG, tintB};
    }

    @Override public double heightAt(Vec3 d) { return heightAt(d, 0.0); }

    @Override
    public double heightAt(Vec3 d, double cell) {
        double[] o = new double[5];
        sampleSurface(d, cell, o);
        return o[0];
    }

    @Override
    public void sampleSurface(Vec3 d, double cell, double[] out) {
        final double x = d.x(), y = d.y(), z = d.z();
        // basins: low, smooth, dark; highlands elsewhere
        double mare = smooth(-0.04, 0.14, n.fbm(x * 1.4 + 3, y * 1.4 - 9, z * 1.4 + 5, 3));
        double h = -3000.0 * mare + 1200.0 * (1.0 - mare) * (0.5 + 0.5 * n.fbm(x * 3 + 1, y * 3 + 2, z * 3 + 3, 4));
        double craterDepth = 0.0, ejecta = 0.0;
        double scaleD = BASE_DIAMETER_FRACTION;                       // diameter in units of the radius
        for (int s = 0; s < SCALES; s++, scaleD /= SHRINK) {
            double diameterM = scaleD * radius;
            if (cell > 0 && diameterM < 2.0 * cell) break;           // below the resolvable size
            double cellSize = scaleD * 1.3;                          // grid spacing on the unit sphere
            double gx = x / cellSize, gy = y / cellSize, gz = z / cellSize;
            int ix = (int) Math.floor(gx), iy = (int) Math.floor(gy), iz = (int) Math.floor(gz);
            double density = (1.0 - 0.55 * mare) * 0.85;             // fewer craters in the (younger) maria
            for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) for (int c = -1; c <= 1; c++) {
                long hsh = hash(ix + a, iy + b, iz + c, s);
                if (unit(hsh, 0) > density) continue;
                double cx = ix + a + unit(hsh, 1), cy = iy + b + unit(hsh, 2), cz = iz + c + unit(hsh, 3);
                double dx = gx - cx, dy = gy - cy, dz = gz - cz;
                // distance along the surface is approximated by the 3D distance on the unit sphere (valid: craters << radius)
                double r = Math.sqrt(dx * dx + dy * dy + dz * dz) * cellSize;      // in unit-sphere length
                double rad = scaleD * 0.5 * (0.6 + 0.4 * unit(hsh, 4));            // crater radius (unit sphere)
                double q = r / rad;                                                // 0 centre .. 1 rim
                if (q > 2.6) continue;
                double dMeters = 2.0 * rad * radius;                                // crater diameter (m)
                // depth/diameter ~ 0.2 for small bowls, shallower for large basins (observed scaling), capped like real ones
                double depth = Math.min(5000.0, 0.5 * dMeters * 0.2 * Math.min(1.0, Math.pow(15_000.0 / dMeters, 0.6)));
                if (q < 1.0) craterDepth += depth * (1.0 - q * q) * (1.0 - q * q * 0.0) - depth * 0.25 * smooth(0.8, 1.0, q);
                else {
                    double rim = Math.exp(-(q - 1.0) * (q - 1.0) * 28.0);
                    ejecta += depth * 0.28 * rim + depth * 0.06 * Math.exp(-(q - 1.0) * 2.2);
                }
            }
        }
        // fine regolith relief, fading with the cell size
        double det = 0.0, amp = 30.0, f = 400.0;
        for (int k = 0; k < 16; k++) {
            double wl = 2.0 * Math.PI * radius / f;
            double fade = cell <= 0 ? 1.0 : Math.max(0.0, Math.min(1.0, wl / (2.0 * cell) - 1.0));
            if (fade <= 0) break;
            det += fade * amp * n.noise(x * f + 11, y * f - 5, z * f + 2);
            amp *= 0.7; f *= 2.0;
        }
        double height = scale * (h - craterDepth + ejecta + det);
        height = Math.max(-planet.maxDepth(), Math.min(planet.maxHeight(), height));
        // albedo: dark basins, bright fresh crater rims/ejecta, slight noise
        double base = 0.55 - 0.28 * mare + 0.18 * Math.min(1.0, ejecta / 300.0) - 0.05 * Math.min(1.0, craterDepth / 800.0);
        double shade = base * (0.94 + 0.12 * n.noise(x * 60 + 4, y * 60, z * 60));
        out[0] = height;
        out[1] = Math.min(1.0, shade * tint[0]); out[2] = Math.min(1.0, shade * tint[1]); out[3] = Math.min(1.0, shade * tint[2]);
        out[4] = 0.0;
    }

    @Override
    public void sample(Vec3 d, double cell, double[] out) { double[] o = new double[5]; sampleSurface(d, cell, o); out[0] = out[1] = o[0]; }

    @Override
    public double unresolvedDetail(double cell) {
        double sq = 0.0, scaleD = BASE_DIAMETER_FRACTION;
        for (int s = 0; s < SCALES; s++, scaleD /= SHRINK) {
            double dm = scaleD * radius;
            if (dm < 2.0 * cell) { double a = dm * 0.2 * 0.5; sq += a * a * 0.5; }
        }
        double amp = 30.0, f = 400.0;
        for (int k = 0; k < 16; k++) {
            if (2.0 * Math.PI * radius / f < 2.0 * cell) sq += amp * amp * 0.25;
            amp *= 0.7; f *= 2.0;
        }
        return scale * Math.sqrt(sq);
    }

    /** Heuristic bound (craters are bowls with steep rims). */
    @Override public double slopeBound() { return 25.0 * scale; }

    private static long hash(long x, long y, long z, long s) {
        long h = (x * 0x9E3779B97F4A7C15L) ^ (y * 0xC2B2AE3D27D4EB4FL) ^ (z * 0x165667B19E3779F9L) ^ (s * 0x27D4EB2F165667C5L);
        h ^= h >>> 33; h *= 0xFF51AFD7ED558CCDL; h ^= h >>> 33; h *= 0xC4CEB9FE1A85EC53L; h ^= h >>> 33;
        return h;
    }
    private static double unit(long h, int k) {
        long v = h * (2 * k + 1) * 0x9E3779B97F4A7C15L;
        v ^= v >>> 29;
        return ((v >>> 11) * 0x1.0p-53);
    }
}
