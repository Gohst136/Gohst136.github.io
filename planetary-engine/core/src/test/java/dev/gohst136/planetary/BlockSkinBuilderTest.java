package dev.gohst136.planetary;

import static org.junit.jupiter.api.Assertions.*;

import dev.gohst136.planetary.lod.PatchKey;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.skin.BlockSkinBuilder;
import dev.gohst136.planetary.skin.SkinMesh;
import dev.gohst136.planetary.skin.SkinStyle;
import dev.gohst136.planetary.terrain.RealisticTerrain;
import dev.gohst136.planetary.world.PlanetColumns;
import dev.gohst136.planetary.world.PlanetColumns.Kind;
import java.util.Random;
import org.junit.jupiter.api.Test;

class BlockSkinBuilderTest {
    static final SkinStyle STYLE = new SkinStyle() {
        public int slotTop(Kind k) { return 100 + k.ordinal(); }
        public int slotSide(Kind k) { return k.ordinal(); }
        public int slotSideOverlay(Kind k) { return k == Kind.GRASS_BLOCK ? 99 : -1; }
        public int slotWater() { return 98; }
        public int tintTop(PlanetColumns.Column c) { return 0xFFFFFF; }
        public int tintOverlay(PlanetColumns.Column c) { return 0x80C060; }
        public int tintWater(PlanetColumns.Column c) { return 0x3F76E4; }
    };

    @Test
    void patchesAreWellFormedAndCostWhatWeExpect() {
        PlanetDefinition p = PlanetDefinition.earth(8);
        RealisticTerrain t = new RealisticTerrain(p);
        BlockSkinBuilder b = new BlockSkinBuilder(p, t, STYLE);
        Random r = new Random(7);
        long quads = 0, ns = 0; int count = 0;
        for (int level = 15; level <= 18; level++) {
            for (int i = 0; i < 12; i++) {
                PatchKey k = new PatchKey(r.nextInt(6), level, r.nextInt(1 << level), r.nextInt(1 << level));
                long t0 = System.nanoTime();
                SkinMesh m = b.build(k);
                ns += System.nanoTime() - t0; count++;
                quads += m.quadCount();
                assertTrue(m.waterStart() >= 32 && m.waterStart() <= m.quadCount());
                // the top faces must tile the patch exactly: total area of top quads = 32 x 32 cells
                double cell = 1 << (18 - level), area = 0;
                for (int q = 0; q < m.waterStart(); q++) if (m.slot()[q] >= 100 && m.slot()[q] < 114) area += m.uv()[q * 8 + 4] * m.uv()[q * 8 + 3];
                assertEquals(1024.0 * cell * cell, area, 1e-6, "top faces cover the patch exactly once, level " + level);
                assertEquals(m.quadCount() * 12, m.pos().length);
                double edge = (1 << (18 - level)) * 32.0;
                for (int q = 0; q < m.quadCount(); q++)
                    for (int v = 0; v < 4; v++) {
                        double x = m.pos()[q * 12 + v * 3], y = m.pos()[q * 12 + v * 3 + 1], z = m.pos()[q * 12 + v * 3 + 2];
                        assertTrue(Math.abs(x) < edge * 1.6 + 3000 && Math.abs(y) < edge * 1.6 + 3000 && Math.abs(z) < edge * 1.6 + 3000, "vertex far from the patch: " + x + "," + y + "," + z);
                    }
            }
        }
        System.out.printf("block skin: %.0f quads per patch on average, %.1f ms per patch (single thread)%n", quads / (double) count, ns / 1e6 / count);
    }
}
