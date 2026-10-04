package dev.gohst136.planetary.planet;

import dev.gohst136.planetary.math.Vec3;

/**
 * Cube-sphere parameterisation. Six faces, each a (u,v) in [-1,1]^2 domain, with an
 * equal-angle (tan) warp to even out cell sizes (max/min area ratio ~1.4 instead of ~5).
 * A patch is addressed by (face, level, x, y); level L has 2^L x 2^L patches per face.
 * Faces share cube edges exactly, so adjacent faces produce bit-identical edge directions.
 */
public final class CubeSphere {
    private CubeSphere() {}

    private static final Vec3[] NORMAL = {
            new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 1, 0),
            new Vec3(0, -1, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1)};
    private static final Vec3[] U_AXIS = {
            new Vec3(0, 0, -1), new Vec3(0, 0, 1), new Vec3(1, 0, 0),
            new Vec3(1, 0, 0), new Vec3(1, 0, 0), new Vec3(-1, 0, 0)};
    private static final Vec3[] V_AXIS = {
            new Vec3(0, 1, 0), new Vec3(0, 1, 0), new Vec3(0, 0, -1),
            new Vec3(0, 0, 1), new Vec3(0, 1, 0), new Vec3(0, 1, 0)};

    /** Unit direction for face-local coordinates u,v in [-1,1]. */
    public static Vec3 direction(int face, double u, double v) {
        double wu = Math.tan(u * Math.PI / 4.0), wv = Math.tan(v * Math.PI / 4.0);
        return NORMAL[face].add(U_AXIS[face].mul(wu)).add(V_AXIS[face].mul(wv)).normalize();
    }

    /** Direction for fractional position (fx,fy) in [0,1]^2 inside patch (level,x,y). */
    public static Vec3 patchDirection(int face, int level, int x, int y, double fx, double fy) {
        double n = (double) (1L << level);
        return direction(face, -1.0 + 2.0 * (x + fx) / n, -1.0 + 2.0 * (y + fy) / n);
    }
}
