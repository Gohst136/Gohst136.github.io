package dev.gohst136.planetary.mod.world;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.registries.Registries;
import net.minecraft.world.level.biome.BiomeSource;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.registries.DeferredRegister;

/** Registers the planet's chunk generator and biome source codecs under "planetary:planet". */
public final class PlanetWorldRegistry {
    private PlanetWorldRegistry() {}

    private static final DeferredRegister<MapCodec<? extends ChunkGenerator>> GENERATORS =
            DeferredRegister.create(Registries.CHUNK_GENERATOR, "planetary");
    private static final DeferredRegister<MapCodec<? extends BiomeSource>> BIOME_SOURCES =
            DeferredRegister.create(Registries.BIOME_SOURCE, "planetary");

    public static void register(IEventBus modBus) {
        GENERATORS.register("planet", () -> PlanetChunkGenerator.CODEC);
        BIOME_SOURCES.register("planet", () -> PlanetBiomeSource.CODEC);
        GENERATORS.register(modBus);
        BIOME_SOURCES.register(modBus);
    }
}
