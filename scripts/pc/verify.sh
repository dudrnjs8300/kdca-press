#!/usr/bin/env bash
set -euo pipefail
kdca_repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
kdca_node="$(python3 -c 'import json,pathlib; print(json.loads((pathlib.Path.home()/".config/kdca-press/runtime.json").read_text())["node"])')"
exec "$kdca_node" "$kdca_repo/scripts/verify-pc.js"
