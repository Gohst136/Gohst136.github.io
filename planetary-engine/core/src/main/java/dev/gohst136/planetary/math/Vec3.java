package dev.gohst136.planetary.math;

/** Immutable double-precision 3-vector. Pure Java, no Minecraft types. */
public record Vec3(double x, double y, double z) {
    public static final Vec3 ZERO = new Vec3(0, 0, 0);

    public Vec3 add(Vec3 o) { return new Vec3(x + o.x, y + o.y, z + o.z); }
    public Vec3 sub(Vec3 o) { return new Vec3(x - o.x, y - o.y, z - o.z); }
    public Vec3 mul(double s) { return new Vec3(x * s, y * s, z * s); }
    public double dot(Vec3 o) { return x * o.x + y * o.y + z * o.z; }
    public Vec3 cross(Vec3 o) { return new Vec3(y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x); }
    public double length() { return Math.sqrt(dot(this)); }
    public Vec3 normalize() { double l = length(); return l == 0 ? this : mul(1.0 / l); }
    public double distance(Vec3 o) { return sub(o).length(); }

    /** Rodrigues rotation of this vector about the unit axis by the angle (radians). */
    public Vec3 rotate(Vec3 axis, double angle) {
        double c = Math.cos(angle), s = Math.sin(angle);
        return mul(c).add(axis.cross(this).mul(s)).add(axis.mul(axis.dot(this) * (1 - c)));
    }

    /**
     * Where a point at {@code position} with {@code velocity} will be after {@code seconds} if it keeps turning about the origin at
     * its present angular rate (orbit-like motion) while keeping its radial speed. Straight-line extrapolation of a 4,000 km/s
     * low flight would leave the surface by hundreds of km within a second; this follows the curve of the planet instead.
     */
    public static Vec3 predictAround(Vec3 position, Vec3 velocity, double seconds) {
        double r = position.length();
        if (r < 1e-9) return position.add(velocity.mul(seconds));
        Vec3 radial = position.mul(1.0 / r);
        double vr = velocity.dot(radial);
        Vec3 tangential = velocity.sub(radial.mul(vr));
        double vt = tangential.length();
        double newR = r + vr * seconds;
        if (vt < 1e-9) return radial.mul(newR);
        Vec3 axis = position.cross(tangential).normalize();
        return radial.rotate(axis, vt * seconds / r).mul(newR);
    }
}
