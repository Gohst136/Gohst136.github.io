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
    private final DensityFunction density;
    private final int seaLevel, minY, maxY;
    final AtomicLong calls = new AtomicLong(), nanos = new AtomicLong();

    VanillaHeights(ServerLevel level) {
        this.level = level;
        ChunkGenerator generator = level.getChunkSource().getGenerator();
        this.density = level.getChunkSource().randomState().router().initialDensityWithoutJaggedness();
        this.seaLevel = generator.getSeaLevel();
        this.minY = level.getMinBuildHeight();
        this.maxY = level.getMaxBuildHeight();
    }

    @Override
    public double applyAsDouble(double x, double z) {
        long t0 = System.nanoTime();
        int bx = (int) Math.floor(x), bz = (int) Math.floor(z);
        int lo = minY, hi = maxY;                         // invariant: solid at lo, air at hi
        double result;
        if (d(bx, lo, bz) <= 0.0) result = minY;
        else if (d(bx, hi, bz) > 0.0) result = maxY;
        else {
            while (hi - lo > 1) {
                int mid = (lo + hi) >>> 1;
                if (d(bx, mid, bz) > 0.0) lo = mid; else hi = mid;
            }
            double dl = d(bx, lo, bz), dh = d(bx, hi, bz);
            result = lo + (dl <= dh ? 0.0 : dl / (dl - dh));
        }
        calls.incrementAndGet();
        nanos.addAndGet(System.nanoTime() - t0);
        return result - seaLevel;
    }

    private double d(int x, int y, int z) { return density.compute(new DensityFunction.SinglePointContext(x, y, z)); }

    String stats() {
        long c = calls.get();
        return "vanilla samples=" + c + " avg=" + (c == 0 ? 0 : nanos.get() / c / 1000) + "us";
    }
}
