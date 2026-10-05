package dev.gohst136.planetary.system;

/**
 * Data-driven celestial body (star, planet, moon, asteroid field). Lengths in metres, times in seconds, gm in m^3/s^2.
 * The orbit is Keplerian about the parent body ({@code parentId == null}: the system's origin, usually the star).
 */
public record BodyDefinition(
        String id,
        String parentId,
        Kind kind,
        double radius,
        double gm,                       // gravitational parameter G*M
        double semiMajorAxis,            // orbit about the parent (ignored without parent)
        double eccentricity,             // 0 <= e < 1
        double inclination,              // radians, relative to the system plane
        double argumentOfPeriapsis,      // radians
        double longitudeOfNode,          // radians
        double meanAnomalyAtEpoch,       // radians
        double rotationPeriod,           // seconds (sidereal), 0 = not rotating
        double axialTilt,                // radians, tilt of the spin axis from the orbit-plane normal
        long seed,                       // terrain seed (planets/moons)
        double luminosity) {             // W, stars only

    public enum Kind { STAR, PLANET, MOON, ASTEROID_FIELD }

    /** Orbital period about the parent, given the parent's gm. */
    public double orbitalPeriod(double parentGm) {
        return 2.0 * Math.PI * Math.sqrt(semiMajorAxis * semiMajorAxis * semiMajorAxis / parentGm);
    }

    /** Surface gravity (m/s^2). */
    public double surfaceGravity() { return gm / (radius * radius); }

    /** Hill sphere radius about the parent: where this body's gravity wins over the parent's (approximation). */
    public double hillRadius(double parentGm) {
        return semiMajorAxis * (1.0 - eccentricity) * Math.cbrt(gm / (3.0 * parentGm));
    }
}
