# Planetary Engine — Architecture & Phase 1 status

## 0. Starting-task findings (honest)
- The repo this was started in (`Gohst136.github.io`) is a static web site; **no NeoForge project existed**, so this
  is a fresh scaffold in `planetary-engine/`. Nothing about existing Minecraft/NeoForge code could be inspected.
- Environment: Java 21 + Gradle, **no Minecraft client/GPU/display**, and `maven.neoforged.net` was unreachable.
  Therefore: `:core` (pure Java) is compiled and unit-tested; `:mod` (NeoForge glue) is **written but never compiled**
  (enable with `gradle -PwithMod=true`). No rendering has been run or measured.

## 1. Module split
| Module | Depends on | Contents | Status |
|---|---|---|---|
| `core` | JDK only | coords, cube-sphere, terrain sampler, quadtree SSE selector, mesh builder, telemetry, `RenderBackend` interface | built + 10 tests passing |
| `mod`  | NeoForge 1.21.1, `core` | entry point; later: GL backend, render hooks, networking, commands | scaffold only, uncompiled |

Pure Java (headless-testable): coordinates, floating origin, planet data, terrain/worldgen sampling, LOD selection,
mesh generation, streaming scheduler, prediction, collision math, telemetry.
Needs GPU/render work: buffer upload, shaders (geomorph, atmosphere), indirect draw/culling, Hi-Z, debug draw.

## 2. Vanilla assumptions to bypass (to be verified against the real 1.21.1 sources once the mod compiles)
- Entity/camera positions are `double` and chunk coords are `int`: universe position lives in `UniversePos`; vanilla
  only ever sees a planet-local, origin-near coordinate inside the simulation bubble.
- Chunk loading is driven by `ChunkMap`/view distance and 384-high columns: bubble chunks are real; the planet surface
  outside it is never chunked. A flat vanilla bubble on a sphere needs a local tangent-plane frame (Phase 6).
- `LevelRenderer` far clip / fog / sky: far-plane + sky replaced at `RenderLevelStageEvent`; no mixin planned for Phase 2.
- Movement speed clamps / `Player` tick collision: Phase 8 (swept collision, own integrator outside the bubble).
- Packet position encoding (`ClientboundMoveEntity`, int-delta limits): Phase 11, separate visual-position channel.

## 3. Package layout (`dev.gohst136.planetary`)
`math`, `coord` (UniversePos, FloatingOrigin), `planet` (PlanetDefinition, CubeSphere), `terrain` (TerrainSampler,
ProceduralTerrain), `lod` (PatchKey, PatchBounds, CameraView, QuadtreeSelector), `mesh` (PatchMeshBuilder, PatchMesh),
`render` (RenderBackend), `telemetry` (FrameStats). Planned: `stream`, `physics`, `net`, `compat`, `debug`.

## 4. What Phase 1 implements (and how)
- **Coordinates**: 64-bit sector index + double offset (2^20 m sectors); exact-ish relative math at 1e15+ m. Floating origin with block-snapped rebasing.
- **Planet**: data record; cube sphere with equal-angle warp; edges shared exactly between faces.
- **Terrain**: seeded 3D value-noise fBm on the unit sphere (no seams/pole pinch), deterministic; exposes `unresolvedDetail(cell)` for error.
- **Selection**: per face quadtree; screen-space error `eps(c)=unresolved(c)+c²/8R`, projected by `H/(2 d tan(fov/2))`;
  horizon + frustum culling; split at `T`, merge below `T*0.6` (hysteresis); velocity relaxation; adaptive budget feedback.
- **Mesh**: (N+1)² grid, skirt, per-vertex geomorph target (parent grid position) for GPU morphing, patch-relative float vertices.
- **Telemetry**: frame-time avg/median/p95/p99/worst.

### Measured (CPU only, headless, this container; `DescentBenchmarkTest`)
20,000 km → 2 m descent, 1167 frames at 60 Hz timestep, 70° FOV, 1080p, 0.75 px threshold: refines to level 19 (~1 m cells),
max 45 patches (straight-down view), 0 merges (no flicker), selection ≈0.1 ms avg / 0.9 ms p99. Horizon view at 1 km: 60 patches.
These counts say the *selection* is cheap; they say nothing about GPU cost, streaming, or visual quality.

## 5. Known gaps / risks (ordered)
1. **Patch bounds are heuristic** (sampled min/max + margin). A mountain between samples can poke outside → wrong culling/LOD. Fix: hierarchical conservative min/max (Phase 3).
2. **Low patch counts partly reflect smooth terrain**: real vanilla-like terrain has far more high-frequency energy; error model must be calibrated against real worldgen.
3. **LOD cracks**: only skirts + geomorph data exist; no 2:1 neighbour constraint, no shader yet.
4. **Float vertex precision** is fine patch-relative; per-patch double camera offsets must be done by the backend.
5. **Vanilla bubble ↔ sphere**: flat chunk grid vs. curved surface — the hardest visual problem (Phase 6). Needs a curvature warp that stays crack-free.
6. **Vanilla worldgen sampling** cost/determinism (noise router, biome source) at coarse levels is unexplored.
7. **Multiplayer**: client prediction must never touch authoritative state; protocol undesigned.
8. Mod module uncompiled; NeoForge/ModDevGradle versions (`21.1.172`, `2.0.78`) are unverified guesses.

## 6. Phase 1 → 2 task list
1. Compile `:mod` where NeoForge maven is reachable; pin real versions.
2. GL backend: upload `PatchMesh`, draw with per-patch double→float camera offset (hook `RenderLevelStageEvent`).
3. Geomorph vertex shader fed by morph factor from the same SSE; atmosphere-less planet shading (Phase 2).
4. Debug overlay: patch bounds/levels/SSE, `FrameStats`, floating-origin state.
5. Worker pool + bounded queues for mesh jobs; upload budget per frame.
6. Replace heuristic bounds; add neighbour-level constraint.

Run tests: `cd planetary-engine && gradle :core:test`
