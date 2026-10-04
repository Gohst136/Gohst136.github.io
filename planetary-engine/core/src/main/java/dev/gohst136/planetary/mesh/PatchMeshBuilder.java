package dev.gohst136.planetary.mesh;

import dev.gohst136.planetary.lod.PatchKey;
import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.CubeSphere;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.terrain.TerrainSampler;

/** Builds a (N+1)^2 displaced grid with a skirt, plus per-vertex geomorph targets. Stateless, thread-safe. */
public final class PatchMeshBuilder {
    private final PlanetDefinition planet;
    private final TerrainSampler terrain;

    public PatchMeshBuilder(PlanetDefinition planet, TerrainSampler terrain) {
        this.planet = planet; this.terrain = terrain;
    }

    public PatchMesh build(PatchKey k, int n) {
        if (n < 2 || (n & 1) != 0) throw new IllegalArgumentException("gridCells must be even and >= 2");
        int w = n + 1;
        Vec3[] pos = new Vec3[w * w];
        for (int j = 0; j <= n; j++) for (int i = 0; i <= n; i++) {
            Vec3 d = CubeSphere.patchDirection(k.face(), k.level(), k.x(), k.y(), i / (double) n, j / (double) n);
            pos[j * w + i] = d.mul(planet.radius() + terrain.heightAt(d));
        }
        Vec3 centerDir = CubeSphere.patchDirection(k.face(), k.level(), k.x(), k.y(), 0.5, 0.5);
        Vec3 o = centerDir.mul(planet.radius() + terrain.heightAt(centerDir));

        // skirt drop: proportional to cell size so it hides LOD cracks but stays tiny on screen
        double edge = planet.radius() * (Math.PI / 2.0) / (double) (1L << k.level());
        double skirt = edge / n * 2.0;

        int skirtCount = 4 * n;
        int total = w * w + skirtCount;
        float[] p = new float[total * 3], m = new float[total * 3], nr = new float[total * 3];
        for (int j = 0; j <= n; j++) for (int i = 0; i <= n; i++) {
            int idx = j * w + i;
            put(p, idx, pos[idx].sub(o));
            put(m, idx, morphed(pos, w, n, i, j).sub(o));
            Vec3 d = pos[idx].normalize();
            put(nr, idx, d); // radial normal; true slope normals are computed from heightmap in shader/LUT later
        }
        int[] ring = new int[skirtCount];
        int r = 0;
        for (int i = 0; i < n; i++) ring[r++] = i;                    // bottom edge
        for (int j = 0; j < n; j++) ring[r++] = j * w + n;            // right edge
        for (int i = n; i > 0; i--) ring[r++] = n * w + i;            // top edge
        for (int j = n; j > 0; j--) ring[r++] = j * w;                // left edge
        for (int s = 0; s < skirtCount; s++) {
            int src = ring[s], dst = w * w + s;
            Vec3 down = pos[src].normalize().mul(-skirt);
            put(p, dst, pos[src].add(down).sub(o));
            put(m, dst, morphed(pos, w, n, src % w, src / w).add(down).sub(o));
            put(nr, dst, pos[src].normalize());
        }
        int[] idx = new int[(n * n * 6) + skirtCount * 6];
        int t = 0;
        for (int j = 0; j < n; j++) for (int i = 0; i < n; i++) {
            int a = j * w + i, b = a + 1, c = a + w, d = c + 1;
            idx[t++] = a; idx[t++] = c; idx[t++] = b; idx[t++] = b; idx[t++] = c; idx[t++] = d;
        }
        for (int s = 0; s < skirtCount; s++) {
            int a = ring[s], b = ring[(s + 1) % skirtCount];
            int sa = w * w + s, sb = w * w + (s + 1) % skirtCount;
            idx[t++] = a; idx[t++] = sa; idx[t++] = b; idx[t++] = b; idx[t++] = sa; idx[t++] = sb;
        }
        return new PatchMesh(new double[]{o.x(), o.y(), o.z()}, p, m, nr, idx, n);
    }

    /** Position this vertex takes in the 2x coarser grid (odd indices collapse onto neighbours). */
    private static Vec3 morphed(Vec3[] pos, int w, int n, int i, int j) {
        boolean oi = (i & 1) == 1, oj = (j & 1) == 1;
        if (!oi && !oj) return pos[j * w + i];
        if (oi && !oj) return pos[j * w + i - 1].add(pos[j * w + i + 1]).mul(0.5);
        if (!oi) return pos[(j - 1) * w + i].add(pos[(j + 1) * w + i]).mul(0.5);
        return pos[(j - 1) * w + i - 1].add(pos[(j + 1) * w + i + 1]).mul(0.5);
    }

    private static void put(float[] a, int idx, Vec3 v) {
        a[idx * 3] = (float) v.x(); a[idx * 3 + 1] = (float) v.y(); a[idx * 3 + 2] = (float) v.z();
    }
}
