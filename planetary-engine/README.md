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

## 9. Collision at speed (Phase 8, first part)
`physics/SweptCollision`: continuous collision of the free-flight camera against the planet surface. Sphere-tracing steps (bounded by
clearance / slope bound), bisection on the crossing, coarse terrain cell size that grows with the move length, so a 1,000 km/s move
costs a few thousand terrain samples at most. Tested: a straight move through the planet stops at the surface (bounded sample count),
high-altitude moves are not blocked, 20 km low-altitude moves never end inside terrain (18/300 blocked by mountains).
Not done yet: the real player's collision at speed inside the bubble (vanilla physics apply there), vehicles, entity collision.

## 10. Several bodies, speed, manual landing (status)
- `system/StarSystem`: Keplerian orbits (analytic), spin, tilt, body-fixed frames, sphere-of-influence frame selection; tested
  (periods, closure, 1e-4 m frame round trips at 1.5e11 m).
- `terrain/CraterTerrain`: airless bodies (maria, power-law craters 2 m .. 280 km, regolith), used for the Moon and a rust-coloured second planet "Ares".
  `mod/client/Bodies` renders them with their own selectors / mesh caches; sun disc, day/night from the simulation clock, bodies occlude stars.
- Benchmark results (RTX 2060): lap at 4,000 km/s, 50 km above ground, cold cache: 10.1 s, 0 hole frames, p99 21-30 ms, patch-weighted
  fallback share 21 % (coarser parent shown for a few frames while children stream); Moon descent 2,000 km -> 2 m with 0 holes.
- Speed levers: curved (orbit-like) prediction, priority queue by time-to-visibility, up to 8 mesh workers, up to 13x detail relaxation at speed.
- Manual play: P toggles planet mode; below 300 m the real-world handoff happens automatically at the spot you sink towards
  (singleplayer, planet world preset). Inertial camera frame in space (switches at 3 / 2.2 planet radii).
- Not done: landing on the Moon/Ares with real blocks (no chunk generator for them yet), spacecraft, multiplayer protocol,
  GPU-driven culling, ray tracing.

## 11. The Moon with real blocks (measured, RTX 2060)
- One dimension, several bodies: each body owns a region of the vanilla plane (`planet/BodyPlane`): Earth |x| <= 1.6e7, Moon around x = +2.2e7
  (both inside the +-3e7 world border; a Mars-sized third body does not fit, so "Ares" is a mesh only).
- The same `PlanetChunkGenerator` fills Moon chunks from `CraterTerrain` (regolith: andesite / tuff / blackstone by albedo, no water, `The Void` biome:
  no vegetation, no mobs). Moon relief is scaled by 0.15 (`BodyTerrain.RELIEF`) and block Y uses `VerticalMap.toBlockYAirless`.
- Handoff works for any body (`PlanetClient.handoff(body, ...)`); Moon gravity = 1.62 / 9.81 of vanilla (attribute `GRAVITY`).
- Free flight near a body uses that body's fixed frame with swept collision against its terrain (`moonFixed`).
- Benchmark (autotest): Earth 20,000 km -> 2 m, orbit tour, lap at 4,000 km/s, Moon 2,000 km -> 2 m through the real Moon chunks (25/25 chunks, no hole frames),
  back to Earth: transit 0 holes, stream latency p50 13 ms.
- Known limits: Moon craters deeper than ~450 m are not representable; the real chunks are lit by a day time derived from the star system sun at the landing site (`syncDayTime`; verified by the benchmark shots `bubble_daysync_night` and `_day`: half a spin turns the real chunks dark and back; the other shots keep noon); the Moon sky is the planet
  pass (stars + sun disc), vanilla sky/clouds are hidden; no Earth-sky transition on the Moon (Earth is drawn by the home renderer).

## 12. Planetary clouds
- Drawn inside the analytic atmosphere pass (`PlanetShaders`): a thin shell at 4 km altitude, ray-intersected per pixel, density = domain-warped value-noise fbm
  (5-9 octaves, more when closer), latitude bands (wet equator / dry subtropics), drift from the simulation clock.
- Lighting: sun elevation at the cloud point, one-tap self-shadow towards the sun, reddened light near the terminator. Clouds hide ground and stars behind them.
- Not volumetric: no cloud shadows on the ground, no flying through clouds (vanilla clouds still show inside the bubble). Toggle: `GlPlanetRenderer.cloudsOn`.

## 13. Persistence and edit sync (compiled, not yet exercised in the benchmark)
- `PlanetPersistence`: `planetary_edits.bin` in the world folder (varint format of `ModificationDatabase`, atomic write, saved on level save and server stop,
  only when the database changed; a corrupt file is logged and ignored, never overwritten blindly).
