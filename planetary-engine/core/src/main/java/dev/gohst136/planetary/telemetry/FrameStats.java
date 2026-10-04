package dev.gohst136.planetary.telemetry;

import java.util.Arrays;

/** Fixed-size ring of frame times (ms) with avg/median/p95/p99/worst. Single-writer. */
public final class FrameStats {
    private final double[] ring;
    private int count, next;

    public FrameStats(int capacity) { ring = new double[capacity]; }

    public void record(double ms) { ring[next] = ms; next = (next + 1) % ring.length; count = Math.min(count + 1, ring.length); }

    public double average() { double s = 0; for (int i = 0; i < count; i++) s += ring[i]; return count == 0 ? 0 : s / count; }
    public double median() { return percentile(0.5); }
    public double p95() { return percentile(0.95); }
    public double p99() { return percentile(0.99); }
    public double worst() { double m = 0; for (int i = 0; i < count; i++) m = Math.max(m, ring[i]); return m; }

    public double percentile(double q) {
        if (count == 0) return 0;
        double[] c = Arrays.copyOf(ring, count);
        Arrays.sort(c);
        return c[(int) Math.min(count - 1, Math.floor(q * count))];
    }
}
