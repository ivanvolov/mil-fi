# AGENTS.md

Instructions for AI coding agents (Claude Code, Claude web, Codex, etc.) working in this repo.

## Branch model

- `main` — production. Auto-deploys to the `hoc-orchestration` Render service. **Never push here directly and never open PRs against it.**
- `staging` — pre-production. Auto-deploys to the `hoc-orchestration-staging` Render service. **Agents commit and push their work directly to `staging` — no feature branches, no pull requests.**

The user promotes `staging` → `main` manually (fast-forward merge or PR) after eyeballing the staging URL. Agents never do that step.

## Workflow

**Commit straight to `staging`. Do not create `claude/<slug>` branches or open PRs.**

1. Start every task on the latest `staging`:

   ```sh
   git fetch origin staging
   git checkout -B staging origin/staging
   ```

2. Commit your work and push it directly to `staging`:

   ```sh
   git push origin staging
   ```

   If the push is rejected because `staging` moved (another agent/operator pushed), `git pull --rebase origin staging` and push again — never force-push `staging`.

3. When the user asks you to "ship" or "deploy," it just means push to `staging`. Merging into `main` is never an agent action.

## Environments

- Both Render services are declared in a single `render.yaml` blueprint at repo root. Editing that file changes both envs; be deliberate.
- Data isolation is by Mongo DB name on the same cluster:
  - prod → `MONGODB_DB=milfy-app`
  - staging → `MONGODB_DB=milfy-app-staging`
- `MONGODB_URI` and any other real secrets are set manually per service in the Render dashboard (`sync: false` in the blueprint). Do not put secret values in `render.yaml` or `.env.example`.
- Staging data is disposable. If a schema migration needs testing, it's fine to wipe the staging DB — do not do the same for prod.

## Health check + verification

- `/api/v1/health` is the Render health probe. If a change breaks it, staging deploys go red before touching users; that's the intended safety net.
- No automated test suite yet. Before asking the user to promote staging → main:
  1. Confirm the staging deploy went green in Render.
  2. Note any manually verifiable smoke tests the user should click through.

## Render access (logs & deploys)

Claude Code cloud sessions may have `RENDER_API_KEY` in the environment (set in the Claude environment settings — never committed). When present, agents can talk to the Render REST API (`https://api.render.com/v1`, `Authorization: Bearer $RENDER_API_KEY`) to observe and manage the two services:

- Resolve a service: `GET /v1/services?name=hoc-orchestration-staging&limit=1` → `.[0].service.id` (`srv-…`) and `.[0].service.ownerId`.
- Runtime logs: `GET /v1/logs?ownerId=<ownerId>&resource=<srv-id>&limit=100` → `.logs[]` with `timestamp` + `message` (newest first).
- Deploy status: `GET /v1/services/<srv-id>/deploys?limit=10` → `.[].deploy.status` (`live`, `build_in_progress`, `build_failed`, `update_failed`, …).
- Trigger a redeploy: `POST /v1/services/<srv-id>/deploys` (empty JSON body).

Typical verification loop after pushing to `staging`: poll deploys until the new commit is `live` (or a failed status), then read the runtime logs. If `RENDER_API_KEY` is absent, ask the user rather than guessing at deploy state.

## Local dev

- Dev boot: `make dev` (Fastify on `:3001`, Vite on `:5173`, deps installed on first run). `make help` lists every target.
- Prod-mode local smoke test:

  ```sh
  cd client && npm run build
  cd ../server && NODE_ENV=production SERVE_STATIC=true npm run build && npm start
  # → http://localhost:3001
  ```

See `README.md` for full architecture and auth model. Algorithm notes live in `algos/*/README.md`.

## Related repos

- **droneBox** at `/Users/ivanvolovik/p🗂️/Carcas/projects/droneBox/` — sibling project. Domain source material for this app (envelope numbers, sensor uncertainty tables, threat-variant tables) lives under `droneBox/artifacts/orchestration-app/`. See `local.pointer.md` at the root of this repo for the full pointer.

## Data isolation & refresh

- **Prod DB:** `milfy-app` on the shared Mongo cluster.
- **Staging DB:** `milfy-app-staging` on the same cluster. **Wiped and re-copied from prod on every staging deploy** — Render's `preDeployCommand` runs `server/src/scripts/refreshStagingDb.ts` before the app starts, so every merge to `staging` produces a live copy of prod state to test against. Any manual staging edits made between deploys are lost on the next merge.
- **Local dev DB:** `milfy-app-dev` on the same cluster (set via `MONGODB_DB` in `.env`).
- **Refreshing local dev DB from prod:** run `make refresh-db` — same script as the Render staging preDeploy. Refuses to run unless the target DB name ends with `-staging` or `-dev` (never touches prod). Useful when you want to eyeball a bug reported against real prod data.
- **Prod DB is never touched by any script.** Only the UI writes to it, and only when authenticated via a valid invite-code session.
