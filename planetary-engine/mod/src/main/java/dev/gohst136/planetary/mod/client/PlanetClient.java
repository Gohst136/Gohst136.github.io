package dev.gohst136.planetary.mod.client;

import com.mojang.blaze3d.systems.RenderSystem;
import dev.gohst136.planetary.lod.CameraView;
import dev.gohst136.planetary.lod.QuadtreeSelector;
import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.mesh.PatchMeshBuilder;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.telemetry.FrameStats;
import dev.gohst136.planetary.terrain.HybridTerrain;
import dev.gohst136.planetary.terrain.ProceduralTerrain;
import dev.gohst136.planetary.terrain.TerrainSampler;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.Input;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.client.event.RegisterKeyMappingsEvent;
import net.neoforged.neoforge.client.event.RenderGuiEvent;
import net.neoforged.neoforge.client.event.RenderLevelStageEvent;
import net.neoforged.neoforge.client.event.MovementInputUpdateEvent;
import org.joml.Matrix4f;
import org.lwjgl.glfw.GLFW;

import java.util.ArrayList;
import java.util.List;

/**
 * Phase 2 test harness: a detached free-flight camera over one procedural planet.
 * Toggle with P. While active, vanilla player movement is zeroed (look still works), the camera
 * moves with W/A/S/D/Space/Shift at a speed proportional to altitude, and the planet is drawn at
 * RenderLevelStageEvent.AFTER_LEVEL after a depth clear: the planet covers the vanilla world wherever it is visible (temporary until the Phase 6 bubble).
 * Everything here runs on the client render/main thread (selector and GL cache are single-owner).
 */
@EventBusSubscriber(modid = "planetary", value = Dist.CLIENT)
public final class PlanetClient {
    static final double FAR = 1.0e9;
    private static final double NEAR = 0.1;

    static final KeyMapping TOGGLE = new KeyMapping("key.planetary.toggle", GLFW.GLFW_KEY_P, "key.categories.planetary");
    static final KeyMapping BOOST = new KeyMapping("key.planetary.boost", GLFW.GLFW_KEY_LEFT_CONTROL, "key.categories.planetary");

    static PlanetDefinition PLANET = PlanetDefinition.earth(20240601L);
    static TerrainSampler TERRAIN = new dev.gohst136.planetary.terrain.RealisticTerrain(PLANET);
    static VanillaHeights vanilla;
    static String terrainMode = "procedural";

    /** Unit vector towards the sun in the planet frame. */
    static final float[] SUN = {0.6f / 0.99719607f, 0.5f / 0.99719607f, 0.62f / 0.99719607f};
    static boolean realWorld;                  // the integrated server runs the planet generator: real chunks match the planet
    static boolean active;
    private static net.minecraft.client.CloudStatus savedClouds = net.minecraft.client.CloudStatus.FANCY;
    /** Landing-site anchor (planet terrain is flattened around it) and, once landed, the vanilla<->planet bubble frame. */
    static Vec3 anchor;
    static BubbleFrame bubble;                 // frame exists once the real player has been parked at the anchor
    static boolean bubbleLive;                 // the camera is the real player's (handoff done)
    private static boolean preloaded;
    private static long frameCount, preloadFrame;
    private static double[] pendingTp;         // vanilla feet position the handoff teleport must reach
    private static boolean planetPrepared;
    static Vec3 pos = Vec3.ZERO;
    private static double speed;
    private static long lastNanos;
    private static QuadtreeSelector selector, predictNear, predictFar;     // each keeps its own hysteresis state
    private static Vec3 lastPos, velocity = Vec3.ZERO;
    private static GlPlanetRenderer renderer;
    private static QuadtreeSelector.Result lastResult;
    private static double selectMs;
    private static final FrameStats FRAMES = new FrameStats(600);

    private PlanetClient() {}

