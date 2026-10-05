package dev.gohst136.planetary;

import static org.junit.jupiter.api.Assertions.*;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.terrain.RealisticTerrain;
import dev.gohst136.planetary.world.PlanetColumns;
import dev.gohst136.planetary.world.PlanetColumns.Kind;
import java.util.EnumMap;
import java.util.Random;
import org.junit.jupiter.api.Test;

class PlanetColumnsTest {
    @Test
    void columnsAreConsistent() {
        PlanetDefinition p = PlanetDefinition.earth(8);
        RealisticTerrain t = new RealisticTerrain(p);
        double half = p.radius() * Math.PI / 4.0;
        Random r = new Random(2);
        EnumMap<Kind, Integer> count = new EnumMap<>(Kind.class);
        for (int i = 0; i < 20000; i++) {
            double y = 2 * r.nextDouble() - 1, phi = 2 * Math.PI * r.nextDouble(), s = Math.sqrt(1 - y * y);
            var c = PlanetColumns.earth(t.surface(new Vec3(s * Math.cos(phi), y, s * Math.sin(phi)), 1.0));
            count.merge(c.top(), 1, Integer::sum);
            if (c.ocean()) { assertTrue(c.waterTopY() >= 0 && c.waterTopY() >= c.groundY()); assertTrue(c.top() == Kind.SAND || c.top() == Kind.CLAY || c.top() == Kind.GRAVEL); }
            if (c.river()) assertEquals(Kind.GRAVEL, c.top());
            if (c.top() == Kind.GRASS_BLOCK) assertEquals(Kind.DIRT, c.filler());
            if (c.top() == Kind.SAND) assertEquals(Kind.SANDSTONE, c.filler());
        }
        System.out.println("surface kinds over the planet (20000 columns): " + count);
        assertTrue(count.getOrDefault(Kind.GRASS_BLOCK, 0) > 500 && count.getOrDefault(Kind.SAND, 0) > 500);
    }
}
