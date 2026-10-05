package dev.gohst136.planetary;

import dev.gohst136.planetary.coord.UniversePos;
import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.system.BodyDefinition;
import dev.gohst136.planetary.system.StarSystem;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class StarSystemTest {
    final StarSystem sys = StarSystem.example(1);

    @Test void orbitalPeriodsMatchKeplerAndOrbitCloses() {
        var earth = sys.body("earth");
        double T = earth.orbitalPeriod(sys.body("sun").gm());
        assertEquals(365.25 * 86400, T, 0.01 * 365.25 * 86400, "about one year: " + T / 86400 + " d");
        Vec3 p0 = sys.relativeToParent("earth", 0), pT = sys.relativeToParent("earth", T);
        assertTrue(p0.distance(pT) < 1.0e3, "closes after one period: " + p0.distance(pT) + " m");
        double Tm = sys.body("moon").orbitalPeriod(sys.body("earth").gm());
        assertEquals(27.3 * 86400, Tm, 0.03 * 27.3 * 86400);
    }

    @Test void distanceRespectsPeriapsisAndApoapsis() {
        var e = sys.body("earth");
        double min = 1e30, max = 0;
        for (int i = 0; i < 2000; i++) {
            double r = sys.position("earth", i * 365.25 * 86400 / 2000).length();
            min = Math.min(min, r); max = Math.max(max, r);
        }
        assertEquals(e.semiMajorAxis() * (1 - e.eccentricity()), min, 2e8);
        assertEquals(e.semiMajorAxis() * (1 + e.eccentricity()), max, 2e8);
    }

    @Test void frameRoundTripIsPreciseEvenFarFromTheStar() {
        double t = 123456789.0;
        Vec3 local = new Vec3(6_371_000.5, -123.25, 4_000_000.125);
        UniversePos w = sys.fromBodyFrame("earth", t, local);
        Vec3 back = sys.toBodyFrame("earth", t, w);
        assertTrue(back.distance(local) < 1e-4, "round trip error " + back.distance(local) + " m at 1.5e11 m from the star");
        // a point 1 m above a point on the surface stays 1 m above it after the planet has moved and spun (relative frame is exact)
        UniversePos w2 = sys.fromBodyFrame("earth", t, local.add(new Vec3(1, 0, 0)));
        assertEquals(1.0, w2.minus(w).length(), 1e-4);
    }

    @Test void bodyFixedPointsRotateWithThePlanetAndSpinAxisStaysFixed() {
        Vec3 pole = new Vec3(0, 0, 6_371_000);
        double t = 4000.0;
        Vec3 p0 = sys.bodyToSystem("earth", 0, pole), p1 = sys.bodyToSystem("earth", t, pole);
        assertEquals(0.0, p0.distance(p1), 1e-6, "the pole does not move with the spin");
        Vec3 eq = new Vec3(6_371_000, 0, 0);
        double angle = Math.acos(sys.bodyToSystem("earth", 0, eq).dot(sys.bodyToSystem("earth", t, eq)) / (6_371_000.0 * 6_371_000.0));
        assertEquals(2 * Math.PI * t / 86164.1, angle, 1e-9);
        assertEquals(Math.toRadians(23.44), Math.acos(sys.spinAxis("earth").z()), 1e-9);
    }

    @Test void dominantBodyFollowsSphereOfInfluence() {
        double t = 1000.0;
        UniversePos nearEarth = sys.fromBodyFrame("earth", t, new Vec3(7_000_000, 0, 0));
        UniversePos nearMoon = sys.centre("moon", t).plus(new Vec3(5_000_000, 0, 0));
        UniversePos deep = UniversePos.ofMeters(3.0e11, 3.0e11, 0);
        assertEquals("earth", sys.dominantBody(nearEarth, t));
        assertEquals("moon", sys.dominantBody(nearMoon, t));
        assertEquals("sun", sys.dominantBody(deep, t));
    }

    @Test void rejectsBrokenSystems() {
        var star = new BodyDefinition("s", null, BodyDefinition.Kind.STAR, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1);
        var orphan = new BodyDefinition("p", "nope", BodyDefinition.Kind.PLANET, 1, 1, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        assertThrows(IllegalArgumentException.class, () -> new StarSystem(List.of(star, orphan)));
        assertThrows(IllegalArgumentException.class, () -> new StarSystem(List.of(star, star)));
    }
}
