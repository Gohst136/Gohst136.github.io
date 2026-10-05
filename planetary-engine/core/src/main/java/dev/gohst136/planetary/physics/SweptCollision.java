package dev.gohst136.planetary.physics;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.terrain.TerrainSampler;

/**
 * Continuous collision of a moving point (the camera / a vehicle) against the planet surface, so a very fast move can never
 * tunnel through a mountain between two frames. The segment is sampled adaptively: step length is limited both by the
 * remaining clearance (a point far above the ground may jump far, sphere-tracing style) and by a hard maximum; where the
 * clearance becomes negative the crossing is refined by bisection.
 *
 * Terrain is queried with a coarse mesh cell size that grows with the distance travelled, so a 1,000 km/s move does not
 * evaluate 1 m detail along the whole path (small obstacles under a fast move are skipped on purpose, like LOD in rendering).
 * Pure Java, deterministic, thread-safe.
 */
public final class SweptCollision {
    private SweptCollision() {}

    /** Result: the furthest safe position along the move and whether the move was blocked. */
    public record Result(Vec3 position, boolean blocked, double fraction, int samples) {}

    /**
     * @param radius     planet baseline radius (m)
     * @param clearance  minimum height above the ground the point must keep (m)
     * @param maxSlope   upper bound of |dh/ds| of the terrain (used for sphere-tracing step safety); use the sampler's bound
     */
    public static Result move(TerrainSampler terrain, double radius, Vec3 from, Vec3 to, double clearance, double maxSlope) {
        Vec3 d = to.sub(from);
        double len = d.length();
        if (len < 1e-9) return new Result(from, false, 1.0, 0);
        double cell = Math.max(1.0, len / 64.0);                     // coarse query size for this move
        int samples = 0;
        double s = 0.0, safeS = 0.0;
        // at s = 0 the start may already be below the clearance (landed): allow leaving, forbid going deeper
        double c0 = clearanceAt(terrain, radius, from, cell, clearance);
        samples++;
        boolean startInside = c0 < 0;
        while (s < len) {
            double c = clearanceAt(terrain, radius, from.add(d.mul(s / len)), cell, clearance);
            samples++;
            if (c < 0 && !startInside) {
                // refine the crossing between safeS and s
                double lo = safeS, hi = s;
                for (int i = 0; i < 24; i++) {
                    double mid = 0.5 * (lo + hi);
                    if (clearanceAt(terrain, radius, from.add(d.mul(mid / len)), cell, clearance) >= 0) lo = mid; else hi = mid;
                    samples++;
                }
                return new Result(from.add(d.mul(lo / len)), true, lo / len, samples);
            }
            if (c >= 0) { startInside = false; safeS = s; }
            // sphere-tracing step: the ground cannot rise faster than maxSlope, so this much travel is safe
            double step = Math.max(cell * 0.5, Math.min(len / 2000.0 * 8.0 + 1.0, Math.max(0.0, c) / Math.max(1.0, maxSlope)));
            s += Math.max(step, len / 4000.0);
        }
        double cEnd = clearanceAt(terrain, radius, to, cell, clearance);
        samples++;
        if (cEnd < 0 && !startInside) return new Result(from.add(d.mul(safeS / len)), true, safeS / len, samples);
        return new Result(to, false, 1.0, samples);
    }

    /** Height above (positive) or below the required clearance at a point. */
    static double clearanceAt(TerrainSampler terrain, double radius, Vec3 p, double cell, double clearance) {
        double r = p.length();
        double ground = radius + terrain.heightAt(p.mul(1.0 / r), cell);
        return r - ground - clearance;
    }
}
