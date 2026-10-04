package dev.gohst136.planetary.mod;

import com.mojang.logging.LogUtils;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;
import org.slf4j.Logger;

/**
 * Mod entry point. UNCOMPILED/UNTESTED scaffold (maven.neoforged.net was unreachable when written).
 * Phase 2 adds: client render hook (RenderLevelStageEvent AFTER_SKY / AFTER_SOLID_BLOCKS) driving an
 * OpenGL RenderBackend implementation fed from the pure-Java core, plus a debug overlay.
 */
@Mod(PlanetaryMod.MOD_ID)
public final class PlanetaryMod {
    public static final String MOD_ID = "planetary";
    private static final Logger LOGGER = LogUtils.getLogger();

    public PlanetaryMod(IEventBus modBus) {
        LOGGER.info("Planetary engine scaffold loaded (core selector/mesh/coords are in :core)");
    }
}
