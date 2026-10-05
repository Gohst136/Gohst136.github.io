package dev.gohst136.planetary.terrain;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.PlanetDefinition;

import static dev.gohst136.planetary.terrain.SurfacePalette.smooth;

/**
 * Earth-like procedural planet, a pure function of (seed, direction, mesh cell size), so any region can be rebuilt
 * independently at any level of detail.
 *
 * Layers (all noise is evaluated on the unit sphere, so there are no seams and no polar pinching):
 *  - continents / oceans: domain-warped fractal "continentalness"; shelf and abyssal depths on the ocean side;
 *  - mountain belts: ridged multifractal, enabled only inland in orogen zones;
 *  - detail: fractal relief whose octaves fade out with the mesh cell size (no aliasing, no LOD popping);
 *  - rivers: warped zero-level sets of several noise fields at four scales, carved into land, widened to at least
 *    0.6 cells so they stay visible from orbit;
 *  - climate: temperature from latitude and altitude, moisture from noise, coast and the Hadley-cell dry belts;
 *    surface colour from climate (ice, tundra, taiga, forest, grass, savanna, desert, rainforest, rock, snow, sand).
 *
 * Rivers are level sets, not a hydrological simulation: they look like river systems but do not strictly flow
 * downhill into the sea. Documented limitation.
 */
public final class RealisticTerrain implements TerrainSampler {
    private final PlanetDefinition planet;
    private final Noise3 n;
    private final double radius;

    /** Above this height warm land counts as upland savanna/desert (vanilla would snow its normal biomes there). */
    public static final double WARM_UPLAND_FROM_M = 450.0;

    /** Chosen so about 30% of the surface is land (checked by test). */
    private static final double LAND_BIAS = 0.06;
    private static final double DETAIL_AMP = 200.0, DETAIL_PERSIST = 0.78, DETAIL_FREQ = 40.0;
    private static final int DETAIL_MAX_OCTAVES = 17;
    private static final double[] RIVER_FREQ = {5, 14, 40, 120};
    private static final double[] RIVER_WIDTH_M = {450, 160, 60, 22};

    public RealisticTerrain(PlanetDefinition planet) {
        this.planet = planet;
        this.n = new Noise3(planet.seed());
        this.radius = planet.radius();
    }

    @Override public double heightAt(Vec3 d) { return heightAt(d, 0.0); }

    @Override
    public double heightAt(Vec3 d, double cell) {
        double[] o = new double[5];
        sampleSurface(d, cell, o);
        return o[0];
    }

    @Override
    public void sample(Vec3 d, double cell, double[] out) {
        double[] o = new double[5];
        sampleSurface(d, cell, o);
        out[0] = out[1] = o[0];
    }

    /** Everything the world generators need to know about one surface point. */
    public record Surface(double height, double temperature, double moisture, double river, double continental,
                          double r, double g, double b, boolean water) {}

    @Override
    public void sampleSurface(Vec3 d, double cell, double[] out) {
        Surface s = surface(d, cell);
        out[0] = s.height(); out[1] = s.r(); out[2] = s.g(); out[3] = s.b(); out[4] = s.water() ? 1.0 : 0.0;
    }

