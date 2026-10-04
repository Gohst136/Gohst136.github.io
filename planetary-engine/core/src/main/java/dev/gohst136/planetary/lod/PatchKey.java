package dev.gohst136.planetary.lod;

/** Address of a quadtree surface patch: cube face, depth, and integer cell within that depth. */
public record PatchKey(int face, int level, int x, int y) {
    public PatchKey[] children() {
        int l = level + 1, cx = x * 2, cy = y * 2;
        return new PatchKey[]{new PatchKey(face, l, cx, cy), new PatchKey(face, l, cx + 1, cy),
                new PatchKey(face, l, cx, cy + 1), new PatchKey(face, l, cx + 1, cy + 1)};
    }
    public PatchKey parent() { return level == 0 ? null : new PatchKey(face, level - 1, x >> 1, y >> 1); }
}
