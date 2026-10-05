package dev.gohst136.planetary;

import static org.junit.jupiter.api.Assertions.*;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.physics.Gravity;
import dev.gohst136.planetary.system.StarSystem;
import org.junit.jupiter.api.Test;

class GravityTest {
    @Test
    void circularOrbitKeepsRadiusAndPeriod() {
        StarSystem sys = StarSystem.example(1);
        double gm = sys.body("earth").gm(), r = 6.371e6 + 400e3, v = Math.sqrt(gm / r), period = 2 * Math.PI * Math.sqrt(r * r * r / gm);
        Vec3 p = new Vec3(r, 0, 0), vel = new Vec3(0, v, 0);
        double dt = 1.0, minR = r, maxR = r;
        int steps = (int) Math.round(10 * period / dt);
        for (int i = 0; i < steps; i++) {
            Vec3[] s = Gravity.step(sys, "earth", 0, p, vel, Vec3.ZERO, dt, false);
            p = s[0]; vel = s[1];
            minR = Math.min(minR, p.length()); maxR = Math.max(maxR, p.length());
        }
        assertTrue(maxR - minR < 50.0, "radius wobble " + (maxR - minR));
    }

    @Test
    void moonAndSunPerturbationsAreTidalSmall() {
        StarSystem sys = StarSystem.example(1);
        Vec3 p = new Vec3(6.771e6, 0, 0);
        double main = sys.body("earth").gm() / (p.length() * p.length());
        double pert = Gravity.accel(sys, "earth", 1.0e6, p, true).sub(Gravity.accel(sys, "earth", 1.0e6, p, false)).length();
        assertTrue(pert > 1e-8 && pert < 1e-5 * main * 1e3, "tidal acceleration " + pert + " vs main " + main);
    }
}
