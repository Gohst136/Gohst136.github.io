package dev.gohst136.planetary.mod.world;

import com.mojang.logging.LogUtils;
import dev.gohst136.planetary.world.ModificationDatabase;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.level.storage.LevelResource;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.event.level.LevelEvent;
import net.neoforged.neoforge.event.server.ServerStartedEvent;
import net.neoforged.neoforge.event.server.ServerStoppingEvent;
import org.slf4j.Logger;

/** Loads / saves {@link PlanetEdits#DB} as {@code <world>/planetary_edits.bin} (written atomically, so a crash never leaves half a file). */
@EventBusSubscriber(modid = "planetary")
public final class PlanetPersistence {
    private static final Logger LOGGER = LogUtils.getLogger();
    private static long savedVersion = -1;

    private PlanetPersistence() {}

    private static Path file(MinecraftServer server) { return server.getWorldPath(LevelResource.ROOT).resolve("planetary_edits.bin"); }

    @SubscribeEvent
    public static void started(ServerStartedEvent e) {
        Path f = file(e.getServer());
        PlanetEdits.DB.replaceWith(new ModificationDatabase());
        if (Files.isRegularFile(f)) {
            try {
                PlanetEdits.DB.replaceWith(ModificationDatabase.deserialize(Files.readAllBytes(f)));
                LOGGER.info("Loaded {} planet edits in {} regions", PlanetEdits.DB.blockCount(), PlanetEdits.DB.regionCount());
            } catch (IOException | RuntimeException ex) {
                LOGGER.error("Could not read {}: edits ignored (file kept)", f, ex);
            }
        }
        savedVersion = PlanetEdits.DB.version();
    }

    @SubscribeEvent
    public static void saving(LevelEvent.Save e) {
        if (e.getLevel() instanceof net.minecraft.server.level.ServerLevel l && l.getServer() != null) save(l.getServer());
    }

    @SubscribeEvent
    public static void stopping(ServerStoppingEvent e) { save(e.getServer()); }

    private static synchronized void save(MinecraftServer server) {
        if (PlanetEdits.DB.version() == savedVersion) return;
        Path f = file(server), tmp = f.resolveSibling(f.getFileName() + ".tmp");
        try {
            long v = PlanetEdits.DB.version();
            Files.write(tmp, PlanetEdits.DB.serialize());
            Files.move(tmp, f, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            savedVersion = v;
        } catch (IOException ex) {
            LOGGER.error("Could not save planet edits to {}", f, ex);
        }
    }
}
