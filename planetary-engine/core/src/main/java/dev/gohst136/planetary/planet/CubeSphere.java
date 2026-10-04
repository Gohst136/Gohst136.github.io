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

    public static Vec3 uAxis(int face) { return U_AXIS[face]; }
    public static Vec3 vAxis(int face) { return V_AXIS[face]; }

    /** Face whose normal axis has the largest |component| of {@code d}. */
    public static int faceOf(Vec3 d) {
        double ax = Math.abs(d.x()), ay = Math.abs(d.y()), az = Math.abs(d.z());
        if (ax >= ay && ax >= az) return d.x() >= 0 ? 0 : 1;
        if (ay >= az) return d.y() >= 0 ? 2 : 3;
        return d.z() >= 0 ? 4 : 5;
    }

    /** Face whose normal axis has the second largest |component| (the neighbour across the nearest edge). */
    public static int secondFaceOf(Vec3 d) {
        int first = faceOf(d);
        double[] a = {Math.abs(d.x()), Math.abs(d.y()), Math.abs(d.z())};
        a[first / 2] = -1;
        int axis = a[0] >= a[1] && a[0] >= a[2] ? 0 : (a[1] >= a[2] ? 1 : 2);
        double c = axis == 0 ? d.x() : axis == 1 ? d.y() : d.z();
        return axis * 2 + (c >= 0 ? 0 : 1);
    }

    /** Inverse of {@link #direction}: face-local (u,v) in [-1,1] for a direction on the given face's hemisphere. */
    public static double[] faceUV(int face, Vec3 d) {
        double n = d.dot(NORMAL[face]);
        double u = Math.atan(d.dot(U_AXIS[face]) / n) * 4.0 / Math.PI;
        double v = Math.atan(d.dot(V_AXIS[face]) / n) * 4.0 / Math.PI;
        return new double[]{u, v};
    }
}
