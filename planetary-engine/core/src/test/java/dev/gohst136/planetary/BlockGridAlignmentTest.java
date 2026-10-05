package dev.gohst136.planetary;

import static org.junit.jupiter.api.Assertions.*;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.CubeSphere;
import dev.gohst136.planetary.planet.PlaneUnwrap;
import dev.gohst136.planetary.planet.PlanetDefinition;
import java.util.Random;
import org.junit.jupiter.api.Test;

/** Quadtree cells at level 18 are exactly 1 block and sit exactly on the block grid of the vanilla plane (level 19: half a block, ...). */
class BlockGridAlignmentTest {
    @Test
    void levelCellsAreWholeBlocksOnTheGrid() {
        double half = PlaneUnwrap.halfSpan(PlanetDefinition.EARTH_RADIUS);
        assertEquals(4194304.0, half, 0.0);
        Random r = new Random(5);
        for (int level : new int[]{18, 16, 12, 6}) {
            double cell = 2.0 * half / (1L << level) / 32.0;
            assertEquals(Math.pow(2, 18 - level), cell, 1e-12);
            double worst = 0;
            for (int t = 0; t < 200; t++) {
                int face = r.nextInt(6), x = r.nextInt(1 << level), y = r.nextInt(1 << level), i = r.nextInt(33), j = r.nextInt(33);
                Vec3 d = CubeSphere.patchDirection(face, level, x, y, i / 32.0, j / 32.0);
                var m = PlaneUnwrap.map(d, half, 0.0);
                double gx = m.x1() / cell, gz = m.z1() / cell;
                worst = Math.max(worst, Math.max(Math.abs(gx - Math.rint(gx)), Math.abs(gz - Math.rint(gz))) * cell);
            }
            assertTrue(worst < 0.01, "level " + level + ": vertices are off the grid by up to " + worst + " m");
        }
    }
}
