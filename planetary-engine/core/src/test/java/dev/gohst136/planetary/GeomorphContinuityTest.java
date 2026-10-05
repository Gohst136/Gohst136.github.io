package dev.gohst136.planetary;

import static org.junit.jupiter.api.Assertions.*;

import dev.gohst136.planetary.lod.PatchKey;
import dev.gohst136.planetary.mesh.PatchMesh;
import dev.gohst136.planetary.mesh.PatchMeshBuilder;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.terrain.RealisticTerrain;
import java.util.Random;
import org.junit.jupiter.api.Test;

/** A fully morphed child must be IDENTICAL to the parent it replaces (geometry and colour): that is what makes LOD switches invisible. */
class GeomorphContinuityTest {
    @Test
    void morphedChildEqualsParent() {
        PlanetDefinition planet = PlanetDefinition.earth(21);
        RealisticTerrain terrain = new RealisticTerrain(planet);
        PatchMeshBuilder b = new PatchMeshBuilder(planet, terrain);
        final int n = 16, w = n + 1;
        Random r = new Random(9);
        double worstPos = 0, worstCol = 0, ownVsParent = 0, ownColVsParent = 0;
        for (int t = 0; t < 40; t++) {
            int level = 3 + r.nextInt(14);
            int x = r.nextInt(1 << level), y = r.nextInt(1 << level), face = r.nextInt(6);
            PatchKey child = new PatchKey(face, level, x, y);
            PatchKey parent = new PatchKey(face, level - 1, x >> 1, y >> 1);
            PatchMesh c = b.build(child, n), p = b.build(parent, n);
            int qx = x & 1, qy = y & 1;
            for (int j = 0; j <= n; j += 2) for (int i = 0; i <= n; i += 2) {
                int ci = (j * w + i) * 3, pi = (((qy * n / 2) + j / 2) * w + (qx * n / 2) + i / 2) * 3;
                for (int a = 0; a < 3; a++) {
                    double cw = c.origin()[a] + c.morphPositions()[ci + a], pw = p.origin()[a] + p.positions()[pi + a];
                    worstPos = Math.max(worstPos, Math.abs(cw - pw));
                    ownVsParent = Math.max(ownVsParent, Math.abs(c.origin()[a] + c.positions()[ci + a] - pw));
                }
                int cc = (j * w + i) * 4, pc = (((qy * n / 2) + j / 2) * w + (qx * n / 2) + i / 2) * 4;
                for (int a = 0; a < 4; a++) ownColVsParent = Math.max(ownColVsParent, Math.abs(c.colors()[cc + a] - p.colors()[pc + a]));
                for (int a = 0; a < 4; a++) worstCol = Math.max(worstCol, Math.abs(c.morphColors()[cc + a] - p.colors()[pc + a]));
            }
        }
        System.out.printf("geomorph: morphed child vs parent: %.4f m / %.5f colour (before this fix the child's own vertices differed from the parent by up to %.1f m / %.3f colour)%n", worstPos, worstCol, ownVsParent, ownColVsParent);
        assertTrue(worstPos < 0.5, "morphed child differs from parent by " + worstPos + " m");
        assertTrue(worstCol < 1e-4, "morphed child colour differs from parent by " + worstCol);
    }
}
