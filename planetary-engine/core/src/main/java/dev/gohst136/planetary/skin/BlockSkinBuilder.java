package dev.gohst136.planetary.skin;

import dev.gohst136.planetary.lod.PatchKey;
import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.CubeSphere;
import dev.gohst136.planetary.planet.PlaneUnwrap;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.planet.VerticalMap;
import dev.gohst136.planetary.terrain.RealisticTerrain;
import dev.gohst136.planetary.world.PlanetColumns;
import dev.gohst136.planetary.world.PlanetColumns.Column;
import dev.gohst136.planetary.world.PlanetColumns.Kind;

/**
 * Far terrain as BLOCKS: a quadtree patch of 32 x 32 cells whose cells are exact powers of two blocks and lie exactly on the vanilla block grid
 * (see PlaneUnwrap.halfSpan), meshed as flat-topped columns with vertical walls, from the very same column decisions the chunk generator uses
 * ({@link PlanetColumns}). Drawn with the game's block atlas and lightmap it looks like real chunks seen from afar, and at 1-block cells it IS the
 * real terrain. Pure Java; thread-safe if the terrain and style are.
 */
public final class BlockSkinBuilder {
    public static final int CELLS = 32;
    /** Finest quadtree level: cells of exactly 1 block. Coarser levels have cells of 2^(18 - level) blocks. */
    public static final int FINEST_LEVEL = 18;
    /** Vanilla face brightness: up 1.0, north/south 0.8, east/west 0.6 (down 0.5 is never visible from outside). */
    static final float SHADE_UP = 1.0f, SHADE_NS = 0.8f, SHADE_EW = 0.6f;
    static final double WATER_SURFACE = 0.89;           // a water source block's surface sits 8/9 up

    private final PlanetDefinition planet;
    private final RealisticTerrain terrain;
    private final SkinStyle style;
    private final double half;

    public BlockSkinBuilder(PlanetDefinition planet, RealisticTerrain terrain, SkinStyle style) {
        this.planet = planet; this.terrain = terrain; this.style = style;
        this.half = PlaneUnwrap.halfSpan(planet.radius());
    }

    /** Quad sink with growable arrays; opaque quads and water quads are collected separately. */
    private static final class Quads {
        float[] pos = new float[12 * 1024], uv = new float[8 * 1024]; int[] rgba = new int[4 * 1024]; short[] slot = new short[1024]; byte[] sky = new byte[1024];
        int n;
        void add(double[] p, double[] u, int c0, int c1, int c2, int c3, int slotId, int skyLevel) {
            if (n == slot.length) {
                int cap = n * 2;
                pos = java.util.Arrays.copyOf(pos, cap * 12); uv = java.util.Arrays.copyOf(uv, cap * 8); rgba = java.util.Arrays.copyOf(rgba, cap * 4);
                slot = java.util.Arrays.copyOf(slot, cap); sky = java.util.Arrays.copyOf(sky, cap);
            }
            for (int i = 0; i < 12; i++) pos[n * 12 + i] = (float) p[i];
            for (int i = 0; i < 8; i++) uv[n * 8 + i] = (float) u[i];
            rgba[n * 4] = c0; rgba[n * 4 + 1] = c1; rgba[n * 4 + 2] = c2; rgba[n * 4 + 3] = c3;
            slot[n] = (short) slotId; sky[n] = (byte) skyLevel;
            n++;
        }
    }

    private static boolean sameAo(byte[] ao, int a, int b) {
        return ao[a * 4] == ao[b * 4] && ao[a * 4 + 1] == ao[b * 4 + 1] && ao[a * 4 + 2] == ao[b * 4 + 2] && ao[a * 4 + 3] == ao[b * 4 + 3];
    }

    /** Packs a brightness multiplier and an RGB tint into 0xAARRGGBB. */
    static int color(float shade, int rgb) {
        int r = Math.min(255, Math.round(shade * ((rgb >> 16) & 255))), g = Math.min(255, Math.round(shade * ((rgb >> 8) & 255))), b = Math.min(255, Math.round(shade * (rgb & 255)));
        return 0xFF000000 | (r << 16) | (g << 8) | b;
    }

