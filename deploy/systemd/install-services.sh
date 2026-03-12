#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
UNIT_DIR="/etc/systemd/system"
APP_USER="${SUDO_USER:-$USER}"
ENV_DEST="/etc/default/lab-inventory"
ENV_TEMPLATE="$ROOT_DIR/deploy/systemd/lab-inventory.env.example"

if [[ ! -f "$ENV_DEST" ]]; then
  cat <<MSG
Missing config: ${ENV_DEST}

Create it manually first (example):
  sudo cp "${ENV_TEMPLATE}" "${ENV_DEST}"
  sudo sed -i "s#__REPO_DIR__#${ROOT_DIR}#g" "${ENV_DEST}"
  sudo vi "${ENV_DEST}"
MSG
  exit 1
fi

for unit in lab-inventory-api.service lab-inventory-web.service; do
  src="$ROOT_DIR/deploy/systemd/$unit"
  tmp="/tmp/$unit"
  sed "s/__APP_USER__/${APP_USER}/g" "$src" > "$tmp"
  sudo cp "$tmp" "$UNIT_DIR/$unit"
  rm -f "$tmp"
done

sudo systemctl daemon-reload
sudo systemctl enable lab-inventory-api.service lab-inventory-web.service

cat <<MSG
Installed systemd units with app user: ${APP_USER}
Config file:
  ${ENV_DEST}

If you moved the repo, edit REPO_DIR in ${ENV_DEST}.

Next:
  sudo systemctl start lab-inventory-api.service
  sudo systemctl start lab-inventory-web.service

Check status:
  systemctl status lab-inventory-api.service --no-pager
  systemctl status lab-inventory-web.service --no-pager

Logs:
  journalctl -u lab-inventory-api.service -f
  journalctl -u lab-inventory-web.service -f
MSG
