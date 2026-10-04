package dev.gohst136.planetary.lod;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.CubeSphere;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.terrain.TerrainSampler;

/**
 * Bounds of a patch: a bounding sphere (covers terrain from minRadius to maxRadius)
 * and the angular radius of the patch as seen from the planet centre (for horizon culling).
 *
 * Height range is estimated per patch from a 9x9 terrain sample plus a margin (unresolved detail at
 * the sample spacing + 25% of the sampled range). This is a heuristic, not a proven bound; Phase 3
 * replaces it with precomputed hierarchical min/max (child bounds nested in parent bounds).
 */
public record PatchBounds(Vec3 center, double radius, Vec3 centerDir, double angularRadius, double edgeMeters) {

    public static PatchBounds of(PlanetDefinition p, TerrainSampler terrain, PatchKey k) {
        Vec3 dir = CubeSphere.patchDirection(k.face(), k.level(), k.x(), k.y(), 0.5, 0.5);
        Vec3 c = dir.mul(p.radius());
        double edge = p.radius() * (Math.PI / 2.0) / (double) (1L << k.level());
        double lo = Double.MAX_VALUE, hi = -Double.MAX_VALUE;
        final int n = 8;
        for (int j = 0; j <= n; j++) for (int i = 0; i <= n; i++) {
            double h = terrain.heightAt(CubeSphere.patchDirection(k.face(), k.level(), k.x(), k.y(), i / (double) n, j / (double) n));
            lo = Math.min(lo, h); hi = Math.max(hi, h);
        }
        double margin = terrain.unresolvedDetail(edge / n) + 0.25 * (hi - lo);
        double rLo = Math.max(p.minRadius(), p.radius() + lo - margin), rHi = Math.min(p.maxRadius(), p.radius() + hi + margin);
        Vec3 c0 = dir.mul((rLo + rHi) * 0.5);
        c = c0;
        double r = 0, ang = 0;
        double[] samples = {0, 0.5, 1};
        for (double fx : samples) for (double fy : samples) {
            Vec3 d = CubeSphere.patchDirection(k.face(), k.level(), k.x(), k.y(), fx, fy);
            ang = Math.max(ang, Math.acos(Math.max(-1, Math.min(1, d.dot(dir)))));
            r = Math.max(r, Math.max(d.mul(rLo).distance(c), d.mul(rHi).distance(c)));
        }
        return new PatchBounds(c, r * 1.02, dir, ang * 1.02, edge);
    }
}