    @EventBusSubscriber(modid = "planetary", value = Dist.CLIENT)
    public static final class ModBus {
        @SubscribeEvent
        public static void keys(RegisterKeyMappingsEvent e) { e.register(TOGGLE); e.register(BOOST); }
    }

    @SubscribeEvent
    public static void tick(ClientTickEvent.Post e) {
        Minecraft mc = Minecraft.getInstance();
        PlanetAutoTest.tick(mc);
        while (TOGGLE.consumeClick()) {
            if (mc.player == null) continue;
            setActive(!active);
        }
    }

    static void setActive(boolean on) {
        Minecraft mc = Minecraft.getInstance();
        if (on && !active) savedClouds = mc.options.cloudStatus().get();     // vanilla clouds do not belong in planet mode
        active = on;
        try { mc.options.cloudStatus().set(on ? net.minecraft.client.CloudStatus.OFF : savedClouds); } catch (RuntimeException ignored) {}
        {
            if (active) {
                pos = new Vec3(PLANET.radius() + 20_000_000.0, 0, 0);       // 20,000 km above the surface
                mc.player.setYRot(90f);                                    // yaw 90 looks along -X, at the planet
                mc.player.setXRot(0f);
                lastNanos = System.nanoTime();
                if (selector == null) {
                    chooseTerrain(mc);
                    selector = new QuadtreeSelector(PLANET, TERRAIN, QuadtreeSelector.Params.defaults());
                    predictNear = new QuadtreeSelector(PLANET, TERRAIN, QuadtreeSelector.Params.defaults());
                    predictFar = new QuadtreeSelector(PLANET, TERRAIN, QuadtreeSelector.Params.defaults());
                    renderer = new GlPlanetRenderer(new PatchMeshBuilder(PLANET, TERRAIN), PLANET);
                    renderer.pinCoarse();
                }
            }
        }
    }

    /**
     * Decides the planet. Default: the realistic Earth-like planet (RealisticTerrain). With -Dplanetary.vanillaBubble=true
     * (singleplayer only) the old vanilla-worldgen detail layer is used instead, which is what real vanilla chunks match.
     */
    static void preparePlanet(Minecraft mc) {
        if (planetPrepared) return;
        planetPrepared = true;
        var server = mc.getSingleplayerServer();
        if (server != null && Boolean.getBoolean("planetary.vanillaBubble")) {
            PLANET = PlanetDefinition.earthlikeVanilla(server.overworld().getSeed());
            vanilla = new VanillaHeights(server.overworld());
            return;
        }
        long seed = dev.gohst136.planetary.mod.world.PlanetWorld.DEFAULT_SEED;
        if (server != null && server.overworld().getChunkSource().getGenerator() instanceof dev.gohst136.planetary.mod.world.PlanetChunkGenerator pg) {
            realWorld = true;
            seed = pg.seed;
        }
        PLANET = dev.gohst136.planetary.mod.world.PlanetWorld.planet(seed);
    }

    private static void chooseTerrain(Minecraft mc) {
        preparePlanet(mc);
        if (vanilla != null) {
            TerrainSampler macro = new ProceduralTerrain(PLANET);
            if (anchor != null) macro = new dev.gohst136.planetary.terrain.FlattenedTerrain(macro, anchor, PLANET.radius(), 1000, 8000);
            TERRAIN = new HybridTerrain(PLANET, macro, vanilla, 1500, 4000, 60, 0.06);
            terrainMode = "hybrid (procedural macro" + (anchor != null ? " flattened 1-8 km around the anchor" : "") + " + vanilla worldgen detail, seed " + PLANET.seed() + ")";
        } else {
            TERRAIN = dev.gohst136.planetary.mod.world.PlanetWorld.terrain(PLANET.seed());
            terrainMode = "realistic planet (continents, oceans, mountain belts, rivers, climate), seed " + PLANET.seed() + (realWorld ? ", real chunks from the planet generator" : "");
        }
    }

