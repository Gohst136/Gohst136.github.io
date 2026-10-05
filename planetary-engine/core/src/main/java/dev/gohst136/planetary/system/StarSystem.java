package dev.gohst136.planetary.system;

import dev.gohst136.planetary.coord.UniversePos;
import dev.gohst136.planetary.math.Vec3;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A star system: bodies with Keplerian orbits and spin. Positions are evaluated analytically at any time t (no integration drift,
 * deterministic, valid for arbitrarily large time warps). Bodies are expressed in the system frame (origin: the root body).
 *
 * Precision: absolute positions use {@link UniversePos} (64-bit sector + double offset), differences between nearby points
 * are exact to ~1e-10 m even 1e12 m from the star, which is what the floating-origin renderer needs.
 */
public final class StarSystem {
    private final Map<String, BodyDefinition> bodies = new LinkedHashMap<>();
    private final Map<String, List<String>> children = new HashMap<>();
    private final String root;

    public StarSystem(List<BodyDefinition> defs) {
        String r = null;
        for (BodyDefinition d : defs) {
            if (bodies.put(d.id(), d) != null) throw new IllegalArgumentException("duplicate body " + d.id());
            if (d.parentId() == null) { if (r != null) throw new IllegalArgumentException("two root bodies"); r = d.id(); }
        }
        if (r == null) throw new IllegalArgumentException("no root body");
        for (BodyDefinition d : defs) {
            if (d.parentId() != null) {
                if (!bodies.containsKey(d.parentId())) throw new IllegalArgumentException("unknown parent " + d.parentId());
                children.computeIfAbsent(d.parentId(), k -> new ArrayList<>()).add(d.id());
            }
        }
        this.root = r;
        for (BodyDefinition d : defs) depth(d.id(), 0);                       // rejects cycles
    }

    private int depth(String id, int n) {
        if (n > 32) throw new IllegalArgumentException("orbit cycle at " + id);
        BodyDefinition d = bodies.get(id);
        return d.parentId() == null ? 0 : 1 + depth(d.parentId(), n + 1);
    }

    public BodyDefinition body(String id) { return bodies.get(id); }
    public Iterable<BodyDefinition> bodies() { return bodies.values(); }
    public String rootId() { return root; }
    public List<String> childrenOf(String id) { return children.getOrDefault(id, List.of()); }

    // ---- orbits ---------------------------------------------------------------------------------------------------------------

