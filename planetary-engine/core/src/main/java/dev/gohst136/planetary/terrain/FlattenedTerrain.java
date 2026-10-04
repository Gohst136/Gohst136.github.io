package dev.gohst136.planetary.terrain;

import dev.gohst136.planetary.math.Vec3;

/**
 * Removes the large-scale relief of {@code base} around an anchor point: inside {@code flatRadius} metres the height is
 * the anchor's constant, outside {@code blendRadius} it is the base height, with a smooth blend between. Real vanilla
 * chunks have no planet-scale slope, so the planet mesh around a landing site has to be flat for the two to meet; the
 * relief returns gradually with distance ("close: local Minecraft, far: curved planet").
 * The anchor's own height is sampled once, so the whole field stays deterministic.
 */
public final class FlattenedTerrain implements TerrainSampler {
    private final TerrainSampler base;
    private final Vec3 anchor;
    private final double radius, flatRadius, blendRadius, anchorHeight;

    public FlattenedTerrain(TerrainSampler base, Vec3 anchorDir, double planetRadius, double flatRadius, double blendRadius) {
        this.base = base; this.anchor = anchorDir.normalize(); this.radius = planetRadius;
        this.flatRadius = flatRadius; this.blendRadius = blendRadius;
        this.anchorHeight = base.heightAt(this.anchor, 1e9);
    }

    @Override public double heightAt(Vec3 d) { return heightAt(d, 0.0); }

    @Override
    public double heightAt(Vec3 d, double cell) {
        double h = base.heightAt(d, cell);
        double dist = radius * Math.acos(Math.max(-1.0, Math.min(1.0, d.dot(anchor))));
        double t = Math.max(0.0, Math.min(1.0, (dist - flatRadius) / (blendRadius - flatRadius)));
        double w = t * t * (3 - 2 * t);
        return anchorHeight + (h - anchorHeight) * w;
    }

    @Override public double unresolvedDetail(double cell) { return base.unresolvedDetail(cell); }
    @Override public double slopeBound() { return base.slopeBound(); }
}