    /**
     * Free flight -> real world handoff (vanilla-bubble path only). Below 4 km the real player is parked (invisibly) at the
     * anchor so its chunks load; below 300 m the player is teleported to the exact vanilla pose of the planet camera and,
     * once it has arrived, the camera becomes the real player's. The planet render is identical before and after: only
     * the real chunks appear on top of it.
     */
    private static void handoff(Minecraft mc, Vec3 radial, Vec3 fwd, double alt) {
        if (anchor == null || (vanilla == null && !realWorld) || mc.getSingleplayerServer() == null || mc.player == null) return;
        frameCount++;
        double dist = PLANET.radius() * Math.acos(Math.max(-1.0, Math.min(1.0, radial.dot(anchor))));
        if (!preloaded && alt < 4000 && dist < 30000) {
            preloaded = true; preloadFrame = frameCount;
            bubble = makeBubble();
            double parkY = realWorld ? Math.max(0.0, dev.gohst136.planetary.planet.VerticalMap.toBlockY(TERRAIN.heightAt(anchor))) + 60 : bubble.y0 + 60;
            teleportReal(bubble.x0, parkY, bubble.z0, 0f, 0f);
            return;
        }
        if (!preloaded) return;
        if (pendingTp == null && alt < 300 && dist < 1500 && frameCount - preloadFrame > 200 && chunksReady(mc) && mc.levelRenderer.hasRenderedAllSections()) {
            double[] v = bubble.vanillaPos(pos);
            float[] yp = bubble.yawPitch(fwd);
            pendingTp = new double[]{v[0], v[1] - mc.player.getEyeHeight(), v[2]};
            teleportReal(pendingTp[0], pendingTp[1], pendingTp[2], yp[0], yp[1]);
        }
        if (pendingTp != null && !bubbleLive) {
            double dx = mc.player.getX() - pendingTp[0], dy = mc.player.getY() - pendingTp[1], dz = mc.player.getZ() - pendingTp[2];
            if (dx * dx + dy * dy + dz * dz < 9.0) { bubbleLive = true; pendingTp = null; }
        }
    }

    /** True when the client has the chunks around the anchor (5x5) that the parked real player makes the server generate. */
    static boolean chunksReady(Minecraft mc) {
        if (bubble == null || mc.level == null) return false;
        int cx = (int) Math.floor(bubble.x0) >> 4, cz = (int) Math.floor(bubble.z0) >> 4;
        for (int dx = -2; dx <= 2; dx++) for (int dz = -2; dz <= 2; dz++)
            if (!mc.level.getChunkSource().hasChunk(cx + dx, cz + dz)) return false;
        return true;
    }

    /** Topmost non-air block of a client-side column (full scan; diagnostics only). */
    static int clientTopSolid(Minecraft mc, int x, int z) {
        var pos = new net.minecraft.core.BlockPos.MutableBlockPos();
        for (int y = mc.level.getMaxBuildHeight() - 1; y >= mc.level.getMinBuildHeight(); y--)
            if (!mc.level.getBlockState(pos.set(x, y, z)).isAir()) return y;
        return Integer.MIN_VALUE;
    }

