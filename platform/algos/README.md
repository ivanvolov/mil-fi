# algos/

Three algorithms — one folder each. Every folder has a `README.md` that says what it optimizes for; the source files live alongside. Imports from the app go through the `@algos/*` alias (declared in `client/vite.config.ts` and every `tsconfig.json`).

- [`orchestration/`](./orchestration/) — assigns launchers to threats. One entry point: the "Orchestrate all" button, backed by `allocate()` (greedy k-pass weapon-target assignment + separate MFG dwell pass). What we optimize for: the closest still-unassigned feasible launcher per threat, with backup passes up to `DEFAULT_REDUNDANCY`. Roadmap to Pk-based WTA is in that folder's README.
- [`placement/`](./placement/) — plans launcher + crew + thread positions given a factory location, NPZ polygons, and a mixed weapon inventory. What we optimize for: maximum coverage area over the sector disk, subject to NPZs, with a factory-centered command crew, field crews at ring centroids, and MFG point-defense clustered around the factory.
- [`threat-placement/`](./threat-placement/) — spawns simulated threats from real launch corridors (Kherson-1/2, Belgorod, Bryansk, Kursk) with a target-sector randomizer. What we optimize for: realistic-looking Shahed inbounds for demo / sandbox use — not production ingest.

Non-algo helpers used by these files live in `shared/distance.ts` (`@shared/distance`). The kinematic `intercept.ts` solver stays in `client/src/lib/` because only the dev `SandboxPage` uses it — it isn't one of the three product algorithms.
