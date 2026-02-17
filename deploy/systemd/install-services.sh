#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
UNIT_DIR="/etc/systemd/system"
APP_USER="${SUDO_USER:-$USER}"

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
