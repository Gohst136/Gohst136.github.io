package dev.gohst136.planetary;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.physics.SweptCollision;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.terrain.RealisticTerrain;
import org.junit.jupiter.api.Test;
import java.util.Random;
import static org.junit.jupiter.api.Assertions.*;

class SweptCollisionTest {
    final PlanetDefinition p = PlanetDefinition.earth(77);
    final RealisticTerrain t = new RealisticTerrain(p);

    @Test void straightThroughThePlanetIsStoppedAtTheSurface() {
        Vec3 up = new Vec3(0.3, 0.8, 0.5).normalize();
        double ground = p.radius() + t.heightAt(up, 100);
        Vec3 from = up.mul(ground + 50_000), to = up.mul(-(ground + 50_000));        // through the centre to the far side
        var r = SweptCollision.move(t, p.radius(), from, to, 2.0, t.slopeBound());
        assertTrue(r.blocked());
        double h = r.position().length() - (p.radius() + t.heightAt(r.position().normalize(), 100));
        assertEquals(2.0, h, 25.0, "stops at about the clearance above the ground (coarse-cell tolerance), got " + h);
        assertTrue(r.samples() < 20_000, "bounded work: " + r.samples());
    }

    @Test void highAltitudeMoveIsNotBlocked() {
        // 10 degree arc at 2000 km altitude: the straight chord stays far above the surface (a 90 degree chord would cut through the planet)
        Vec3 a = new Vec3(1, 0, 0).mul(p.radius() + 2_000_000), b = new Vec3(Math.cos(Math.toRadians(10)), Math.sin(Math.toRadians(10)), 0).mul(p.radius() + 2_000_000);
        var r = SweptCollision.move(t, p.radius(), a, b, 2.0, t.slopeBound());
        assertFalse(r.blocked());
        assertEquals(b.x(), r.position().x(), 1e-6);
    }

    @Test void fastGrazingFlightOverMountainsNeverEndsInsideTerrain() {
        Random rnd = new Random(9);
        int blocked = 0;
        for (int i = 0; i < 300; i++) {
            Vec3 dir = new Vec3(rnd.nextGaussian(), rnd.nextGaussian(), rnd.nextGaussian()).normalize();
            Vec3 tan = dir.cross(new Vec3(rnd.nextGaussian(), rnd.nextGaussian(), rnd.nextGaussian())).normalize();
            double h = p.radius() + t.heightAt(dir, 100) + 30 + rnd.nextDouble() * 400;
            Vec3 from = dir.mul(h);
            Vec3 to = dir.add(tan.mul(20_000 / p.radius())).normalize().mul(h);         // 20 km in one step at low altitude
            var r = SweptCollision.move(t, p.radius(), from, to, 2.0, t.slopeBound());
            Vec3 e = r.position();
            double cell = from.distance(to) / 64.0;                                     // the coarse query size the move used
            double ground = p.radius() + t.heightAt(e.normalize(), cell);
            assertTrue(e.length() >= ground + 2.0 - 0.5, "ended inside the coarse terrain it tested against: " + (e.length() - ground));
            if (r.blocked()) blocked++;
        }
        System.out.println("grazing 20 km moves blocked by terrain: " + blocked + "/300");
        assertTrue(blocked > 0 && blocked < 300, "some, not all, low flights hit terrain: " + blocked);
    }
}
