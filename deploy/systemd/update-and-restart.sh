#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/opt/lab-inventory"
BRANCH="main"

cd "$REPO_DIR"

echo "[1/6] Fetch latest"
git fetch origin "$BRANCH"

echo "[2/6] Pull latest"
git pull --ff-only origin "$BRANCH"

echo "[3/6] Install API deps"
cd "$REPO_DIR/apps/api"
npm install

echo "[4/6] Install Web deps"
cd "$REPO_DIR/apps/web"
npm install

echo "[5/6] Apply prisma migrations"
cd "$REPO_DIR/apps/api"
npx prisma migrate deploy

echo "[6/6] Restart services"
sudo systemctl restart lab-inventory-api.service
sudo systemctl restart lab-inventory-web.service

cat <<MSG
Done.

Status:
  systemctl status lab-inventory-api.service --no-pager
  systemctl status lab-inventory-web.service --no-pager

Logs:
  journalctl -u lab-inventory-api.service -n 80 --no-pager
  journalctl -u lab-inventory-web.service -n 80 --no-pager
MSG
