package dev.gohst136.planetary.mod.client;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.CubeSphere;
import dev.gohst136.planetary.planet.PlaneUnwrap;
import org.joml.Matrix3f;
import org.joml.Matrix4f;

/**
 * Reference frame that ties the real vanilla world to the planet around a landing site (the "simulation bubble").
 * Vanilla (x east, y up, z south; right-handed) maps onto the tangent plane at the anchor direction d0:
 * ex = tangent of +u, ey = d0 (up), ez = ex x ey (= -v, the mirror-free unwrap). A vanilla position (X, Y, Z) becomes
 * planet-frame position  d0 * (groundRadius + (Y - Y0)) + ex*(X - X0) + ez*(Z - Z0),  where (X0, Z0) are the anchor's
 * plane coordinates and Y0 the real vanilla ground height there; the planet terrain is flattened around d0
 * (FlattenedTerrain) so planet mesh and real chunks agree. Curvature error is s^2/2R: 0.08 m at 1 km.
 */
final class BubbleFrame {
    final Vec3 d0, ex, ey, ez;
    final double x0, z0, y0, groundRadius;
    private final Matrix4f toPlanet4;      // vanilla direction -> planet direction (columns ex, ey, ez)
    private final Matrix4f viewTransform;  // its inverse (transpose), applied after the vanilla view rotation

    BubbleFrame(Vec3 anchorDir, double planetRadius, double groundRadius, double y0) {
        this.d0 = anchorDir.normalize();
        int face = CubeSphere.faceOf(d0);
        var m = PlaneUnwrap.map(d0, planetRadius * Math.PI / 4.0, 0.0);
        this.x0 = m.x1(); this.z0 = m.z1();
        Vec3 u = CubeSphere.uAxis(face);
        this.ey = d0;
        this.ex = u.sub(d0.mul(u.dot(d0))).normalize();
        this.ez = ex.cross(ey);
        this.groundRadius = groundRadius;
        this.y0 = y0;
        Matrix3f mat = new Matrix3f((float) ex.x(), (float) ex.y(), (float) ex.z(),
                                    (float) ey.x(), (float) ey.y(), (float) ey.z(),
                                    (float) ez.x(), (float) ez.y(), (float) ez.z());
        this.toPlanet4 = new Matrix4f(mat);
        this.viewTransform = new Matrix4f(mat).transpose();
    }

    Vec3 position(double x, double y, double z) {
        return d0.mul(groundRadius + (y - y0)).add(ex.mul(x - x0)).add(ez.mul(z - z0));
    }

    Vec3 direction(double x, double y, double z) {
        return ex.mul(x).add(ey.mul(y)).add(ez.mul(z)).normalize();
    }

    /** view' = vanillaViewRotation * M^T renders the planet frame with the vanilla camera orientation. */
    Matrix4f viewTransform() { return viewTransform; }
}
