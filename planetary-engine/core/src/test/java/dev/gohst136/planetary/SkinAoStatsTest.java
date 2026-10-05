package dev.gohst136.planetary;

import dev.gohst136.planetary.lod.PatchKey;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.skin.BlockSkinBuilder;
import dev.gohst136.planetary.skin.SkinMesh;
import dev.gohst136.planetary.terrain.RealisticTerrain;
import java.util.Random;
import org.junit.jupiter.api.Test;

/** Average brightness (AO included) of tops and walls per level: shows that coarse cells keep the brightness of the exact 1-block level. */
class SkinAoStatsTest {
    @Test
    void averageBrightnessByLevel() {
        PlanetDefinition p = PlanetDefinition.earth(8);
        RealisticTerrain t = new RealisticTerrain(p);
        BlockSkinBuilder b = new BlockSkinBuilder(p, t, BlockSkinBuilderTest.STYLE);
        Random r = new Random(11);
        StringBuilder sb = new StringBuilder("skin brightness by level (tops / walls, mean vertex brightness 0..1): ");
        for (int level = 18; level >= 15; level--) {
            double top = 0, wall = 0; long nt = 0, nw = 0;
            int patches = 0;
            while (patches < 14) {
                int face = r.nextInt(6), x = r.nextInt(1 << level), y = r.nextInt(1 << level);
                var d = dev.gohst136.planetary.planet.CubeSphere.patchDirection(face, level, x, y, 0.5, 0.5);
                if (t.heightAt(d, 1.0) < 30) continue;                         // land only
                SkinMesh m = b.build(new PatchKey(face, level, x, y));
                patches++;
                for (int q = 0; q < m.waterStart(); q++) {
                    boolean isTop = m.slot()[q] >= 100 && m.slot()[q] < 114;
                    double v = 0;
                    for (int k = 0; k < 4; k++) v += (m.rgba()[q * 4 + k] & 255) / 255.0;
                    v /= 4;
                    if (isTop) { top += v; nt++; } else { wall += v; nw++; }
                }
            }
            sb.append(String.format("L%d: %.2f / %.2f   ", level, top / Math.max(1, nt), wall / Math.max(1, nw)));
        }
        System.out.println(sb);
    }
}