    public Surface surface(Vec3 d, double cell) {
        final double x = d.x(), y = d.y(), z = d.z();
        double[] out = new double[5];

        // ---- continents ------------------------------------------------------------------------------------
        double wx = n.fbm(x * 1.3 + 11, y * 1.3 + 5, z * 1.3 + 3, 3);
        double wy = n.fbm(x * 1.3 - 7, y * 1.3 + 19, z * 1.3 + 2, 3);
        double wz = n.fbm(x * 1.3 + 23, y * 1.3 - 3, z * 1.3 - 9, 3);
        double qx = x + 0.30 * wx, qy = y + 0.30 * wy, qz = z + 0.30 * wz;
        double cn = n.fbm(qx * 1.15 + 31.4, qy * 1.15 + 7.7, qz * 1.15 - 12.1, 6);
        double t = cn - LAND_BIAS;                                      // > 0 land, < 0 ocean
        double base;
        if (t < 0) base = -60.0 - 4300.0 * Math.pow(smooth(0.0, 0.42, -t), 0.85);
        else base = 15.0 + 650.0 * smooth(0.0, 0.5, t);
        double landW = smooth(0.015, 0.20, t);

        // ---- mountain belts ----------------------------------------------------------------------------------
        double orog = smooth(-0.12, 0.28, n.fbm(qx * 2.2 + 71, qy * 2.2 - 4, qz * 2.2 + 9, 3));
        double mx = qx + 0.12 * wy, my = qy + 0.12 * wz, mz = qz + 0.12 * wx;
        double ridge = n.ridged(mx * 4.8 + 5.5, my * 4.8 - 2.2, mz * 4.8 + 8.1, 5);
        double mountain = orog * landW * Math.pow(ridge, 1.7) * 7500.0;

        // ---- detail relief (octaves fade out below 2 cells) -----------------------------------------------------
        double rough = (0.6 + 0.9 * orog) * (0.3 + 0.7 * landW);
        double det = 0.0, amp = DETAIL_AMP, f = DETAIL_FREQ;
        for (int k = 0; k < DETAIL_MAX_OCTAVES; k++) {
            double wavelength = 2.0 * Math.PI * radius / f;
            double fade = cell <= 0 ? 1.0 : Math.max(0.0, Math.min(1.0, wavelength / (2.0 * cell) - 1.0));
            if (fade <= 0.0) break;
            det += fade * amp * n.noise(x * f + 101.3, y * f - 33.7, z * f + 57.9);
            amp *= DETAIL_PERSIST; f *= 2.0;
        }
        double h0 = base + mountain + det * rough;

        // ---- rivers --------------------------------------------------------------------------------------------
        double riverMask = 0.0, riverTint = 0.0, carve = 0.0;
        if (h0 > 2.0 && landW > 0.0) {
            double fadeHigh = 1.0 - smooth(1800.0, 3200.0, h0);
            for (int s = 0; s < RIVER_FREQ.length && fadeHigh > 0.0; s++) {
                double fr = RIVER_FREQ[s], lambda = 2.0 * Math.PI * radius / fr;
                double wEff = Math.max(RIVER_WIDTH_M[s], 1.3 * cell);       // >= 1.3 cells: a thinner line cannot be shown by vertex colours (it would turn into dots)
                wEff = Math.min(wEff, 0.0008 * lambda);                  // far views: thin lines, ~2% land coverage per scale
                if (cell > 0.05 * lambda) continue;                           // below the resolvable scale for this class
                double ox = 17.0 * (s + 1), oz = 29.0 * (s + 2);
                double vx = n.noise(x * fr * 0.7 + ox, y * fr * 0.7, z * fr * 0.7 + oz) * 0.10;
                double vy = n.noise(x * fr * 0.7 - ox, y * fr * 0.7 + oz, z * fr * 0.7) * 0.10;
                double vz = n.noise(x * fr * 0.7 + oz, y * fr * 0.7 - ox, z * fr * 0.7 + 3) * 0.10;
                double nv = Math.abs(n.fbm((x + vx) * fr + ox * 3, (y + vy) * fr - oz, (z + vz) * fr + 5.5, 3));
                double hw = (wEff / radius) * fr * 1.4;
                double m = (1.0 - smooth(0.0, hw * 2.4, nv)) * fadeHigh;      // soft shoulders: vertex colours interpolate, so hard edges alias into blocks
                riverTint = Math.max(riverTint, m * Math.pow(Math.min(1.0, RIVER_WIDTH_M[s] / wEff), 0.7));   // colour: a river thinner than a cell is only a faint tint (coverage), not a cell-sized blue dot
                if (m > riverMask) {
                    riverMask = m;
                    carve = Math.min(0.45 * h0 + 2.0, 4.0 + 0.06 * wEff);
                }
            }
        }
        double h = h0 - riverMask * carve;

        // ---- climate ---------------------------------------------------------------------------------------------
        double lat = Math.asin(Math.max(-1.0, Math.min(1.0, y)));
        double alat = Math.abs(lat);
        double temp = 29.0 - 52.0 * Math.pow(Math.sin(alat), 3.0) + 4.0 * n.fbm(x * 3 + 9, y * 3, z * 3 - 9, 3)
                - 6.5 * Math.max(h, 0.0) / 1000.0;
        double moist = 0.5 + 0.38 * n.fbm(x * 4.2 + 41, y * 4.2 + 3, z * 4.2, 4)
                + 0.22 * smooth(0.0, 0.35, 0.35 - Math.abs(t)) * (t < 0 ? 1.0 : 0.6)                 // near coasts
                - 0.38 * Math.exp(-Math.pow((alat - Math.toRadians(27)) / Math.toRadians(11), 2))   // subtropical dry belts
                + 0.26 * Math.exp(-Math.pow(lat / Math.toRadians(9), 2));                           // wet tropics
        moist = Math.max(0.0, Math.min(1.0, moist));

        out[0] = h;
        colour(h, t, temp, moist, riverMask, riverTint, cell, x, y, z, out);
        return new Surface(h, temp, moist, riverMask, t, out[1], out[2], out[3], out[4] > 0.5);
    }

