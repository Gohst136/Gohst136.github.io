# Planetary Engine — architecture and status against the goal

Goal (see the master prompt): fly from a Minecraft block to space and to another planet and back to blocks, with no loading
screens, no visible LOD pops and no dimension hops. This file tracks what exists, what was measured, and what is missing.

## Decisions
- **The planet is its own realistic world, not vanilla.** Continents, huge oceans, mountain belts, rivers, climate and ice caps
  come from `RealisticTerrain` (pure function of seed, direction and mesh cell size). Vanilla worldgen is NOT the planet:
  at planet scale its km-sized features look like noise from orbit. A vanilla-derived path (`-Dplanetary.vanillaBubble=true`)
  still exists as an experiment and is what the real-chunk handoff below was proven with.
- **Real chunks must come from the planet.** Next step: a custom `ChunkGenerator` that fills chunks from `RealisticTerrain`
  through `PlaneUnwrap`, so blocks near the player match the planet mesh (continents, rivers, biomes). Until then the real
  world and the planet only match in the vanilla path.
- **Pure-Java core + thin GPU layer.** `:core` is JDK-only and unit-tested headlessly; `:mod` is NeoForge + OpenGL glue.

## Modules and packages (`dev.gohst136.planetary`)
| Package | Role |
|---|---|
| `coord` | `UniversePos` (64-bit sector + double offset), `FloatingOrigin` |
| `planet` | `PlanetDefinition`, `CubeSphere` (equal-angle faces, inverse mapping), `PlaneUnwrap` (mirror-free face -> flat plane, edge blending) |
| `terrain` | `RealisticTerrain`, `Noise3`, `SurfacePalette`, `HybridTerrain`/`FlattenedTerrain` (vanilla path), `ProceduralTerrain` |
| `lod` | `QuadtreeSelector` (screen-space error, horizon+frustum culling, hysteresis, velocity relax, budget feedback), `PatchBounds`, `CameraView` |
| `mesh` | `PatchMeshBuilder` (grid + skirt + geomorph targets + vertex colours) |
| `telemetry` | `FrameStats` (avg/median/p95/p99/worst) |
| `render` | `RenderBackend` interface |
| `mod/client` | `GlPlanetRenderer` (OpenGL 3.2, priority mesh jobs, predictive prefetch, VRAM budget), `PlanetShaders` (geomorph, log-depth, water glint, 1 m / 16 m lattice, atmosphere pass), `PlanetClient` (free flight, handoff), `BubbleFrame`, `PlanetAutoTest` (scripted benchmark) |

## What works (measured on an RTX 2060, 1280x720, via `watch-autotest.bat`)
- Descent 20,000 km -> 2 m above ground, continuous: level 19 (~1 m cells), ~8.4 ms/frame, p99 ~11 ms, VRAM 30-110 MB.
- Streaming with a cold cache (real-time flight at v = altitude per second): 0 hole frames, 0 fallback frames, latency
  p50 ~180 ms / p95 ~600 ms (`GlPlanetRenderer`: priority queue by time-to-visibility, 0.5 s / 1.5 s look-ahead, pinned coarse levels).
- Atmosphere: analytic Rayleigh + Mie single scattering, continuous from orbit to ground; procedural star field in space.
- Camera: floating-origin style (camera-relative doubles -> floats), logarithmic depth, auto-levelled to the local vertical.
- Vanilla path (proof of concept): real chunks in front of the planet backdrop, handoff at 300 m with exact pose match,
  mirror-free plane mapping, detail layer within ~6 m (std) of the generator after a +7 m bias correction.

## Measured, honest limitations
- Pop-in is only measured by proxies (fallback/hole frames, split/merge counts), not by image differences.
- Rivers are noise level sets, not hydrology: they look like river systems but do not strictly flow downhill.
- Heights between patch samples are bounded heuristically (slope bound), not provably, for `RealisticTerrain`.
- Three-face cube corners are only approximately continuous in `PlaneUnwrap`.
- No 2:1 neighbour constraint between LOD levels yet (skirts + geomorph weights hide cracks).
- No multiplayer protocol, no real physics regimes, no multiple planets, no GPU-driven culling, no ray tracing.

## Roadmap (phase numbers from the master prompt)
1-5 done (planet, rendering from space, continuous quadtree refinement, coordinates, orbit -> surface). 6 in progress
(real blocks: proven with vanilla; needs the custom chunk generator). 7 done for the camera path (predictive streaming).
Next: custom chunk generator (6), swept collision + speed regimes (8), several bodies + orbits (9-10), server-authoritative
correction and networking (11), vehicles/compat (12), GPU-driven culling with Hi-Z and indirect draws (13), optional RT (14).

## Test loop
`watch-autotest.bat` (dev PC) pulls every new commit, runs `run-autotest.bat` (Minecraft client, scripted benchmark) and pushes
`autotest-results/` (stats, screenshots, log, `tested-commit.txt`); the cloud session reads and continues.
Autotest output: 8 altitude stops, an 8-view orbit tour (`orbit_*.png`), a cold-cache real-time transit, target/fidelity lines.
Unit tests: `gradle :core:test` (coordinates, cube sphere, bounds, selector, realistic terrain statistics, plane-unwrap continuity).

## 8. Status of the real-world bubble (measured)
- The planet's own `ChunkGenerator` fills real chunks from `RealisticTerrain` (11 ms/chunk). Real vs planet function at the landing
  site: median |dY| = 1 block, 88-92 % of columns within 3 blocks (trees and features count as terrain).
- Orbit -> ground works end to end in the benchmark (20,000 km -> real blocks), no loading screen, no dimension change. The planet
  mesh stays as the backdrop behind real chunks; the real player's camera takes over below 300 m.
- Known limitation: vanilla lowers biome temperature with absolute Y, so high plateaus (> ~500 m) snow over where the planet colours
  say green; the benchmark lands in lowlands. Fix options: custom biome temperature modifier or a dimension-specific climate.
- Bugs found by measuring (kept here as lessons): a mode flip every frame painted the planet over the real chunks (exit condition used
  height above sea level); an unfilled biome cache made worldgen 30x slower; stale save folders invalidated early runs.
