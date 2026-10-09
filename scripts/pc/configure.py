#!/usr/bin/env python3
"""Interactive local setup. Secrets are read from the terminal, never CLI flags."""
import getpass
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
CONFIG = Path.home()/'.config/kdca-press'

def read_env(file):
    if not file.exists():
        return {}
    return {key:json.loads(value) for key, value in
            (line.split('=', 1) for line in file.read_text().splitlines() if line and not line.startswith('#'))}

def origin(value):
    u = urlsplit(value)
    if u.scheme != 'https' or not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in ('', '/'):
        raise ValueError('경로 없는 HTTPS 주소가 필요합니다. 예: https://press.example.org')
    if u.port not in (None, 443) or '.' not in u.hostname or not re.fullmatch(r'[a-zA-Z0-9.-]+', u.hostname):
        raise ValueError('공개 도메인의 HTTPS 주소를 입력하세요.')
    return f'https://{u.hostname.lower()}'

def ask(label, default='', hidden=False, check=None):
    hint = ' [Enter: 기존 값 유지]' if hidden and default else (f' [{default}]' if default else '')
    value = (getpass.getpass if hidden else input)(label+hint+': ').strip() or default
    if not value or any(ord(c)<32 or ord(c)==127 for c in value):
        raise ValueError(label+' 값이 비어 있거나 잘못됐습니다.')
    return check(value) if check else value

def write_private(file, text):
    temporary = file.with_name(file.name+'.new')
    fd = os.open(temporary, os.O_WRONLY|os.O_CREAT|os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(text)
    temporary.chmod(0o600)
    temporary.replace(file)

def configure():
    if os.geteuid()==0:
        raise ValueError('sudo 없이 일반 WSL 사용자로 실행하세요.')
    if not sys.stdin.isatty():
        raise ValueError('비밀값 입력을 위해 WSL 터미널에서 직접 실행하세요.')
    for path in (ROOT, CONFIG):
        if not re.fullmatch(r'/[a-zA-Z0-9_./@-]+', str(path)) or str(path).startswith('/mnt/'):
            raise ValueError('공백 없는 Linux 홈 경로에서 실행하세요.')
    CONFIG.mkdir(parents=True, exist_ok=True, mode=0o700)
    CONFIG.chmod(0o700)
    runtime = json.loads((CONFIG/'runtime.json').read_text())
    cloudflared = shutil.which('cloudflared')
    if not cloudflared or not Path(runtime['node']).is_file():
        raise ValueError('먼저 bash scripts/pc/install-wsl.sh 를 실행하세요.')
    old = read_env(CONFIG/'server.env')
    print('Cloudflare에 등록한 고정 주소와 GitHub OAuth App 정보를 입력합니다.')
    url = ask('공개 HTTPS 주소', old.get('PUBLIC_BASE_URL', ''), check=origin)
    print('GitHub OAuth callback: '+url+'/auth/github/callback')
    client = ask('GitHub OAuth Client ID', old.get('GITHUB_CLIENT_ID', ''))
    secret = ask('GitHub OAuth Client secret', old.get('GITHUB_CLIENT_SECRET', ''), hidden=True)
    ids = ask('허용할 GitHub 숫자 ID (쉼표 구분)', old.get('ALLOWED_GITHUB_IDS', '61446131'))
    if not re.fullmatch(r'[0-9]+(,[0-9]+)*', ids):
        raise ValueError('GitHub 숫자 ID만 쉼표로 구분하세요.')
    token_file = CONFIG/'tunnel.token'
    token = ask('Cloudflare Tunnel token (설치 명령 전체가 아닌 토큰만)', token_file.read_text().strip() if token_file.exists() else '', hidden=True)
    if not re.fullmatch(r'[A-Za-z0-9_+/=-]{40,}', token):
        raise ValueError('Cloudflare 터널 토큰 형식을 확인하세요.')
    auth_dir = CONFIG/'auth'
    auth_dir.mkdir(exist_ok=True, mode=0o700)
    env = {'PUBLIC_BASE_URL':url, 'GITHUB_CLIENT_ID':client, 'GITHUB_CLIENT_SECRET':secret,
           'ALLOWED_GITHUB_IDS':ids, 'NODE_ENV':'production', 'DEMO_MODE':'false',
           'HOST':'127.0.0.1', 'PORT':'3000', 'TRUST_PROXY':'loopback',
           'AUTH_DATA_DIR':str(auth_dir), 'PYTHON_BIN':runtime['python'],
           'PYTHONDONTWRITEBYTECODE':'1'}
    write_private(CONFIG/'server.env', ''.join(key+'='+json.dumps(value)+'\n' for key,value in env.items()))
    write_private(token_file, token+'\n')
    user = pwd.getpwuid(os.getuid()).pw_name
    if not re.fullmatch(r'[a-zA-Z0-9_-]+', user):
        raise ValueError('Linux 사용자 이름 형식을 확인하세요.')
    units = CONFIG/'units'
    units.mkdir(exist_ok=True, mode=0o700)
    common = f'''User={user}
UMask=0077
Restart=on-failure
RestartSec=5
TimeoutStopSec=15
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
LimitCORE=0
'''
    service = f'''[Unit]
Description=KDCA press MCP
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0
[Service]
Type=simple
WorkingDirectory={ROOT}
EnvironmentFile={CONFIG}/server.env
ExecStart={runtime['node']} {ROOT}/src/remote.js
ReadWritePaths={auth_dir}
{common}[Install]
WantedBy=multi-user.target
'''
    tunnel = f'''[Unit]
Description=KDCA press HTTPS tunnel
After=network-online.target kdca-press.service
Wants=network-online.target kdca-press.service
StartLimitIntervalSec=0
[Service]
Type=simple
ExecStart={cloudflared} tunnel --no-autoupdate run --token-file {token_file}
{common}[Install]
WantedBy=multi-user.target
'''
    write_private(units/'kdca-press.service', service)
    write_private(units/'kdca-press-tunnel.service', tunnel)
    print('설정 저장 완료. 접속 주소: '+url+'/mcp')

if __name__=='__main__':
    try:
        configure()
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as error:
        print('설정 중단: '+str(error), file=sys.stderr)
        sys.exit(1)
