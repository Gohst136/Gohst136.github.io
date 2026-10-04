package dev.gohst136.planetary;

import dev.gohst136.planetary.coord.FloatingOrigin;
import dev.gohst136.planetary.coord.UniversePos;
import dev.gohst136.planetary.math.Vec3;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class CoordinateTest {
    @Test void normalisesAndSubtractsPreciselyFarFromOrigin() {
        double km = 1000.0;
        UniversePos a = UniversePos.ofMeters(8_273_472_183.0 * km, -5.5e12, 3.0);
        UniversePos b = a.plus(new Vec3(1.25, -2.5, 0.125));
        Vec3 d = b.minus(a);
        assertEquals(1.25, d.x(), 1e-6);
        assertEquals(-2.5, d.y(), 1e-6);
        assertEquals(0.125, d.z(), 1e-6);
        assertTrue(a.ox >= 0 && a.ox < UniversePos.SECTOR_SIZE);
    }

    @Test void rebasingDoesNotChangeRelativeRenderPositions() {
        UniversePos start = UniversePos.ofMeters(1e15, 2e15, -3e15);
        FloatingOrigin fo = new FloatingOrigin(start, 4096);
        UniversePos obj = start.plus(new Vec3(100.5, 20, -7));
        UniversePos cam = start;
        double lastObjToCam = fo.relative(obj).sub(fo.relative(cam)).length();
        int rebases = 0;
        for (int i = 0; i < 1000; i++) {
            cam = cam.plus(new Vec3(37.3, 0, 11.1));
            if (fo.update(cam)) rebases++;
            assertTrue(fo.relative(cam).length() <= 4096 + 1e-6, "camera stays near render origin");
        }
        assertTrue(rebases > 5);
        // object-to-camera vector derived via the origin equals the direct difference
        assertEquals(obj.minus(cam).length(), fo.relative(obj).sub(fo.relative(cam)).length(), 1e-6);
        assertTrue(lastObjToCam > 0);
    }
}
