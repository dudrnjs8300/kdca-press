#!/usr/bin/env bash
set -euo pipefail
umask 077
kdca_repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ "$EUID" -eq 0 ]]; then echo '일반 WSL 사용자로 실행하세요. 필요한 단계만 sudo를 사용합니다.' >&2; exit 1; fi
if [[ "$(ps -p 1 -o comm=)" != systemd ]]; then
  echo 'WSL systemd를 먼저 활성화하세요. docs/SELF_HOST_WSL.md의 1단계를 참고하세요.' >&2; exit 1
fi
case "$kdca_repo" in /mnt/*) echo 'Linux 홈 폴더(예: ~/kdca-press)에 저장소를 복제한 뒤 실행하세요.' >&2; exit 1;; esac
if [[ ! "$kdca_repo" =~ ^/[a-zA-Z0-9_./@-]+$ || ! "$HOME" =~ ^/[a-zA-Z0-9_./@-]+$ ]]; then
  echo '설치 경로와 Linux 홈 경로에는 공백 없이 영문·숫자·하이픈을 사용하세요.' >&2; exit 1
fi
command -v apt-get >/dev/null || { echo 'Ubuntu/Debian WSL용 설치기입니다.' >&2; exit 1; }
sudo apt-get update
sudo apt-get install -y ca-certificates curl xz-utils python3 git
python3 -c 'import sys; assert sys.version_info >= (3,10), "Python 3.10+ 필요: Ubuntu 22.04 이상을 사용하세요."'
case "$(uname -m)" in x86_64) kdca_arch=x64;; aarch64) kdca_arch=arm64;; *) echo '지원 CPU: x86_64, aarch64' >&2; exit 1;; esac
kdca_runtime="$HOME/.local/share/kdca-press/runtime"
mkdir -p "$kdca_runtime"
kdca_tmp="$(mktemp -d)"
trap 'rm -rf -- "$kdca_tmp"' EXIT
# Keep other projects' Node installations unchanged; verify the official archive.
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$kdca_tmp/SHASUMS256.txt"
kdca_archive="$(awk -v suffix="-linux-${kdca_arch}.tar.xz" '$2 ~ (suffix "$") {print $2}' "$kdca_tmp/SHASUMS256.txt")"
[[ "$kdca_archive" =~ ^node-v24\.[0-9]+\.[0-9]+-linux-(x64|arm64)\.tar\.xz$ ]] || { echo '공식 Node 24 배포 목록을 확인하지 못했습니다.' >&2; exit 1; }
kdca_version="${kdca_archive#node-}"
kdca_version="${kdca_version%%-linux-*}"
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  "https://nodejs.org/dist/$kdca_version/$kdca_archive" -o "$kdca_tmp/$kdca_archive"
(cd "$kdca_tmp" && awk -v file="$kdca_archive" '$2==file' SHASUMS256.txt | sha256sum --check --strict -)
tar -xJf "$kdca_tmp/$kdca_archive" -C "$kdca_runtime"
kdca_node_dir="$kdca_runtime/${kdca_archive%.tar.xz}"
export PATH="$kdca_node_dir/bin:$PATH"
# Signed Cloudflare APT repository; no remote shell script is executed.
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  https://pkg.cloudflare.com/cloudflare-main.gpg -o "$kdca_tmp/cloudflare-main.gpg"
sudo install -m 644 "$kdca_tmp/cloudflare-main.gpg" /usr/share/keyrings/kdca-cloudflare.gpg
printf '%s\n' 'deb [signed-by=/usr/share/keyrings/kdca-cloudflare.gpg] https://pkg.cloudflare.com/cloudflared any main' > "$kdca_tmp/cloudflared.list"
if [[ ! -f /etc/apt/sources.list.d/cloudflared.list ]]; then
  sudo install -m 644 "$kdca_tmp/cloudflared.list" /etc/apt/sources.list.d/kdca-cloudflared.list
fi
sudo apt-get update
sudo apt-get install -y cloudflared
cd "$kdca_repo"
npm ci --omit=dev --omit=optional --ignore-scripts
npm run check
python3 - "$kdca_node_dir/bin/node" <<'PY'
import json, os, pathlib, sys
config = pathlib.Path.home()/'.config/kdca-press'
config.mkdir(parents=True, exist_ok=True, mode=0o700)
os.chmod(config, 0o700)
(config/'runtime.json').write_text(json.dumps({'node':sys.argv[1], 'python':'/usr/bin/python3'}))
PY
printf '\n설치 완료. 다음 명령으로 주소·로그인·터널을 설정하세요.\n'
printf 'cd %q\nbash scripts/pc/activate.sh\n' "$kdca_repo"
