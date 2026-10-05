package dev.gohst136.planetary.planet;

import dev.gohst136.planetary.math.Vec3;

/**
 * Maps a sphere direction to coordinates in a flat, infinite (x,z) plane such as vanilla's world plane.
 * z = -v keeps the mapping mirror-free: with y = face normal, vanilla's (x, y, z) is right-handed while (u, normal, v) is
 * not (u x n = -v), so using +v would give a mirror image of the real vanilla terrain.
 * Each cube face becomes a square of side 2*halfSpan metres, placed at its own offset (no overlap), so
 * distances inside a face are ~1:1 with sphere metres (equal-angle faces: +-20% variation).
 *
 * Faces cannot be joined without seams in a plane. To keep the height field continuous across a cube
 * edge, within {@code band} (in face uv units) of an edge the result also carries the neighbour face's
 * coordinates and a weight w2 that rises to exactly 0.5 at the edge. Both faces compute the same pair
 * with the same weight there, so a blended sample is continuous (checked by a test). Three-face corners
 * are only approximately continuous (documented limitation).
 */
public final class PlaneUnwrap {
    private PlaneUnwrap() {}

    /** Distance between neighbouring face squares in units of the half span; 2.25 * 2^k is an integer, so every square (and every cell of it) stays on the block grid. */
    public static final double PITCH = 2.25;

    /**
     * Half the side of a cube-face square in the vanilla plane (= blocks) for a body of this radius: pi*R/4 rounded to a whole number. For the
     * planet radii the project uses (2^24/pi, 2^22/pi) it is exactly 2^22 / 2^20, so quadtree cells are exact powers of two blocks and aligned to blocks.
     */
    public static double halfSpan(double radius) { return Math.rint(radius * Math.PI / 4.0); }

    public record Mapped(double x1, double z1, double x2, double z2, double w2) {}

    public static Mapped map(Vec3 d, double halfSpan, double band) {
        int f = CubeSphere.faceOf(d);
        double[] uv = CubeSphere.faceUV(f, d);
        double m = 1.0 - Math.max(Math.abs(uv[0]), Math.abs(uv[1]));     // distance to the nearest edge in uv units
        double pitch = PITCH * halfSpan;
        double x1 = ((f % 3) - 1) * pitch + uv[0] * halfSpan, z1 = ((f / 3) - 0.5) * pitch - uv[1] * halfSpan;
        if (m >= band) return new Mapped(x1, z1, 0, 0, 0);
        int g = CubeSphere.secondFaceOf(d);
        double[] uv2 = CubeSphere.faceUV(g, d);
        double t = Math.max(0.0, m) / band;                                // 0 at the edge .. 1 at the band end
        double w2 = 0.5 * (1.0 - t) * (1.0 - t);                           // smooth, 0.5 at the edge
        double x2 = ((g % 3) - 1) * pitch + uv2[0] * halfSpan, z2 = ((g / 3) - 0.5) * pitch - uv2[1] * halfSpan;
        return new Mapped(x1, z1, x2, z2, w2);
    }

    /**
     * Inverse: plane coordinates -> sphere direction, for world generators (vanilla chunks live in the plane). Each face's
     * square is extended (equal-angle mapping is exact beyond the edge: along an axis angle = u * 90 deg / 2) up to |u|,|v| of
     * 1.15, so terrain keeps going across cube edges where the plane has a gap. Beyond the half-way line to the neighbouring
     * face square the nearest face is used; callers should re-anchor (teleport to the same planet point on the proper face)
     * well before that, i.e. while max(|u|,|v|) < 1.0.
     */
    public static Vec3 inverse(double x, double z, double halfSpan) {
        double pitch = PITCH * halfSpan;
        int best = 0; double bestM = Double.MAX_VALUE;
        for (int f = 0; f < 6; f++) {
            double u = (x - ((f % 3) - 1) * pitch) / halfSpan, v = -(z - ((f / 3) - 0.5) * pitch) / halfSpan;
            double m = Math.max(Math.abs(u), Math.abs(v));
            if (m < bestM) { bestM = m; best = f; }
        }
        double u = (x - ((best % 3) - 1) * pitch) / halfSpan, v = -(z - ((best / 3) - 0.5) * pitch) / halfSpan;
        u = Math.max(-1.6, Math.min(1.6, u)); v = Math.max(-1.6, Math.min(1.6, v));
        return CubeSphere.direction(best, u, v);
    }

    /** Largest of |u|, |v| of a direction on its own face: how close it is to a cube edge (1.0 = on the edge). */
    public static double edgeDistance(Vec3 d) {
        double[] uv = CubeSphere.faceUV(CubeSphere.faceOf(d), d);
        return Math.max(Math.abs(uv[0]), Math.abs(uv[1]));
    }
}
