# orchestration-app

Air-defense orchestration sim. MongoDB-backed React app for placing, editing, and assigning interceptors / threats / crews on per-layer scenarios.

## Layout

```
orchestration-app/
├─ algos/                      the three algorithms (orchestration, placement, threat-placement) — see algos/README.md
├─ shared/                     zod schemas + TS types + distance util shared by client, server, algos
├─ server/                     Node + Fastify + MongoDB (TypeScript, tsx in dev)
├─ client/                     React + Vite + TypeScript + react-leaflet
├─ mockup/                     frozen legacy HTML mockup (reference + JSON-export escape hatch)
├─ Makefile                    single operator entrypoint (make dev, make build, etc.)
└─ local.pointer.md            where domain research lives on disk (droneBox artifacts)
```

## Where the research lives

Domain source material (envelope numbers, sensor uncertainty, Shahed variant tables, original mockup spec) is **not in this repo**. It lives at:

```
/Users/ivanvolovik/p🗂️/Carcas/projects/droneBox/artifacts/orchestration-app/
```

Read `local.pointer.md` at the repo root for the full convention. Short version: any file named `local.pointer.md` in a project points via YAML frontmatter to an absolute local directory that holds material the project depends on. It parallels `github.pointer.md` (which points at a git URL). Both are documentation, not auto-materialized.

## Run (dev) — one command

```sh
make dev
```

That installs `server/` and `client/` deps on first run, boots Fastify on `:3001`, Vite on `:5173`, and stops both cleanly with `Ctrl+C`. The `.env` file ships with the homelab Mongo URI baked in (so `make dev` works out of the box; replace `MONGODB_URI` in `.env` if you want a different cluster). Run `make help` for the full target list.

**First run only — generate invite codes:**

```sh
cd server && npm run seed:invites
```

This prints 10 codes to your terminal (and only the terminal — nothing is written to disk in this repo). Pass `--force` to wipe + regenerate.

Then open `http://localhost:5173/` → you'll land on `/login`. Paste any code, you're in.

### Manual (two terminals) if you prefer

```sh
# terminal 1
cd server && npm install && npm run dev

# terminal 2
cd client && npm install && npm run dev
```

The Vite dev server proxies `/api/*` to Fastify, so the client uses the same origin.

## Verifying the seed

```sh
curl -s http://localhost:3001/api/v1/layers/vzil-1/full | jq '{
  interceptors: (.interceptors | length),
  teams: (.teams | length),
  threats: (.threats | length),
  threads: (.threads | length),
  drawings: (.drawings | length),
  interceptorTypes: (.types.interceptor | length),
  threatTypes: (.types.threat | length)
}'
```

Expected: `12 / 3 / 2 / 16 / 1 / 7 / 1`.

## Architecture notes

- **8 Mongo collections:** `interceptor_types`, `threat_types` (global) + `layers`, `interceptors`, `threats`, `teams`, `threads`, `drawings` (layer-scoped via `layerId`).
- **Type vs instance split:** envelopes / categories / `requiresCrew` / default loadout live on **types** — shared across all layers, edits propagate. Positions / current ammo / crew assignments live on **instances** — layer-scoped, edit one without touching others.
- **Threads** are first-class docs (`teamId`, `interceptorId`, `kind: 'primary' | 'override'`). Elite crews use `kind: 'override'`, which the map renders as a dashed line.
- **Optimistic concurrency:** every doc has a monotonic `version` field. Mutations require `If-Match: <version>`; a mismatch returns `409 STALE` and the client refetches.
- **Type-edit gating:** PATCH on a type takes `{ patch, expectedAffectedCount }`. Server re-counts referencing instances and returns `409 AFFECTED_COUNT_CHANGED` if the dialog's count is stale. The client shows a confirmation dialog with the live count before sending.
- **Soft delete** with `deletedAt`. Cascade on layer / team / interceptor delete. Hard-delete is never exposed.
- **Mongo transactions** are used for cascades; the cluster must run as a replica set (Atlas already does).
- **Audit:** every mutation logs `X-Operator: <name>` header as `updatedBy` on the touched doc. No auth yet.

## Key UX

- **Topbar:** layer switcher (Radix Select) + clone button + visibility toggles (Threats / Launchers / Crews / Controls / Envelopes / Edit) + types-catalog link + center coords.
- **Left rail:** accordions for threats / crews / launchers with hover plus-buttons. Plus on a launcher → assign-crew popover. Plus on a crew → multi-add launchers popover.
- **Map:** per-interceptor envelope rings (cyan = interceptor, amber = MFG, purple = MANPADS). T-1 threat geometry: past path (solid yellow), predicted cruise (dashed yellow), attack (dashed red), uncertainty rectangle (orange), detonation circle (red). T-2 passing line (yellow). Brick-hatched no-fly polygon.
- **Right inspector:** read-only summary of the selected entity, with an **Edit** button that opens the form dialog.
- **Edit dialogs:** two columns. Left = instance fields (position, ammo, code, site). Right = type fields (read-only by default, "Edit type…" reveals the form, "Save type (affects N)" gates through a confirmation dialog).
- **Edit mode toggle** in the topbar enables draggable map markers and threat-waypoint edit handles (handles render only for the selected threat to keep the map clean).
- **Crew-required indicator:** any interceptor whose type has `requiresCrew=true` and zero threads gets a `NO CREW · NOT OPERATIONAL` chip in the map marker, left rail, and inspector. MFG types (`requiresCrew=false`) never show it.

## Phased delivery (what was built)

