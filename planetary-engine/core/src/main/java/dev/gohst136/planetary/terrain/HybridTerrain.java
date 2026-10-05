package dev.gohst136.planetary.terrain;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.PlaneUnwrap;
import dev.gohst136.planetary.planet.PlanetDefinition;

import java.util.function.DoubleBinaryOperator;

/**
 * Planet-scale macro terrain (continents, mountains) plus a fine-detail layer sampled from a flat-plane
 * height function such as vanilla worldgen. The detail layer fades in as the mesh cell size drops below
 * {@code fadeEnd} and is fully present below {@code fadeStart}: coarse levels never pay for (or alias) it.
 * This is the "coarse worldgen -> detailed worldgen -> real chunks" ladder of the design, first two rungs.
 */
public final class HybridTerrain implements TerrainSampler {
    private final PlanetDefinition planet;
    private final TerrainSampler macro;
    private final DoubleBinaryOperator detail;     // (x, z) metres in the unwrapped plane -> height rel. sea level
    private final double halfSpan, fadeStart, fadeEnd, detailAmplitude, detailSlope;

    public HybridTerrain(PlanetDefinition planet, TerrainSampler macro, DoubleBinaryOperator detail,
                         double fadeStart, double fadeEnd, double detailAmplitude, double detailSlope) {
        this.planet = planet; this.macro = macro; this.detail = detail;
        this.halfSpan = dev.gohst136.planetary.planet.PlaneUnwrap.halfSpan(planet.radius());
        this.fadeStart = fadeStart; this.fadeEnd = fadeEnd;
        this.detailAmplitude = detailAmplitude; this.detailSlope = detailSlope;
    }

    @Override public double heightAt(Vec3 d) { return heightAt(d, 0.0); }

    @Override
    public double heightAt(Vec3 d, double cell) {
        double[] o = new double[2];
        sample(d, cell, o);
        return o[0];
    }

    @Override
    public void sample(Vec3 d, double cell, double[] out) {
        double h = macro.heightAt(d, cell);
        double w = 1.0 - smooth(fadeStart, fadeEnd, cell);
        if (w <= 0.0) { out[0] = out[1] = h; return; }
        var m = PlaneUnwrap.map(d, halfSpan, 0.08);
        double v = detail.applyAsDouble(m.x1(), m.z1());
        if (m.w2() > 0.0) v += (detail.applyAsDouble(m.x2(), m.z2()) - v) * m.w2();
        out[0] = Math.max(-planet.maxDepth(), Math.min(planet.maxHeight(), h + w * v));
        out[1] = w * v + (1.0 - w) * h;       // fine views: local vanilla height; far views: planet-scale height
    }

    @Override
    public double unresolvedDetail(double cell) {
        // detail layer: roughly 6% slope until it saturates at its amplitude (it is fully missing above fadeEnd)
        // the layer has 1 m resolution (one value per block column): cells of <= 1 m resolve it completely
        return macro.unresolvedDetail(cell) + Math.min(detailAmplitude, detailSlope * Math.max(0.0, cell - 1.0));
    }

    /** Heuristic, not provable: vanilla terrain has cliffs; bounds saturate at the planet's min/max radius anyway. */
    @Override public double slopeBound() { return macro.slopeBound() + 20.0; }

    private static double smooth(double a, double b, double x) {
        double t = Math.max(0, Math.min(1, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
    }
}
