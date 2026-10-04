package dev.gohst136.planetary;

import dev.gohst136.planetary.lod.*;
import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.*;
import dev.gohst136.planetary.terrain.ProceduralTerrain;
import org.junit.jupiter.api.Test;
import java.util.Random;
import static org.junit.jupiter.api.Assertions.*;

class PatchBoundsTest {
    final PlanetDefinition planet = PlanetDefinition.earthlike(7);
    final ProceduralTerrain terrain = new ProceduralTerrain(planet);

    @Test void slopeBoundHoldsEmpirically() {
        Random rnd = new Random(1);
        double worst = 0;
        for (int i = 0; i < 20000; i++) {
            Vec3 a = new Vec3(rnd.nextGaussian(), rnd.nextGaussian(), rnd.nextGaussian()).normalize();
            double eps = Math.pow(10, -2 - rnd.nextDouble() * 5);
            Vec3 b = a.add(new Vec3(rnd.nextGaussian(), rnd.nextGaussian(), rnd.nextGaussian()).normalize().mul(eps)).normalize();
            worst = Math.max(worst, Math.abs(terrain.heightAt(a) - terrain.heightAt(b)) / a.distance(b));
        }
        assertTrue(worst <= terrain.slopeBound(), "worst=" + worst + " bound=" + terrain.slopeBound());
    }

    @Test void everySurfacePointLiesInsidePatchBoundingSphere() {
        Random rnd = new Random(2);
        for (int t = 0; t < 400; t++) {
            int level = rnd.nextInt(20), n = 1 << level;
            PatchKey k = new PatchKey(rnd.nextInt(6), level, rnd.nextInt(n), rnd.nextInt(n));
            PatchBounds pb = PatchBounds.of(planet, terrain, k);
            for (int s = 0; s < 200; s++) {
                Vec3 d = CubeSphere.patchDirection(k.face(), k.level(), k.x(), k.y(), rnd.nextDouble(), rnd.nextDouble());
                Vec3 p = d.mul(planet.radius() + terrain.heightAt(d));
                assertTrue(p.distance(pb.center()) <= pb.radius(), "outside bounds at " + k);
            }
        }
    }

    @Test void morphWeightsAreInRangeAndRootsDoNotMorph() {
        var sel = new QuadtreeSelector(planet, terrain, QuadtreeSelector.Params.defaults());
        Vec3 pos = new Vec3(planet.radius() + 3_000_000, 0, 0);
        var r = sel.select(new CameraView(pos, new Vec3(-1, 0, 0), new Vec3(0, 1, 0), Math.toRadians(70), 1080, 1920, 0));
        for (var p : r.patches) {
            assertTrue(p.morphToParent() >= 0 && p.morphToParent() <= 1);
            if (p.key().level() == 0) assertEquals(0f, p.morphToParent());
        }
    }
}
