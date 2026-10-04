package dev.gohst136.planetary.coord;

import dev.gohst136.planetary.math.Vec3;

/**
 * Hierarchical fixed-point + double position: a 64-bit integer sector index per axis plus a
 * double offset inside the sector. Sector edge is 2^20 m (~1048 km), so the offset keeps
 * ~1e-10 m resolution while the range is ~9.6e24 m (>1e9 light years). Always normalised:
 * offsets lie in [0, SECTOR_SIZE).
 *
 * Differences are computed sector-wise, so camera-relative vectors stay precise at any
 * absolute distance as long as the two points are within a few sectors of each other.
 */
public final class UniversePos {
    public static final int SECTOR_BITS = 20;
    public static final double SECTOR_SIZE = (double) (1L << SECTOR_BITS);

    public final long sx, sy, sz;
    public final double ox, oy, oz;

    private UniversePos(long sx, long sy, long sz, double ox, double oy, double oz) {
        this.sx = sx; this.sy = sy; this.sz = sz;
        this.ox = ox; this.oy = oy; this.oz = oz;
    }

    public static UniversePos of(long sx, long sy, long sz, double ox, double oy, double oz) {
        double cx = Math.floor(ox / SECTOR_SIZE), cy = Math.floor(oy / SECTOR_SIZE), cz = Math.floor(oz / SECTOR_SIZE);
        return new UniversePos(sx + (long) cx, sy + (long) cy, sz + (long) cz,
                ox - cx * SECTOR_SIZE, oy - cy * SECTOR_SIZE, oz - cz * SECTOR_SIZE);
    }

    public static UniversePos ofMeters(double x, double y, double z) { return of(0, 0, 0, x, y, z); }

    public UniversePos plus(Vec3 d) { return of(sx, sy, sz, ox + d.x(), oy + d.y(), oz + d.z()); }

    /** this - other, in metres, precise when the two are close. */
    public Vec3 minus(UniversePos o) {
        return new Vec3((sx - o.sx) * SECTOR_SIZE + (ox - o.ox),
                        (sy - o.sy) * SECTOR_SIZE + (oy - o.oy),
                        (sz - o.sz) * SECTOR_SIZE + (oz - o.oz));
    }

    @Override public String toString() {
        return "UniversePos[sector=(" + sx + "," + sy + "," + sz + ") off=(" + ox + "," + oy + "," + oz + ")]";
    }
}
