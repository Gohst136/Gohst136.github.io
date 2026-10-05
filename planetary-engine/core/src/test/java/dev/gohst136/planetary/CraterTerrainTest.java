package dev.gohst136.planetary;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.terrain.CraterTerrain;
import org.junit.jupiter.api.Test;
import java.util.Random;
import static org.junit.jupiter.api.Assertions.*;

class CraterTerrainTest {
    final PlanetDefinition moon = new PlanetDefinition("planetary:moon", 5, 1_737_400.0, 1.62, 0, 9_000, 9_000, 2.36e6, 0, 14);
    final CraterTerrain t = new CraterTerrain(moon);

    @Test void deterministicBoundedAndCratered() {
        Random r = new Random(1);
        double min = 1e18, max = -1e18, dark = 0, bright = 0;
        double[] o = new double[5];
        int n = 5000;
        for (int i = 0; i < n; i++) {
            Vec3 d = new Vec3(r.nextGaussian(), r.nextGaussian(), r.nextGaussian()).normalize();
            t.sampleSurface(d, 3000, o);
            assertEquals(o[0], new CraterTerrain(moon).heightAt(d, 3000));
            min = Math.min(min, o[0]); max = Math.max(max, o[0]);
            if (o[2] < 0.35) dark++; if (o[2] > 0.5) bright++;
        }
        System.out.printf("moon height %.0f..%.0f dark %.2f bright %.2f%n", min, max, dark / n, bright / n);
        assertTrue(min >= -moon.maxDepth() && max <= moon.maxHeight());
        assertTrue(max - min > 3000, "needs relief: " + (max - min));
        assertTrue(dark / n > 0.05 && bright / n > 0.05, "maria and highlands both present");
    }

    @Test void finerCellsAddDetailCoarserCellsRemoveIt() {
        Random r = new Random(2);
        double varFine = 0, varCoarse = 0;
        for (int i = 0; i < 400; i++) {
            Vec3 d = new Vec3(r.nextGaussian(), r.nextGaussian(), r.nextGaussian()).normalize();
            Vec3 e = d.add(new Vec3(r.nextGaussian(), r.nextGaussian(), r.nextGaussian()).normalize().mul(200.0 / moon.radius())).normalize();
            varFine += Math.abs(t.heightAt(d, 5) - t.heightAt(e, 5));
            varCoarse += Math.abs(t.heightAt(d, 100_000) - t.heightAt(e, 100_000));
        }
        assertTrue(varFine > varCoarse, "fine=" + varFine + " coarse=" + varCoarse);
        assertTrue(t.unresolvedDetail(100_000) > t.unresolvedDetail(100));
    }
}
