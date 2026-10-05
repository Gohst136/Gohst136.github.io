package dev.gohst136.planetary.net;

import java.nio.ByteBuffer;

/**
 * Wire format for a player's universal position, independent of vanilla's int-delta entity packets (which cannot express more than
 * +-8 blocks per tick). Fixed 40 bytes: body id (short), reference-frame flags, 64-bit fixed-point position relative to the body
 * centre (1/1024 m resolution, +-9e15 m range: more than the whole solar system), velocity in float m/s, and a tick counter.
 * The server sends it to clients (visual/prediction channel); the client sends its intended velocity (never positions it expects
 * to be trusted). Position is the SERVER's authoritative value; clients render it, they do not set it.
 */
public record PlanetStatePacket(short bodyId, byte flags, long xQ, long yQ, long zQ, float vx, float vy, float vz, int tick) {
    public static final int SIZE = 44;                              // 2 + 1 + 1 (reserved) + 24 + 12 + 4
    public static final double RES = 1.0 / 1024.0;
    public static final byte FLAG_INERTIAL = 1, FLAG_IN_BUBBLE = 2, FLAG_ON_GROUND = 4;

    public static PlanetStatePacket of(short bodyId, byte flags, double x, double y, double z, float vx, float vy, float vz, int tick) {
        return new PlanetStatePacket(bodyId, flags, Math.round(x / RES), Math.round(y / RES), Math.round(z / RES), vx, vy, vz, tick);
    }

    public double x() { return xQ * RES; }
    public double y() { return yQ * RES; }
    public double z() { return zQ * RES; }

    public byte[] encode() {
        ByteBuffer b = ByteBuffer.allocate(44);
        b.putShort(bodyId).put(flags).put((byte) 0).putLong(xQ).putLong(yQ).putLong(zQ).putFloat(vx).putFloat(vy).putFloat(vz).putInt(tick);
        return b.array();
    }

    public static PlanetStatePacket decode(byte[] data) {
        if (data.length != 44) throw new IllegalArgumentException("bad packet size " + data.length);
        ByteBuffer b = ByteBuffer.wrap(data);
        short body = b.getShort(); byte flags = b.get(); b.get();
        return new PlanetStatePacket(body, flags, b.getLong(), b.getLong(), b.getLong(), b.getFloat(), b.getFloat(), b.getFloat(), b.getInt());
    }

    /**
     * Server-side sanity check of a client's claimed speed: rejects physically impossible velocity changes (anti-teleport) while
     * allowing the legitimate regime changes (a ship can accelerate hard, a walker cannot).
     * @param maxAccel the largest acceleration the player's current vehicle/regime allows (m/s^2)
     */
    public boolean plausibleAfter(PlanetStatePacket previous, double dtSeconds, double maxAccel) {
        double dvx = vx - previous.vx, dvy = vy - previous.vy, dvz = vz - previous.vz;
        return Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz) <= maxAccel * Math.max(dtSeconds, 1e-3) * 1.5 + 1e-3;
    }
}