    public SkinMesh build(PatchKey key) {
        final int n = CELLS;
        final int shift = FINEST_LEVEL - key.level();
        if (shift < 0) throw new IllegalArgumentException("block skin has no level finer than " + FINEST_LEVEL);
        final double cell = (double) (1L << shift);                       // blocks per cell
        // plane origin of the patch: (i, j) = (0, 0) corner; plane x grows with i, plane z shrinks with j
        var m0 = PlaneUnwrap.map(CubeSphere.patchDirection(key.face(), key.level(), key.x(), key.y(), 0.0, 0.0), half, 0.0);
        final double x0 = Math.rint(m0.x1() / cell) * cell, z0 = Math.rint(m0.z1() / cell) * cell - n * cell;    // min corner of the patch in the plane

        // columns of the patch plus a one-cell border (walls and skirts need the neighbours)
        final int w = n + 2;
        Column[] col = new Column[w * w];
        for (int cz = -1; cz <= n; cz++) for (int cx = -1; cx <= n; cx++)
            col[(cz + 1) * w + (cx + 1)] = PlanetColumns.earth(terrain, half, x0 + (cx + 0.5) * cell, z0 + (cz + 0.5) * cell, cell);

        // patch origin: the sphere point above the patch centre
        Vec3 cdir = PlaneUnwrap.inverse(x0 + n * cell / 2.0, z0 + n * cell / 2.0, half);
        double cy = VerticalMap.toMeters(col[(n / 2 + 1) * w + (n / 2 + 1)].groundY() + 1.0);
        Vec3 origin = cdir.mul(planet.radius() + cy);

        Quads opaque = new Quads(), water = new Quads();
        double[] p = new double[12], uv = new double[8];
        double R = planet.radius();

        // per-cell attributes
        final int nn = n * n;
        int[] ground = new int[nn], tintTop = new int[nn], sky = new int[nn], waterY = new int[nn], tintW = new int[nn];
        Kind[] topKind = new Kind[nn];
        for (int cz = 0; cz < n; cz++) for (int cx = 0; cx < n; cx++) {
            Column c = col[(cz + 1) * w + (cx + 1)];
            int i = cz * n + cx;
            ground[i] = c.groundY(); topKind[i] = c.top(); tintTop[i] = style.tintTop(c);
            boolean wet = c.waterTopY() > c.groundY();
            sky[i] = wet ? Math.max(0, 15 - (c.waterTopY() - c.groundY())) : 15;          // water absorbs one level of sky light per block
            waterY[i] = wet ? c.waterTopY() : Integer.MIN_VALUE;
            tintW[i] = wet ? style.tintWater(c) : 0;
        }

        // vanilla ambient occlusion of the top faces: each vertex counts the occluding blocks among its two side neighbours and its corner neighbour (a neighbour column
        // that is higher than this one stands in the air block above the face); both sides blocked count the corner too. brightness = 1 - 0.2 * count, exactly the
        // average vanilla takes over (air block 1.0, three neighbours 1.0 or 0.2). Corners in vanilla's UP vertex order: (-x,-z) (-x,+z) (+x,+z) (+x,-z).
        final int[][] corners = {{-1, -1}, {-1, 1}, {1, 1}, {1, -1}};
        byte[] ao = new byte[nn * 4];
        for (int cz = 0; cz < n; cz++) for (int cx = 0; cx < n; cx++) {
            int i = cz * n + cx, top0 = ground[i];
            for (int v = 0; v < 4; v++) {
                int sx = corners[v][0], sz = corners[v][1];
                boolean s1 = col[(cz + 1) * w + (cx + 1 + sx)].groundY() > top0, s2 = col[(cz + 1 + sz) * w + (cx + 1)].groundY() > top0;
                boolean cn = col[(cz + 1 + sz) * w + (cx + 1 + sx)].groundY() > top0;
                ao[i * 4 + v] = (byte) ((s1 ? 1 : 0) + (s2 ? 1 : 0) + ((s1 && s2) || cn ? 1 : 0));
            }
        }

        // top faces and water surfaces: runs along x of identical cells become one quad (the sprite is tiled per block, so a long quad looks like many)
        for (int cz = 0; cz < n; cz++) {
            int cx = 0;
            while (cx < n) {
                int i0 = cz * n + cx, run = 1;
                while (cx + run < n) {
                    int i = cz * n + cx + run;
                    if (ground[i] != ground[i0] || topKind[i] != topKind[i0] || tintTop[i] != tintTop[i0] || sky[i] != sky[i0]) break;
                    if (!sameAo(ao, i0, i) || ao[i0 * 4] != ao[i0 * 4 + 3] || ao[i0 * 4 + 1] != ao[i0 * 4 + 2]) break;      // a merged quad interpolates AO along x: only valid where AO is constant along x
                    run++;
                }
                double px0 = x0 + cx * cell, px1 = x0 + (cx + run) * cell, pz0 = z0 + cz * cell, pz1 = pz0 + cell, len = run * cell;
                double yTop = ground[i0] + 1.0;
                corner(p, 0, px0, pz0, yTop, R, origin); corner(p, 1, px0, pz1, yTop, R, origin); corner(p, 2, px1, pz1, yTop, R, origin); corner(p, 3, px1, pz0, yTop, R, origin);
                uv[0] = 0; uv[1] = 0; uv[2] = 0; uv[3] = cell; uv[4] = len; uv[5] = cell; uv[6] = len; uv[7] = 0;
                int lastCell = cz * n + cx + run - 1;
                opaque.add(p, uv, color(SHADE_UP * (1f - 0.2f * ao[i0 * 4]), tintTop[i0]), color(SHADE_UP * (1f - 0.2f * ao[i0 * 4 + 1]), tintTop[i0]),
                        color(SHADE_UP * (1f - 0.2f * ao[lastCell * 4 + 2]), tintTop[i0]), color(SHADE_UP * (1f - 0.2f * ao[lastCell * 4 + 3]), tintTop[i0]), style.slotTop(topKind[i0]), sky[i0]);
                cx += run;
            }
            cx = 0;
            while (cx < n) {
                int i0 = cz * n + cx;
                if (waterY[i0] == Integer.MIN_VALUE) { cx++; continue; }
                int run = 1;
                while (cx + run < n && waterY[cz * n + cx + run] == waterY[i0] && tintW[cz * n + cx + run] == tintW[i0]) run++;
                double px0 = x0 + cx * cell, px1 = x0 + (cx + run) * cell, pz0 = z0 + cz * cell, pz1 = pz0 + cell, len = run * cell;
                double yw = waterY[i0] + WATER_SURFACE;
                corner(p, 0, px0, pz0, yw, R, origin); corner(p, 1, px0, pz1, yw, R, origin); corner(p, 2, px1, pz1, yw, R, origin); corner(p, 3, px1, pz0, yw, R, origin);
                uv[0] = 0; uv[1] = 0; uv[2] = 0; uv[3] = cell; uv[4] = len; uv[5] = cell; uv[6] = len; uv[7] = 0;
                int wc = color(SHADE_UP, tintW[i0]);
                water.add(p, uv, wc, wc, wc, wc, style.slotWater(), 15);
                cx += run;
            }
        }

        if (cell == 1.0) {
            wallsExact(opaque, p, uv, col, w, n, x0, z0, R, origin);
        } else {
        // walls: for each of the four sides, runs along the edge of columns with the same wall profile become one quad
            double skirt = Math.max(2.0, 1.5 * cell);
            for (int side = 0; side < 4; side++) {
                boolean alongX = side >= 2;                     // sides 0,1 are -x/+x faces (run along z), sides 2,3 are -z/+z faces (run along x)
                int lines = n, len = n;
                for (int line = 0; line < lines; line++) {
                    int k = 0;
                    while (k < len) {
                        int cx = alongX ? k : line, cz = alongX ? line : k;
                        // iterate over the cells in this row/column that have a neighbour on this side
                        Column c = col[(cz + 1) * w + (cx + 1)];
                        int nxo = side == 0 ? -1 : side == 1 ? 1 : 0, nzo = side == 2 ? -1 : side == 3 ? 1 : 0;
                        Column nb = col[(cz + 1 + nzo) * w + (cx + 1 + nxo)];
                        boolean border = alongX ? (side == 2 ? cz == 0 : cz == n - 1) : (side == 0 ? cx == 0 : cx == n - 1);
                        double bottom = wallBottom(c, nb, border, skirt);
                        if (Double.isNaN(bottom)) { k++; continue; }
                        int run = 1;
                        while (k + run < len) {
                            int cx2 = alongX ? k + run : cx, cz2 = alongX ? cz : k + run;
                            Column c2 = col[(cz2 + 1) * w + (cx2 + 1)], nb2 = col[(cz2 + 1 + nzo) * w + (cx2 + 1 + nxo)];
                            double b2 = wallBottom(c2, nb2, border, skirt);
                            if (Double.isNaN(b2) || b2 != bottom || c2.groundY() != c.groundY() || c2.top() != c.top() || c2.filler() != c.filler() || style.tintOverlay(c2) != style.tintOverlay(c)) break;
                            run++;
                        }
                        // plane edge of this wall
                        double ax, az, bx, bz;
                        if (alongX) { ax = x0 + k * cell; bx = x0 + (k + run) * cell; az = bz = z0 + (side == 2 ? cz * cell : (cz + 1) * cell); }
                        else { az = z0 + k * cell; bz = z0 + (k + run) * cell; ax = bx = x0 + (side == 0 ? cx * cell : (cx + 1) * cell); }
                        wallQuads(opaque, p, uv, c, bottom, ax, az, bx, bz, alongX ? SHADE_NS : SHADE_EW, run * cell, R, origin);
                        k += run;
                    }
                }
            }
        }
        int total = opaque.n + water.n;
        float[] pos = new float[total * 12], uvs = new float[total * 8]; int[] rgba = new int[total * 4]; short[] slotOut = new short[total]; byte[] skyOut = new byte[total];
        copy(opaque, 0, pos, uvs, rgba, slotOut, skyOut);
        copy(water, opaque.n, pos, uvs, rgba, slotOut, skyOut);
        return new SkinMesh(new double[]{origin.x(), origin.y(), origin.z()}, total, opaque.n, pos, uvs, rgba, slotOut, skyOut);
    }

