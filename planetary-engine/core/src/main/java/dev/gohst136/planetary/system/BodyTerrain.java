package dev.gohst136.planetary.system;

import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.terrain.CraterTerrain;
import dev.gohst136.planetary.terrain.TerrainSampler;

/** Builds the planet definition and the terrain sampler of an airless body from its {@link BodyDefinition} (used by both the world generator and the renderer so they agree). */
public final class BodyTerrain {
    private BodyTerrain() {}

    public static PlanetDefinition planetFor(BodyDefinition d) {
        return new PlanetDefinition("planetary:" + d.id(), d.seed(), d.radius(), d.surfaceGravity(), 0,
                Math.min(9000.0, 0.005 * d.radius() + 500), Math.min(9000.0, 0.004 * d.radius() + 500), d.rotationPeriod(), 0, 14);
    }

    public static TerrainSampler terrainFor(BodyDefinition d, PlanetDefinition pd) {
        return d.kind() == BodyDefinition.Kind.PLANET ? new CraterTerrain(pd, 1.35, 0.85, 0.6) : new CraterTerrain(pd);
    }
}