- **Phase 0** — JSON export button on the legacy mockup as an escape hatch.
- **Phase 1** — backend skeleton, 8 collections, indexes, seed of VZIL 1 from the mockup data.
- **Phase 2** — React skeleton, read-only render visually identical to the mockup.
- **Phase 3** — full CRUD endpoints, optimistic concurrency, drag-to-persist for interceptors / teams / threats.
- **Phase 4** — instance/type edit dialogs with affected-count confirmation.
- **Phase 5** — layer switcher, clone-layer button, plus-button popovers, crew-required indicators.
- **Phase 6** — read-only types catalog at `/types`. (Type create-from-scratch is a follow-up; type edits happen via the per-instance edit dialog today.)
- **Phase 7** — README, cleanup.

## Algorithms

Three: **orchestration** (assigns launchers to threats), **placement** (plans launcher + crew positions), **threat-placement** (spawns simulated threats). Each lives in `algos/<name>/` with its own `README.md` explaining what it optimizes for. Start at [`algos/README.md`](./algos/README.md).

## Authentication

Invite-code → server-side session, stored in Mongo. Built for ~4 trusted users, not for the open web.

- **Codes**: 20 random digits, displayed as `XXXX-XXXX-XXXX-XXXX-XXXX`. ~10²⁰ entropy → uncrackable for any realistic attacker; rate limiting on `/auth/login` (10 attempts / 5 min / IP) is belt-and-braces.
- **Reusable**: each code stays valid until you revoke it. Same person logs in from a new device with the same code. You don't need to issue new codes after a week or month — only when you rotate or revoke.
- **Sessions**: 30-day sliding TTL. Every API call extends `expiresAt` by 30 days, so active users never re-login. After 30 days of inactivity, MongoDB's TTL index auto-deletes the session row and they paste their (still valid) code again.
- **Cookie**: `hoc_sid`, HTTP-only, signed with `SESSION_SECRET`, `SameSite=Lax`, `Secure` in production.
- **Audit**: the session label (`user-1`, `user-2`, …) becomes the `updatedBy` field on every mutation — replaces the old client-sent `X-Operator` header.

### Generating codes

```sh
cd server && npm run seed:invites              # first time
cd server && npm run seed:invites -- --force   # wipe + regenerate (also kills active sessions)
```

Codes are printed to stdout only. **They are not stored in this repo.** Copy them out of the terminal and DM them to your users (Signal/Telegram is fine).

### Revoking a user

In `mongosh`:

```js
db.invites.updateOne({ _id: "20-digit-code-no-dashes" }, { $set: { revoked: true } });
db.sessions.deleteMany({ code: "20-digit-code-no-dashes" });
```

That user is locked out immediately. Others are unaffected.

## Deploy to Render

Single Web Service. The Fastify process serves both the API and the built React app from the same origin (no CORS, no gateway).

1. **Push the repo to GitHub** (private — even though no secrets are committed, live invite codes pass through Render logs).
2. **In the Render dashboard**: New → Blueprint → connect this repo. Render reads `render.yaml` and provisions the two Web Services (`hoc-orchestration` + `hoc-orchestration-staging`).
3. **Set the secret env vars** on each service in the Render dashboard (they're declared `sync: false` in `render.yaml`): `MONGODB_URI`, `SESSION_SECRET`, and optionally `OPENAI_API_KEY`, `RENDER_WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — see below.
4. **Wait for the first deploy**. `npm run build:all` builds both apps; `npm start` boots Fastify (serving `client/dist` as static + `/api/v1/*` as the API).
5. **Open Render Shell** on the service and run:

   ```sh
   npm run seed:invites
   ```

   Copy the 10 codes. DM one to each person along with the `https://<your-service>.onrender.com` URL.

### Secrets — plain env vars

All secrets are plain environment variables — no secret manager. `render.yaml` declares them per service with `sync: false`, so their values live only in the Render dashboard:

- `MONGODB_URI` — required
- `SESSION_SECRET` — required in production, ≥ 32 chars
- `OPENAI_API_KEY` — optional (feature flag for Manage Assets AI panel)
- `RENDER_WEBHOOK_SECRET` — optional (see next section)
- `TELEGRAM_BOT_TOKEN` — optional (see next section)
- `TELEGRAM_CHAT_ID` — optional (see next section)

**Local dev** — the same keys come from the single `.env` at the repo root (`MilFi/.env`), shared by all apps in this repo. `server/src/config.ts` loads it CWD-independently (path resolved relative to the source file). Real environment variables always win over the `.env` file. To set up: copy `platform/.env.example` to the repo root as `.env` and fill in the values.

### Local prod-mode smoke test

To replicate the Render setup locally (one port, no Vite dev server):

```sh
make prod-smoke
# → visit http://localhost:3001
```

### Deploy notifications to Telegram

Fastify exposes `POST /api/v1/hooks/render` — an HMAC-verified receiver for Render's deploy webhooks that reposts to a Telegram chat. Set three env vars on each Render service to enable it:

- `RENDER_WEBHOOK_SECRET` — from Render dashboard → Notifications → Add Webhook
- `TELEGRAM_BOT_TOKEN` — from @BotFather
- `TELEGRAM_CHAT_ID` — the numeric id of the chat/channel the bot posts to

Missing any of the three = notifier no-ops (endpoint still returns 200). Point Render's webhook at `https://<your-service>.onrender.com/api/v1/hooks/render`. See `server/src/routes/hooks.ts` for the message format.

## Out of scope for v1

- Real-time multi-user sync — single-operator use only. Add SSE later if needed.
- `mockup/screen-2.html` scenario gallery — not ported.
- Polygon vertex drag-edit for drawings — drawings edit via form in v1.
- Standalone type creation (no instance needed) — currently you create a type by editing an existing one.

## Escape hatch

`mockup/screen-1.html` keeps its compact-icon download button — click the down-arrow in the topbar (next to the copy-positions clipboard icon) to dump `{ launchers, crews, threats, noFlyCoords }` as a JSON file. Useful if the new app regresses on data shape.