    /** One-line state of the real-world bubble for the benchmark log. */
    static String bubbleDiag() {
        Minecraft mc = Minecraft.getInstance();
        if (!realWorld) return "bubble: n/a";
        StringBuilder sb = new StringBuilder("bubble: live=" + bubbleLive + " preloaded=" + preloaded + " pendingTp=" + (pendingTp != null));
        if (mc.player != null) sb.append(String.format(" player=(%.0f,%.0f,%.0f)", mc.player.getX(), mc.player.getY(), mc.player.getZ()));
        if (bubble != null && mc.level != null) {
            int cx = (int) Math.floor(bubble.x0) >> 4, cz = (int) Math.floor(bubble.z0) >> 4, have = 0;
            for (int dx = -2; dx <= 2; dx++) for (int dz = -2; dz <= 2; dz++) if (mc.level.getChunkSource().hasChunk(cx + dx, cz + dz)) have++;
            sb.append(String.format(" anchorPlane=(%.0f,%.0f) clientChunks5x5=%d/25 ready=%b allSections=%b", bubble.x0, bubble.z0, have, chunksReady(mc), mc.levelRenderer.hasRenderedAllSections()));
            int top = clientTopSolid(mc, (int) Math.floor(bubble.x0), (int) Math.floor(bubble.z0));
            sb.append(" clientTopSolid@anchor=" + (top == Integer.MIN_VALUE ? "NONE(all air)" : top + " " + mc.level.getBlockState(new net.minecraft.core.BlockPos((int) Math.floor(bubble.x0), top, (int) Math.floor(bubble.z0))).getBlock().getDescriptionId()));
            sb.append(" dim=" + mc.level.dimensionType().minY() + ".." + (mc.level.dimensionType().minY() + mc.level.dimensionType().height()));
        }
        var server = mc.getSingleplayerServer();
        if (server != null) {
            var sp = server.getPlayerList().getPlayers().isEmpty() ? null : server.getPlayerList().getPlayers().get(0);
            if (sp != null) sb.append(String.format(" serverPlayer=(%.0f,%.0f,%.0f)", sp.getX(), sp.getY(), sp.getZ()));
            if (bubble != null && sp != null) {
                var lvl = sp.serverLevel();
                var bp = new net.minecraft.core.BlockPos.MutableBlockPos();
                int stop = Integer.MIN_VALUE;
                for (int y = lvl.getMaxBuildHeight() - 1; y >= lvl.getMinBuildHeight(); y--)
                    if (!lvl.getBlockState(bp.set((int) Math.floor(bubble.x0), y, (int) Math.floor(bubble.z0))).isAir()) { stop = y; break; }
                sb.append(" serverTopSolid@anchor=" + (stop == Integer.MIN_VALUE ? "NONE" : String.valueOf(stop)));
                sb.append(" generator=" + lvl.getChunkSource().getGenerator().getClass().getSimpleName() + " minY=" + lvl.getMinBuildHeight());
            }
        }
        return sb.toString();
    }

    /** Moves the real (server-side) player; used for the handoff and by the benchmark. */
    static void teleportReal(double x, double y, double z, float yaw, float pitch) {
        var server = Minecraft.getInstance().getSingleplayerServer();
        if (server == null) return;
        server.execute(() -> {
            var sp = server.getPlayerList().getPlayers().get(0);
            sp.teleportTo(sp.serverLevel(), x, y, z, yaw, pitch);
            sp.getAbilities().flying = true;
            sp.onUpdateAbilities();
        });
    }

    /** Builds the bubble frame at the anchor: planet ground there, real vanilla ground height there. */
    static BubbleFrame makeBubble() {
        if (realWorld) return new BubbleFrame(anchor, PLANET.radius(), PLANET.radius(), 0.0);   // block Y == metres above sea level (below Y 800)
        var m = dev.gohst136.planetary.planet.PlaneUnwrap.map(anchor, PLANET.radius() * Math.PI / 4.0, 0.0);
        double y0 = vanilla.exactHeight(m.x1(), m.z1()) + 63.0;
        return new BubbleFrame(anchor, PLANET.radius(), PLANET.radius() + TERRAIN.heightAt(anchor), y0);
    }

    static String terrainStats() { return terrainMode + (vanilla != null ? " | " + vanilla.stats() : ""); }

    @SubscribeEvent
    public static void input(MovementInputUpdateEvent e) {
        if (!active || bubbleLive) return;                         // in the bubble the real player moves normally
        Input in = e.getInput();
        in.forwardImpulse = 0; in.leftImpulse = 0;
        in.up = in.down = in.left = in.right = in.jumping = in.shiftKeyDown = false;
    }

