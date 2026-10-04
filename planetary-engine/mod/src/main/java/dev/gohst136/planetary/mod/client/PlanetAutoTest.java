package dev.gohst136.planetary.mod.client;

import dev.gohst136.planetary.lod.QuadtreeSelector;
import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.telemetry.FrameStats;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.world.Difficulty;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;

/**
 * Dev-only scripted benchmark (spec section 46), enabled with -Dplanetary.autotest=true.
 * Creates a world, then descends from 20,000 km to 2 m above a fixed ground point in virtual
 * time (1/30 s per rendered frame, so results do not depend on the software renderer's speed),
 * holds at each decade of altitude until streaming catches up, saves a screenshot plus stats
 * to run/planetary-autotest/, then quits.
 */
final class PlanetAutoTest {
    private static final boolean ENABLED = Boolean.getBoolean("planetary.autotest");
    private static final double[] STOPS = {2e7, 2e6, 2e5, 2e4, 2e3, 2e2, 20, 2};
    private static final int HOLD_FRAMES = 40;

    private static boolean worldRequested;
    private static int ticksInWorld;
    private static double t;                 // virtual seconds
    private static int stop, hold, frames;
    private static double alt = STOPS[0];
    private static File outDir;
    private static FileWriter log;
    private static String pendingName;
    private static Vec3 target;
    private static double targetGround;

    private PlanetAutoTest() {}

    static boolean enabled() { return ENABLED && PlanetClient.active; }

    static void tick(Minecraft mc) {
        if (!ENABLED) return;
        if (mc.level == null) {
            if (!worldRequested && mc.screen instanceof TitleScreen) {
                worldRequested = true;
                mc.createWorldOpenFlows().createFreshLevel("planetary_autotest",
                        new LevelSettings("planetary_autotest", GameType.CREATIVE, false, Difficulty.PEACEFUL, true,
                                new GameRules(), WorldDataConfiguration.DEFAULT),
                        WorldOptions.defaultWithRandomSeed(), WorldPresets::createNormalWorldDimensions, mc.screen);
            }
            return;
        }
        if (mc.player != null && ++ticksInWorld == 100 && !PlanetClient.active) {
            outDir = new File(mc.gameDirectory, "planetary-autotest");
            outDir.mkdirs();
            try { log = new FileWriter(new File(outDir, "stats.txt"));
                log.write("GPU: " + org.lwjgl.opengl.GL11.glGetString(org.lwjgl.opengl.GL11.GL_RENDERER) + " | GL " + org.lwjgl.opengl.GL11.glGetString(org.lwjgl.opengl.GL11.GL_VERSION) + "\n"); } catch (IOException e) { throw new RuntimeException(e); }
            PlanetClient.setActive(true);
        }
        if (PlanetClient.active && mc.player != null) aim(mc);
    }

    static double scriptedSpeed() { return Math.max(5.0, alt / 2.0); }

    /** Highest point found on a 100k-point Fibonacci sphere: the descent targets a mountain, not the sea. */
    private static Vec3 targetDir() {
        if (target == null) {
            double best = -1e18; Vec3 bestDir = new Vec3(1, 0, 0);
            int n = 100_000;
            for (int i = 0; i < n; i++) {
                double y = 1 - 2.0 * (i + 0.5) / n, r = Math.sqrt(1 - y * y), phi = i * 2.399963229728653;
                Vec3 d = new Vec3(r * Math.cos(phi), y, r * Math.sin(phi));
                double h = PlanetClient.TERRAIN.heightAt(d);
                if (Math.abs(y) < 0.9 && h > best) { best = h; bestDir = d; }   // keep away from the poles (look vector is degenerate there)
            }
            target = bestDir; targetGround = PlanetClient.PLANET.radius() + best;
            System.out.printf("[planetary-autotest] target mountain height=%.0f m dir=%s%n", best, target);
        }
        return target;
    }

    private static double lookWeight() { return alt > 2e6 ? 0 : 0.7 * Math.sqrt(1 - alt / 2e6); }

    /** Aim at the planet centre, tilting towards the horizon as altitude drops. Called every client tick. */
    private static void aim(Minecraft mc) {
        Vec3 d = targetDir();
        Vec3 tangent = d.cross(new Vec3(0, 1, 0)).normalize();
        Vec3 look = d.mul(-1).add(tangent.mul(lookWeight())).normalize();
        mc.player.setXRot((float) Math.toDegrees(-Math.asin(look.y())));
        mc.player.setYRot((float) Math.toDegrees(Math.atan2(-look.x(), look.z())));
    }

    static Vec3 scriptedPosition() {
        double groundRadius = (targetDir() != null) ? targetGround : 0;
        if (stop < STOPS.length && hold == 0) {
            t += 1.0 / 30.0;
            alt = Math.max(STOPS[STOPS.length - 1], STOPS[0] * Math.exp(-t / 2.0));
            if (alt <= STOPS[stop] * 1.0001) { alt = STOPS[stop]; hold = 1; }
        }
        return targetDir().mul(groundRadius + alt);
    }

    static void afterFrame(QuadtreeSelector.Result r, GlPlanetRenderer renderer, FrameStats fs, double selectMs) {
        if (!enabled() || stop >= STOPS.length) return;
        frames++;
        if (hold == 0) return;
        if (++hold < HOLD_FRAMES) return;
        // steady state reached at this altitude: record stats now, screenshot at the END of this frame
        // (RenderGuiEvent.Post), i.e. after the planet and the debug overlay have been drawn
        pendingName = String.format("alt_%08.0fm.png", STOPS[stop]);
        String line = String.format("alt=%.0fm patches=%d maxLevel=%d splits=%d merges=%d select=%.2fms frame avg=%.1f p95=%.1f p99=%.1f worst=%.1f %s",
                STOPS[stop], r.patches.size(), r.maxLevel, r.splits, r.merges, selectMs,
                fs.average(), fs.p95(), fs.p99(), fs.worst(), renderer.stats());
        System.out.println("[planetary-autotest] " + line);
        try { log.write(line + "\n"); log.flush(); } catch (IOException ignored) {}
        stop++; hold = 0;
    }

    /** Called from RenderGuiEvent.Post: the frame is complete (sky, planet, GUI), so grab it. */
    static void captureIfPending() {
        if (pendingName == null) return;
        Minecraft mc = Minecraft.getInstance();
        Screenshot.grab(outDir, pendingName, mc.getMainRenderTarget(), c -> {});
        pendingName = null;
        if (stop >= STOPS.length) {
            try { log.close(); } catch (IOException ignored) {}
            mc.execute(mc::stop);
        }
    }
}
