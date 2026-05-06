#!/usr/bin/env bash
# Run on the VPS as the `scheduler` user inside /srv/scheduler.
# Pulls latest code, rebuilds backend + frontend, runs migrations, restarts API.
set -euo pipefail

cd /srv/scheduler

echo "==> git pull"
git pull --ff-only

echo "==> pnpm install"
pnpm install --frozen-lockfile

echo "==> backend build"
pnpm --filter @scheduler/backend build

echo "==> db migrate"
pnpm --filter @scheduler/backend db:migrate

echo "==> frontend build"
pnpm --filter @scheduler/frontend build

echo "==> restart api"
sudo systemctl restart scheduler-api

echo "==> reload caddy"
sudo systemctl reload caddy

echo "Done."
