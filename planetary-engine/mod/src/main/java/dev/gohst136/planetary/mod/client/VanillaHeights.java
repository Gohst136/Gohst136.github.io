package dev.gohst136.planetary.mod.client;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.RandomState;

import java.util.concurrent.atomic.AtomicLong;
import java.util.function.DoubleBinaryOperator;

/**
 * Height of the real vanilla overworld (this world's seed and generator) at block column (x, z), relative to
 * sea level. Reads the integrated server's generator, so it works in singleplayer only; a multiplayer client
 * would need the seed/generator from the server (planned). {@link ChunkGenerator#getBaseHeight} builds a
 * throw-away noise column per call and shares only immutable router data, which is what worldgen workers do.
 * Counters are for telemetry.
 */
final class VanillaHeights implements DoubleBinaryOperator {
    private final ServerLevel level;
    private final ChunkGenerator generator;
    private final RandomState randomState;
    private final int seaLevel;
    final AtomicLong calls = new AtomicLong(), nanos = new AtomicLong();

    VanillaHeights(ServerLevel level) {
        this.level = level;
        this.generator = level.getChunkSource().getGenerator();
        this.randomState = level.getChunkSource().randomState();
        this.seaLevel = generator.getSeaLevel();
    }

    @Override
    public double applyAsDouble(double x, double z) {
        long t0 = System.nanoTime();
        int y = generator.getBaseHeight((int) Math.floor(x), (int) Math.floor(z), Heightmap.Types.OCEAN_FLOOR_WG, level, randomState);
        calls.incrementAndGet();
        nanos.addAndGet(System.nanoTime() - t0);
        return y - seaLevel;
    }

    String stats() {
        long c = calls.get();
        return "vanilla samples=" + c + " avg=" + (c == 0 ? 0 : nanos.get() / c / 1000) + "us";
    }
}
