package dev.gohst136.planetary.mod.client;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.CubeSphere;
import dev.gohst136.planetary.planet.PlaneUnwrap;
import org.joml.Matrix3f;
import org.joml.Matrix4f;

import java.util.function.DoubleUnaryOperator;

/**
 * Reference frame that ties the real vanilla world to the planet around a landing site (the "simulation bubble").
 * Vanilla (x east, y up, z south; right-handed) maps onto the tangent plane at the anchor direction d0:
 * ex = tangent of +u, ey = d0 (up), ez = ex x ey (= -v, the mirror-free unwrap). A vanilla position (X, Y, Z) becomes
 * planet-frame position  d0 * (groundRadius + (Y - Y0)) + ex*(X - X0) + ez*(Z - Z0),  where (X0, Z0) are the anchor's
 * plane coordinates and Y0 the real vanilla ground height there; the planet terrain is flattened around d0
 * (FlattenedTerrain) so planet mesh and real chunks agree. Curvature error is s^2/2R: 0.08 m at 1 km.
 *
 * The vanilla plane is NOT isometric to the sphere (cube faces are stretched by up to ~20% towards edges and corners, anisotropically), and the
 * chunk generator evaluates the terrain at PlaneUnwrap.inverse(x, z). A 1:1 tangent plane therefore drifts away from the real terrain with
 * distance (measured: 20 m at 200 m, 85 m at 1 km, 265 m at 3 km, median). So the chart is the exact first-order one: the tangent vectors are the
 * Jacobian columns of the plane -> sphere mapping at the anchor (jx = dP/dx, jz = dP/dz, not unit, not orthogonal). Positions and directions use it,
 * and the backdrop is drawn through its inverse (warpTransform) so it coincides with the real chunks; the sky keeps the orthonormal frame.
 */
final class BubbleFrame {
    final Vec3 d0, ex, ey, ez;
    final Vec3 jx, jz;                 // plane -> sphere Jacobian columns at the anchor (metres of sphere per plane metre)
    private final double det;
    private final Matrix4f warp;       // planet-frame vectors -> vanilla-frame vectors (inverse of [jx, d0, jz])
    final double x0, z0, y0, groundRadius;
    private final DoubleUnaryOperator yToMeters, metersToY;     // vertical map between vanilla block Y and metres above the body's baseline radius
    final String body;
    private final Matrix4f toPlanet4;      // vanilla direction -> planet direction (columns ex, ey, ez)
    private final Matrix4f viewTransform;  // its inverse (transpose), applied after the vanilla view rotation

    BubbleFrame(Vec3 anchorDir, double planetRadius, double groundRadius, double y0) {
        this(anchorDir, planetRadius, groundRadius, y0, "earth", 0.0, null, null);
    }