- `PlanetSync` (NeoForge payloads, optional so vanilla clients can still join): full snapshot on join, then batches of changed columns (<= 4096 per tick).
  Dedicated server only; singleplayer shares the same database instance. Still missing: a dedicated-server test run, per-player interest filtering, block-level sync
  (the vanilla chunk protocol carries blocks inside the bubble), and `PlanetStatePacket` use for out-of-bubble players.

## 14. Rivers at coarse LOD, and why GPU-driven culling is deferred (measured)
- Rivers thinner than a mesh cell are drawn as an area-conserving faint tint, glossy only when they cover the cell (`riverTint`); before, they became cell-sized blue
  dots with glints at 200-2000 km. Screenshots `alt_*` of the benchmark show clean river lines from ~20 km down.
- Phase 13 (GPU-driven culling, Hi-Z, indirect draws): the benchmark shows <= ~370 drawn patches (<= ~4000 resident), selection 0.03-0.3 ms on the CPU, frame time avg 8.7 ms
  with p99 14 ms at 4000 km/s. CPU culling is not the limiter at this scale, so the extra complexity is not justified yet; revisit if patch counts grow ~10x (denser
  grids, many bodies, vegetation instancing). Hole frames stay at 0.

## 15. Spacecraft mode (Phase 12, first part)
- `physics/Gravity`: N-body acceleration for a test particle in the home body's non-rotating frame (direct attraction + tidal terms of Moon/Sun) and a symplectic
  leapfrog step with thrust. Unit test: 10 revolutions of a 400 km circular orbit keep the radius within 50 m; Moon/Sun perturbation is tidal-small.
- In game: key N (in space, inertial frame) switches to Newtonian flight: WASD/Space/Shift thrust (50 m/s^2, Ctrl x20), gravity bends the path, swept collision stops at the
  ground (inelastic), the HUD shows speed and Pe/Ap. Compiled, NOT exercised by the benchmark yet; no atmosphere drag, no fuel, no vehicle entity/model.

## 16. LOD continuity, bubble chart, free-flight camera (user feedback round)
- **Geomorph = the parent.** A child patch's morph target is now the PARENT's geometry and colour (even vertices re-sampled with the parent's cell, odd ones interpolated),
  not the child's own coarser grid: before, children differed from the parent they replaced by up to 38 m in height and a full colour step (octave fade, river tint and water flag
  depend on the cell size), which showed as a pop on every LOD switch. Test `GeomorphContinuityTest`: morphed child == parent within 4 cm / 0 colour. Colours are 8 bit, vertex 32 bytes.
- **Bubble chart.** The vanilla plane is not isometric to the sphere (up to ~20% stretch, anisotropic, worst near cube edges), and the generator evaluates the terrain at
  `PlaneUnwrap.inverse(x, z)`. A 1:1 tangent plane drifted from the real terrain: median 20 m at 200 m, 85 m at 1 km, 265 m at 3 km from the anchor (680 m near cube edges), i.e. the planet backdrop and the
  real chunks showed different terrain with height differences up to 24-100 m. `BubbleFrame` now uses the exact first-order chart (Jacobian of the generator's mapping); the backdrop is drawn through
  its inverse so it coincides with the real chunks, culling uses a widened frustum. Test `BubbleMismatchTest`: drift at 3 km < 1 m everywhere, including 10 km from a cube edge.
- **Landing next to cube edges.** Anchors were refused within 300 km of a cube edge (|u| > 0.97), so there the player never got real chunks (stayed in the planet mesh). The chart makes this safe up to |u| < 0.998.
- **Fly camera.** Free flight is a 6-DoF camera (`camera/FlyCamera`, tested): mouse yaw/pitch about the camera's own axes, Z/C roll, no pitch clamp, no auto-level; orientation is kept in the current
  frame's axes so it never jumps when the frame switches (inertial <-> planet-fixed <-> Moon-fixed). The vanilla camera is used only inside the bubble. The benchmark still scripts the vanilla camera (unchanged path).
- **Not yet done:** 22% of land is above 1000 m (12% above 2000 m, 4% above 4000 m), where the real world's vertical map compresses heights (build limit Y 1280): the planet is
  more mountainous than Earth and the real chunks flatten its high peaks. Candidates: lower the relief and/or raise the dimension height.

- **Measured after these changes** (commit 841ef95, run on a 3440x1440 window, i.e. ~3.7x the pixels of the 1280x720 baseline, so more patches and slower streaming than the older numbers): 0 hole frames in
  transit and lap, real chunks equal the planet function (FIDELITY 100%), mesh build 3.4 ms per 32x32 patch (+~26% from the parent sampling). Compare runs only at the same resolution.
