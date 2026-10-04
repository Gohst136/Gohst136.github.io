package dev.gohst136.planetary;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.terrain.RealisticTerrain;
import org.junit.jupiter.api.Test;
import java.util.Random;
import static org.junit.jupiter.api.Assertions.*;

class RealisticTerrainTest {
    static Vec3 rnd(Random r) { return new Vec3(r.nextGaussian(), r.nextGaussian(), r.nextGaussian()).normalize(); }

    @Test void looksLikeAPlanet() {
        for (long seed : new long[]{1, 2, 3, 42, 99999, -7}) {
            PlanetDefinition p = PlanetDefinition.earth(seed);
            RealisticTerrain t = new RealisticTerrain(p);
            Random r = new Random(seed);
            int n = 6000, land = 0, river = 0, ice = 0, mountains = 0;
            double min = 1e18, max = -1e18;
            double[] o = new double[5];
            for (int i = 0; i < n; i++) {
                Vec3 d = rnd(r);
                t.sampleSurface(d, 20_000, o);          // far-orbit mesh cell
                min = Math.min(min, o[0]); max = Math.max(max, o[0]);
                if (o[0] > 0) { land++; if (o[4] > 0.5) river++; }
                if (o[1] > 0.8 && o[2] > 0.8 && o[3] > 0.8) ice++;
                if (o[0] > 2500) mountains++;
            }
            double landFrac = land / (double) n;
            System.out.printf("seed %d: land %.2f  rivers-of-land %.3f  ice %.3f  >2.5km %.3f  height %.0f..%.0f%n", seed, landFrac, land == 0 ? 0 : river / (double) land, ice / (double) n, mountains / (double) n, min, max);
            assertTrue(landFrac > 0.2 && landFrac < 0.42, "land fraction " + landFrac + " seed " + seed);
            assertTrue(min >= -p.maxDepth() && max <= p.maxHeight());
            assertTrue(min < -2500 && max > 1500, "needs deep oceans and high mountains");
            assertTrue(ice / (double) n > 0.01, "polar ice");
        }
    }

    @Test void deterministicAndContinuousAtHumanScale() {
        PlanetDefinition p = PlanetDefinition.earth(5);
        RealisticTerrain a = new RealisticTerrain(p), b = new RealisticTerrain(PlanetDefinition.earth(5));
        Random r = new Random(11);
        double worst = 0;
        for (int i = 0; i < 3000; i++) {
            Vec3 d = rnd(r);
            assertEquals(a.heightAt(d, 1), b.heightAt(d, 1));
            Vec3 e = d.add(rnd(r).mul(1.0 / p.radius())).normalize();          // ~1 m away
            worst = Math.max(worst, Math.abs(a.heightAt(d, 1) - a.heightAt(e, 1)) / d.distance(e) / p.radius());
        }
        assertTrue(worst < 12.0, "max slope (m per m): " + worst);
    }

    @Test void riversExistOnLandAtAllScales() {
        RealisticTerrain t = new RealisticTerrain(PlanetDefinition.earth(8));
        Random r = new Random(5);
        for (double cell : new double[]{30_000, 2_000, 100, 5}) {
            int land = 0, water = 0; double[] o = new double[5];
            for (int i = 0; i < 20000; i++) {
                t.sampleSurface(rnd(r), cell, o);
                if (o[0] > 5) { land++; if (o[4] > 0.5) water++; }
            }
            double f = water / (double) land;
            System.out.printf("cell %.0f m: river fraction of land %.4f%n", cell, f);
            assertTrue(f > 0.0003 && f < 0.15, "cell " + cell + " river fraction " + f);
        }
    }
}
