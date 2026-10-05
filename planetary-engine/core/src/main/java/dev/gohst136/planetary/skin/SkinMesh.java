package dev.gohst136.planetary.skin;

/**
 * Block-skin mesh of one quadtree patch: independent quads (4 vertices each, vanilla corner order), opaque ones first, then the water quads.
 * Positions are metres relative to {@code origin} (planet frame). {@code uv} are block-space texture coordinates relative to the patch's own
 * corner (the renderer tiles the sprite per block with fract()), {@code rgba} the per-vertex multiplier (face shade x ambient occlusion x tint),
 * {@code slot} the sprite slot, {@code sky} the sky light level (0..15) of the quad.
 */
public record SkinMesh(double[] origin, int quadCount, int waterStart, float[] pos, float[] uv, int[] rgba, short[] slot, byte[] sky) {}
