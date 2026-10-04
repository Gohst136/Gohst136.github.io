package dev.gohst136.planetary;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.*;
import dev.gohst136.planetary.terrain.*;
import org.junit.jupiter.api.Test;
import java.util.Random;
import static org.junit.jupiter.api.Assertions.*;

class HybridTerrainTest {
    final PlanetDefinition planet = PlanetDefinition.earthlikeVanilla(5);

    @Test void faceUvRoundTrips() {
        Random r = new Random(3);
        for (int i = 0; i < 5000; i++) {
            int f = r.nextInt(6);
            double u = r.nextDouble() * 2 - 1, v = r.nextDouble() * 2 - 1;
            Vec3 d = CubeSphere.direction(f, u, v);
            assertEquals(f, CubeSphere.faceOf(d));
            double[] uv = CubeSphere.faceUV(f, d);
            assertEquals(u, uv[0], 1e-9); assertEquals(v, uv[1], 1e-9);
        }
    }

    @Test void blendedPlaneHeightIsContinuousAcrossEveryCubeEdge() {
        // a deliberately wild, unrelated-per-position plane function: any seam would show as a jump
        var plane = (java.util.function.DoubleBinaryOperator) (x, z) -> 100 * Math.sin(x * 0.0013 + 1) * Math.cos(z * 0.0017) + 40 * Math.sin(x * 0.0101 + z * 0.0071);
        var h = new HybridTerrain(planet, new ProceduralTerrain(planet), plane, 1500, 4000, 60, 0.06);
        Random r = new Random(4);
        double worstJump = 0;
        for (int i = 0; i < 4000; i++) {
            // pick a point on a random cube edge (not corner) and step 1 m to either side
            int f = r.nextInt(6);
            double t = r.nextDouble() * 1.6 - 0.8;
            double[] e = r.nextBoolean() ? new double[]{1, t} : new double[]{t, 1};
            Vec3 on = CubeSphere.direction(f, e[0], e[1]);
            Vec3 tangent = new Vec3(r.nextGaussian(), r.nextGaussian(), r.nextGaussian()).cross(on).normalize();
            Vec3 a = on.add(tangent.mul(0.5 / planet.radius())).normalize();
            Vec3 b = on.sub(tangent.mul(0.5 / planet.radius())).normalize();
            worstJump = Math.max(worstJump, Math.abs(h.heightAt(a, 1) - h.heightAt(b, 1)));
        }
        assertTrue(worstJump < 5.0, "height jump across a 1 m step at a cube edge: " + worstJump);
    }

    @Test void detailFadesOutAtCoarseCells() {
        var plane = (java.util.function.DoubleBinaryOperator) (x, z) -> 50.0;
        var macro = new ProceduralTerrain(planet);
        var h = new HybridTerrain(planet, macro, plane, 1500, 4000, 60, 0.06);
        Vec3 d = new Vec3(0.3, 0.5, 0.8).normalize();
        assertEquals(macro.heightAt(d), h.heightAt(d, 10_000), 1e-9);
        assertEquals(Math.min(planet.maxHeight(), macro.heightAt(d) + 50), h.heightAt(d, 10), 1e-6);
    }
}
