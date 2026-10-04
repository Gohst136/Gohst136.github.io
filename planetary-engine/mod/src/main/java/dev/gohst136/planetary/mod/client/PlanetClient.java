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

    static PlanetDefinition PLANET = PlanetDefinition.earthlike(20240601L);
    static TerrainSampler TERRAIN = new ProceduralTerrain(PLANET);
    static VanillaHeights vanilla;
    static String terrainMode = "procedural";

    /** Unit vector towards the sun in the planet frame. */
    static final float[] SUN = {0.6f / 0.99719607f, 0.5f / 0.99719607f, 0.62f / 0.99719607f};
    static boolean active;
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
        active = on;
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

    /** Singleplayer: macro planet shape + real vanilla worldgen detail. Otherwise: pure procedural fallback. */
    private static void chooseTerrain(Minecraft mc) {
        var server = mc.getSingleplayerServer();
        if (server != null && !Boolean.getBoolean("planetary.noVanilla")) {
            PLANET = PlanetDefinition.earthlikeVanilla(server.overworld().getSeed());
            vanilla = new VanillaHeights(server.overworld());
            TERRAIN = new HybridTerrain(PLANET, new ProceduralTerrain(PLANET), vanilla, 1500, 4000, 60, 0.06);
            terrainMode = "hybrid (procedural macro + vanilla worldgen detail, seed " + PLANET.seed() + ")";
        } else {
            terrainMode = "procedural";
        }
    }

    static String terrainStats() { return terrainMode + (vanilla != null ? " | " + vanilla.stats() : ""); }

    @SubscribeEvent
    public static void input(MovementInputUpdateEvent e) {
        if (!active) return;
        Input in = e.getInput();
        in.forwardImpulse = 0; in.leftImpulse = 0;
        in.up = in.down = in.left = in.right = in.jumping = in.shiftKeyDown = false;
    }

    @SubscribeEvent
    public static void render(RenderLevelStageEvent e) {
        if (!active || e.getStage() != RenderLevelStageEvent.Stage.AFTER_LEVEL || selector == null) return;
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
        if (desired.length() > 1e-3) {
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
