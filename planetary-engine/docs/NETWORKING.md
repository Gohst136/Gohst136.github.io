# Networking design (Phase 11) — what is built, what is not

## Principles (from the master prompt)
1. The distant world is a *prediction*; the server is the only authority. Clients never write gameplay state from predicted data.
2. High-speed travel must not force chunk streaming along the path: visual planet streaming is client-local and deterministic
   (seed + generator version), the server only streams real chunks inside each player's simulation bubble.
3. Vanilla entity packets (int deltas, +-8 blocks per tick) cannot express planetary speeds: a separate channel carries state.

## Built (pure Java, tested in `:core`)
- `net/PlanetStatePacket`: 44-byte fixed packet: body id, frame flags (inertial / in bubble / on ground), 64-bit fixed-point position
  (1/1024 m, +-9e15 m), float velocity, tick. `plausibleAfter(...)` is the server's anti-teleport check (acceleration bound per regime).
- `world/ModificationDatabase`: CurrentWorld = Procedural(seed) + sparse edits. Region = 32x32 columns; block deltas and per-column surface
  heights; varint serialisation (about 5.5 bytes per random edit, far less for structured edits); deterministic bytes (hashable/diffable).
- `terrain/ModifiedTerrain`: far meshes ignore edits below `editCell` resolution (no rebuilds for small edits), fine meshes show modified
  columns, blended over a factor of 4 in cell size.
- Planet identity is only (generator version, planet seed): the client reconstructs the far field without receiving it.

## Protocol sketch (not wired into NeoForge payloads yet)
| Direction | Message | Content |
|---|---|---|
| S -> C | `PlanetHello` | generator version, planet seed, star system definition hash |
| C -> S | `FlightIntent` | desired velocity / thrust in the current frame, camera orientation (never a position) |
| S -> C | `PlanetState` (every tick, others at a lower rate by distance) | `PlanetStatePacket` per relevant player |
| S -> C | `ColumnTops` | modified surface heights of columns near the player (feeds `ModificationDatabase` on the client) |
| S -> C | vanilla chunks | only inside the bubble, driven by the server-side player position as usual |

Server-authoritative correction: when real chunk data arrives for a region where the client predicted the surface from the procedural
function, the client compares (heights are cheap) and, if they differ, writes the server's column tops into its local
`ModificationDatabase`; `ModifiedTerrain` then morphs the mesh over the blend range; no pop, no authority given to the client.

## Open (honest list)
- NeoForge `CustomPacketPayload` wiring, handshake and version check; dedicated-server test (the benchmark only covers the integrated server).
- Server-side flight simulation of high-speed regimes (the free-flight camera is client-only today).
- Interest management by planet/body (who needs whose state), bandwidth budget per player.
- Persistence of the database in the world save (region files) and merging when two servers edit the same planet.