    private static void copy(Quads q, int at, float[] pos, float[] uv, int[] rgba, short[] slot, byte[] sky) {
        System.arraycopy(q.pos, 0, pos, at * 12, q.n * 12); System.arraycopy(q.uv, 0, uv, at * 8, q.n * 8);
        System.arraycopy(q.rgba, 0, rgba, at * 4, q.n * 4); System.arraycopy(q.slot, 0, slot, at, q.n); System.arraycopy(q.sky, 0, sky, at, q.n);
    }

    /** Sphere position of plane point (px, pz) at block height y (relative to the patch origin). */
    private void corner(double[] out, int i, double px, double pz, double y, double R, Vec3 origin) {
        Vec3 d = PlaneUnwrap.inverse(px, pz, half);
        Vec3 pt = d.mul(R + VerticalMap.toMeters(y)).sub(origin);
        out[i * 3] = pt.x(); out[i * 3 + 1] = pt.y(); out[i * 3 + 2] = pt.z();
    }

    private static boolean solid(Column c, int y) { return c.groundY() >= y; }

    /**
     * Walls of 1-block cells, block by block, with vanilla's ambient occlusion: a wall face looks into the air block of the lower neighbour column; its
     * four vertices darken with the solid blocks around that air block (the lower column's top just below, taller columns next to it along the edge).
     * Rows without any occlusion are merged vertically. Patch borders keep their skirts.
     */
    private void wallsExact(Quads out, double[] p, double[] uv, Column[] col, int w, int n, double x0, double z0, double R, Vec3 origin) {
        final int[][] nbOff = {{-1, 0}, {1, 0}, {0, -1}, {0, 1}};                     // -x, +x, -z, +z
        for (int cz = 0; cz < n; cz++) for (int cx = 0; cx < n; cx++) {
            Column c = col[(cz + 1) * w + (cx + 1)];
            int top = c.groundY();
            for (int side = 0; side < 4; side++) {
                int ax = cx + nbOff[side][0], az = cz + nbOff[side][1];
                Column nb = col[(az + 1) * w + (ax + 1)];
                boolean border = ax < 0 || ax >= n || az < 0 || az >= n;
                boolean xFace = side < 2;
                // plane edge: along z for x faces, along x for z faces
                double ex0, ez0, ex1, ez1;
                if (xFace) { ex0 = ex1 = x0 + (side == 0 ? cx : cx + 1); ez0 = z0 + cz; ez1 = ez0 + 1; }
                else { ez0 = ez1 = z0 + (side == 2 ? cz : cz + 1); ex0 = x0 + cx; ex1 = ex0 + 1; }
                float shade = xFace ? SHADE_EW : SHADE_NS;
                if (nb.groundY() >= top) {
                    if (border) wallRange(out, p, uv, c, top + 1.0, top + 1.0 - Math.max(2.0, 1.5), ex0, ez0, ex1, ez1, shade, 1.0, R, origin);   // skirt
                    continue;
                }
                // the two columns next to the lower neighbour along the edge
                Column lowEnd = xFace ? col[(az + 1 - 1 + 1) * w + (ax + 1)] : col[(az + 1) * w + (ax + 1 - 1)];
                Column highEnd = xFace ? col[(az + 1 + 1) * w + (ax + 1)] : col[(az + 1) * w + (ax + 1 + 1)];
                int bottomY = nb.groundY() + 1;
                int groupHi = -1;                                      // top Y of the pending run of unoccluded rows
                Kind groupKind = null;
                for (int y = top; y >= bottomY; y--) {
                    Kind kind = y == top ? c.top() : (y >= top - 3 ? c.filler() : Kind.STONE);
                    int[] o = new int[4];                              // occluders at (low,hi) (low,lo) (high,lo) (high,hi)
                    for (int v = 0; v < 4; v++) {
                        Column end = (v == 0 || v == 1) ? lowEnd : highEnd;
                        boolean hi = v == 0 || v == 3;
                        boolean s1 = solid(end, y), s2 = hi ? solid(nb, y + 1) : solid(nb, y - 1), cn = solid(end, hi ? y + 1 : y - 1);
                        o[v] = (s1 ? 1 : 0) + (s2 ? 1 : 0) + ((s1 && s2) || cn ? 1 : 0);
                    }
                    boolean flat = o[0] == 0 && o[1] == 0 && o[2] == 0 && o[3] == 0;
                    if (flat && (groupKind == null || groupKind == kind)) { if (groupKind == null) { groupHi = y + 1; groupKind = kind; } continue; }
                    if (groupKind != null) { wallRows(out, p, uv, c, groupKind, groupHi, y + 1, null, ex0, ez0, ex1, ez1, shade, R, origin); groupKind = null; }
                    if (flat) { groupHi = y + 1; groupKind = kind; continue; }
                    wallRows(out, p, uv, c, kind, y + 1, y, o, ex0, ez0, ex1, ez1, shade, R, origin);
                }
                if (groupKind != null) wallRows(out, p, uv, c, groupKind, groupHi, bottomY, null, ex0, ez0, ex1, ez1, shade, R, origin);
                if (border && top + 1.0 - Math.max(2.0, 1.5) < bottomY) wallRange(out, p, uv, c, bottomY, top + 1.0 - Math.max(2.0, 1.5), ex0, ez0, ex1, ez1, shade, 1.0, R, origin);   // skirt below the wall
            }
        }
    }

