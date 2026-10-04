package dev.gohst136.planetary.coord;

import dev.gohst136.planetary.math.Vec3;

/**
 * Floating origin. The origin snaps to the camera whenever the camera drifts further than
 * {@code rebaseDistance}; all render-side data is expressed relative to the origin (doubles
 * in Java, floats on the GPU). Snap positions are rounded to whole blocks so that rebasing
 * is invisible to anything block-aligned. Rebasing never changes {@link #relative}'s result
 * beyond double rounding, which is what makes it unnoticeable.
 */
public final class FloatingOrigin {
    private UniversePos origin;
    private final double rebaseDistance;
    private long rebaseCount;

    public FloatingOrigin(UniversePos initial, double rebaseDistance) {
        this.origin = snap(initial);
        this.rebaseDistance = rebaseDistance;
    }

    /** @return true if the origin was moved this call. */
    public boolean update(UniversePos camera) {
        if (camera.minus(origin).length() <= rebaseDistance) return false;
        origin = snap(camera);
        rebaseCount++;
        return true;
    }

    /** Position relative to the current origin (double). */
    public Vec3 relative(UniversePos p) { return p.minus(origin); }

    public UniversePos origin() { return origin; }
    public long rebaseCount() { return rebaseCount; }

    private static UniversePos snap(UniversePos p) {
        return UniversePos.of(p.sx, p.sy, p.sz, Math.floor(p.ox), Math.floor(p.oy), Math.floor(p.oz));
    }
}
