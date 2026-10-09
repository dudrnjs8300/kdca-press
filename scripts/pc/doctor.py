#!/usr/bin/env python3
"""Print shareable status only; no env values, tokens, logs, or source documents."""
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request
from configure import read_env

config = Path.home()/'.config/kdca-press'
failures = []

def report(name, ok, detail=''):
    print(('PASS ' if ok else 'FAIL ')+name+(' — '+detail if detail else ''))
    if not ok:
        failures.append(name)

def fetch(base, path, method='GET'):
    req = urllib.request.Request(base+path, data=b'{}' if method=='POST' else None,
                                 headers={'Content-Type':'application/json'}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.status, dict(response.headers), json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), {}
    except (OSError, ValueError):
        return 0, {}, {}

try:
    env = read_env(config/'server.env')
    for name in ('server.env', 'tunnel.token'):
        p = config/name
        report(name+' 파일 권한', p.is_file() and (p.stat().st_mode & 0o077)==0)
    for unit in ('kdca-press', 'kdca-press-tunnel'):
        active = subprocess.run(['systemctl','is-active',unit],capture_output=True,text=True).stdout.strip()
        report(unit, active=='active', active)
    for label, base in [('PC 내부', 'http://127.0.0.1:3000'), ('공개 HTTPS', env['PUBLIC_BASE_URL'])]:
        status, _, health = fetch(base, '/healthz')
        report(label+' 응답', status==200 and health.get('service')=='kdca-press', str(status))
        if status==200:
            report(label+' 인증 보존', health.get('authentication')=='persistent')
    status, _, metadata = fetch(env['PUBLIC_BASE_URL'], '/.well-known/oauth-protected-resource/mcp')
    report('OAuth 주소', status==200 and metadata.get('resource')==env['PUBLIC_BASE_URL']+'/mcp')
    status, headers, _ = fetch(env['PUBLIC_BASE_URL'], '/mcp', 'POST')
    report('인증 없는 MCP 요청 차단', status==401 and any(k.lower()=='www-authenticate' for k in headers), str(status))
    print('MCP 주소: '+env['PUBLIC_BASE_URL']+'/mcp')
    print('이 검사는 공개 연결만 확인합니다. 로그인 후 문서 생성은 별도 실사용 시험이 필요합니다.')
except (OSError, ValueError, KeyError) as error:
    print('FAIL 설정을 읽을 수 없습니다. 먼저 설치·설정 단계를 완료하세요.')
    failures.append('configuration')
sys.exit(bool(failures))
