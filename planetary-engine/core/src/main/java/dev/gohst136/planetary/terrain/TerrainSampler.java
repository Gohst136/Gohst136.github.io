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
