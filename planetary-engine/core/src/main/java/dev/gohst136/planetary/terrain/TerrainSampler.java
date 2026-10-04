package dev.gohst136.planetary.terrain;

import dev.gohst136.planetary.math.Vec3;

/**
 * Deterministic, thread-safe, side-effect-free height function over the unit sphere.
 * This is the seam where vanilla worldgen sampling (noise router / biome source) plugs in
 * later: coarse levels use the cheap sampler, the finest level defers to real chunks.
 */
public interface TerrainSampler {
    /** Height in metres relative to the planet baseline radius (negative = below). */
    double heightAt(Vec3 unitDir);

    /**
     * Height as seen by a mesh with the given cell size. Samplers whose fine detail is unresolvable (or
     * expensive) at coarse LODs may omit it here. Default: full-detail height.
     */
    default double heightAt(Vec3 unitDir, double cellSizeMeters) { return heightAt(unitDir); }

    /**
     * Mesh sample: out[0] = geometric height, out[1] = "colour height" used for shading. They differ where the fine detail
     * layer is local (vanilla worldgen heights relative to sea level) while the geometry also carries planet-scale relief:
     * a 2000 m plateau with a meadow on it must be coloured as a meadow, not as a 2000 m rock face.
     */
    default void sample(Vec3 unitDir, double cellSizeMeters, double[] out) {
        out[0] = out[1] = heightAt(unitDir, cellSizeMeters);
    }

    /**
     * Full surface sample for a mesh vertex: out[0] = height, out[1..3] = RGB, out[4] = water (0 land, 1 water).
     * Default: {@link #sample} geometry coloured by height; climate-aware samplers override it.
     */
    default void sampleSurface(Vec3 unitDir, double cellSizeMeters, double[] out) {
        double[] hh = new double[2];
        sample(unitDir, cellSizeMeters, hh);
        out[0] = hh[0];
        double[] rgb = new double[3];
        SurfacePalette.byHeight(hh[1], rgb);
        out[1] = rgb[0]; out[2] = rgb[1]; out[3] = rgb[2];
        out[4] = hh[1] < 0 ? 1.0 : 0.0;
    }

    /**
     * Upper bound of height detail (metres) that a mesh with the given cell size cannot
     * represent. Drives screen-space error: it is 0 once the mesh resolves all octaves.
     */
    double unresolvedDetail(double cellSizeMeters);

    /**
     * Provable upper bound of |dh| per unit of chord length on the unit sphere (metres per unit-sphere
     * distance). Lets bounds be derived rigorously: |h(x) - h(s)| <= slopeBound() * |x - s|.
     */
    double slopeBound();
}
