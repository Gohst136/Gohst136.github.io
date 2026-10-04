package dev.gohst136.planetary.lod;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.terrain.TerrainSampler;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Screen-space-error driven selection over the six cube-face quadtrees.
 *
 * Error model (metres) for a patch with grid cell size c:
 *   eps(c) = terrain.unresolvedDetail(c) + c^2/(8R)      (missing octaves + chord sag)
 * projected(px) = eps * pixelsPerUnitDistance / distance-to-bounding-sphere.
 *
 * A node is split when projected > T and merged back only when it falls under T * hysteresis,
 * which removes threshold flicker. T is relaxed by camera speed (velocity-aware detail) and by
 * an adaptive load scale that tracks the patch budget.
 *
 * Thread ownership: one selector instance belongs to exactly one thread.
 */
public final class QuadtreeSelector {

    /** A selected patch plus its geomorph weight toward the parent grid in [0,1] (1 = parent shape). */
    public record SelectedPatch(PatchKey key, float morphToParent) {}

    public record Params(double thresholdPixels, double hysteresis, int maxLevel, int gridCells,
                         int patchBudget, double velocityDwellSeconds, double maxVelocityRelax) {
        public static Params defaults() { return new Params(0.75, 0.6, 22, 32, 6000, 0.05, 4.0); }
    }

    public static final class Result {
        public final List<SelectedPatch> patches = new ArrayList<>();
        public int culledHorizon, culledFrustum, maxLevel;
        public double effectiveThreshold;
        /** Nodes that were split last frame and are merged this frame (pop-in risk metric). */
        public int merges;
        /** Nodes newly split this frame. */
        public int splits;
    }

    private final PlanetDefinition planet;
    private final TerrainSampler terrain;
    private final Params params;
    private Set<PatchKey> splitPrev = new HashSet<>();
    private double loadScale = 1.0;
    private static final int BOUNDS_CACHE_LIMIT = 300_000;
    private final java.util.HashMap<PatchKey, PatchBounds> bounds = new java.util.HashMap<>();

    public QuadtreeSelector(PlanetDefinition planet, TerrainSampler terrain, Params params) {
        this.planet = planet; this.terrain = terrain; this.params = params;
    }

    public Result select(CameraView cam) {
        if (bounds.size() > BOUNDS_CACHE_LIMIT) bounds.clear();
        Result res = new Result();
        Set<PatchKey> splitNow = new HashSet<>();
        double camDist = cam.position().length();
        Vec3 camDir = cam.position().normalize();
        double rLo = planet.minRadius(), rHi = planet.maxRadius();
        // angle beyond which a point at rHi is hidden behind the rLo sphere
        double horizon = Math.acos(Math.min(1, rLo / Math.max(camDist, rLo))) + Math.acos(rLo / rHi);
        Ctx ctx = new Ctx(cam, camDir, horizon, res, splitNow, new HashSet<>());
        for (int face = 0; face < 6; face++) visit(new PatchKey(face, 0, 0, 0), ctx);

        for (PatchKey k : splitPrev) if (ctx.reached.contains(k) && !splitNow.contains(k)) res.merges++;
        for (PatchKey k : splitNow) if (!splitPrev.contains(k)) res.splits++;
        splitPrev = splitNow;

        // adaptive budget feedback: tighten quickly, relax slowly
        if (res.patches.size() > params.patchBudget()) loadScale = Math.min(64, loadScale * 1.25);
        else if (res.patches.size() < params.patchBudget() * 0.6) loadScale = Math.max(1.0, loadScale * 0.98);
        return res;
    }

    private record Ctx(CameraView cam, Vec3 camDir, double horizon, Result res, Set<PatchKey> splitNow,
                       Set<PatchKey> reached) {}

    private void visit(PatchKey k, Ctx c) {
        PatchBounds b = bounds.computeIfAbsent(k, key -> PatchBounds.of(planet, terrain, key));
        double theta = Math.acos(Math.max(-1, Math.min(1, c.camDir.dot(b.centerDir()))));
        if (theta - b.angularRadius() > c.horizon) { c.res.culledHorizon++; return; }
        if (!c.cam.sphereMayBeVisible(b.center(), b.radius())) { c.res.culledFrustum++; return; }

        c.reached.add(k);
        double dist = Math.max(1.0, c.cam.position().distance(b.center()) - b.radius());
        double cell = b.edgeMeters() / params.gridCells();
        double eps = terrain.unresolvedDetail(cell) + cell * cell / (8.0 * planet.radius());
        double px = eps * c.cam.pixelsPerUnitDistance() / dist;

        double relax = 1.0 + Math.min(params.maxVelocityRelax(), c.cam.speed() * params.velocityDwellSeconds() / dist);
        double t = params.thresholdPixels() * relax * loadScale;
        c.res.effectiveThreshold = t;
        if (splitPrev.contains(k)) t *= params.hysteresis();

        if (k.level() < params.maxLevel() && px > t) {
            c.splitNow.add(k);
            for (PatchKey child : k.children()) visit(child, c);
        } else {
            // geomorph weight toward the parent grid: 1 right after a split (child px ~ T/2), 0 at px >= T
            double w = k.level() == 0 ? 0 : 1.0 - Math.max(0, Math.min(1, (px / (params.thresholdPixels() * relax * loadScale) - 0.5) / 0.5));
            c.res.patches.add(new SelectedPatch(k, (float) w));
            c.res.maxLevel = Math.max(c.res.maxLevel, k.level());
        }
    }
}
