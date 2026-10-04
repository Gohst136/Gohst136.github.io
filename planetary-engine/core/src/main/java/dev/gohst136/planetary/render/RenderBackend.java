package dev.gohst136.planetary.render;

import dev.gohst136.planetary.lod.PatchKey;
import dev.gohst136.planetary.mesh.PatchMesh;

import java.util.List;

/**
 * Boundary between the engine (pure Java, testable headless) and a graphics API.
 * Implementations: OpenGL (Phase 2, in the mod module), GPU-driven/MDI (Phase 13), Vulkan/RTX later.
 * All methods are called on the render thread; meshes are produced on worker threads.
 */
public interface RenderBackend {
    /** Queue a mesh for upload (backend decides batching / persistent-mapped staging). */
    void upload(PatchKey key, PatchMesh mesh);
    void evict(PatchKey key);
    /** Draw the selected set; per-patch camera-relative offsets are computed in double by the caller. */
    void draw(List<PatchKey> selected, double[] cameraPositionPlanetFrame);
}
