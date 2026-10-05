package dev.gohst136.planetary.physics;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.system.BodyDefinition;
import dev.gohst136.planetary.system.StarSystem;

/**
 * N-body gravity for a test particle (spacecraft) in the frame centred on a home body, with the system's axes (non-rotating).
 * The home body attracts directly; every other body contributes its attraction minus the attraction on the home body itself (the home
 * frame accelerates), i.e. the tidal term, so the Moon and the Sun perturb orbits correctly. Plus a leapfrog (kick-drift-kick) integrator:
 * symplectic, so circular orbits keep their energy over many revolutions.
 */
public final class Gravity {
    private Gravity() {}

    /** Acceleration (m/s^2) of a particle at {@code rel} (relative to the home body's centre, system axes) at time t. */
    public static Vec3 accel(StarSystem sys, String home, double t, Vec3 rel, boolean others) {
        double r = rel.length();
        Vec3 a = rel.mul(-sys.body(home).gm() / (r * r * r));
        if (!others) return a;
        Vec3 hp = sys.position(home, t);
        for (BodyDefinition b : sys.bodies()) {
            if (b.id().equals(home) || b.gm() <= 0) continue;
            Vec3 d = sys.position(b.id(), t).sub(hp);              // body relative to home
            Vec3 toBody = d.sub(rel);                               // particle -> body
            double l1 = toBody.length(), l2 = d.length();
            a = a.add(toBody.mul(b.gm() / (l1 * l1 * l1))).sub(d.mul(b.gm() / (l2 * l2 * l2)));
        }
        return a;
    }

    /** One kick-drift-kick step with a constant extra acceleration (thrust). Returns {position, velocity}. */
    public static Vec3[] step(StarSystem sys, String home, double t, Vec3 pos, Vec3 vel, Vec3 thrust, double dt, boolean others) {
        Vec3 a0 = accel(sys, home, t, pos, others).add(thrust);
        Vec3 vh = vel.add(a0.mul(0.5 * dt));
        Vec3 p = pos.add(vh.mul(dt));
        Vec3 a1 = accel(sys, home, t + dt, p, others).add(thrust);
        return new Vec3[] {p, vh.add(a1.mul(0.5 * dt))};
    }
}
