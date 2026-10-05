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
    private static boolean finished, stopAfterCapture, landing;
    private static int post, postFrames;     // post-transit shots in the real world: planet on / planet off
    private static long chunkWaitStart;
    // watchdog: if the benchmark stops making progress, dump every thread's stack to hang.txt and exit, so results always arrive
    private static volatile long lastFrameNanos, lastStageNanos;
    private static volatile String stageName = "start";
    private static boolean watchdogStarted;
    // orbit tour: eight views of the whole planet from 9,000 km (continents, oceans, ice caps, both poles)
    private static boolean orbit;
    private static int orbitIdx, orbitHold;
    private static final Vec3[] ORBIT_DIRS = {
            new Vec3(1, 0, 0), new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(0, 0, -1),
            new Vec3(0.7, 0.7, 0).normalize(), new Vec3(0.5, -0.7, -0.5).normalize(),
            new Vec3(0.05, 1, 0.05).normalize(), new Vec3(0.05, -1, 0.05).normalize()};
    private static final double ORBIT_ALT = 9.0e6;
    // lap benchmark (spec section 12/52): once round the planet at 4,000 km/s, 50 km above the ground
    private static boolean lap;
    private static double lapAngle, lapSeconds;
    private static long lapNanos;
    private static int lapFrames, lapFallbackFrames, lapHoleFrames, lapMaxHoles;
    private static final FrameStats lapStats = new FrameStats(8000);
    private static final double LAP_V = 4.0e6, LAP_ALT = 50_000.0;
    private static Vec3 lapStartDir, lapAxis;
    private static final int ORBIT_SHOTS = 11;      // 8 planet views + sun at the limb + Moon close-up + Earth from the Moon

    /** Rodrigues rotation of v about the unit axis by angle. */
    private static Vec3 rotateAbout(Vec3 v, Vec3 axis, double angle) {
        double c = Math.cos(angle), sn = Math.sin(angle);
        return v.mul(c).add(axis.cross(v).mul(sn)).add(axis.mul(axis.dot(v) * (1 - c)));
    }

    /** {camera position, look direction} in the home planet's body-fixed axes for orbit-tour shot i. */
    private static Vec3[] orbitShot(int i) {
        double R = PlanetClient.PLANET.radius();
        if (i < ORBIT_DIRS.length) return new Vec3[]{ORBIT_DIRS[i].mul(R + ORBIT_ALT), ORBIT_DIRS[i].mul(-1)};
        Vec3 sun = new Vec3(PlanetClient.sunDirE()[0], PlanetClient.sunDirE()[1], PlanetClient.sunDirE()[2]);
        if (i == ORBIT_DIRS.length) {                                        // the sun just above the planet's limb
            Vec3 perp = sun.cross(new Vec3(0, 0, 1)).normalize();
            Vec3 look = sun.mul(0.8).sub(perp.mul(0.6)).normalize();
            return new Vec3[]{perp.mul(R + ORBIT_ALT), look};
        }
        Vec3 moon = PlanetClient.BODIES.centreE("moon", PlanetClient.simTime);
        if (i == ORBIT_DIRS.length + 1) {                                    // the Moon, 4,000 km away, lit side towards the camera
            Vec3 toSunFromMoon = sun.mul(1.0);                               // the sun is ~1 AU away: the direction is the same everywhere
            return new Vec3[]{moon.add(toSunFromMoon.mul(4.0e6)), toSunFromMoon.mul(-1)};
        }
        Vec3 toEarth = moon.mul(-1).normalize();                             // Earth seen from 3,000 km above the Moon's surface
        return new Vec3[]{moon.add(toEarth.mul(1.737e6 + 3.0e6)), toEarth};
    }
    private static int landingTick;
    private static boolean clearPending;
    private static String targetInfo = "";
    private static long holdStartNanos;
    private static long lastTransitNanos;
    private static boolean transit;          // phase 2: continuous descent without holds
    private static int tFrames, tFallbackFrames, tHoleFrames, tMaxFallback, tMaxHoles, tMerges;
    private static FrameStats tStats = new FrameStats(5000);
    private static Vec3 target;
    private static double targetGround;

    private PlanetAutoTest() {}

    private static void stage(String name) { stageName = name; lastStageNanos = System.nanoTime(); }

    private static void startWatchdog() {
        if (watchdogStarted) return;
        watchdogStarted = true;
        lastFrameNanos = lastStageNanos = System.nanoTime();
        Thread t = new Thread(() -> {
            while (true) {
                try { Thread.sleep(5000); } catch (InterruptedException e) { return; }
                long now = System.nanoTime();
                boolean noFrames = now - lastFrameNanos > 30_000_000_000L;
                boolean noStage = now - lastStageNanos > 120_000_000_000L;
                if (!noFrames && !noStage) continue;
                try (FileWriter w = new FileWriter(new File(outDir, "hang.txt"))) {
                    w.write("WATCHDOG: " + (noFrames ? "no render frames for 30 s" : "no stage progress for 120 s")
                            + "\nstage=" + stageName + " alt=" + alt + " stop=" + stop + " hold=" + hold + " orbitIdx=" + orbitIdx
                            + " transit=" + transit + "\n\n");
                    for (var e : Thread.getAllStackTraces().entrySet()) {
                        w.write("--- " + e.getKey().getName() + " (" + e.getKey().getState() + ")\n");
                        for (var el : e.getValue()) w.write("    at " + el + "\n");
                    }
                } catch (IOException ignored) {}
                System.exit(3);
            }
        }, "planetary-watchdog");
        t.setDaemon(true);
        t.start();
    }

    static boolean enabled() { return ENABLED && PlanetClient.active; }

    static void tick(Minecraft mc) {
        if (!ENABLED) return;
        if (mc.level == null) {
            if (!worldRequested && mc.screen instanceof TitleScreen) {
                worldRequested = true;
                mc.createWorldOpenFlows().createFreshLevel("planetary_autotest",
                        new LevelSettings("planetary_autotest", GameType.CREATIVE, false, Difficulty.PEACEFUL, true,
                                new GameRules(), WorldDataConfiguration.DEFAULT),
                        WorldOptions.defaultWithRandomSeed(),
                        Boolean.getBoolean("planetary.vanillaBubble") ? WorldPresets::createNormalWorldDimensions
                                : (ra -> ra.registryOrThrow(net.minecraft.core.registries.Registries.WORLD_PRESET).getHolderOrThrow(
                                        net.minecraft.resources.ResourceKey.create(net.minecraft.core.registries.Registries.WORLD_PRESET,
                                                net.minecraft.resources.ResourceLocation.fromNamespaceAndPath("planetary", "planet"))).value().createWorldDimensions()),
                        mc.screen);
            }
            return;
        }
        if (mc.player != null && ++ticksInWorld == 100 && !PlanetClient.active) {
            outDir = new File(mc.gameDirectory, "planetary-autotest");
            outDir.mkdirs();
            try { log = new FileWriter(new File(outDir, "stats.txt"));
                log.write("GPU: " + org.lwjgl.opengl.GL11.glGetString(org.lwjgl.opengl.GL11.GL_RENDERER) + " | GL " + org.lwjgl.opengl.GL11.glGetString(org.lwjgl.opengl.GL11.GL_VERSION) + "\n"); } catch (IOException e) { throw new RuntimeException(e); }
            PlanetClient.preparePlanet(mc);
            PlanetClient.initSystem();                           // sun direction (day side) for the landing site
            PlanetClient.anchor = targetDir();                   // landing site (vanilla path: terrain is flattened around it)
            startWatchdog();
            PlanetClient.setActive(true);
        }
        if (PlanetClient.active && !PlanetClient.bubbleLive && mc.player != null) aim(mc);
        if (PlanetClient.bubbleLive && mc.player != null) drivePlayer(mc);
    }

    static double scriptedSpeed() { return lap ? LAP_V : orbit ? 0.0 : Math.max(5.0, alt / (transit ? 1.0 : 2.0)); }

    /** Land point with a height closest to 2000 m (hills/rock rather than ocean or a snow plateau). */
    private static Vec3 targetDir() {
        if (target == null) {
            final boolean vanillaPath = PlanetClient.vanilla != null;
            final double wanted = vanillaPath ? 2000.0 : Double.parseDouble(System.getProperty("planetary.targetHeight", "700"));   // landing height; 150 = lowlands, 700 = warm upland (checks the no-snow biome rule)
            dev.gohst136.planetary.terrain.TerrainSampler search = vanillaPath
                    ? new dev.gohst136.planetary.terrain.ProceduralTerrain(PlanetClient.PLANET)
                    : new dev.gohst136.planetary.terrain.RealisticTerrain(PlanetClient.PLANET);
            double bestErr = 1e18, bestH = 0; Vec3 bestDir = new Vec3(1, 0, 0);
            int n = 100_000;
            for (int i = 0; i < n; i++) {
                double y = 1 - 2.0 * (i + 0.5) / n, r = Math.sqrt(1 - y * y), phi = i * 2.399963229728653;
                Vec3 d = new Vec3(r * Math.cos(phi), y, r * Math.sin(phi));
                if (d.x() * PlanetClient.sunDirE()[0] + d.y() * PlanetClient.sunDirE()[1] + d.z() * PlanetClient.sunDirE()[2] < 0.5) continue;   // day side only
                if (!vanillaPath && Math.abs(d.y()) > 0.8) continue;           // temperate/tropical latitudes
                if (dev.gohst136.planetary.planet.PlaneUnwrap.edgeDistance(d) > 0.8) continue;   // keep the landing site clear of cube edges
                double h = search.heightAt(d, 1e9);                   // coarse only: fast, no per-point vanilla/rivers cost
                if (Math.abs(h - wanted) < bestErr) {
                    if (!vanillaPath) {                                   // the landing column must lie in the 1:1 height range
                        double full = search.heightAt(d, 1.0);
                        if (full < wanted - 130 || full > wanted + 150) continue;
                    }
                    bestErr = Math.abs(h - wanted); bestDir = d; bestH = h;
                }
            }
            target = bestDir;
            targetInfo = String.format("TARGET: dir=%s height=%.0f m (day side)", target, bestH);
            System.out.println("[planetary-autotest] " + targetInfo);
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
        if (lap) {                                                           // look along the direction of flight, 12 degrees down
            Vec3 p = rotateAbout(lapStartDir, lapAxis, lapAngle);
            Vec3 tangent = lapAxis.cross(p).normalize();
            Vec3 l = tangent.mul(Math.cos(Math.toRadians(12))).sub(p.mul(Math.sin(Math.toRadians(12)))).normalize();
            mc.player.setXRot((float) Math.toDegrees(-Math.asin(l.y())));
            mc.player.setYRot((float) Math.toDegrees(Math.atan2(-l.x(), l.z())));
            return;
        }
        if (orbit && orbitHold >= 0) {
            Vec3 l = orbitShot(Math.min(orbitIdx, ORBIT_SHOTS - 1))[1];
            mc.player.setXRot((float) Math.toDegrees(-Math.asin(l.y())));
            mc.player.setYRot((float) Math.toDegrees(Math.atan2(-l.x(), l.z())));
            return;
        }
        Vec3 d = targetDir();
        Vec3 tangent = d.cross(Math.abs(d.y()) < 0.9 ? new Vec3(0, 1, 0) : new Vec3(1, 0, 0)).normalize();
        Vec3 look = d.mul(-1).add(tangent.mul(lookWeight())).normalize();
        mc.player.setXRot((float) Math.toDegrees(-Math.asin(look.y())));
        mc.player.setYRot((float) Math.toDegrees(Math.atan2(-look.x(), look.z())));
    }

    static Vec3 scriptedPosition() {
        if (targetGround == 0) targetGround = PlanetClient.PLANET.radius() + PlanetClient.TERRAIN.heightAt(targetDir());   // true ground incl. flattening + detail
        double groundRadius = targetGround;
        if (lap) {
            long now = System.nanoTime();
            double dt = lapNanos == 0 ? 0 : Math.min(0.1, (now - lapNanos) / 1e9);
            lapNanos = now;
            double r = PlanetClient.PLANET.radius() + LAP_ALT;
            lapAngle += LAP_V / r * dt; lapSeconds += dt;
            return rotateAbout(lapStartDir, lapAxis, lapAngle).mul(r);
        }
        if (orbit && orbitHold >= 0) return orbitShot(Math.min(orbitIdx, ORBIT_SHOTS - 1))[0];
        if (transit) {
            if (PlanetClient.realWorld && alt < 420 && !PlanetClient.bubbleLive && PlanetClient.bubble != null && !PlanetClient.chunksReady(Minecraft.getInstance())) {
                lastTransitNanos = System.nanoTime();                    // chunks missing: hover (the clock must not run)
                return targetDir().mul(groundRadius + alt);
            }
            // REAL time (clamped), so streaming gets exactly as long as in a genuine flight
            long now = System.nanoTime();
            double dt = lastTransitNanos == 0 ? 0 : Math.min(0.1, (now - lastTransitNanos) / 1e9);
            lastTransitNanos = now;
            t += dt;
            alt = Math.max(STOPS[STOPS.length - 1], alt - Math.min(alt / 1.0, alt < 400 ? 40.0 : 1e18) * dt);   // v = alt per second, capped at 40 m/s below 400 m
        } else if (stop < STOPS.length && hold == 0) {
            // real-world path: do not descend into the bubble until the real chunks around the landing site exist (max 60 s)
            if (PlanetClient.realWorld && alt < 420 && !PlanetClient.bubbleLive) {
                if (chunkWaitStart == 0) chunkWaitStart = System.nanoTime();
                if (System.nanoTime() - chunkWaitStart < 60_000_000_000L) return targetDir().mul(groundRadius + alt);
            }
            t += 1.0 / 30.0;
            alt = Math.max(STOPS[STOPS.length - 1], alt - Math.min(alt / 2.0, alt < 400 ? 40.0 : 1e18) / 30.0);   // v = alt/2 per second, capped at 40 m/s below 400 m
            if (alt <= STOPS[stop] * 1.0001) { alt = STOPS[stop]; hold = 1; }
        }
        return targetDir().mul(groundRadius + alt);
    }

    static void afterFrame(QuadtreeSelector.Result r, GlPlanetRenderer renderer, FrameStats fs, double selectMs) {
        if (!enabled()) return;
        lastFrameNanos = System.nanoTime();
        if (transit) {
            if (clearPending) { renderer.clearCache(); clearPending = false; }   // after the last screenshot was taken: cold cache (pinned coarse levels stay)
            tFrames++;
            if (tFrames % 200 == 0) stage("transit frame " + tFrames + " alt=" + (long) alt);
            tStats.record(fs.median() > 0 ? lastFrameMs(fs) : 0);
            int fb = renderer.fallbackLastFrame(), ho = renderer.holesLastFrame();
            if (fb > 0) tFallbackFrames++;
            if (ho > 0) tHoleFrames++;
            tMaxFallback = Math.max(tMaxFallback, fb); tMaxHoles = Math.max(tMaxHoles, ho);
            tMerges += r.merges;
            if (alt <= STOPS[STOPS.length - 1] && tFrames > 30) {
                try { log.write("TERRAIN: " + PlanetClient.terrainStats() + "\n" + targetInfo + "\nWORLDGEN: " + dev.gohst136.planetary.mod.world.PlanetChunkGenerator.stats() + "\n"); } catch (IOException ignored) {}
                String line = String.format("TRANSIT (continuous, real time, v=alt/s, no holds): frames=%d fallbackFrames=%d (max %d patches) holeFrames=%d (max %d) merges=%d frame ms avg=%.1f p95=%.1f p99=%.1f worst=%.1f | " + renderer.latencySummary(),
                        tFrames, tFallbackFrames, tMaxFallback, tHoleFrames, tMaxHoles, tMerges, tStats.average(), tStats.p95(), tStats.p99(), tStats.worst());
                System.out.println("[planetary-autotest] " + line);
                try { log.write(line + "\n" + fidelityStats() + "\n"); log.close(); } catch (IOException ignored) {}
                transit = false; post = 1; postFrames = 0; pendingName = "final.png";
            }
            return;
        }
        if (post > 0) {
            if (pendingName != null) return;
            postFrames++;
            if (post == 1 && postFrames > 60) { pendingName = "bubble_planet_on.png"; post = 2; postFrames = 0; }
            else if (post == 2) { PlanetClient.planetOff = true; Minecraft.getInstance().options.gamma().set(1.0); post = 3; postFrames = 0; }   // magenta backdrop + full brightness: if real blocks are drawn at all they must show
            else if (post == 3 && postFrames > 30) { pendingName = "bubble_planet_off.png"; post = 4; postFrames = 0; }
            else if (post == 4) { PlanetClient.suspended = true; post = 5; postFrames = 0; }

            return;
        }
        if (lap) {
            if (clearPending) { renderer.clearCache(); clearPending = false; }
            lapFrames++;
            lapStats.record(fs.last());
            int fb = renderer.fallbackLastFrame(), ho = renderer.holesLastFrame();
            if (fb > 0) lapFallbackFrames++;
            if (ho > 0) lapHoleFrames++;
            lapMaxHoles = Math.max(lapMaxHoles, ho);
            if (lapAngle >= 2 * Math.PI) {
                String line = String.format("LAP (one orbit at %.0f km/s, %.0f km above ground): %.1f s, frames=%d fallbackFrames=%d holeFrames=%d (max %d patches) frame ms avg=%.1f p95=%.1f p99=%.1f worst=%.1f | %s | %s",
                        LAP_V / 1000, LAP_ALT / 1000, lapSeconds, lapFrames, lapFallbackFrames, lapHoleFrames, lapMaxHoles,
                        lapStats.average(), lapStats.p95(), lapStats.p99(), lapStats.worst(), renderer.latencySummary(), renderer.stats().get(0));
                System.out.println("[planetary-autotest] " + line);
                try { log.write(line + "\n"); log.flush(); } catch (IOException ignored) {}
                lap = false; transit = true; clearPending = true; t = 0; alt = STOPS[0]; lastTransitNanos = 0; stage("transit");
            }
            return;
        }
        if (orbit) {
            if (++orbitHold < 40 || (!renderer.settled() && orbitHold < 600)) return;
            pendingName = String.format("orbit_%d.png", orbitIdx);
            orbitIdx++; orbitHold = 0; stage("orbit " + orbitIdx);
            if (orbitIdx >= ORBIT_SHOTS) {
                orbit = false; lap = true; lapAngle = 0; lapSeconds = 0; lapNanos = 0; lapFrames = lapFallbackFrames = lapHoleFrames = lapMaxHoles = 0;
                lapStartDir = new Vec3(1, 0, 0); lapAxis = new Vec3(0, 0, 1);
                clearPending = true; stage("lap");                          // cold cache: a lap must really stream
            }
            return;
        }
        if (stop >= STOPS.length) return;
        frames++;
        if (hold == 0) return;
        if (hold == 1) holdStartNanos = System.nanoTime();
        // wait until streaming has really caught up (max 15 s), so each stop shows the settled state
        if (++hold < HOLD_FRAMES || (!renderer.settled() && System.nanoTime() - holdStartNanos < 15_000_000_000L)) return;
        // steady state reached at this altitude: record stats now, screenshot at the END of this frame
        // (RenderGuiEvent.Post), i.e. after the planet and the debug overlay have been drawn
        pendingName = String.format("alt_%08.0fm.png", STOPS[stop]);
        String line = String.format("alt=%.0fm patches=%d maxLevel=%d splits=%d merges=%d select=%.2fms frame avg=%.1f p95=%.1f p99=%.1f worst=%.1f %s",
                STOPS[stop], r.patches.size(), r.maxLevel, r.splits, r.merges, selectMs,
                fs.average(), fs.p95(), fs.p99(), fs.worst(), renderer.stats());
        line += "\n   " + PlanetClient.bubbleDiag();
        System.out.println("[planetary-autotest] " + line);
        try { log.write(line + "\n"); log.flush(); } catch (IOException ignored) {}
        stop++; hold = 0; stage("stop " + stop);
        if (stop >= STOPS.length) { orbit = true; orbitIdx = 0; orbitHold = -10; PlanetClient.leaveBubble(); }   // start the orbit tour a few frames later so the last stop's screenshot is not overwritten
    }

    private static double lastFrameMs(FrameStats fs) { return fs.last(); }

    /** Called from RenderGuiEvent.Post: the frame is complete (sky, planet, GUI), so grab it. */
    static void captureIfPending() {
        if (pendingName == null) return;
        Minecraft mc = Minecraft.getInstance();
        Screenshot.grab(outDir, pendingName, mc.getMainRenderTarget(), c -> {});
        pendingName = null;
        if (stopAfterCapture) mc.execute(mc::stop);
    }

    /** While the real player's camera is live, the scripted path moves the real player (server-side teleport each tick). */
    private static void drivePlayer(Minecraft mc) {
        var frame = PlanetClient.bubble;
        if (frame == null) return;
        Vec3 d = targetDir();
        Vec3 planetPos = d.mul(targetGround + alt);
        Vec3 tangent = d.cross(Math.abs(d.y()) < 0.9 ? new Vec3(0, 1, 0) : new Vec3(1, 0, 0)).normalize();
        Vec3 look = d.mul(-1).add(tangent.mul(lookWeight())).normalize();
        double[] v = frame.vanillaPos(planetPos);
        float[] yp = frame.yawPitch(look);
        PlanetClient.teleportReal(v[0], v[1] - mc.player.getEyeHeight(), v[2], yp[0], yp[1]);
    }

    /** Fidelity of the vanilla-detail layer against the generator's true column heights: local grid and scattered points. */
    private static String fidelityStats() {
        if (PlanetClient.vanilla == null) return realWorldFidelity();
        var d = targetDir();
        var m = dev.gohst136.planetary.planet.PlaneUnwrap.map(d, PlanetClient.PLANET.radius() * Math.PI / 4.0, 0.0);
        double bx = m.x1(), bz = m.z1();
        double err = 0, signed = 0, worst = 0; int n = 0;
        for (int i = -4; i < 4; i++) for (int j = -4; j < 4; j++) {
            double e = PlanetClient.vanilla.applyAsDouble(bx + i * 8, bz + j * 8) - PlanetClient.vanilla.exactHeight(bx + i * 8, bz + j * 8);
            err += Math.abs(e); signed += e; worst = Math.max(worst, Math.abs(e)); n++;
        }
        java.util.Random rnd = new java.util.Random(7);
        double gs = 0, ga = 0, gss = 0; int gn = 120;
        for (int i = 0; i < gn; i++) {
            double gx = (rnd.nextDouble() - 0.5) * 8e6, gz = (rnd.nextDouble() - 0.5) * 8e6;
            double e = PlanetClient.vanilla.applyAsDouble(gx, gz) - PlanetClient.vanilla.exactHeight(gx, gz);
            gs += e; ga += Math.abs(e); gss += e * e;
        }
        double gmean = gs / gn;
        return String.format("FIDELITY local(8x8 @8m): mean|err|=%.2f signed=%.2f worst=%.1f | global(%d pts): mean=%.2f mean|err|=%.2f std=%.2f",
                err / n, signed / n, worst, gn, gmean, ga / gn, Math.sqrt(gss / gn - gmean * gmean));
    }

    /** Real chunks vs. the planet function that built them and the mesh: client heightmap around the anchor. */
    private static String realWorldFidelity() {
        var mc = Minecraft.getInstance();
        var frame = PlanetClient.bubble;
        if (!PlanetClient.realWorld || mc.level == null || frame == null || !PlanetClient.bubbleLive) return "FIDELITY n/a (real-world bubble not live)";
        double half = dev.gohst136.planetary.mod.world.PlanetWorld.halfSpan(PlanetClient.PLANET.seed());
        java.util.List<Double> diffs = new java.util.ArrayList<>();
        int exact = 0, n = 0, unloaded = 0;
        for (int i = -6; i < 6; i++) for (int j = -6; j < 6; j++) {
            int x = (int) Math.floor(frame.x0 + i * 10), z = (int) Math.floor(frame.z0 + j * 10);
            int real = PlanetClient.clientTopSolid(mc, x, z);
            if (real == Integer.MIN_VALUE) { unloaded++; continue; }                               // all air: no chunk data
            Vec3 dir = dev.gohst136.planetary.planet.PlaneUnwrap.inverse(x + 0.5, z + 0.5, half);
            double expected = Math.floor(dev.gohst136.planetary.planet.VerticalMap.toBlockY(PlanetClient.TERRAIN.heightAt(dir, 1.0)));
            diffs.add(Math.abs(real - expected)); n++;
            if (Math.abs(real - expected) <= 3) exact++;                                           // trees/features add a few blocks
        }
        java.util.Collections.sort(diffs);
        double mean = diffs.stream().mapToDouble(Double::doubleValue).average().orElse(0);
        return String.format("FIDELITY real chunks vs planet function (%d points @10 m, %d empty): median |dY|=%.1f mean=%.2f max=%.0f within 3 blocks: %d%% (ground blocks only: trees and plants ignored)",
                n, unloaded, diffs.get(n / 2), mean, diffs.get(n - 1), exact * 100 / n);
    }

    /** Called from the GUI overlay every frame while the render handler is suspended (pure vanilla frame). */
    static void suspendedTick() {
        if (post != 5 || pendingName != null) return;
        if (++postFrames > 60) { pendingName = "bubble_vanilla_only.png"; post = 6; stopAfterCapture = true; }
    }
}
