#!/usr/bin/env bash
set -euo pipefail
kdca_repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
[[ "$EUID" -ne 0 ]] || { echo 'sudo 없이 실행하세요.' >&2; exit 1; }
[[ "$(ps -p 1 -o comm=)" == systemd ]] || { echo 'WSL systemd 활성화가 필요합니다.' >&2; exit 1; }
python3 "$kdca_repo/scripts/pc/configure.py"
sudo install -m 644 "$HOME/.config/kdca-press/units/kdca-press.service" /etc/systemd/system/kdca-press.service
sudo install -m 644 "$HOME/.config/kdca-press/units/kdca-press-tunnel.service" /etc/systemd/system/kdca-press-tunnel.service
sudo systemctl daemon-reload
sudo systemctl enable kdca-press.service kdca-press-tunnel.service
sudo systemctl restart kdca-press.service kdca-press-tunnel.service
# systemctl reports started before Node finishes opening its listening socket.
for kdca_attempt in {1..15}; do
  if curl --fail --silent --max-time 2 http://127.0.0.1:3000/healthz >/dev/null; then break; fi
  sleep 1
done
python3 "$kdca_repo/scripts/pc/doctor.py"
