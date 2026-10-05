package dev.gohst136.planetary;

import static org.junit.jupiter.api.Assertions.*;

import dev.gohst136.planetary.render.VanillaDaylight;
import org.junit.jupiter.api.Test;

class VanillaDaylightTest {
    @Test
    void noonMatchesTheLightmapOfTheGame() {
        // measured in the game (brightness option 0.5, noon): sky 15 = (251, 251, 251)
        double[] c = VanillaDaylight.lightmapSky15(VanillaDaylight.skyDarken(1.0), 0.5);
        for (double v : c) assertEquals(251.0, v * 255.0, 1.0);
    }

    @Test
    void skyDarkenAtTheEnds() {
        assertEquals(1.0, VanillaDaylight.skyDarken(0.9), 1e-12);
        assertEquals(0.2, VanillaDaylight.skyDarken(-0.5), 1e-12);
        assertEquals(0.36, VanillaDaylight.skyDarken(0.0), 1e-12);
    }

    @Test
    void dayTimeInversionRoundTrips() {
        for (double s = -1.0; s <= 1.0; s += 0.05) {
            for (boolean pm : new boolean[]{false, true}) {
                long t = VanillaDaylight.dayTimeForSunSin(s, pm);
                double back = Math.cos(2.0 * Math.PI * VanillaDaylight.celestialFraction(t));
                assertEquals(s, back, 0.01, "sun sin " + s + " via day time " + t);
            }
        }
        assertEquals(6000, VanillaDaylight.dayTimeForSunSin(1.0, true));
    }
}
