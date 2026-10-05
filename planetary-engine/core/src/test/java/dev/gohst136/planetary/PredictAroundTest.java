package dev.gohst136.planetary;

import dev.gohst136.planetary.math.Vec3;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class PredictAroundTest {
    @Test void lowFlightStaysOnTheSphereWhereTheTangentLeaves() {
        double R = 6_421_000;
        Vec3 p = new Vec3(R, 0, 0), v = new Vec3(0, 4.0e6, 0);          // 4,000 km/s tangential at 50 km altitude
        Vec3 curved = Vec3.predictAround(p, v, 0.5), straight = p.add(v.mul(0.5));
        assertEquals(R, curved.length(), 1e-3, "radius preserved");
        assertTrue(straight.length() - R > 250_000, "the straight line leaves by hundreds of km: " + (straight.length() - R));
        assertEquals(4.0e6 * 0.5 / R, Math.acos(curved.normalize().dot(p.normalize())), 1e-9);
    }

    @Test void radialVelocityIsKeptAndZeroTangentialWorks() {
        Vec3 p = new Vec3(0, 7_000_000, 0);
        assertEquals(7_000_000 - 500, Vec3.predictAround(p, new Vec3(0, -100, 0), 5).length(), 1e-6);
        Vec3 q = Vec3.predictAround(p, new Vec3(30, 0, 0), 2);
        assertTrue(q.length() > 6_999_999 && q.length() < 7_000_001);
    }

    @Test void rotateQuarterTurn() {
        Vec3 r = new Vec3(1, 0, 0).rotate(new Vec3(0, 0, 1), Math.PI / 2);
        assertEquals(0, r.x(), 1e-12); assertEquals(1, r.y(), 1e-12);
    }
}
