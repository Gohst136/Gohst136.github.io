package dev.gohst136.planetary.world;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Sparse record of how the real world deviates from the procedural planet: CurrentWorld = Procedural(seed) + this database.
 * Only changed blocks and the resulting per-column surface heights are stored, so a planet of 1e14 columns with a few million edits
 * costs a few MB. Regions are 32x32 columns of the vanilla plane (one value per touched column, one entry per touched block).
 *
 * Why column heights: the far-field mesh and the physics need "how high is the ground here now", not every block. The server
 * (authoritative) writes the surface height of a column whenever an edit changes it; clients only ever read.
 * Thread-safe (concurrent map of regions, per-region synchronisation). Serialisation: compact varints, deterministic order.
 */
public final class ModificationDatabase {
    public static final int REGION_BITS = 5;                       // 32 x 32 columns

    private static final class Region {
        final TreeMap<Integer, Short> blocks = new TreeMap<>();    // key: (localX<<5 | localZ) << 16 | (y + 32768) & 0xffff -> block state id
        final TreeMap<Integer, Integer> columnTop = new TreeMap<>();   // key: localX<<5 | localZ -> surface y
    }

    private final ConcurrentHashMap<Long, Region> regions = new ConcurrentHashMap<>();
    private volatile long version;

    private static long regionKey(int x, int z) { return ((long) (x >> REGION_BITS) << 32) ^ ((z >> REGION_BITS) & 0xffffffffL); }
    private static int colKey(int x, int z) { return ((x & 31) << 5) | (z & 31); }

    public void setBlock(int x, int y, int z, short stateId) {
        Region r = regions.computeIfAbsent(regionKey(x, z), k -> new Region());
        synchronized (r) { r.blocks.put((colKey(x, z) << 16) | ((y + 32768) & 0xffff), stateId); }
        version++;
    }

    /** @return the stored state id, or {@code null} if this block was never modified (use the procedural value). */
    public Short getBlock(int x, int y, int z) {
        Region r = regions.get(regionKey(x, z));
        if (r == null) return null;
        synchronized (r) { return r.blocks.get((colKey(x, z) << 16) | ((y + 32768) & 0xffff)); }
    }

    public void setColumnTop(int x, int z, int surfaceY) {
        Region r = regions.computeIfAbsent(regionKey(x, z), k -> new Region());
        synchronized (r) { r.columnTop.put(colKey(x, z), surfaceY); }
        version++;
    }

    /** @return the modified surface height of this column, or {@code null} if unmodified. */
    public Integer columnTop(int x, int z) {
        Region r = regions.get(regionKey(x, z));
        if (r == null) return null;
        synchronized (r) { return r.columnTop.get(colKey(x, z)); }
    }

    /** Replaces the content with {@code other}'s (used when loading a saved world into the shared instance). */
    public void replaceWith(ModificationDatabase other) {
        regions.clear();
        regions.putAll(other.regions);
        version++;
    }

    public long version() { return version; }
    public int regionCount() { return regions.size(); }

    public long blockCount() {
        long n = 0;
        for (Region r : regions.values()) synchronized (r) { n += r.blocks.size(); }
        return n;
    }

    // ---- serialisation ----------------------------------------------------------------------------------------------------------

    public byte[] serialize() {
        try {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            DataOutputStream out = new DataOutputStream(bos);
            TreeMap<Long, Region> sorted = new TreeMap<>(regions);
            writeVar(out, sorted.size());
            long prevKey = 0;
            for (Map.Entry<Long, Region> e : sorted.entrySet()) {
                writeVarLong(out, zigzag(e.getKey() - prevKey)); prevKey = e.getKey();
                Region r = e.getValue();
                synchronized (r) {
                    writeVar(out, r.columnTop.size());
                    int prev = 0;
                    for (var c : r.columnTop.entrySet()) { writeVar(out, c.getKey() - prev); prev = c.getKey(); writeVar(out, zigzagI(c.getValue())); }
                    writeVar(out, r.blocks.size());
                    int pk = 0;
                    for (var b : r.blocks.entrySet()) { writeVarLong(out, ((long) b.getKey() & 0xffffffffL) - (pk & 0xffffffffL)); pk = b.getKey(); writeVar(out, b.getValue() & 0xffff); }
                }
            }
            out.flush();
            return bos.toByteArray();
        } catch (IOException e) { throw new IllegalStateException(e); }
    }

    public static ModificationDatabase deserialize(byte[] data) {
        try {
            DataInputStream in = new DataInputStream(new ByteArrayInputStream(data));
            ModificationDatabase db = new ModificationDatabase();
            int n = readVar(in);
            long prevKey = 0;
            for (int i = 0; i < n; i++) {
                prevKey += unzigzag(readVarLong(in));
                Region r = new Region();
                int nc = readVar(in), prev = 0;
                for (int j = 0; j < nc; j++) { prev += readVar(in); r.columnTop.put(prev, unzigzagI(readVar(in))); }
                int nb = readVar(in); long pk = 0;
                for (int j = 0; j < nb; j++) { pk += readVarLong(in); r.blocks.put((int) pk, (short) readVar(in)); }
                db.regions.put(prevKey, r);
            }
            return db;
        } catch (IOException e) { throw new IllegalArgumentException("corrupt modification database", e); }
    }

    private static long zigzag(long v) { return (v << 1) ^ (v >> 63); }
    private static long unzigzag(long v) { return (v >>> 1) ^ -(v & 1); }
    private static int zigzagI(int v) { return (v << 1) ^ (v >> 31); }
    private static int unzigzagI(int v) { return (v >>> 1) ^ -(v & 1); }
    private static void writeVar(DataOutputStream o, int v) throws IOException { writeVarLong(o, v & 0xffffffffL); }
    private static void writeVarLong(DataOutputStream o, long v) throws IOException {
        while ((v & ~0x7fL) != 0) { o.writeByte((int) ((v & 0x7f) | 0x80)); v >>>= 7; }
        o.writeByte((int) v);
    }
    private static int readVar(DataInputStream i) throws IOException { return (int) readVarLong(i); }
    private static long readVarLong(DataInputStream i) throws IOException {
        long r = 0; int shift = 0;
        while (true) { int b = i.readUnsignedByte(); r |= (long) (b & 0x7f) << shift; if ((b & 0x80) == 0) return r; shift += 7; if (shift > 63) throw new IOException("varint too long"); }
    }
}
