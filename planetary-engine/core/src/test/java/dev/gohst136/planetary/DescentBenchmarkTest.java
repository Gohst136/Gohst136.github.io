package dev.gohst136.planetary;

import dev.gohst136.planetary.lod.*;
import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.telemetry.FrameStats;
import dev.gohst136.planetary.terrain.ProceduralTerrain;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

/** Headless version of the spec's orbit-to-ground scenario (spec section 46), CPU selection only. */
class DescentBenchmarkTest {
    final PlanetDefinition planet = PlanetDefinition.earthlike(1337);
    final ProceduralTerrain terrain = new ProceduralTerrain(planet);

    CameraView cam(Vec3 pos, Vec3 target, double speed) {
        Vec3 fwd = target.sub(pos).normalize();
        Vec3 up = Math.abs(fwd.normalize().y()) > 0.99 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
        return new CameraView(pos, fwd, up, Math.toRadians(70), 1080, 1920, speed);
    }

    @Test void farViewIsCheapAndBackSideIsCulled() {
        QuadtreeSelector s = new QuadtreeSelector(planet, terrain, QuadtreeSelector.Params.defaults());
        Vec3 pos = new Vec3(planet.radius() + 20_000_000, 0, 0);
        QuadtreeSelector.Result r = s.select(cam(pos, Vec3.ZERO, 0));
        assertTrue(r.patches.size() > 0 && r.patches.size() < 400, "patches=" + r.patches.size());
        assertTrue(r.culledHorizon > 0);
    }

    @Test void descentFromTwentyThousandKmReachesBlockScaleWithBoundedBudgetAndNoFlicker() {
        QuadtreeSelector.Params params = QuadtreeSelector.Params.defaults();
        QuadtreeSelector s = new QuadtreeSelector(planet, terrain, params);
        Vec3 dir = new Vec3(0.3, 0.5, 0.8).normalize();
        double ground = planet.radius() + terrain.heightAt(dir);
        FrameStats timing = new FrameStats(100_000);
        double alt = 20_000_000, dt = 1.0 / 60;
        int frames = 0, maxPatches = 0, totalMerges = 0, finalLevel = 0, flickerFrames = 0;
        while (alt > 2.0) {
            double speed = Math.max(5, alt * 0.8);            // exponential approach, ~0.8 alt/s
            double next = alt - speed * dt;
            alt = Math.max(2.0, next);
            Vec3 pos = dir.mul(ground + alt);
            long t0 = System.nanoTime();
            QuadtreeSelector.Result r = s.select(cam(pos, dir.mul(ground), speed));
            timing.record((System.nanoTime() - t0) / 1e6);
            maxPatches = Math.max(maxPatches, r.patches.size());
            totalMerges += r.merges;
            if (r.merges > 0) flickerFrames++;
            finalLevel = r.maxLevel;
            frames++;
        }
        System.out.printf("descent: frames=%d maxPatches=%d finalLevel=%d merges=%d select avg=%.3fms p99=%.3fms worst=%.3fms%n",
                frames, maxPatches, finalLevel, totalMerges, timing.average(), timing.p99(), timing.worst());
        assertTrue(maxPatches <= params.patchBudget() * 2, "budget feedback keeps counts bounded: " + maxPatches);
        assertTrue(finalLevel >= 17, "must refine to ~block scale: " + finalLevel);
        // monotone approach: hysteresis must prevent split/merge flapping. Only budget feedback may merge.
        assertTrue(flickerFrames <= frames * 0.02, "flicker frames=" + flickerFrames + "/" + frames);
    }

    @Test void stationaryCameraIsPerfectlyStable() {
        QuadtreeSelector s = new QuadtreeSelector(planet, terrain, QuadtreeSelector.Params.defaults());
        Vec3 dir = new Vec3(0, 1, 0);
        CameraView c = cam(dir.mul(planet.radius() + 50_000), dir.mul(planet.radius()), 0);
        s.select(c);
        for (int i = 0; i < 20; i++) { var r = s.select(c); assertEquals(0, r.merges); assertEquals(0, r.splits); }
    }

    @Test void horizonViewAtLowAltitudeStaysBounded() {
        QuadtreeSelector s = new QuadtreeSelector(planet, terrain, QuadtreeSelector.Params.defaults());
        Vec3 dir = new Vec3(0, 1, 0);
        Vec3 pos = dir.mul(planet.radius() + terrain.heightAt(dir) + 1000);
        CameraView c = new CameraView(pos, new Vec3(1, 0, 0), dir, Math.toRadians(70), 1080, 1920, 0);
        var r = s.select(c);
        System.out.println("horizon view: patches=" + r.patches.size() + " maxLevel=" + r.maxLevel);
        assertTrue(r.patches.size() > 45 && r.patches.size() < 6000, "patches=" + r.patches.size());
    }
}
