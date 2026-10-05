package dev.gohst136.planetary;

import static org.junit.jupiter.api.Assertions.*;

import dev.gohst136.planetary.camera.FlyCamera;
import dev.gohst136.planetary.math.Vec3;
import org.junit.jupiter.api.Test;

class FlyCameraTest {
    private static final Vec3 F = new Vec3(0, 0, 1), U = new Vec3(0, 1, 0);

    @Test void yawRightFromSouthLooksWest() {
        Vec3[] r = FlyCamera.rotate(F, U, Math.PI / 2, 0, 0);
        assertEquals(-1.0, r[0].x(), 1e-9);                     // facing +Z, turning right: towards -X (Minecraft yaw 90)
        assertEquals(1.0, r[1].y(), 1e-9);
    }

    @Test void pitchDownLooksDown() {
        Vec3[] r = FlyCamera.rotate(F, U, 0, Math.PI / 4, 0);
        assertTrue(r[0].y() < -0.7);
        assertTrue(r[1].z() > 0.7);                              // up tilts back over the head
    }

    @Test void noPitchClampAndStaysOrthonormal() {
        Vec3 f = F, u = U;
        for (int i = 0; i < 400; i++) {                         // loop the camera over the top several times, plus yaw and roll
            Vec3[] r = FlyCamera.rotate(f, u, 0.013, 0.05, 0.007);
            f = r[0]; u = r[1];
            assertEquals(1.0, f.length(), 1e-9);
            assertEquals(1.0, u.length(), 1e-9);
            assertEquals(0.0, f.dot(u), 1e-9);
        }
    }

    @Test void straightUpAndOverTheTopIsContinuous() {
        Vec3 f = F, u = U;
        Vec3 prev = f;
        for (int i = 0; i < 180; i++) {                          // pitch up by 180 degrees in 1 degree steps: passes through vertical
            Vec3[] r = FlyCamera.rotate(f, u, 0, -Math.toRadians(1), 0);
            f = r[0]; u = r[1];
            assertTrue(f.distance(prev) < 0.02, "step " + i);
            prev = f;
        }
        assertEquals(-1.0, f.z(), 1e-9);                         // now looking backwards, upside down
        assertEquals(-1.0, u.y(), 1e-9);
    }

    @Test void rollTurnsUpTowardsRight() {
        Vec3[] r = FlyCamera.rotate(F, U, 0, 0, Math.PI / 2);
        assertEquals(1.0, r[0].z(), 1e-9);                       // forward unchanged
        assertEquals(-1.0, r[1].x(), 1e-9);                      // right = F x U = -X, up rotates towards it
    }
}
