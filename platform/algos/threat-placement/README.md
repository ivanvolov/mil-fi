# threat-placement/

Spawns simulated threats from real-world Shahed launch corridors. Feeds the Threat Simulator dialog and the simulator overlay layer — this is a **demo / sandbox generator**, not production sensor ingest.

## What we optimize for

Realistic-looking Shahed inbounds for operator training and demos. Concretely:

- **Origins** are the five recognizable Shahed launch corridors against western/central Ukraine, hard-coded with real coordinates: Kherson-1 (Hola Prystan), Kherson-2 (S of Nova Kakhovka), Belgorod (RU), Bryansk (Klimovo, RU), Kursk (Sudzha, RU). See `threat-sim-presets.ts`.
- **Target picks** — the caller specifies a target sector (center + bearing range + distance range). `randomContactInSector` samples a target inside that sector uniformly, then draws a threat contact origin from the presets and returns a threat spec with position, heading, and speed range appropriate for a Shahed-family variant.
- **Deterministic-per-seed** when needed — the presets themselves are stable; the sector sampler uses `Math.random()` today (upgrade to a seeded PRNG if reproducibility becomes a requirement).

## Files

- `threat-sim.ts` — geometry helpers (`offsetMeters`, `piePolygonPoints`, `randomContactInSector`).
- `threat-sim-presets.ts` — the five launch presets with real lat/lng coordinates.

## Not what this does

- It doesn't ingest real sensor tracks. The app has no sensor-ingest path today.
- It doesn't model the acoustic-node ±5° uncertainty that the mockup dossier describes. That uncertainty is baked into the rendered visuals, not into this spawner.