    @SubscribeEvent
    public static void render(RenderLevelStageEvent e) {
        if (!active || selector == null) return;
        // free flight owns the whole frame (AFTER_LEVEL); in the bubble the planet is the backdrop of the real world (AFTER_SKY)
        if (e.getStage() != (bubbleLive ? RenderLevelStageEvent.Stage.AFTER_SKY : RenderLevelStageEvent.Stage.AFTER_LEVEL)) return;
        Minecraft mc = Minecraft.getInstance();
        long now = System.nanoTime();
        double dt = Math.min(0.1, (now - lastNanos) / 1e9);
        lastNanos = now;
        FRAMES.record(dt * 1000.0);

        var cam = e.getCamera();
        var look = cam.getLookVector();
        var left = cam.getLeftVector();
        Vec3 fwd = new Vec3(look.x(), look.y(), look.z());
        Vec3 lft = new Vec3(left.x(), left.y(), left.z());
        Vec3 radial = pos.normalize();
        if (!bubbleLive) {
            double ground = PLANET.radius() + TERRAIN.heightAt(radial);
            double alt = Math.max(1.0, pos.length() - ground);
            speed = Math.max(5.0, alt * 0.8) * (BOOST.isDown() ? 4.0 : 1.0);

            var o = mc.options;
            Vec3 move = Vec3.ZERO;
            if (o.keyUp.isDown()) move = move.add(fwd);
            if (o.keyDown.isDown()) move = move.sub(fwd);
            if (o.keyLeft.isDown()) move = move.add(lft);
            if (o.keyRight.isDown()) move = move.sub(lft);
            if (o.keyJump.isDown()) move = move.add(radial);
            if (o.keyShift.isDown()) move = move.sub(radial);
            if (move.length() > 0) pos = pos.add(move.normalize().mul(speed * dt));
            if (PlanetAutoTest.enabled()) { pos = PlanetAutoTest.scriptedPosition(); speed = PlanetAutoTest.scriptedSpeed(); }
            // minimal terrain contact: never go below 2 m above the ground (swept collision comes in Phase 8)
            Vec3 nd = pos.normalize();
            double minR = PLANET.radius() + TERRAIN.heightAt(nd) + 2.0;
            if (pos.length() < minR) pos = nd.mul(minR);
            handoff(mc, pos.normalize(), fwd, Math.max(0.0, pos.length() - (PLANET.radius() + TERRAIN.heightAt(pos.normalize()))));
        } else {
            // bubble: the camera IS the real player's camera, mapped into the planet frame
            var cp = cam.getPosition();
            pos = bubble.position(cp.x, cp.y, cp.z);
            fwd = bubble.direction(look.x(), look.y(), look.z());
            radial = pos.normalize();
            speed = 0;
            if (pos.length() - bubble.groundRadius > 800.0) { bubbleLive = false; pendingTp = null; }   // flew back out of the bubble
        }

        Matrix4f projIn = e.getProjectionMatrix();
        double tanHalf = 1.0 / projIn.m11();
        double fovY = 2.0 * Math.atan(tanHalf);
        int w = mc.getWindow().getWidth(), h = mc.getWindow().getHeight();
        double aspect = (double) w / h;
        var up = cam.getUpVector();
        // auto-level: roll the view so the camera's up is the local vertical (horizon stays level anywhere on the planet)
        Vec3 camUp = new Vec3(up.x(), up.y(), up.z());
        Vec3 desired = radial.sub(fwd.mul(radial.dot(fwd)));
        Matrix4f viewRot = new Matrix4f(e.getModelViewMatrix());
        if (bubbleLive) {
            camUp = bubble.direction(up.x(), up.y(), up.z());
            viewRot = new Matrix4f(e.getModelViewMatrix()).mul(bubble.viewTransform());
        } else if (desired.length() > 1e-3) {
            desired = desired.normalize();
            camUp = desired;
            org.joml.Vector3f dv = viewRot.transformDirection(new org.joml.Vector3f((float) desired.x(), (float) desired.y(), (float) desired.z()));
            viewRot = new Matrix4f().rotateZ((float) Math.atan2(dv.x, dv.y)).mul(viewRot);
        }
        CameraView view = new CameraView(pos, fwd, camUp, fovY, h, w, speed);

        long t0 = System.nanoTime();
        lastResult = selector.select(view);
        selectMs = (System.nanoTime() - t0) / 1e6;

        // predictive streaming: where will the camera be in 0.5 s / 1.5 s? Load what it will need, ordered by time-to-visibility
        if (lastPos != null && dt > 1e-4) velocity = velocity.mul(0.7).add(pos.sub(lastPos).mul(0.3 / dt));
        lastPos = pos;
        if (bubbleLive && velocity.length() > 300.0) velocity = Vec3.ZERO;      // a teleport, not a flight: never prefetch along it
        if (velocity.length() > 1.0) {
            for (int i = 0; i < 2; i++) {
                double horizon = i == 0 ? 0.5 : 1.5;
                Vec3 pp = pos.add(velocity.mul(horizon));
                double predMinR = PLANET.radius() + 2.0;
                if (pp.length() < predMinR) pp = pp.normalize().mul(predMinR);
                var pv = new CameraView(pp, fwd, camUp, fovY, h, w, speed);
                var res = (i == 0 ? predictNear : predictFar).select(pv);
                List<dev.gohst136.planetary.lod.PatchKey> keys = new ArrayList<>(res.patches.size());
                for (var sp : res.patches) keys.add(sp.key());
                renderer.prefetch(keys, i + 1);
            }
        }

        Matrix4f proj = new Matrix4f().perspective((float) fovY, (float) aspect, (float) NEAR, (float) FAR);
        float[] sun = SUN;
        PlanetAutoTest.afterFrame(lastResult, renderer, FRAMES, selectMs);
        // planet mode owns the whole picture: black space (stars are added by the atmosphere pass), depth reset
        RenderSystem.clearColor(0f, 0f, 0f, 1f);
        RenderSystem.clear(16384 | 256, Minecraft.ON_OSX);
        renderer.drawFrame(lastResult.patches, new double[]{pos.x(), pos.y(), pos.z()}, viewRot, proj, sun);
        if (bubbleLive) RenderSystem.clear(256, Minecraft.ON_OSX);        // real world draws on top of the planet backdrop
    }