    /** Position relative to the parent at time t (seconds since epoch), in the system frame axes. */
    public Vec3 relativeToParent(String id, double t) {
        BodyDefinition d = bodies.get(id);
        if (d.parentId() == null) return Vec3.ZERO;
        double parentGm = bodies.get(d.parentId()).gm();
        double n = Math.sqrt(parentGm / (d.semiMajorAxis() * d.semiMajorAxis() * d.semiMajorAxis()));   // mean motion
        double M = d.meanAnomalyAtEpoch() + n * t;
        double E = solveKepler(M, d.eccentricity());
        double a = d.semiMajorAxis(), e = d.eccentricity();
        double xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);      // orbital plane, periapsis along +x
        // rotate: argument of periapsis (z), inclination (x), longitude of node (z)
        double cw = Math.cos(d.argumentOfPeriapsis()), sw = Math.sin(d.argumentOfPeriapsis());
        double ci = Math.cos(d.inclination()), si = Math.sin(d.inclination());
        double co = Math.cos(d.longitudeOfNode()), so = Math.sin(d.longitudeOfNode());
        double x1 = cw * xp - sw * yp, y1 = sw * xp + cw * yp;
        double x2 = x1, y2 = ci * y1, z2 = si * y1;
        return new Vec3(co * x2 - so * y2, so * x2 + co * y2, z2);
    }

    /** Position in the system frame at time t (sum of the orbit chain). */
    public Vec3 position(String id, double t) {
        Vec3 p = Vec3.ZERO;
        for (String c = id; c != null; c = bodies.get(c).parentId()) p = p.add(relativeToParent(c, t));
        return p;
    }

    /** Velocity (m/s) by a symmetric difference of the analytic position (exact enough for frame velocity transfer). */
    public Vec3 velocity(String id, double t) {
        double h = 1.0;
        return position(id, t + h).sub(position(id, t - h)).mul(1.0 / (2.0 * h));
    }

    /** Centre of the body as an absolute position (precision-safe for sub-metre differences). */
    public UniversePos centre(String id, double t) {
        Vec3 p = position(id, t);
        return UniversePos.ofMeters(p.x(), p.y(), p.z());
    }

    static double solveKepler(double M, double e) {
        M = M % (2.0 * Math.PI);
        double E = e < 0.8 ? M : Math.PI;
        for (int i = 0; i < 40; i++) {
            double f = E - e * Math.sin(E) - M, fp = 1.0 - e * Math.cos(E);
            double dE = f / fp;
            E -= dE;
            if (Math.abs(dE) < 1e-14) break;
        }
        return E;
    }

    // ---- spin and frames --------------------------------------------------------------------------------------------------------

    /** Rotation angle about the spin axis at time t. */
    public double spinAngle(String id, double t) {
        BodyDefinition d = bodies.get(id);
        return d.rotationPeriod() == 0 ? 0 : 2.0 * Math.PI * t / d.rotationPeriod();
    }

    /** Spin axis (unit) in the system frame: system z tilted by the axial tilt about the x axis. */
    public Vec3 spinAxis(String id) {
        double tilt = bodies.get(id).axialTilt();
        return new Vec3(0, -Math.sin(tilt), Math.cos(tilt));
    }

    /** Body-fixed -> system frame rotation applied to a vector (body-fixed axes: z = spin axis, rotating with the body). */
    public Vec3 bodyToSystem(String id, double t, Vec3 v) {
        double a = spinAngle(id, t);
        Vec3 spun = new Vec3(Math.cos(a) * v.x() - Math.sin(a) * v.y(), Math.sin(a) * v.x() + Math.cos(a) * v.y(), v.z());
        double tilt = bodies.get(id).axialTilt();
        double c = Math.cos(tilt), s = Math.sin(tilt);
        return new Vec3(spun.x(), c * spun.y() - s * spun.z(), s * spun.y() + c * spun.z());
    }

    public Vec3 systemToBody(String id, double t, Vec3 v) {
        double tilt = bodies.get(id).axialTilt();
        double c = Math.cos(tilt), s = Math.sin(tilt);
        Vec3 untilted = new Vec3(v.x(), c * v.y() + s * v.z(), -s * v.y() + c * v.z());
        double a = -spinAngle(id, t);
        return new Vec3(Math.cos(a) * untilted.x() - Math.sin(a) * untilted.y(), Math.sin(a) * untilted.x() + Math.cos(a) * untilted.y(), untilted.z());
    }

    /** A point of the system (absolute) -> coordinates in the body-fixed frame of {@code id} (what the planet renderer wants). */
    public Vec3 toBodyFrame(String id, double t, UniversePos world) {
        return systemToBody(id, t, world.minus(centre(id, t)));
    }

    /** Body-fixed coordinates -> absolute point of the system. */
    public UniversePos fromBodyFrame(String id, double t, Vec3 local) {
        return centre(id, t).plus(bodyToSystem(id, t, local));
    }

    /**
     * Which body's reference frame governs a point: the deepest body whose sphere of influence contains it
     * (SOI = a (m/M)^(2/5) about its parent). Spacecraft physics and the renderer pick their frame from this.
     */
    public String dominantBody(UniversePos world, double t) {
        String best = root;
        double bestDepth = -1;
        for (BodyDefinition d : bodies.values()) {
            if (d.parentId() == null) continue;
            double soi = d.semiMajorAxis() * Math.pow(d.gm() / bodies.get(d.parentId()).gm(), 0.4);
            if (world.minus(centre(d.id(), t)).length() < soi) {
                int dep = depth(d.id(), 0);
                if (dep > bestDepth) { bestDepth = dep; best = d.id(); }
            }
        }
        return best;
    }

    // ---- a ready-made example system ---------------------------------------------------------------------------------------------

    /** Sun-like star, the Earth-like planet (seed from the world), a Moon, and a second, smaller rocky planet. */
    public static StarSystem example(long earthSeed) {
        final double G = 6.674e-11;
        // the Earth and Moon radii are fixed by the block grid (PlanetDefinition); their GM keeps the real surface gravity (9.81 and 1.62 m/s^2)
        double earthR = dev.gohst136.planetary.planet.PlanetDefinition.EARTH_RADIUS, moonR = dev.gohst136.planetary.planet.PlanetDefinition.MOON_RADIUS;
        double sunGm = G * 1.989e30, earthGm = 9.81 * earthR * earthR, moonGm = 1.62 * moonR * moonR, marsGm = G * 6.417e23;
        double moonA = Math.cbrt(earthGm * Math.pow(2.3606e6 / (2.0 * Math.PI), 2));      // keeps the sidereal month (27.3 d) with the scaled Earth GM
        return new StarSystem(List.of(
                new BodyDefinition("sun", null, BodyDefinition.Kind.STAR, 6.957e8, sunGm, 0, 0, 0, 0, 0, 0, 2.2e6, 0, 1, 3.828e26),
                new BodyDefinition("earth", "sun", BodyDefinition.Kind.PLANET, earthR, earthGm, 1.496e11, 0.0167, 0, 1.99, 0, 0.0, 86164.1, Math.toRadians(23.44), earthSeed, 0),
                new BodyDefinition("moon", "earth", BodyDefinition.Kind.MOON, moonR, moonGm, moonA, 0.0549, Math.toRadians(5.1), 0.0, 0.0, 1.0, 2.36e6, Math.toRadians(6.7), earthSeed ^ 0x5DEECE66DL, 0),
                new BodyDefinition("ares", "sun", BodyDefinition.Kind.PLANET, 3.39e6, marsGm, 2.279e11, 0.0934, Math.toRadians(1.85), 5.0, 0.86, 3.1, 88642.7, Math.toRadians(25.2), earthSeed ^ 0xBB67AE85L, 0)));
    }
}
