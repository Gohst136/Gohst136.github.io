package dev.gohst136.planetary.skin;

import dev.gohst136.planetary.world.PlanetColumns;

/**
 * How the block skin looks: which texture slot each block face uses and how it is tinted. Implemented by the mod from the game's own block
 * models and biome colours (so the far blocks use exactly the textures and tints of real chunks); tests use a fake.
 */
public interface SkinStyle {
    /** Texture slot of the top face of this kind; slots index the renderer's table of atlas sprites. */
    int slotTop(PlanetColumns.Kind kind);
    /** Texture slot of the side faces. */
    int slotSide(PlanetColumns.Kind kind);
    /** Slot of the tinted overlay drawn on top of the side (grass block), or -1. */
    int slotSideOverlay(PlanetColumns.Kind kind);
    /** Texture slot of water. */
    int slotWater();
    /** RGB (0xRRGGBB) multiplied into the top face of a column (0xFFFFFF = untinted). */
    int tintTop(PlanetColumns.Column column);
    /** RGB for the side overlay (grass) of a column. */
    int tintOverlay(PlanetColumns.Column column);
    /** RGB for the water surface of a column. */
    int tintWater(PlanetColumns.Column column);
}
