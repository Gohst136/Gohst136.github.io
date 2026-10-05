package dev.gohst136.planetary;

import dev.gohst136.planetary.planet.BodyPlane;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.planet.PlaneUnwrap;
import dev.gohst136.planetary.planet.VerticalMap;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class BodyPlaneTest {
    @Test void bodiesDoNotOverlapAndStayInsideTheWorldBorder() {
        double earthHalf = PlaneUnwrap.halfSpan(PlanetDefinition.EARTH_RADIUS), moonHalf = PlaneUnwrap.halfSpan(PlanetDefinition.MOON_RADIUS);
        double earthMax = PlaneUnwrap.PITCH * earthHalf + earthHalf;                            // face-square pitch + half span
        double moonPitch = PlaneUnwrap.PITCH * moonHalf;
        double moonMin = BodyPlane.offsetX(BodyPlane.MOON) - (moonPitch + moonHalf), moonMax = BodyPlane.offsetX(BodyPlane.MOON) + (moonPitch + moonHalf);
        assertTrue(earthMax < moonMin, "earth " + earthMax + " vs moon " + moonMin);
        assertTrue(moonMax < 3.0e7, "inside the +-3e7 border: " + moonMax);
        assertEquals(BodyPlane.HOME, BodyPlane.bodyAt(earthMax));
        assertEquals(BodyPlane.MOON, BodyPlane.bodyAt(moonMin + 1));
    }

    @Test void airlessVerticalMapIsMonotonicAndBounded() {
        double prev = -1e9;
        for (double h = -9000; h < 9000; h += 13) {
            double y = VerticalMap.toBlockYAirless(h);
            assertTrue(y >= prev - 1e-9);
            assertTrue(y >= -250.0 - 1e-9 && y <= 2031);
            prev = y;
        }
        assertEquals(VerticalMap.toBlockY(500), VerticalMap.toBlockYAirless(500), 1e-12);
    }
}
