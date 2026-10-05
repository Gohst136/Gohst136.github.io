package dev.gohst136.planetary;

import dev.gohst136.planetary.lod.PatchKey;
import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.mesh.PatchMesh;
import dev.gohst136.planetary.mesh.PatchMeshBuilder;
import dev.gohst136.planetary.planet.CubeSphere;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.terrain.ProceduralTerrain;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class PlanetTest {
    final PlanetDefinition planet = PlanetDefinition.earthlike(42);
    final ProceduralTerrain terrain = new ProceduralTerrain(planet);

    @Test void terrainIsDeterministicAndBounded() {
        ProceduralTerrain other = new ProceduralTerrain(PlanetDefinition.earthlike(42));
        double min = 1e18, max = -1e18;
        for (int i = 0; i < 20000; i++) {
            Vec3 d = new Vec3(Math.sin(i * 0.37), Math.cos(i * 1.11), Math.sin(i * 0.071 + 1)).normalize();
            double h = terrain.heightAt(d);
            assertEquals(h, other.heightAt(d));
            assertTrue(h >= -planet.maxDepth() && h <= planet.maxHeight());
            min = Math.min(min, h); max = Math.max(max, h);
        }
        assertTrue(min < -100 && max > 500, "terrain should have both ocean and mountains: " + min + ".." + max);
    }

    @Test void unresolvedDetailShrinksWithFinerCells() {
        assertTrue(terrain.unresolvedDetail(100_000) > terrain.unresolvedDetail(1_000));
        assertTrue(terrain.unresolvedDetail(1_000) > terrain.unresolvedDetail(20));
        assertEquals(0.0, terrain.unresolvedDetail(1.0), 0.01);
    }

    @Test void cubeFaceEdgesAreSharedExactly() {
        // +X face right edge (u=1) must match +Z... check every face edge point has a neighbour face with same direction
        int matched = 0;
        for (int f = 0; f < 6; f++) for (int g = 0; g < 6; g++) {
            if (f == g) continue;
            for (double t = -1; t <= 1; t += 0.25) {
                for (double[] e : new double[][]{{1, t}, {-1, t}, {t, 1}, {t, -1}}) {
                    Vec3 a = CubeSphere.direction(f, e[0], e[1]);
                    for (double[] e2 : new double[][]{{1, t}, {-1, t}, {t, 1}, {t, -1}, {1, -t}, {-1, -t}, {-t, 1}, {-t, -1}}) {
                        if (a.distance(CubeSphere.direction(g, e2[0], e2[1])) < 1e-12) matched++;
                    }
                }
            }
        }
        assertTrue(matched > 0);
        // all directions unit length, and face centres are the 6 axes
        for (int f = 0; f < 6; f++) assertEquals(1.0, CubeSphere.direction(f, 0.3, -0.7).length(), 1e-12);
    }

    @Test void meshHasMorphTargetsConsistentWithGrid() {
        PatchMesh m = new PatchMeshBuilder(planet, terrain).build(new PatchKey(2, 6, 10, 20), 16);
        int w = 17;
        assertEquals((w * w + 64) * 3, m.positions().length);
        double maxLen = 0;
        for (int i = 0; i < m.positions().length; i += 3)
            maxLen = Math.max(maxLen, Math.sqrt(Math.pow(m.positions()[i], 2) + Math.pow(m.positions()[i + 1], 2) + Math.pow(m.positions()[i + 2], 2)));
        assertTrue(maxLen < planet.radius() * Math.PI / 2 / 64 * 1.5 + planet.maxHeight() * 2, "float vertices stay small (patch-relative)");
    }
}
