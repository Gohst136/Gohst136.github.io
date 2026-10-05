package dev.gohst136.planetary.terrain;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.planet.PlaneUnwrap;
import dev.gohst136.planetary.planet.VerticalMap;
import dev.gohst136.planetary.world.ModificationDatabase;

/**
 * The procedural planet plus the world's recorded edits. At coarse mesh resolution edits are invisible (a 5 m hole does not exist at
 * 10 km cells) and the base terrain is returned untouched, so far meshes never need rebuilding for small edits. At resolutions of
 * {@code editCell} metres or finer, a column whose surface was modified returns the modified height. A coarse-to-fine blend over
 * [editCell, 4 * editCell] avoids a visible step between levels.
 */
public final class ModifiedTerrain implements TerrainSampler {
    private final TerrainSampler base;
    private final ModificationDatabase db;
    private final double halfSpan, editCell;

    public ModifiedTerrain(TerrainSampler base, ModificationDatabase db, double planetRadius, double editCell) {
        this.base = base; this.db = db; this.halfSpan = planetRadius * Math.PI / 4.0; this.editCell = editCell;
    }

    @Override public double heightAt(Vec3 d) { return heightAt(d, 0.0); }

    @Override
    public double heightAt(Vec3 d, double cell) {
        double h = base.heightAt(d, cell);
        if (cell > 4.0 * editCell) return h;
        var m = PlaneUnwrap.map(d, halfSpan, 0.0);
        Integer top = db.columnTop((int) Math.floor(m.x1()), (int) Math.floor(m.z1()));
        if (top == null) return h;
        double edited = VerticalMap.toMeters(top + 0.5);
        double w = cell <= editCell ? 1.0 : 1.0 - (cell - editCell) / (3.0 * editCell);
        return h + (edited - h) * w;
    }

    @Override public double unresolvedDetail(double cell) { return base.unresolvedDetail(cell); }
    @Override public double slopeBound() { return base.slopeBound() + 50.0; }
    @Override public void sampleSurface(Vec3 d, double cell, double[] out) {
        base.sampleSurface(d, cell, out);
        out[0] = heightAt(d, cell);
    }
}
