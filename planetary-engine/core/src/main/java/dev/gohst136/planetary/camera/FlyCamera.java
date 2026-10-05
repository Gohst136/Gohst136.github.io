package dev.gohst136.planetary.camera;

import dev.gohst136.planetary.math.Vec3;

/**
 * Orientation maths of the 6-DoF free-flight camera: yaw turns about the camera's own up axis, pitch about its right axis, roll about
 * its forward axis (no pitch clamp, no preferred horizon). Conventions follow Minecraft's mouse: positive yaw = turn right, positive
 * pitch = look down. Right = forward x up.
 */
public final class FlyCamera {
    private FlyCamera() {}

    /** @return {forward, up}, orthonormal, after applying the rotations in the order yaw, pitch, roll (radians). */
    public static Vec3[] rotate(Vec3 forward, Vec3 up, double yaw, double pitch, double roll) {
        Vec3 f = forward.normalize();
        Vec3 u = up.sub(f.mul(up.dot(f))).normalize();
        Vec3 r = f.cross(u);
        if (yaw != 0) { double c = Math.cos(yaw), s = Math.sin(yaw); Vec3 nf = f.mul(c).add(r.mul(s)); r = r.mul(c).sub(f.mul(s)); f = nf; }
        if (pitch != 0) { double c = Math.cos(pitch), s = Math.sin(pitch); Vec3 nf = f.mul(c).sub(u.mul(s)); u = u.mul(c).add(f.mul(s)); f = nf; }
        if (roll != 0) { double c = Math.cos(roll), s = Math.sin(roll); u = u.mul(c).add(r.mul(s)); }
        f = f.normalize();
        u = u.sub(f.mul(u.dot(f))).normalize();
        return new Vec3[] {f, u};
    }
}
