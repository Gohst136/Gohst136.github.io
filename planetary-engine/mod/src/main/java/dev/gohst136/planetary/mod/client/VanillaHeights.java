package dev.gohst136.planetary.mod.client;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.DensityFunction;
import net.minecraft.world.level.levelgen.RandomState;

import java.util.concurrent.atomic.AtomicLong;
import java.util.function.DoubleBinaryOperator;

/**
 * Height of the real vanilla overworld (this world's seed and noise router) at block column (x, z), relative
 * to sea level, via a bisection on the router's {@code initialDensityWithoutJaggedness} (solid where > 0,
 * decreasing in y) with a final linear zero-crossing interpolation, so heights are continuous.
 *
 * Why not {@code ChunkGenerator#getBaseHeight}: measured at ~4.4 ms per column on the dev PC (it builds a
 * noise chunk per call), i.e. seconds per mesh. This costs ~10 density evaluations per column. The price:
 * no jaggedness, caves or surface rules, so peaks are smoother than real chunks (Phase 6 uses real chunks
 * inside the simulation bubble). Reads the integrated server's router, so singleplayer only. The router's
 * functions are immutable (cache markers just delegate outside a noise chunk), hence thread-safe.
 */
final class VanillaHeights implements DoubleBinaryOperator {
    private final ServerLevel level;
    private final ChunkGenerator generator;
    private final RandomState randomState;
    private final DensityFunction density;
    private final int seaLevel, minY, maxY;
    final AtomicLong calls = new AtomicLong(), nanos = new AtomicLong();

    VanillaHeights(ServerLevel level) {
        this.level = level;
        this.generator = level.getChunkSource().getGenerator();
        this.randomState = level.getChunkSource().randomState();
        this.density = randomState.router().initialDensityWithoutJaggedness();
        this.seaLevel = generator.getSeaLevel();
        this.minY = level.getMinBuildHeight();
        this.maxY = level.getMaxBuildHeight();
    }

    /** Last solid height found by this thread: consecutive mesh vertices are neighbours, so it is a good starting bracket. */
    private final ThreadLocal<int[]> hint = ThreadLocal.withInitial(() -> new int[]{Integer.MIN_VALUE});

    @Override
    public double applyAsDouble(double x, double z) {
        long t0 = System.nanoTime();
        int bx = (int) Math.floor(x), bz = (int) Math.floor(z);
        int lo = minY, hi = maxY;                         // invariant: solid at lo, air at hi
        double result;
        int[] h = hint.get();
        boolean bracketed = false;
        if (h[0] != Integer.MIN_VALUE) {                  // gallop outwards from the previous surface height
            int g = Math.max(minY + 1, Math.min(maxY - 1, h[0]));
            if (d(bx, g, bz) > 0.0) {                     // solid at g: surface is above, search upwards
                lo = g;
                for (int step = 8; ; step *= 2) {
                    int t = Math.min(maxY, g + step);
                    if (d(bx, t, bz) <= 0.0) { hi = t; bracketed = true; break; }
                    lo = t;
                    if (t >= maxY) break;
                }
            } else {                                      // air at g: surface is below
                hi = g;
                for (int step = 8; ; step *= 2) {
                    int t = Math.max(minY, g - step);
                    if (d(bx, t, bz) > 0.0) { lo = t; bracketed = true; break; }
                    hi = t;
                    if (t <= minY) break;
                }
            }
        }
        if (!bracketed) { lo = minY; hi = maxY; }
        if (!bracketed && d(bx, lo, bz) <= 0.0) result = minY;
        else if (!bracketed && d(bx, hi, bz) > 0.0) result = maxY;
        else {
            while (hi - lo > 1) {
                int mid = (lo + hi) >>> 1;
                if (d(bx, mid, bz) > 0.0) lo = mid; else hi = mid;
            }
            double dl = d(bx, lo, bz), dh = d(bx, hi, bz);
            result = lo + (dl <= dh ? 0.0 : dl / (dl - dh));
        }
        h[0] = (int) Math.floor(result);
        calls.incrementAndGet();
        nanos.addAndGet(System.nanoTime() - t0);
        return result - seaLevel;
    }

    private double d(int x, int y, int z) { return density.compute(new DensityFunction.SinglePointContext(x, y, z)); }

    /** Ground truth: the generator's own column height (slow, for validation only). */
    double exactHeight(double x, double z) {
        int y = generator.getBaseHeight((int) Math.floor(x), (int) Math.floor(z),
                net.minecraft.world.level.levelgen.Heightmap.Types.OCEAN_FLOOR_WG, level, randomState);
        return y - seaLevel;
    }

    String stats() {
        long c = calls.get();
        return "vanilla samples=" + c + " avg=" + (c == 0 ? 0 : nanos.get() / c / 1000) + "us";
    }
}
