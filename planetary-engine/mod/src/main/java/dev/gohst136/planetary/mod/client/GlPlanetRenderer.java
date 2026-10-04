package dev.gohst136.planetary.mod.client;

import com.mojang.blaze3d.platform.GlStateManager;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.BufferUploader;
import dev.gohst136.planetary.lod.PatchKey;
import dev.gohst136.planetary.lod.QuadtreeSelector.SelectedPatch;
import dev.gohst136.planetary.mesh.PatchMesh;
import dev.gohst136.planetary.mesh.PatchMeshBuilder;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.render.RenderBackend;
import org.joml.Matrix4f;
import org.lwjgl.opengl.GL11;
import org.lwjgl.opengl.GL15;
import org.lwjgl.opengl.GL30;
import org.lwjgl.system.MemoryStack;
import org.lwjgl.system.MemoryUtil;

import java.nio.ByteBuffer;
import java.nio.FloatBuffer;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * OpenGL 3.2-core backend. Thread ownership:
 *  - render thread: everything GL, the resident cache, selection, eviction;
 *  - 2 daemon worker threads: {@link PatchMeshBuilder#build} only (pure Java, no GL, no shared mutable state);
 *  - workers hand finished meshes to the render thread through a ConcurrentLinkedQueue.
 * Requests are bounded (queue of 256, excess dropped and retried next frame). Uploads per frame are budgeted.
 * Holes are avoided by drawing the nearest resident ancestor of a patch whose own mesh is not ready yet.
 */
final class GlPlanetRenderer implements RenderBackend, AutoCloseable {
    private static final int GRID = 32;
    private static final int WORKERS = Math.max(2, Math.min(6, Runtime.getRuntime().availableProcessors() / 2));
    private static final long VRAM_BUDGET_BYTES = 192L << 20;
    private static final int MAX_UPLOADS_PER_FRAME = 6;
    private static final int MAX_REQUESTS_PER_FRAME = 64;

    private static final class Gpu {
        int vao, vbo, ebo, indexCount;
        double[] origin;
        long bytes;
        long lastUsedFrame;
    }

    private record Built(PatchKey key, PatchMesh mesh) {}

    private final PatchMeshBuilder builder;
    private final PlanetDefinition planet;
    private int atmoProgram = -1, atmoVao;
    private boolean atmoFailed;
    private int aInvProj, aView, aUp, aSun, aR0, aH0, aR, aAtmH;
    private final Map<PatchKey, Gpu> resident = new HashMap<>();
    private final Set<PatchKey> inFlight = ConcurrentHashMap.newKeySet();
    private final ConcurrentLinkedQueue<Built> finished = new ConcurrentLinkedQueue<>();
    private final ThreadPoolExecutor workers;
    private final AtomicInteger workerId = new AtomicInteger();

    private int program = -1;
    private int uProj, uView, uOffset, uMorph, uFarLog, uSun, uCamPos, uOriginMod;
    private long residentBytes, frame;
    private int drawnLastFrame, requestedLastFrame;
    /** Selected patches drawn through a coarser ancestor / not drawn at all in the last frame (pop-in proxies). */
    private int fallbackLastFrame, holesLastFrame;
    private final java.util.concurrent.atomic.AtomicLong meshesBuilt = new java.util.concurrent.atomic.AtomicLong();
    private long uploadsTotal;

    GlPlanetRenderer(PatchMeshBuilder builder, PlanetDefinition planet) {
        this.builder = builder;
        this.planet = planet;
        this.workers = new ThreadPoolExecutor(WORKERS, WORKERS, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(256),
                r -> { Thread t = new Thread(r, "planetary-mesh-" + workerId.incrementAndGet()); t.setDaemon(true); return t; },
                (r, ex) -> { /* dropped: key stays absent from inFlight so it is re-requested next frame */ });
    }

    // ---- RenderBackend ----------------------------------------------------------------------

    /** Uploads on the render thread. */
    @Override
    public void upload(PatchKey key, PatchMesh mesh) {
        Gpu g = new Gpu();
        int n = mesh.positions().length / 3;
        ByteBuffer vb = MemoryUtil.memAlloc(n * 28);
        for (int i = 0; i < n; i++) {
            vb.putFloat(mesh.positions()[i * 3]).putFloat(mesh.positions()[i * 3 + 1]).putFloat(mesh.positions()[i * 3 + 2]);
            vb.putFloat(mesh.morphPositions()[i * 3]).putFloat(mesh.morphPositions()[i * 3 + 1]).putFloat(mesh.morphPositions()[i * 3 + 2]);
            vb.putFloat(mesh.heights()[i]);
        }
        vb.flip();
        ByteBuffer ib = MemoryUtil.memAlloc(mesh.indices().length * 4);
        for (int idx : mesh.indices()) ib.putInt(idx);
        ib.flip();

        g.vao = GlStateManager._glGenVertexArrays();
        g.vbo = GlStateManager._glGenBuffers();
        g.ebo = GlStateManager._glGenBuffers();
        GlStateManager._glBindVertexArray(g.vao);
        GlStateManager._glBindBuffer(GL15.GL_ARRAY_BUFFER, g.vbo);
        GlStateManager._glBufferData(GL15.GL_ARRAY_BUFFER, vb, GL15.GL_STATIC_DRAW);
        GlStateManager._glBindBuffer(GL15.GL_ELEMENT_ARRAY_BUFFER, g.ebo);
        GlStateManager._glBufferData(GL15.GL_ELEMENT_ARRAY_BUFFER, ib, GL15.GL_STATIC_DRAW);
        GlStateManager._enableVertexAttribArray(0);
        GlStateManager._vertexAttribPointer(0, 3, GL11.GL_FLOAT, false, 28, 0);
        GlStateManager._enableVertexAttribArray(1);
        GlStateManager._vertexAttribPointer(1, 3, GL11.GL_FLOAT, false, 28, 12);
        GlStateManager._enableVertexAttribArray(2);
        GlStateManager._vertexAttribPointer(2, 1, GL11.GL_FLOAT, false, 28, 24);
        GlStateManager._glBindVertexArray(0);
        MemoryUtil.memFree(vb);
        MemoryUtil.memFree(ib);

        g.indexCount = mesh.indices().length;
        g.origin = mesh.origin();
        g.bytes = (long) n * 28 + (long) mesh.indices().length * 4;
        g.lastUsedFrame = frame;
        residentBytes += g.bytes;
        uploadsTotal++;
        Gpu old = resident.put(key, g);
        if (old != null) free(old);
    }

    @Override
    public void evict(PatchKey key) {
        Gpu g = resident.remove(key);
        if (g != null) free(g);
    }

    private void free(Gpu g) {
        residentBytes -= g.bytes;
        GlStateManager._glDeleteBuffers(g.vbo);
        GlStateManager._glDeleteBuffers(g.ebo);
        GL30.glDeleteVertexArrays(g.vao);
    }

    /** Interface form (kept for backend swappability); the mod uses {@link #drawFrame}. */
    @Override
    public void draw(List<SelectedPatch> selected, double[] cam) {
        throw new UnsupportedOperationException("use drawFrame with matrices");
    }

    // ---- per-frame ---------------------------------------------------------------------------

    void drawFrame(List<SelectedPatch> selected, double[] cam, Matrix4f view, Matrix4f proj, float[] sun) {
        frame++;
        if (program < 0) initProgram();
        drainUploads();
        requestMissing(selected);

        // choose what to draw: own mesh if resident, else nearest resident ancestor (deduplicated)
        Map<PatchKey, Float> toDraw = new LinkedHashMap<>();
        Set<PatchKey> ancestors = new HashSet<>();
        int fallback = 0, holes = 0;
        for (SelectedPatch sp : selected) {
            if (resident.containsKey(sp.key())) continue;
            boolean found = false;
            for (PatchKey a = sp.key().parent(); a != null; a = a.parent())
                if (resident.containsKey(a)) { ancestors.add(a); found = true; break; }
            if (found) fallback++; else holes++;
        }
        fallbackLastFrame = fallback; holesLastFrame = holes;
        for (SelectedPatch sp : selected) {
            if (resident.containsKey(sp.key())) {
                if (!hasAncestorIn(sp.key(), ancestors)) toDraw.put(sp.key(), sp.morphToParent());
            }
        }
        for (PatchKey a : ancestors) toDraw.put(a, 0f);

        RenderSystem.enableDepthTest();
        RenderSystem.depthFunc(GL11.GL_LEQUAL);
        RenderSystem.depthMask(true);
        RenderSystem.disableBlend();
        RenderSystem.disableCull();
        GlStateManager._glUseProgram(program);
        try (MemoryStack st = MemoryStack.stackPush()) {
            FloatBuffer fb = st.mallocFloat(16);
            GlStateManager._glUniformMatrix4(uProj, false, proj.get(fb));
            GlStateManager._glUniformMatrix4(uView, false, view.get(fb));
            FloatBuffer v3 = st.mallocFloat(3);
            GlStateManager._glUniform3(uSun, v3.put(sun).flip());
            v3.clear();
            GlStateManager._glUniform3(uCamPos, v3.put((float) cam[0]).put((float) cam[1]).put((float) cam[2]).flip());
            GlStateManager._glUniform1(uFarLog, st.floats((float) (Math.log(PlanetClient.FAR + 1.0) / Math.log(2.0))));
            for (var e : toDraw.entrySet()) {
                Gpu g = resident.get(e.getKey());
                g.lastUsedFrame = frame;
                v3.clear();
                v3.put((float) (g.origin[0] - cam[0])).put((float) (g.origin[1] - cam[1])).put((float) (g.origin[2] - cam[2])).flip();
                GlStateManager._glUniform3(uOffset, v3);
                v3.clear();
                for (int a = 0; a < 3; a++) v3.put((float) (g.origin[a] - Math.floor(g.origin[a] / 1024.0) * 1024.0));
                GlStateManager._glUniform3(uOriginMod, v3.flip());
                GlStateManager._glUniform1(uMorph, st.floats(e.getValue()));
                GlStateManager._glBindVertexArray(g.vao);
                GL11.glDrawElements(GL11.GL_TRIANGLES, g.indexCount, GL11.GL_UNSIGNED_INT, 0L);
            }
        }
        drawnLastFrame = toDraw.size();
        drawAtmosphere(cam, view, proj, sun);
        GlStateManager._glBindVertexArray(0);
        GlStateManager._glBindBuffer(GL15.GL_ARRAY_BUFFER, 0);
        // vanilla caches the last-used program/VAO; reset its static state through a vanilla shader's clear()
        var vanilla = net.minecraft.client.renderer.GameRenderer.getPositionColorShader();
        if (vanilla != null) vanilla.clear(); else GlStateManager._glUseProgram(0);
        BufferUploader.invalidate();
        RenderSystem.enableCull();
        evictIfOverBudget();
    }

    /** Full-screen analytic atmosphere pass. A shader failure disables it (logged) instead of crashing the game. */
    private void drawAtmosphere(double[] cam, Matrix4f view, Matrix4f proj, float[] sun) {
        if (atmoFailed) return;
        try {
            if (atmoProgram < 0) {
                atmoProgram = PlanetShaders.compileAtmosphere();
                aInvProj = GlStateManager._glGetUniformLocation(atmoProgram, "uInvProj");
                aView = GlStateManager._glGetUniformLocation(atmoProgram, "uView");
                aUp = GlStateManager._glGetUniformLocation(atmoProgram, "uUp");
                aSun = GlStateManager._glGetUniformLocation(atmoProgram, "uSun");
                aR0 = GlStateManager._glGetUniformLocation(atmoProgram, "uR0");
                aH0 = GlStateManager._glGetUniformLocation(atmoProgram, "uH0");
                aR = GlStateManager._glGetUniformLocation(atmoProgram, "uR");
                aAtmH = GlStateManager._glGetUniformLocation(atmoProgram, "uAtmH");
                atmoVao = GlStateManager._glGenVertexArrays();
            }
        } catch (RuntimeException e) {
            atmoFailed = true;
            System.out.println("[planetary] atmosphere disabled: " + e.getMessage());
            return;
        }
        double r0 = Math.sqrt(cam[0] * cam[0] + cam[1] * cam[1] + cam[2] * cam[2]);
        Matrix4f inv = new Matrix4f(proj).invert();
        RenderSystem.disableDepthTest();
        RenderSystem.depthMask(false);
        RenderSystem.enableBlend();
        RenderSystem.blendFunc(1, 770);                       // GL_ONE, GL_SRC_ALPHA: inscatter + scene * transmittance
        GlStateManager._glUseProgram(atmoProgram);
        try (MemoryStack st = MemoryStack.stackPush()) {
            FloatBuffer fb = st.mallocFloat(16);
            GlStateManager._glUniformMatrix4(aInvProj, false, inv.get(fb));
            GlStateManager._glUniformMatrix4(aView, false, view.get(fb));
            FloatBuffer v3 = st.mallocFloat(3);
            GlStateManager._glUniform3(aUp, v3.put((float) (cam[0] / r0)).put((float) (cam[1] / r0)).put((float) (cam[2] / r0)).flip());
            v3.clear();
            GlStateManager._glUniform3(aSun, v3.put(sun).flip());
            GlStateManager._glUniform1(aR0, st.floats((float) r0));
            GlStateManager._glUniform1(aH0, st.floats((float) (r0 - planet.radius())));
            GlStateManager._glUniform1(aR, st.floats((float) planet.radius()));
            GlStateManager._glUniform1(aAtmH, st.floats((float) planet.atmosphereHeight()));
        }
        GlStateManager._glBindVertexArray(atmoVao);
        GL11.glDrawArrays(GL11.GL_TRIANGLES, 0, 3);
        GlStateManager._glBindVertexArray(0);
        RenderSystem.defaultBlendFunc();
        RenderSystem.disableBlend();
        RenderSystem.enableDepthTest();
        RenderSystem.depthMask(true);
    }

    private static boolean hasAncestorIn(PatchKey k, Set<PatchKey> set) {
        if (set.isEmpty()) return false;
        for (PatchKey a = k.parent(); a != null; a = a.parent()) if (set.contains(a)) return true;
        return false;
    }

    private void initProgram() {
        program = PlanetShaders.compileProgram();
        uProj = GlStateManager._glGetUniformLocation(program, "uProj");
        uView = GlStateManager._glGetUniformLocation(program, "uView");
        uOffset = GlStateManager._glGetUniformLocation(program, "uOffset");
        uMorph = GlStateManager._glGetUniformLocation(program, "uMorph");
        uFarLog = GlStateManager._glGetUniformLocation(program, "uFarLog");
        uSun = GlStateManager._glGetUniformLocation(program, "uSun");
        uCamPos = GlStateManager._glGetUniformLocation(program, "uCamPos");
        uOriginMod = GlStateManager._glGetUniformLocation(program, "uOriginMod");
    }

    private void drainUploads() {
        for (int i = 0; i < MAX_UPLOADS_PER_FRAME; i++) {
            Built b = finished.poll();
            if (b == null) return;
            inFlight.remove(b.key());
            upload(b.key(), b.mesh());
        }
    }

    private void requestMissing(List<SelectedPatch> selected) {
        List<PatchKey> missing = new ArrayList<>();
        for (SelectedPatch sp : selected) {
            PatchKey k = sp.key();
            if (!resident.containsKey(k) && !inFlight.contains(k)) missing.add(k);
            PatchKey par = k.parent();                       // make sure a fallback exists
            if (par != null && !resident.containsKey(par) && !inFlight.contains(par)) missing.add(par);
        }
        missing.sort(Comparator.comparingInt(PatchKey::level));   // coarse first: fills holes fastest
        int n = 0;
        for (PatchKey k : missing) {
            if (n >= MAX_REQUESTS_PER_FRAME) break;
            if (!inFlight.add(k)) continue;
            try {
                workers.execute(() -> {
                    try { finished.add(new Built(k, builder.build(k, GRID))); meshesBuilt.incrementAndGet(); }
                    catch (Throwable t) { inFlight.remove(k); }
                });
                n++;
            } catch (RejectedExecutionException e) { inFlight.remove(k); break; }
        }
        requestedLastFrame = n;
    }

    private void evictIfOverBudget() {
        if (residentBytes <= VRAM_BUDGET_BYTES) return;
        List<Map.Entry<PatchKey, Gpu>> all = new ArrayList<>(resident.entrySet());
        all.sort(Comparator.comparingLong(e -> e.getValue().lastUsedFrame));
        for (var e : all) {
            if (residentBytes <= VRAM_BUDGET_BYTES * 0.9) break;
            if (e.getValue().lastUsedFrame >= frame - 1) continue;      // never evict what is on screen
            resident.remove(e.getKey());
            free(e.getValue());
        }
    }

    /** True when every selected patch is drawn from its own mesh and no work is pending. */
    boolean settled() { return inFlight.isEmpty() && finished.isEmpty() && fallbackLastFrame == 0 && holesLastFrame == 0; }

    int fallbackLastFrame() { return fallbackLastFrame; }
    int holesLastFrame() { return holesLastFrame; }

    List<String> stats() {
        return List.of("resident=" + resident.size() + " vram=" + (residentBytes >> 20) + "MB/" + (VRAM_BUDGET_BYTES >> 20) + "MB",
                "drawn=" + drawnLastFrame + " fallback=" + fallbackLastFrame + " holes=" + holesLastFrame + " inFlight=" + inFlight.size() + " req/frame=" + requestedLastFrame,
                "built=" + meshesBuilt + " uploaded=" + uploadsTotal);
    }

    @Override
    public void close() {
        workers.shutdownNow();
        for (Gpu g : resident.values()) free(g);
        resident.clear();
        if (program >= 0) { GlStateManager.glDeleteProgram(program); program = -1; }
        if (atmoProgram >= 0) { GlStateManager.glDeleteProgram(atmoProgram); atmoProgram = -1; }
    }
}
