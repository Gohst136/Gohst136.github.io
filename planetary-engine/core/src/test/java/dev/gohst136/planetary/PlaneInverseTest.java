package dev.gohst136.planetary;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.*;
import org.junit.jupiter.api.Test;
import java.util.Random;
import static org.junit.jupiter.api.Assertions.*;

class PlaneInverseTest {
    final double half = PlaneUnwrap.halfSpan(PlanetDefinition.EARTH_RADIUS);

    @Test void inverseUndoesMapInsideEveryFace() {
        Random r = new Random(1);
        for (int i = 0; i < 3000; i++) {
            Vec3 d = CubeSphere.direction(r.nextInt(6), r.nextDouble() * 1.9 - 0.95, r.nextDouble() * 1.9 - 0.95);
            var m = PlaneUnwrap.map(d, half, 0.0);
            Vec3 back = PlaneUnwrap.inverse(m.x1(), m.z1(), half);
            assertTrue(d.distance(back) < 1e-9, "round trip " + d.distance(back));
        }
    }

    @Test void extendedPlaneContinuesAcrossACubeEdge() {
        // walk 3 km in plane +x from just inside a face edge: the direction must move smoothly (no jump) across the edge
        double x0 = half - 1500, z0 = -(PlaneUnwrap.PITCH * half) / 2 + 0;               // face 1 (cx = 0, cz = -pitch/2), v = 0 line
        Vec3 prev = PlaneUnwrap.inverse(x0, z0, half);
        double worst = 0;
        for (double dx = 1; dx <= 3000; dx += 1) {
            Vec3 d = PlaneUnwrap.inverse(x0 + dx, z0, half);
            worst = Math.max(worst, d.distance(prev) * PlanetDefinition.EARTH_RADIUS);
            prev = d;
        }
        assertEquals(1.0, worst, 0.02, "1 plane metre must stay ~1 planet metre across the edge: " + worst);
    }

    @Test void verticalMapIsMonotonicAndInvertible() {
        double prev = -1e9;
        for (double h = -6000; h < 9000; h += 7) {
            double y = VerticalMap.toBlockY(h);
            assertTrue(y >= prev);
            assertTrue(y >= -256 && y <= 2031);
            prev = y;
        }
        for (double h : new double[]{-100, 0, 300, 799, 900, 2500, 6000}) assertEquals(h, VerticalMap.toMeters(VerticalMap.toBlockY(h)), 1e-6);
    }
}
