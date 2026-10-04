package dev.gohst136.planetary.mesh;

/**
 * CPU-side patch mesh, ready for upload. Positions are metres relative to {@code origin}
 * (the patch centre, in planet frame); the renderer adds (origin - cameraPos) in double
 * precision per patch, so float vertices stay small and jitter-free at any scale.
 *
 * {@code morphPositions} holds, per vertex, the position it would have in the parent (coarser)
 * grid; the vertex shader blends position -> morphPositions by a per-patch morph factor
 * derived from the same screen-space error, giving continuous geomorphing instead of popping.
 * {@code heights} holds the terrain height above the baseline radius per vertex (metres) for shading.
 * Positions/morph: xyz triples. Skirt vertices (last ring) hide cracks between LODs.
 */
public record PatchMesh(double[] origin, float[] positions, float[] morphPositions, float[] heights,
                        int[] indices, int gridCells) {}
