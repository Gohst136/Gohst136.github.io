package dev.gohst136.planetary.mod.world;

import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.terrain.RealisticTerrain;

import java.util.concurrent.ConcurrentHashMap;

/** Shared, thread-safe access to the planet for the biome source, the chunk generator and the client renderer. */
public final class PlanetWorld {
    private PlanetWorld() {}

    /** Fixed planet seed (the planet does not depend on the Minecraft world seed, so the client needs no network sync yet). */
    public static final long DEFAULT_SEED = Long.getLong("planetary.seed", 20240601L);

    private static final ConcurrentHashMap<Long, RealisticTerrain> TERRAINS = new ConcurrentHashMap<>();

    public static PlanetDefinition planet(long seed) { return PlanetDefinition.earth(seed); }

    public static RealisticTerrain terrain(long seed) {
        return TERRAINS.computeIfAbsent(seed, s -> new RealisticTerrain(PlanetDefinition.earth(s)));
    }

    /** Half the side of one cube-face square in the vanilla plane, in blocks (= planet metres). */
    public static double halfSpan(long seed) { return PlanetDefinition.earth(seed).radius() * Math.PI / 4.0; }

    // ---- the Moon (second body with real chunks) ----------------------------------------------------------------------------------

    private static final ConcurrentHashMap<Long, Object[]> MOONS = new ConcurrentHashMap<>();

    private static Object[] moon(long seed) {
        return MOONS.computeIfAbsent(seed, s -> {
            var def = dev.gohst136.planetary.system.StarSystem.example(s).body("moon");
            var pd = dev.gohst136.planetary.system.BodyTerrain.planetFor(def);
            return new Object[]{def, pd, dev.gohst136.planetary.system.BodyTerrain.terrainFor(def, pd)};
        });
    }

    public static dev.gohst136.planetary.terrain.TerrainSampler moonTerrain(long seed) { return (dev.gohst136.planetary.terrain.TerrainSampler) moon(seed)[2]; }
    public static PlanetDefinition moonPlanet(long seed) { return (PlanetDefinition) moon(seed)[1]; }
    public static double moonHalfSpan(long seed) { return moonPlanet(seed).radius() * Math.PI / 4.0; }
}
