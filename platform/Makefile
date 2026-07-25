.PHONY: help dev install build prod-smoke seed-invites seed-invites-force backup-layers refresh-db clean

PORT ?= 3001

# The default target: `make` on its own prints the target list.
help:
	@echo 'HOC orchestration · Makefile targets'
	@echo ''
	@echo '  make dev                — server (tsx watch :3001) + client (Vite HMR :5173)'
	@echo '  make install            — install root, server, and client deps'
	@echo '  make build              — production build of server and client'
	@echo '  make prod-smoke         — local prod-mode replay (client build → Fastify serves it)'
	@echo '  make seed-invites       — first-time invite-code seed (prints codes to stdout)'
	@echo '  make seed-invites-force — wipe + regenerate invite codes (kills active sessions)'
	@echo '  make backup-layers      — snapshot every layer to backups/<date>/'
	@echo '  make refresh-db         — copy prod DB into local dev DB (MONGODB_DB=*-dev)'
	@echo '  make clean              — remove client/dist, server/dist, and node_modules trees'

install:
	npm install
	npm --prefix server install
	npm --prefix client install

# Boot server + client together. Both hot-reload on save. Ctrl+C stops both.
# The `trap` line kills the whole process group so npm's forked tsx/vite die too.
dev:
	@[ -d server/node_modules ] || (echo '→ installing server deps'; cd server && npm install)
	@[ -d client/node_modules ] || (echo '→ installing client deps'; cd client && npm install)
	@printf '%s\n' \
	  '─────────────────────────────────────────────────────────────' \
	  '  HOC orchestration · dev mode' \
	  '  ─────────────────────────────────────────────────────' \
	  '  server   http://localhost:$(PORT)          (tsx watch — restarts on .ts save)' \
	  '  client   http://localhost:5173           (Vite — HMR on .tsx / .css save)' \
	  '  catalog  http://localhost:5173/types' \
	  '  ─────────────────────────────────────────────────────' \
	  '  Ctrl+C to stop both.' \
	  '─────────────────────────────────────────────────────────────'
	@bash -c 'trap "kill 0" INT TERM; \
	  (cd server && npm run dev) & sleep 1; \
	  (cd client && npm run dev) & \
	  wait'

build:
	npm run build:all

# Replicate Render's runtime locally: build the client, then boot Fastify in prod-mode
# serving client/dist as static + /api/v1/* as the API. Same origin, no CORS.
prod-smoke:
	cd client && npm run build
	cd server && NODE_ENV=production SERVE_STATIC=true npm run build && npm start

seed-invites:
	npm --prefix server run seed:invites

seed-invites-force:
	npm --prefix server run seed:invites -- --force

backup-layers:
	npm --prefix server run backup:layers

# Drops the local dev DB and copies orchestration-app (prod) into it. Refuses
# to run unless MONGODB_DB ends with -staging or -dev (see server/src/scripts/
# refreshStagingDb.ts). Same script as Render staging's preDeployCommand.
refresh-db:
	npm --prefix server run refresh-db

clean:
	rm -rf client/dist server/dist client/node_modules server/node_modules node_modules