    @SubscribeEvent
    public static void overlay(RenderGuiEvent.Post e) {
        if (!active) { PlanetAutoTest.captureIfPending(); return; }          // vanilla-mode screenshots (landing check)
        if (lastResult == null) return;
        Minecraft mc = Minecraft.getInstance();
        double alt = pos.length() - PLANET.radius();
        List<String> lines = new ArrayList<>();
        lines.add(String.format("PLANET  alt=%.1f km  speed=%.1f km/s", alt / 1000.0, speed / 1000.0));
        lines.add("patches=" + lastResult.patches.size() + " maxLevel=" + lastResult.maxLevel
                + " culled(h/f)=" + lastResult.culledHorizon + "/" + lastResult.culledFrustum);
        lines.add(String.format("split/merge=%d/%d  thresholdPx=%.2f  select=%.2fms", lastResult.splits, lastResult.merges,
                lastResult.effectiveThreshold, selectMs));
        lines.add(String.format("frame ms avg=%.1f med=%.1f p95=%.1f p99=%.1f worst=%.1f", FRAMES.average(), FRAMES.median(),
                FRAMES.p95(), FRAMES.p99(), FRAMES.worst()));
        lines.addAll(renderer.stats());
        int y = 4;
        for (String s : lines) { e.getGuiGraphics().drawString(mc.font, s, 4, y, 0xFFFFFF, true); y += 10; }
        e.getGuiGraphics().flush();
        PlanetAutoTest.captureIfPending();
    }
}