    private void colour(double h, double t, double temp, double moist, double river, double riverTint, double cell,
                        double x, double y, double z, double[] out) {
        double[] c = new double[3];
        boolean water;
        if (h < 0.0) {                                                    // ocean
            double depth = Math.min(1.0, -h / 3500.0);
            double[] shallow = {0.07, 0.42, 0.55}, deep = {0.01, 0.06, 0.22};
            SurfacePalette.mix(c, shallow, deep, Math.pow(depth, 0.45));
            if (temp < -8.0) {                                            // sea ice
                double[] ice = {0.86, 0.92, 0.97};
                SurfacePalette.mix(c, c, ice, smooth(-8.0, -20.0, temp));
            }
            water = true;
        } else {
            double[] desert = {0.80, 0.69, 0.44}, savanna = {0.60, 0.57, 0.28}, grass = {0.38, 0.55, 0.20},
                    forest = {0.12, 0.36, 0.13}, rain = {0.04, 0.28, 0.09}, taiga = {0.11, 0.27, 0.17},
                    tundra = {0.52, 0.55, 0.47}, rock = {0.45, 0.42, 0.39}, snow = {0.95, 0.96, 0.98},
                    sand = {0.84, 0.78, 0.56};
            SurfacePalette.mix(c, desert, savanna, smooth(0.14, 0.34, moist));
            SurfacePalette.mix(c, c, grass, smooth(0.30, 0.50, moist));
            SurfacePalette.mix(c, c, forest, smooth(0.50, 0.74, moist) * smooth(4.0, 14.0, temp));
            SurfacePalette.mix(c, c, rain, smooth(0.72, 0.92, moist) * smooth(20.0, 25.0, temp));
            SurfacePalette.mix(c, c, taiga, smooth(8.0, -2.0, temp) * smooth(0.25, 0.55, moist));
            SurfacePalette.mix(c, c, tundra, smooth(2.0, -8.0, temp));
            double upland = smooth(WARM_UPLAND_FROM_M - 100.0, WARM_UPLAND_FROM_M + 100.0, h) * smooth(3.0, 7.0, temp) * (1.0 - smooth(1500.0, 2400.0, h));
            SurfacePalette.mix(c, c, moist < 0.2 ? desert : savanna, upland);
            SurfacePalette.mix(c, c, rock, smooth(1400.0, 3200.0, h) * 0.85);
            SurfacePalette.mix(c, c, snow, Math.max(smooth(-7.0, -19.0, temp), smooth(3600.0, 4800.0, h)));
            SurfacePalette.mix(c, c, sand, (1.0 - smooth(1.0, 9.0, h)) * smooth(-0.002, 0.02, t) * (1.0 - smooth(-2.0, 6.0, -temp)));
            // colour variation from 1.3 km down to 13 m (fades out below the mesh resolution), plus a canopy speckle in forests
            double tint = 1.0;
            double[] tf = {3.0e4, 3.0e5, 3.0e6}, ta = {0.10, 0.09, 0.08};
            for (int k = 0; k < tf.length; k++) {
                double wl = 2.0 * Math.PI * radius / tf[k];
                double fade = cell <= 0 ? 1.0 : Math.max(0.0, Math.min(1.0, wl / (2.0 * cell) - 1.0));
                tint += fade * ta[k] * n.noise(x * tf[k] + 3, y * tf[k] - 5, z * tf[k] + 7 * k);
            }
            double forestness = smooth(0.45, 0.75, moist) * smooth(2.0, 12.0, temp) * (1.0 - smooth(1800.0, 3000.0, h));
            double wlc = 2.0 * Math.PI * radius / 2.4e6;
            double canopy = cell <= 0 ? 1.0 : Math.max(0.0, Math.min(1.0, wlc / (2.0 * cell) - 1.0));
            tint *= 1.0 - forestness * canopy * (0.16 + 0.22 * (0.5 + 0.5 * n.noise(x * 2.4e6 + 9, y * 2.4e6, z * 2.4e6 - 4)));
            for (int i = 0; i < 3; i++) c[i] = Math.max(0.0, Math.min(1.0, c[i] * tint));
            water = false;
            if (river > 0.0) {
                double[] rw = {0.08, 0.30, 0.52};
                SurfacePalette.mix(c, c, rw, smooth(0.08, 0.85, riverTint));
                water = riverTint > 0.7;                                      // glossy only when the river really covers the cell
            }
        }
        out[1] = c[0]; out[2] = c[1]; out[3] = c[2];
        out[4] = water ? 1.0 : 0.0;
    }

    @Override
    public double unresolvedDetail(double cell) {
        // Octaves with wavelength < 2 cells are missing. Independent octaves add up as a root of squares (not as a sum of
        // amplitudes), and the visible relief factor ("rough") is ~0.7 on average. Narrow rivers are widened, costing depth.
        double sq = 0.0, amp = DETAIL_AMP, f = DETAIL_FREQ;
        for (int k = 0; k < DETAIL_MAX_OCTAVES; k++) {
            double wavelength = 2.0 * Math.PI * radius / f;
            if (wavelength < 2.0 * cell) { double a = amp * 0.7 * 0.7; sq += a * a; }
            amp *= DETAIL_PERSIST; f *= 2.0;
        }
        return Math.sqrt(sq) + Math.min(20.0, 0.12 * Math.max(0.0, cell - 1.0));
    }

    /** Heuristic (not provable): relief is rough and rivers are narrow; bounds saturate at the planet radii anyway. */
    @Override public double slopeBound() { return 14.0; }
}
