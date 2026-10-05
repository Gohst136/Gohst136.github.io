package dev.gohst136.planetary;

import static org.junit.jupiter.api.Assertions.*;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.planet.VerticalMap;
import dev.gohst136.planetary.terrain.RealisticTerrain;
import java.util.Random;
import org.junit.jupiter.api.Test;

/** Survey of the planet's heights vs the real-world vertical map (min_y -256, linear up to 1000 m, compressed above). */
class TerrainSurveyTest {
    @Test
    void surveyHeightsAgainstVerticalMap() {
        RealisticTerrain t = new RealisticTerrain(PlanetDefinition.earth(8));
        Random r = new Random(3);
        int n = 200_000, land = 0, above1000 = 0, above2000 = 0, above4000 = 0, deep = 0, ocean = 0;
        double maxH = 0, maxCompressionError = 0, sumErr = 0;
        for (int i = 0; i < n; i++) {
            double y = 2 * r.nextDouble() - 1, phi = 2 * Math.PI * r.nextDouble(), s = Math.sqrt(1 - y * y);
            double h = t.heightAt(new Vec3(s * Math.cos(phi), y, s * Math.sin(phi)), 100.0);
            if (h > 0) {
                land++;
                maxH = Math.max(maxH, h);
                if (h > 1000) { above1000++; double e = h - VerticalMap.toMeters(VerticalMap.toBlockY(h)); maxCompressionError = Math.max(maxCompressionError, e); }
                if (h > 2000) above2000++;
                if (h > 4000) above4000++;
            } else { ocean++; if (h < -250) deep++; }
        }
        System.out.printf("survey: land %.1f%% of the planet; of the land: >1000 m %.1f%%, >2000 m %.1f%%, >4000 m %.2f%%, max %.0f m; the vertical map squeezes the %.1f%% above 1000 m "
                        + "(block Y of a 4000 m peak = %.0f, of a 6000 m peak = %.0f); ocean deeper than the Y -250 floor: %.1f%%%n",
                100.0 * land / n, 100.0 * above1000 / land, 100.0 * above2000 / land, 100.0 * above4000 / land, maxH, 100.0 * above1000 / land,
                VerticalMap.toBlockY(4000), VerticalMap.toBlockY(6000), 100.0 * deep / ocean);
        assertTrue(land > n * 0.2 && land < n * 0.5);
    }
}
