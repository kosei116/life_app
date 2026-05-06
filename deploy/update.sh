#!/usr/bin/env bash
# Run on the VPS as the `lifeapp` user inside /srv/life_app.
# Pulls latest code, rebuilds, migrates, restarts services.
set -euo pipefail

cd /srv/life_app

echo "==> git pull"
git pull --ff-only

echo "==> pnpm install"
pnpm install --frozen-lockfile

echo "==> backend builds"
pnpm --filter @scheduler/backend build
pnpm --filter @study/backend build
pnpm --filter @shift/backend build

echo "==> db migrate"
pnpm --filter @scheduler/backend db:migrate
pnpm --filter @study/backend db:migrate
pnpm --filter @shift/backend db:migrate

echo "==> frontend builds (with base path)"
VITE_BASE=/scheduler/ VITE_API_BASE=/scheduler/api \
	pnpm --filter @scheduler/frontend build
VITE_BASE=/study/ VITE_API_BASE=/study/api \
	pnpm --filter @study/frontend build
VITE_BASE=/shift/ VITE_API_BASE=/shift/api \
	pnpm --filter @shift/frontend build

echo "==> restart APIs"
sudo systemctl restart scheduler-api study-api shift-api

echo "==> reload Caddy"
sudo systemctl reload caddy

echo "Done."
