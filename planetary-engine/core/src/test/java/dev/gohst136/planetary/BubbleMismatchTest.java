package dev.gohst136.planetary;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.CubeSphere;
import dev.gohst136.planetary.planet.PlaneUnwrap;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.terrain.RealisticTerrain;
import java.util.Arrays;
import java.util.Random;
import org.junit.jupiter.api.Test;

/**
 * The real chunks live in the flat vanilla plane (terrain = f(PlaneUnwrap.inverse(x, z))); the planet backdrop is the true sphere. The bubble frame
 * places the plane on the sphere's tangent plane at the anchor (1:1). How far apart do the two surfaces drift with distance from the anchor?
 */
class BubbleMismatchTest {
    @Test
    void driftBetweenRealChunksAndBackdrop() {
        PlanetDefinition p = PlanetDefinition.earth(8);
        RealisticTerrain t = new RealisticTerrain(p);
        double halfSpan = PlaneUnwrap.halfSpan(p.radius()), R = p.radius();
        Random r = new Random(6);
        for (double dist : new double[]{200, 1000, 3000}) {
            double[] horiz = new double[600], dh = new double[600], horizJ = new double[600], dhJ = new double[600];
            double[] byEdge = new double[3];
            for (int k = 0; k < 600; k++) {
                Vec3 a;
                do {
                    double y = 2 * r.nextDouble() - 1, phi = 2 * Math.PI * r.nextDouble(), s = Math.sqrt(1 - y * y);
                    a = new Vec3(s * Math.cos(phi), y, s * Math.sin(phi));
                } while (PlaneUnwrap.edgeDistance(a) > 0.9995 || PlaneUnwrap.edgeDistance(a) < 0.9 || t.heightAt(a, 0.0) < 20);
                int face = CubeSphere.faceOf(a);
                var m = PlaneUnwrap.map(a, halfSpan, 0.0);
                Vec3 u = CubeSphere.uAxis(face);
                Vec3 ex = u.sub(a.mul(u.dot(a))).normalize(), ez = ex.cross(a);
                double ang = r.nextDouble() * 2 * Math.PI, dx = dist * Math.cos(ang), dz = dist * Math.sin(ang);
                Vec3 backdropDir = a.mul(R).add(ex.mul(dx)).add(ez.mul(dz)).normalize();      // what the bubble frame assumes
                Vec3 realDir = PlaneUnwrap.inverse(m.x1() + dx, m.z1() + dz, halfSpan);       // what the chunk generator evaluates
                horiz[k] = backdropDir.distance(realDir) * R;
                dh[k] = Math.abs(t.heightAt(backdropDir, 0.0) - t.heightAt(realDir, 0.0));
                // exact first-order chart (BubbleFrame): tangent vectors = Jacobian of the generator's plane -> direction function
                double hh = 40.0;
                Vec3 jx = PlaneUnwrap.inverse(m.x1() + hh, m.z1(), halfSpan).sub(PlaneUnwrap.inverse(m.x1() - hh, m.z1(), halfSpan)).mul(R / (2 * hh));
                Vec3 jz = PlaneUnwrap.inverse(m.x1(), m.z1() + hh, halfSpan).sub(PlaneUnwrap.inverse(m.x1(), m.z1() - hh, halfSpan)).mul(R / (2 * hh));
                Vec3 chartDir = a.mul(R).add(jx.mul(dx)).add(jz.mul(dz)).normalize();
                horizJ[k] = chartDir.distance(realDir) * R;
                dhJ[k] = Math.abs(t.heightAt(chartDir, 0.0) - t.heightAt(realDir, 0.0));
            }
            Arrays.sort(horiz); Arrays.sort(dh); Arrays.sort(horizJ); Arrays.sort(dhJ);
            System.out.printf("bubble mismatch at %4.0f m from the anchor: horizontal drift median %.1f m / 90%% %.1f m / max %.1f m; height difference median %.1f m / 90%% %.1f m / max %.1f m%n",
                    dist, horiz[300], horiz[540], horiz[599], dh[300], dh[540], dh[599]);
            System.out.printf("  with the Jacobian chart (this fix):                 horizontal drift median %.2f m / 90%% %.2f m / max %.2f m; height difference median %.2f m / 90%% %.2f m / max %.2f m%n",
                    horizJ[300], horizJ[540], horizJ[599], dhJ[300], dhJ[540], dhJ[599]);
            org.junit.jupiter.api.Assertions.assertTrue(horizJ[599] < 0.002 * dist * dist / 1000.0 + 0.5 + dist * 5e-4, "chart drift max " + horizJ[599]);
        }
    }
}
