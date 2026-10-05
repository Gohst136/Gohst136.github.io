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
    private static final int WORKERS = Math.max(2, Math.min(8, Runtime.getRuntime().availableProcessors() - 4));   // leave cores for the render thread, the server and the OS
    private static final long VRAM_BUDGET_BYTES = Long.getLong("planetary.vramMB", 320L) << 20;
    private static final int MAX_UPLOADS_PER_FRAME = 6;
    private static final int MAX_REQUESTS_PER_FRAME = 64;
    private static final int PIN_LEVEL = 2;                       // levels <= 2 stay resident (126 meshes, ~8 MB)
    private static final long STALE_FRAMES = 240;                 // queued jobs nobody wants any more are skipped
    private static final int MAX_QUEUED = 600;

    /** Mesh job ordered by time-to-visibility class (0 = visible now, 1 = in 0.5 s, 2 = in 1.5 s), then coarse first. */
    private static final class Job implements Runnable, Comparable<Job> {
        final int prio, level; final long seq; final Runnable body;
        Job(int prio, int level, long seq, Runnable body) { this.prio = prio; this.level = level; this.seq = seq; this.body = body; }
        @Override public void run() { body.run(); }
        @Override public int compareTo(Job o) {
            if (prio != o.prio) return Integer.compare(prio, o.prio);
            if (level != o.level) return Integer.compare(level, o.level);
            return Long.compare(seq, o.seq);
        }
    }

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
    private int aInvProj, aView, aUp, aSun, aR0, aH0, aR, aAtmH, aOccC, aOccR;
    /** Occluders for the sky pass (set each frame by the client): camera-relative centres (E axes) and radii of the other bodies. */
    static final float[] occC = new float[6], occR = new float[2];
    private final Map<PatchKey, Gpu> resident = new HashMap<>();
    private final Set<PatchKey> inFlight = ConcurrentHashMap.newKeySet();
    private final ConcurrentLinkedQueue<Built> finished = new ConcurrentLinkedQueue<>();
    private final ThreadPoolExecutor workers;
    private final AtomicInteger workerId = new AtomicInteger();

    private int sharedEbo = -1;      // all patches have the same topology: one index buffer serves every VAO
    private int program = -1;
    private int uProj, uView, uOffset, uMorph, uFarLog, uSun, uCamPos, uOriginMod;
    private long residentBytes;
    private volatile long frame;
    private final java.util.concurrent.atomic.AtomicLong jobSeq = new java.util.concurrent.atomic.AtomicLong();
    private final Map<PatchKey, Long> wanted = new ConcurrentHashMap<>();       // key -> last frame someone wanted it
    private final Map<PatchKey, Long> requestedAt = new ConcurrentHashMap<>();   // key -> nanoTime of request
    private final dev.gohst136.planetary.telemetry.FrameStats latencyMs = new dev.gohst136.planetary.telemetry.FrameStats(4000);
    private int prefetchLastFrame;
    private int drawnLastFrame, requestedLastFrame;
    /** Selected patches drawn through a coarser ancestor / not drawn at all in the last frame (pop-in proxies). */
    private int fallbackLastFrame, holesLastFrame;
    private final java.util.concurrent.atomic.AtomicLong meshesBuilt = new java.util.concurrent.atomic.AtomicLong();
    private long uploadsTotal;

    GlPlanetRenderer(PatchMeshBuilder builder, PlanetDefinition planet) { this(builder, planet, WORKERS); }

    GlPlanetRenderer(PatchMeshBuilder builder, PlanetDefinition planet, int workerThreads) {
        this.builder = builder;
        this.planet = planet;
        this.workers = new ThreadPoolExecutor(workerThreads, workerThreads, 30, TimeUnit.SECONDS,
                new PriorityBlockingQueue<Runnable>(256, (a, b) -> ((Job) a).compareTo((Job) b)),
                r -> {
                    Thread t = new Thread(r, "planetary-mesh-" + workerId.incrementAndGet());
                    t.setDaemon(true);
                    t.setPriority(Thread.MIN_PRIORITY);          // never compete with the render thread if the OS honours it
                    return t;
                });
    }

    // ---- RenderBackend ----------------------------------------------------------------------

    /** Uploads on the render thread. */
    @Override
    public void upload(PatchKey key, PatchMesh mesh) {
        Gpu g = new Gpu();
        int n = mesh.positions().length / 3;
        ByteBuffer vb = MemoryUtil.memAlloc(n * 40);
        for (int i = 0; i < n; i++) {
            vb.putFloat(mesh.positions()[i * 3]).putFloat(mesh.positions()[i * 3 + 1]).putFloat(mesh.positions()[i * 3 + 2]);
            vb.putFloat(mesh.morphPositions()[i * 3]).putFloat(mesh.morphPositions()[i * 3 + 1]).putFloat(mesh.morphPositions()[i * 3 + 2]);
            vb.putFloat(mesh.colors()[i * 4]).putFloat(mesh.colors()[i * 4 + 1]).putFloat(mesh.colors()[i * 4 + 2]).putFloat(mesh.colors()[i * 4 + 3]);
        }
        vb.flip();
        if (sharedEbo < 0) {
            ByteBuffer ib = MemoryUtil.memAlloc(mesh.indices().length * 4);
            for (int idx : mesh.indices()) ib.putInt(idx);
            ib.flip();
            sharedEbo = GlStateManager._glGenBuffers();
            GlStateManager._glBindBuffer(GL15.GL_ELEMENT_ARRAY_BUFFER, sharedEbo);
            GlStateManager._glBufferData(GL15.GL_ELEMENT_ARRAY_BUFFER, ib, GL15.GL_STATIC_DRAW);
            }

        g.vao = GlStateManager._glGenVertexArrays();
        g.vbo = GlStateManager._glGenBuffers();
        GlStateManager._glBindVertexArray(g.vao);
        GlStateManager._glBindBuffer(GL15.GL_ARRAY_BUFFER, g.vbo);
        GlStateManager._glBufferData(GL15.GL_ARRAY_BUFFER, vb, GL15.GL_STATIC_DRAW);
        GlStateManager._glBindBuffer(GL15.GL_ELEMENT_ARRAY_BUFFER, sharedEbo);     // recorded in the VAO
        GlStateManager._enableVertexAttribArray(0);
        GlStateManager._vertexAttribPointer(0, 3, GL11.GL_FLOAT, false, 40, 0);
        GlStateManager._enableVertexAttribArray(1);
        GlStateManager._vertexAttribPointer(1, 3, GL11.GL_FLOAT, false, 40, 12);
        GlStateManager._enableVertexAttribArray(2);
        GlStateManager._vertexAttribPointer(2, 4, GL11.GL_FLOAT, false, 40, 24);
        GlStateManager._glBindVertexArray(0);
        MemoryUtil.memFree(vb);

        g.indexCount = mesh.indices().length;
        g.origin = mesh.origin();
        g.bytes = (long) n * 40;
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
        prefetchLastFrame = 0;
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
        if (planet.atmosphereHeight() > 0) drawAtmosphere(cam, view, proj, sun);        // airless bodies have none
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
                aOccC = GlStateManager._glGetUniformLocation(atmoProgram, "uOccC");
                aOccR = GlStateManager._glGetUniformLocation(atmoProgram, "uOccR");
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
            FloatBuffer oc = st.mallocFloat(6); oc.put(occC).flip();
            GlStateManager._glUniform3(aOccC, oc);
            FloatBuffer orr = st.mallocFloat(2); orr.put(occR).flip();
            GlStateManager._glUniform1(aOccR, orr);
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
        // 6 per frame normally; a backlog (teleport, lap) gets up to 40 per frame but never more than ~3 ms of upload work
        int budget = finished.size() > 64 ? 40 : MAX_UPLOADS_PER_FRAME;
        long t0 = System.nanoTime();
        for (int i = 0; i < budget; i++) {
            if (i >= MAX_UPLOADS_PER_FRAME && System.nanoTime() - t0 > 3_000_000L) return;
            Built b = finished.poll();
            if (b == null) return;
            inFlight.remove(b.key());
            Long t0 = requestedAt.remove(b.key());
            if (t0 != null) latencyMs.record((System.nanoTime() - t0) / 1e6);
            upload(b.key(), b.mesh());
        }
    }

    private void requestMissing(List<SelectedPatch> selected) {
        List<PatchKey> missing = new ArrayList<>();
        for (SelectedPatch sp : selected) {
            PatchKey k = sp.key();
            wanted.put(k, frame);
            if (!resident.containsKey(k) && !inFlight.contains(k)) missing.add(k);
            PatchKey par = k.parent();                       // make sure a fallback exists
            if (par != null) {
                wanted.put(par, frame);
                if (!resident.containsKey(par) && !inFlight.contains(par)) missing.add(par);
            }
        }
        requestedLastFrame = submit(missing, 0);
    }

    /** Predictive streaming: keys the camera is expected to need soon. prio 1 = ~0.5 s ahead, 2 = ~1.5 s ahead. */
    void prefetch(Collection<PatchKey> keys, int prio) {
        List<PatchKey> missing = new ArrayList<>();
        for (PatchKey k : keys) {
            wanted.put(k, frame);
            if (!resident.containsKey(k) && !inFlight.contains(k)) missing.add(k);
        }
        prefetchLastFrame += submit(missing, prio);
    }

    /** Requests the permanently resident coarse levels (so a descent from orbit always has ancestors). */
    void pinCoarse() {
        List<PatchKey> keys = new ArrayList<>();
        for (int face = 0; face < 6; face++)
            for (int lvl = 0; lvl <= PIN_LEVEL; lvl++)
                for (int x = 0; x < (1 << lvl); x++) for (int y = 0; y < (1 << lvl); y++) keys.add(new PatchKey(face, lvl, x, y));
        for (PatchKey k : keys) wanted.put(k, Long.MAX_VALUE / 2);
        submit(keys, -1);
    }

    private int submit(List<PatchKey> keys, int prio) {
        keys.sort(Comparator.comparingInt(PatchKey::level));
        int n = 0;
        for (PatchKey k : keys) {
            if (prio >= 0 && (n >= MAX_REQUESTS_PER_FRAME || workers.getQueue().size() > MAX_QUEUED)) break;
            if (!inFlight.add(k)) continue;
            requestedAt.put(k, System.nanoTime());
            workers.execute(new Job(prio, k.level(), jobSeq.incrementAndGet(), () -> {
                try {
                    if (frame - wanted.getOrDefault(k, 0L) > STALE_FRAMES) { inFlight.remove(k); requestedAt.remove(k); return; }
                    if (finished.size() > 600) { inFlight.remove(k); requestedAt.remove(k); return; }          // uploads are behind: do not build what cannot be uploaded; it is re-requested if still needed
                    finished.add(new Built(k, builder.build(k, GRID)));
                    meshesBuilt.incrementAndGet();
                } catch (Throwable t) { inFlight.remove(k); requestedAt.remove(k); }
            }));
            n++;
        }
        return n;
    }

    private void evictIfOverBudget() {
        if (residentBytes <= VRAM_BUDGET_BYTES) return;
        List<Map.Entry<PatchKey, Gpu>> all = new ArrayList<>(resident.entrySet());
        all.sort(Comparator.comparingLong(e -> e.getValue().lastUsedFrame));
        for (var e : all) {
            if (residentBytes <= VRAM_BUDGET_BYTES * 0.9) break;
            if (e.getValue().lastUsedFrame >= frame - 1) continue;      // never evict what is on screen
            if (e.getKey().level() <= PIN_LEVEL) continue;               // pinned coarse levels
            resident.remove(e.getKey());
            free(e.getValue());
        }
    }

    /** True when every selected patch is drawn from its own mesh and no work is pending. */
    boolean settled() { return inFlight.isEmpty() && finished.isEmpty() && fallbackLastFrame == 0 && holesLastFrame == 0; }

    /** Drops every resident mesh (used by the benchmark to start a transit with a cold cache). */
    void clearCache() {
        resident.entrySet().removeIf(e -> {
            if (e.getKey().level() <= PIN_LEVEL) return false;          // pinned coarse levels survive
            free(e.getValue());
            return true;
        });
    }

    int drawnLastFrame() { return drawnLastFrame; }
    int fallbackLastFrame() { return fallbackLastFrame; }
    int holesLastFrame() { return holesLastFrame; }

    String latencySummary() { return String.format("stream latency ms p50=%.0f p95=%.0f p99=%.0f max=%.0f", latencyMs.median(), latencyMs.p95(), latencyMs.p99(), latencyMs.worst()); }

    List<String> stats() {
        return List.of("resident=" + resident.size() + " vram=" + (residentBytes >> 20) + "MB/" + (VRAM_BUDGET_BYTES >> 20) + "MB",
                "drawn=" + drawnLastFrame + " fallback=" + fallbackLastFrame + " holes=" + holesLastFrame + " inFlight=" + inFlight.size() + " req/frame=" + requestedLastFrame,
                "prefetch/frame=" + prefetchLastFrame + " queued=" + workers.getQueue().size() + " latency p50/p95/p99 ms=" + String.format("%.0f/%.0f/%.0f", latencyMs.median(), latencyMs.p95(), latencyMs.p99()),
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