    /** One quad (plus the tinted overlay for grass sides) of a wall of one kind between heights yHi and yLo; {@code o} = occluder counts per vertex or null. */
    private void wallRows(Quads out, double[] p, double[] uv, Column c, Kind kind, double yHi, double yLo, int[] o,
                          double ax, double az, double bx, double bz, float shade, double R, Vec3 origin) {
        corner(p, 0, ax, az, yHi, R, origin); corner(p, 1, ax, az, yLo, R, origin); corner(p, 2, bx, bz, yLo, R, origin); corner(p, 3, bx, bz, yHi, R, origin);
        uv[0] = 0; uv[1] = -yHi; uv[2] = 0; uv[3] = -yLo; uv[4] = 1; uv[5] = -yLo; uv[6] = 1; uv[7] = -yHi;
        int[] oc = o == null ? new int[4] : o;
        out.add(p, uv, color(shade * (1f - 0.2f * oc[0]), 0xFFFFFF), color(shade * (1f - 0.2f * oc[1]), 0xFFFFFF), color(shade * (1f - 0.2f * oc[2]), 0xFFFFFF),
                color(shade * (1f - 0.2f * oc[3]), 0xFFFFFF), style.slotSide(kind), 15);
        if (kind == c.top() && yHi > c.groundY() && style.slotSideOverlay(kind) >= 0) {
            int t = style.tintOverlay(c);
            out.add(p, uv, color(shade * (1f - 0.2f * oc[0]), t), color(shade * (1f - 0.2f * oc[1]), t), color(shade * (1f - 0.2f * oc[2]), t),
                    color(shade * (1f - 0.2f * oc[3]), t), style.slotSideOverlay(kind), 15);
        }
    }