    /** @param xOffset plane x of the body's centre (see BodyPlane); maps null = linear (Y - y0). */
    BubbleFrame(Vec3 anchorDir, double planetRadius, double groundRadius, double y0, String body, double xOffset,
                DoubleUnaryOperator yToMeters, DoubleUnaryOperator metersToY) {
        this.body = body;
        this.yToMeters = yToMeters != null ? yToMeters : (y -> y - y0);
        this.metersToY = metersToY != null ? metersToY : (m -> m + y0);
        this.d0 = anchorDir.normalize();
        int face = CubeSphere.faceOf(d0);
        var m = PlaneUnwrap.map(d0, PlaneUnwrap.halfSpan(planetRadius), 0.0);
        this.x0 = m.x1() + xOffset; this.z0 = m.z1();
        Vec3 u = CubeSphere.uAxis(face);
        this.ey = d0;
        this.ex = u.sub(d0.mul(u.dot(d0))).normalize();
        this.ez = ex.cross(ey);
        this.groundRadius = groundRadius;
        this.y0 = y0;
        {   // exact first-order chart: finite differences of the generator's own plane -> direction function
            double hs = PlaneUnwrap.halfSpan(planetRadius), hh = 40.0, px = x0 - xOffset;
            Vec3 jxr = PlaneUnwrap.inverse(px + hh, z0, hs).sub(PlaneUnwrap.inverse(px - hh, z0, hs)).mul(planetRadius / (2 * hh));
            Vec3 jzr = PlaneUnwrap.inverse(px, z0 + hh, hs).sub(PlaneUnwrap.inverse(px, z0 - hh, hs)).mul(planetRadius / (2 * hh));
            this.jx = jxr.sub(d0.mul(jxr.dot(d0)));
            this.jz = jzr.sub(d0.mul(jzr.dot(d0)));
            Vec3 bc = d0.cross(jz), ca = jz.cross(jx), ab = jx.cross(d0);
            this.det = jx.dot(bc);
            this.warp = new Matrix4f(
                    (float) (bc.x() / det), (float) (ca.x() / det), (float) (ab.x() / det), 0f,
                    (float) (bc.y() / det), (float) (ca.y() / det), (float) (ab.y() / det), 0f,
                    (float) (bc.z() / det), (float) (ca.z() / det), (float) (ab.z() / det), 0f,
                    0f, 0f, 0f, 1f);
        }
        Matrix3f mat = new Matrix3f((float) ex.x(), (float) ex.y(), (float) ex.z(),
                                    (float) ey.x(), (float) ey.y(), (float) ey.z(),
                                    (float) ez.x(), (float) ez.y(), (float) ez.z());
        this.toPlanet4 = new Matrix4f(mat);
        this.viewTransform = new Matrix4f(mat).transpose();
    }

    Vec3 position(double x, double y, double z) {
        return d0.mul(groundRadius + yToMeters.applyAsDouble(y)).add(jx.mul(x - x0)).add(jz.mul(z - z0));
    }

    /** Inverse of {@link #position}: planet-frame position -> vanilla (X, Y, Z). */
    double[] vanillaPos(Vec3 p) {
        Vec3 t = p.sub(d0.mul(p.dot(d0)));
        double gxx = jx.dot(jx), gxz = jx.dot(jz), gzz = jz.dot(jz), bx = t.dot(jx), bz = t.dot(jz), dg = gxx * gzz - gxz * gxz;
        double dx = (bx * gzz - bz * gxz) / dg, dz = (gxx * bz - gxz * bx) / dg;
        return new double[]{x0 + dx, metersToY.applyAsDouble(p.dot(d0) - groundRadius), z0 + dz};
    }

    /** Vanilla-frame components of a planet-frame vector (inverse of the chart's linear part). */
    private Vec3 toVanilla(Vec3 q) {
        Vec3 bc = d0.cross(jz), ca = jz.cross(jx), ab = jx.cross(d0);
        return new Vec3(bc.dot(q) / det, ca.dot(q) / det, ab.dot(q) / det);
    }

    /** Planet-frame direction -> vanilla yaw/pitch in degrees (MC: yaw 0 = +z, 90 = -x; pitch > 0 looks down). */
    float[] yawPitch(Vec3 planetDir) {
        Vec3 v = toVanilla(planetDir.normalize()).normalize();
        double vx = v.x(), vy = v.y(), vz = v.z();
        return new float[]{(float) Math.toDegrees(Math.atan2(-vx, vz)), (float) Math.toDegrees(-Math.asin(Math.max(-1, Math.min(1, vy))))};
    }

    Vec3 direction(double x, double y, double z) {
        return jx.mul(x).add(d0.mul(y)).add(jz.mul(z)).normalize();
    }

    /** Planet-frame vectors -> vanilla-frame vectors: the terrain pass multiplies it after the vanilla view so the backdrop coincides with the real chunks. */
    Matrix4f warpTransform() { return warp; }

    /** Largest ratio between the chart's stretch factors (>= 1): how much the culling frustum must be widened. */
    double stretch() {
        double a = jx.length(), b = jz.length();
        return Math.max(a, b) / Math.min(a, b);
    }

    /** view' = vanillaViewRotation * M^T renders the planet frame with the vanilla camera orientation. */
    Matrix4f viewTransform() { return viewTransform; }
}
