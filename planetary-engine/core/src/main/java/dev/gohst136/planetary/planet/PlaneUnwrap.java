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

    public record Mapped(double x1, double z1, double x2, double z2, double w2) {}

    public static Mapped map(Vec3 d, double halfSpan, double band) {
        int f = CubeSphere.faceOf(d);
        double[] uv = CubeSphere.faceUV(f, d);
        double m = 1.0 - Math.max(Math.abs(uv[0]), Math.abs(uv[1]));     // distance to the nearest edge in uv units
        double pitch = 2.2 * halfSpan;
        double x1 = ((f % 3) - 1) * pitch + uv[0] * halfSpan, z1 = ((f / 3) - 0.5) * pitch - uv[1] * halfSpan;
        if (m >= band) return new Mapped(x1, z1, 0, 0, 0);
        int g = CubeSphere.secondFaceOf(d);
        double[] uv2 = CubeSphere.faceUV(g, d);
        double t = Math.max(0.0, m) / band;                                // 0 at the edge .. 1 at the band end
        double w2 = 0.5 * (1.0 - t) * (1.0 - t);                           // smooth, 0.5 at the edge
        double x2 = ((g % 3) - 1) * pitch + uv2[0] * halfSpan, z2 = ((g / 3) - 0.5) * pitch - uv2[1] * halfSpan;
        return new Mapped(x1, z1, x2, z2, w2);
    }
}