    /** Wall between two heights without occlusion (skirts), segmented by depth like the generator fills the column. */
    private void wallRange(Quads out, double[] p, double[] uv, Column c, double yHi0, double yLo0, double ax, double az, double bx, double bz,
                           float shade, double len, double R, Vec3 origin) {
        int top = c.groundY();
        double[] edges = {top + 1.0, top, top - 3.0, yLo0};
        for (int s = 0; s < 3; s++) {
            double yHi = Math.min(edges[s], yHi0), yLo = Math.max(edges[s + 1], yLo0);
            if (yHi <= yLo + 1e-9) continue;
            wallRows(out, p, uv, c, s == 0 ? c.top() : (s == 1 ? c.filler() : Kind.STONE), yHi, yLo, null, ax, az, bx, bz, shade, R, origin);
        }
    }

    /** Bottom of the wall of {@code c} towards neighbour {@code nb}, or NaN when there is no wall (the neighbour is as high; patch borders get a skirt). */
    private static double wallBottom(Column c, Column nb, boolean border, double skirt) {
        int top = c.groundY();
        if (nb.groundY() < top) {
            double bottom = nb.groundY() + 1.0;
            return border ? Math.min(bottom, top + 1.0 - skirt) : bottom;
        }
        return border ? top + 1.0 - skirt : Double.NaN;                   // a skirt instead of a wall: the neighbour patch may be coarser or finer
    }

