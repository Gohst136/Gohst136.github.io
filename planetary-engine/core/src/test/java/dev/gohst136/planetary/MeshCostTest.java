package dev.gohst136.planetary;

import dev.gohst136.planetary.lod.PatchKey;
import dev.gohst136.planetary.mesh.PatchMeshBuilder;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.terrain.RealisticTerrain;
import java.util.Random;
import org.junit.jupiter.api.Test;

/** Build cost of a 32x32 patch mesh (single thread), printed for the record. */
class MeshCostTest {
    @Test
    void buildCost() {
        PlanetDefinition p = PlanetDefinition.earth(8);
        PatchMeshBuilder b = new PatchMeshBuilder(p, new RealisticTerrain(p));
        Random r = new Random(1);
        for (int i = 0; i < 100; i++) b.build(new PatchKey(r.nextInt(6), 10, r.nextInt(1024), r.nextInt(1024)), 32);   // warm up
        long t0 = System.nanoTime();
        int n = 400;
        for (int i = 0; i < n; i++) b.build(new PatchKey(r.nextInt(6), 4 + r.nextInt(16), r.nextInt(16), r.nextInt(16)), 32);
        System.out.printf("mesh build: %.2f ms per 32x32 patch (single thread)%n", (System.nanoTime() - t0) / 1e6 / n);
    }
}
