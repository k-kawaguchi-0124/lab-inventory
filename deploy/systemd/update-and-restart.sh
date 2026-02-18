#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
if [[ -f /etc/default/lab-inventory ]]; then
  # shellcheck disable=SC1091
  source /etc/default/lab-inventory
fi

REPO_DIR="${REPO_DIR:-$ROOT_DIR}"
BRANCH="${BRANCH:-main}"
API_SERVICE="${API_SERVICE:-lab-inventory-api.service}"
WEB_SERVICE="${WEB_SERVICE:-lab-inventory-web.service}"

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
sudo systemctl restart "$API_SERVICE"
sudo systemctl restart "$WEB_SERVICE"

cat <<MSG
Done.

Status:
  systemctl status ${API_SERVICE} --no-pager
  systemctl status ${WEB_SERVICE} --no-pager

Logs:
  journalctl -u ${API_SERVICE} -n 80 --no-pager
  journalctl -u ${WEB_SERVICE} -n 80 --no-pager
MSG
