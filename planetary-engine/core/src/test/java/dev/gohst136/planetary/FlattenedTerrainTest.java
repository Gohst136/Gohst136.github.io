package dev.gohst136.planetary;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.terrain.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class FlattenedTerrainTest {
    final PlanetDefinition p = PlanetDefinition.earthlikeVanilla(11);
    final ProceduralTerrain base = new ProceduralTerrain(p);

    @Test void flatInsideBaseOutsideAndContinuousBetween() {
        Vec3 a = new Vec3(0.2, 0.7, 0.4).normalize();
        var f = new FlattenedTerrain(base, a, p.radius(), 1000, 8000);
        double h0 = f.heightAt(a);
        Vec3 u = a.cross(new Vec3(0, 0, 1)).normalize();
        for (double m : new double[]{0, 200, 700, 1000}) {
            Vec3 d = a.add(u.mul(m / p.radius())).normalize();
            assertEquals(h0, f.heightAt(d), 1e-6, "flat at " + m + " m");
        }
        Vec3 far = a.add(u.mul(20_000 / p.radius())).normalize();
        assertEquals(base.heightAt(far), f.heightAt(far), 1e-9);
        double prev = f.heightAt(a), worst = 0;
        for (double m = 0; m < 10_000; m += 5) {                       // no jumps along a 10 km line
            double h = f.heightAt(a.add(u.mul(m / p.radius())).normalize());
            worst = Math.max(worst, Math.abs(h - prev)); prev = h;
        }
        assertTrue(worst < 3.0, "max change per 5 m step: " + worst);
    }
}