    /**
     * Wall quads of column {@code c} along the plane edge (ax,az)-(bx,bz) down to {@code bottom}, segmented by depth below c's surface exactly
     * like the generator fills a column: the surface block, three filler blocks, then stone.
     */
    private void wallQuads(Quads out, double[] p, double[] uv, Column c, double bottom, double ax, double az, double bx, double bz,
                           float shade, double len, double R, Vec3 origin) {
        int top = c.groundY();
        double[] edges = {top + 1.0, top, top - 3.0, bottom};
        for (int s = 0; s < 3; s++) {
            double yHi = Math.min(edges[s], top + 1.0), yLo = Math.max(edges[s + 1], bottom);
            if (yHi <= yLo + 1e-9) continue;
            Kind kind = s == 0 ? c.top() : (s == 1 ? c.filler() : Kind.STONE);
            corner(p, 0, ax, az, yHi, R, origin); corner(p, 1, ax, az, yLo, R, origin); corner(p, 2, bx, bz, yLo, R, origin); corner(p, 3, bx, bz, yHi, R, origin);
            uv[0] = 0; uv[1] = -yHi; uv[2] = 0; uv[3] = -yLo; uv[4] = len; uv[5] = -yLo; uv[6] = len; uv[7] = -yHi;      // texture v grows downward
            int sc = color(shade, 0xFFFFFF);
            out.add(p, uv, sc, sc, sc, sc, style.slotSide(kind), 15);
            if (s == 0 && style.slotSideOverlay(kind) >= 0) {
                int oc = color(shade, style.tintOverlay(c));
                out.add(p, uv, oc, oc, oc, oc, style.slotSideOverlay(kind), 15);
            }
        }
    }
}
