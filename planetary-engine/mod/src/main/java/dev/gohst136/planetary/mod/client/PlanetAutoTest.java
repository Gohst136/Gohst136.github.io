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
    private static boolean finished;
    private static long lastTransitNanos;
    private static boolean transit;          // phase 2: continuous descent without holds
    private static int tFrames, tFallbackFrames, tHoleFrames, tMaxFallback, tMaxHoles, tMerges;
    private static FrameStats tStats = new FrameStats(5000);
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

    static double scriptedSpeed() { return Math.max(5.0, alt / (transit ? 1.0 : 2.0)); }

    /** Land point with a height closest to 2000 m (hills/rock rather than ocean or a snow plateau). */
    private static Vec3 targetDir() {
        if (target == null) {
            double bestErr = 1e18, bestH = 0; Vec3 bestDir = new Vec3(1, 0, 0);
            int n = 100_000;
            for (int i = 0; i < n; i++) {
                double y = 1 - 0.005 * (i + 0.5) / n, r = Math.sqrt(1 - y * y), phi = i * 2.399963229728653;   // cap within ~5.7 deg of the pole: world-up ~ local up, so the horizon is level
                Vec3 d = new Vec3(r * Math.cos(phi), y, r * Math.sin(phi));
                double h = PlanetClient.TERRAIN.heightAt(d, 1e9);   // macro only: 100k vanilla samples would freeze the render thread
                if (Math.abs(h - 2000) < bestErr) { bestErr = Math.abs(h - 2000); bestDir = d; bestH = h; }
            }
            target = bestDir;
            bestH = PlanetClient.TERRAIN.heightAt(bestDir);          // one full-detail sample for the true ground level
            targetGround = PlanetClient.PLANET.radius() + bestH;
            System.out.printf("[planetary-autotest] target height=%.0f m dir=%s%n", bestH, target);
        }
        return target;
    }

    /** Tilt from nadir: up to 60 deg, but never beyond 60% of the horizon angle (keeps the planet in view from afar). */
    private static double lookWeight() {
        double R = PlanetClient.PLANET.radius();
        double tilt = Math.min(Math.toRadians(60), 0.6 * Math.asin(R / (R + alt)));
        return Math.tan(tilt);
    }

    /** Aim at the planet centre, tilting towards the horizon as altitude drops. Called every client tick. */
    private static void aim(Minecraft mc) {
        Vec3 d = targetDir();
        Vec3 tangent = d.cross(new Vec3(1, 0, 0)).normalize();
        Vec3 look = d.mul(-1).add(tangent.mul(lookWeight())).normalize();
        mc.player.setXRot((float) Math.toDegrees(-Math.asin(look.y())));
        mc.player.setYRot((float) Math.toDegrees(Math.atan2(-look.x(), look.z())));
    }

    static Vec3 scriptedPosition() {
        double groundRadius = (targetDir() != null) ? targetGround : 0;
        if (transit) {
            // REAL time (clamped), so streaming gets exactly as long as in a genuine flight
            long now = System.nanoTime();
            double dt = lastTransitNanos == 0 ? 0 : Math.min(0.1, (now - lastTransitNanos) / 1e9);
            lastTransitNanos = now;
            t += dt;
            alt = Math.max(STOPS[STOPS.length - 1], STOPS[0] * Math.exp(-t / 1.0));   // alt/s: v = alt per second, no holds
        } else if (stop < STOPS.length && hold == 0) {
            t += 1.0 / 30.0;
            alt = Math.max(STOPS[STOPS.length - 1], STOPS[0] * Math.exp(-t / 2.0));
            if (alt <= STOPS[stop] * 1.0001) { alt = STOPS[stop]; hold = 1; }
        }
        return targetDir().mul(groundRadius + alt);
    }

    static void afterFrame(QuadtreeSelector.Result r, GlPlanetRenderer renderer, FrameStats fs, double selectMs) {
        if (!enabled()) return;
        if (transit) {
            tFrames++;
            tStats.record(fs.median() > 0 ? lastFrameMs(fs) : 0);
            int fb = renderer.fallbackLastFrame(), ho = renderer.holesLastFrame();
            if (fb > 0) tFallbackFrames++;
            if (ho > 0) tHoleFrames++;
            tMaxFallback = Math.max(tMaxFallback, fb); tMaxHoles = Math.max(tMaxHoles, ho);
            tMerges += r.merges;
            if (alt <= STOPS[STOPS.length - 1] && tFrames > 30) {
                try { log.write("TERRAIN: " + PlanetClient.terrainStats() + "\n"); } catch (IOException ignored) {}
                String line = String.format("TRANSIT (continuous, real time, v=alt/s, no holds): frames=%d fallbackFrames=%d (max %d patches) holeFrames=%d (max %d) merges=%d frame ms avg=%.1f p95=%.1f p99=%.1f worst=%.1f",
                        tFrames, tFallbackFrames, tMaxFallback, tHoleFrames, tMaxHoles, tMerges, tStats.average(), tStats.p95(), tStats.p99(), tStats.worst());
                System.out.println("[planetary-autotest] " + line);
                try { log.write(line + "\n"); log.close(); } catch (IOException ignored) {}
                transit = false; finished = true; pendingName = "final.png";
            }
            return;
        }
        if (stop >= STOPS.length) return;
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
        if (stop >= STOPS.length) { transit = true; t = 0; alt = STOPS[0]; }
    }

    private static double lastFrameMs(FrameStats fs) { return fs.last(); }

    /** Called from RenderGuiEvent.Post: the frame is complete (sky, planet, GUI), so grab it. */
    static void captureIfPending() {
        if (pendingName == null) return;
        Minecraft mc = Minecraft.getInstance();
        Screenshot.grab(outDir, pendingName, mc.getMainRenderTarget(), c -> {});
        pendingName = null;
        if (finished) mc.execute(mc::stop);
    }
}
