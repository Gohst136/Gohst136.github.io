package dev.gohst136.planetary.lod;

import dev.gohst136.planetary.math.Vec3;

/**
 * Camera state expressed in the planet-centred frame (metres, doubles).
 * {@code speed} is the camera speed in m/s, used for velocity-aware detail.
 */
public record CameraView(Vec3 position, Vec3 forward, Vec3 up, double fovYRadians,
                         int viewportHeight, int viewportWidth, double speed, double cullScale) {

    /** Normal camera: the culling frustum equals the drawn one. */
    public CameraView(Vec3 position, Vec3 forward, Vec3 up, double fovYRadians, int viewportHeight, int viewportWidth, double speed) {
        this(position, forward, up, fovYRadians, viewportHeight, viewportWidth, speed, 1.0);
    }

    /** Pixels per metre at distance 1 m: projected size = metres * pixelsPerUnitDistance / distance. */
    public double pixelsPerUnitDistance() {
        return viewportHeight / (2.0 * Math.tan(fovYRadians / 2.0));
    }

    /** Conservative sphere-vs-frustum test on the four side planes. */
    public boolean sphereMayBeVisible(Vec3 center, double radius) {
        Vec3 f = forward.normalize();
        Vec3 r = f.cross(up).normalize();
        Vec3 u = r.cross(f).normalize();
        double tanY = Math.tan(fovYRadians / 2.0) * cullScale;       // >1 when the drawn view is a stretched chart of the planet frame (bubble)
        double tanX = tanY * viewportWidth / (double) viewportHeight;
        Vec3 rel = center.sub(position);
        double z = rel.dot(f), x = rel.dot(r), y = rel.dot(u);
        // plane normals of the side planes in camera space, normalised
        double ax = Math.atan(tanX), ay = Math.atan(tanY);
        double cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
        // signed distance to each side plane (positive = outside)
        if (x * cx - z * sx > radius) return false;
        if (-x * cx - z * sx > radius) return false;
        if (y * cy - z * sy > radius) return false;
        if (-y * cy - z * sy > radius) return false;
        return true; // no near/far cull: the surface may be arbitrarily close/far
    }
}
