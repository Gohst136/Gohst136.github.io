package dev.gohst136.planetary;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.terrain.RealisticTerrain;
import java.util.Arrays;
import java.util.Random;
import org.junit.jupiter.api.Test;

/** Survey: typical terrain slope on land at several horizontal scales (what the player experiences as steepness). */
class SlopeSurveyTest {
    @Test
    void slopesByScale() {
        PlanetDefinition p = PlanetDefinition.earth(8);
        RealisticTerrain t = new RealisticTerrain(p);
        Random r = new Random(4);
        double[] scales = {2, 10, 50, 250, 1000, 5000};
        StringBuilder sb = new StringBuilder("slope survey (land, median / 90th percentile of |dh|/dx): ");
        for (double dx : scales) {
            double[] sl = new double[4000]; int k = 0;
            while (k < sl.length) {
                double y = 2 * r.nextDouble() - 1, phi = 2 * Math.PI * r.nextDouble(), s = Math.sqrt(1 - y * y);
                Vec3 d = new Vec3(s * Math.cos(phi), y, s * Math.sin(phi));
                double h = t.heightAt(d, 0.0);
                if (h < 20) continue;
                Vec3 e = Vec3.ZERO.add(d).add(new Vec3(-d.z(), 0, d.x()).normalize().mul(dx / p.radius())).normalize();
                sl[k++] = Math.abs(t.heightAt(e, 0.0) - h) / dx;
            }
            Arrays.sort(sl);
            sb.append(String.format("dx=%.0f m: %.2f / %.2f   ", dx, sl[sl.length / 2], sl[(int) (sl.length * 0.9)]));
        }
        System.out.println(sb);
    }
}
