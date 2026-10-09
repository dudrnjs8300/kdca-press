# 본인 PC에서 KDCA MCP 운영하기

v0.3.0 · Windows + Ubuntu/Debian WSL2 · 2026-10-10 한국 기준

이 방식은 기존 PC에서 MCP를 실행하고 Cloudflare Tunnel의 고정 HTTPS 주소로 연결합니다. 서버용 PC에만 설치합니다. 원격 MCP를 지원하는 AI 계정의 이용자는 PC에 설치할 필요가 없습니다. 글은 이용 중인 AI가 작성하므로 OpenRouter 등 별도 AI API 키나 GPU가 필요 없습니다.

현재 제공 상태: 설치기·인증 보존·자동 시작 파일과 자동 시험은 준비됐습니다. 사용자의 PC, Cloudflare 도메인, 실제 GitHub OAuth App을 통한 연결은 사용자 환경에서 아래 절차로 완료해야 합니다. 이 안내를 공개했다는 것만으로 접속 가능한 MCP 주소가 생기지는 않습니다.

## 1. WSL 준비 — Windows PowerShell

```powershell
wsl --version
wsl --list --verbose
```

기존 Ubuntu 22.04 이상 또는 Debian의 Python 3.10 이상 환경을 사용합니다. WSL2가 필요합니다. WSL을 처음 설치하는 PC라면 Windows 관리자 PowerShell에서 `wsl --install -d Ubuntu` 후 재시작하고 Linux 사용자 계정을 만듭니다. 기존 WSL 사용자는 다시 설치하지 않습니다.

WSL 터미널에서 `ps -p 1 -o comm=` 결과가 `systemd`인지 확인하세요. 아니라면 `sudo nano /etc/wsl.conf`로 **기존 설정을 보존하면서** 다음 항목을 추가하거나 수정합니다.

```ini
[boot]
systemd=true
```

실행 중인 다른 WSL 작업을 종료할 수 있는 시점에 Windows PowerShell에서 `wsl --shutdown`을 실행하고 WSL을 다시 엽니다. 필요한 경우 먼저 `wsl --update`를 실행합니다. 자동 설치기는 WSL 설정이나 Windows 전원 설정을 임의로 변경하지 않습니다.

## 2. 설치 — WSL 터미널

서버 코드와 인증 DB는 Linux 홈에 둡니다. `/mnt/f` 등 Windows 드라이브에는 설치하지 않습니다. 기존 분석 폴더나 Node 환경을 바꾸지 않습니다.

```bash
sudo apt-get update
sudo apt-get install -y git
cd ~
git clone https://github.com/dudrnjs8300/kdca-press.git
cd ~/kdca-press
bash scripts/pc/install-wsl.sh
```

이미 `~/kdca-press`가 있으면 중복 복제하지 말고 변경 사항을 확인한 뒤 `git pull --ff-only`를 사용하세요. 설치기는 공식 Node 24 바이너리의 SHA256을 확인해 전용 폴더에 설치하고, Cloudflare의 서명된 APT 저장소에서 cloudflared를 설치합니다. Python·curl 등 필요한 패키지도 설치합니다. sudo 암호가 필요할 수 있습니다.

## 3. 고정 HTTPS 주소 — Cloudflare 계정

Cloudflare에 DNS가 등록된 본인 소유 도메인이 필요합니다. 도메인이 없다면 구매·등록하거나 다른 고정 주소 제공 방식부터 선택해야 합니다. GitHub Pages 주소를 임의로 이 터널의 도메인으로 바꿀 수는 없습니다. Quick Tunnel의 임시 주소는 재연결 시 바뀔 수 있어 OAuth 운영용 기본 경로로 사용하지 않습니다.

1. [Cloudflare 대시보드](https://dash.cloudflare.com/)의 Networking → Tunnels에서 `kdca-press` 터널을 만듭니다. 계정 화면에 따라 Zero Trust → Networks → Connectors에 표시될 수 있습니다.
2. 연결 프로그램은 cloudflared를 선택합니다. 화면의 설치 명령 전체를 실행하지 말고, 마지막 **터널 token 값만** 준비하세요. 전용 설치기가 이미 준비되어 있습니다.
3. Published application route에 본인의 고정 주소를 추가합니다. 예: `press.본인도메인`.
4. Service는 **HTTP**, URL은 **127.0.0.1:3000**으로 지정합니다. PC와 터널이 같은 WSL에서 실행됩니다.
5. 이 전용 호스트의 API·OAuth·다운로드 경로에 캐시나 별도의 브라우저 로그인 화면을 적용하지 않습니다. 인증은 이 프로그램의 GitHub OAuth/PKCE가 담당합니다. 기관 내 다른 서비스의 접근 정책은 변경하지 않습니다.

Cloudflare 무료 플랜에서 Tunnel을 사용할 수 있습니다. 도메인 등록·갱신 비용, PC 전력·인터넷 비용은 별도입니다. 공유기 포트 개방과 고정 공인 IP는 필요하지 않습니다. 요청·다운로드는 Cloudflare를 경유하며, 원문은 이용하는 AI 서비스에도 전달됩니다.

## 4. GitHub 로그인 설정 — 본인 GitHub 계정

[GitHub OAuth App 만들기](https://github.com/settings/applications/new)에서 다음을 입력하세요. GitHub 플러그인 연결과 이 앱의 로그인 설정은 별개입니다. 현재 GitHub 플러그인에는 OAuth App 생성 도구가 없어 이 항목은 계정 설정에서 직접 만듭니다.

| 항목 | 입력값 |
| --- | --- |
| Application name | KDCA Press Personal MCP |
| Homepage URL | 3단계에서 만든 HTTPS 주소 |
| Authorization callback URL | 같은 주소 뒤에 `/auth/github/callback` |

등록 후 Client ID와 Client secret을 준비합니다. 저장소 접근 권한은 요청하지 않으며 `read:user`로 로그인 계정만 확인합니다. secret과 터널 token은 아래 WSL 입력창에만 입력하며 채팅이나 GitHub에 올리지 않습니다.

## 5. 서비스 시작 — WSL 터미널

```bash
cd ~/kdca-press
bash scripts/pc/activate.sh
```

다섯 가지를 순서대로 물어봅니다: HTTPS 주소, GitHub Client ID, GitHub Client secret, 허용할 GitHub 숫자 ID, Cloudflare 터널 token. 초기 허용 ID는 이 저장소 소유자 `dudrnjs8300`의 `61446131`입니다. 다른 이용자를 허용할 때는 해당 계정의 숫자 ID를 추가합니다. 비밀값은 입력 중 화면에 표시하지 않습니다.

설정은 `~/.config/kdca-press/`에만 기록하며 파일 권한은 600, 디렉터리는 700으로 설정합니다. MCP는 `127.0.0.1:3000`에만 바인딩하고, systemd가 MCP와 터널을 자동 재시작합니다. 즉시 진단이 실패하면 DNS 전파·터널 시작 상태를 확인하고 아래를 다시 실행합니다.

```bash
python3 scripts/pc/doctor.py
```

진단 결과에는 키·토큰·원문이 포함되지 않습니다. `PASS` 항목과 오류 상태만 공유할 수 있습니다. 이 검사는 HTTPS·메타데이터·401 인증 요구까지 확인하며 실제 로그인을 대신하지 않습니다.

## 6. Windows 로그인 시 자동 실행

WSL의 systemd 서비스만으로는 WSL 인스턴스가 계속 유지된다고 가정할 수 없습니다. 제공 PowerShell 스크립트는 **현재 Windows 사용자 로그인 시** 지정 WSL을 유지하는 작업을 등록합니다. Windows 로그인 전이나 로그아웃 후의 무인 운영은 이 구성의 보장 범위가 아닙니다.

WSL에서 스크립트를 Windows 다운로드 폴더로 복사합니다.

```bash
explorer.exe "$(wslpath -w ~/kdca-press/scripts/pc)"
```

열린 탐색기에서 `enable-autostart.ps1`을 Windows 다운로드 폴더에 복사하세요. Windows PowerShell에서 실행합니다. `Ubuntu`는 `wsl --list --quiet`에 표시된 실제 이름으로 바꾸세요.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\enable-autostart.ps1" -Distro Ubuntu
```

ExecutionPolicy 옵션은 이 프로세스에만 적용합니다. 조직 정책이 실행을 제한하면 정책을 우회하지 말고 해당 환경에서 허용된 실행 방법을 사용하세요. 작업은 현재 사용자 권한으로 동작하며 암호를 저장하지 않습니다. PC가 절전·최대 절전·종료되거나 Windows에서 로그아웃하면 서비스가 중단될 수 있습니다. 사용할 때 PC를 켜 두고 절전에 들어가지 않도록 Windows 설정을 직접 조정하세요.

## 7. 실제 로그인과 예시 3종 검증

WSL에서:

```bash
cd ~/kdca-press
bash scripts/pc/verify.sh
```

표시된 주소를 **같은 PC의 Windows 브라우저**에서 열고 GitHub 로그인·연결 승인을 합니다. 검증기는 표준 MCP 클라이언트로 심포지엄·통계발표·사업발표의 가상 초안을 보내고, HWPX 다운로드와 SHA256 일치까지 확인합니다. 토큰은 메모리에만 두며 파일로 저장하지 않습니다. 결과는 `~/kdca-mcp-results/실행시각/`에 저장합니다. 이는 서버의 문서함이 아니라 본인이 시험을 위해 내려받은 파일입니다.

이후 다음을 확인하세요.

1. HWPX 3개를 한컴오피스에서 열고 수정·저장·재열기.
2. 원격 MCP를 지원하는 AI 계정의 연결 설정에 **본인의 `https://주소/mcp`** 등록. GitHub 저장소 주소가 아닙니다.
3. GitHub 로그인 후 새 대화에서 원문을 넣고 “KDCA 보도자료로 다듬고 HWPX로 만들어 줘” 요청.
4. 아래 명령으로 MCP를 재시작한 뒤 같은 AI 연결에서 다시 생성. 인증 토큰이 아직 유효하다면 재등록 없이 사용할 수 있어야 합니다.

```bash
sudo systemctl restart kdca-press
```

자동 검증기의 입력에는 이미 작성된 가상 초안이 포함됩니다. 실제 AI의 작성 품질은 원문만 넣는 3번 시험에서 따로 평가합니다. ChatGPT·Claude·Gemini의 기능 제공·계정 조건은 각각 다르며, PC 호스팅이 플랫폼의 지역·요금제 제한을 없애지는 않습니다. Gemini MCP 조건이 맞지 않는 계정은 기존 Skill을 이용합니다. 세 플랫폼에서 성공을 실제로 관측한 뒤에만 연결 완료로 기록하세요.

## 운영·업데이트·해제

```bash
# 공개 진단 (키·토큰 출력 없음)
python3 ~/kdca-press/scripts/pc/doctor.py
# 서비스 중단 / 다시 시작
sudo systemctl stop kdca-press-tunnel kdca-press
sudo systemctl start kdca-press kdca-press-tunnel
# 업데이트: 수정 중인 로컬 파일이 있으면 먼저 확인
cd ~/kdca-press
git pull --ff-only
bash scripts/pc/install-wsl.sh
bash scripts/pc/activate.sh
```

설정 재실행 시 Enter로 기존 값을 유지할 수 있습니다. HTTPS 주소 변경이나 OAuth App 변경은 AI 측 재연결이 필요할 수 있습니다. 서비스 로그는 `journalctl -u kdca-press -n 30 --no-pager`로 직접 확인하며 원문·비밀값을 포함한 외부 로그를 공유하지 않습니다.

자동 시작 해제: Windows PowerShell에서 같은 스크립트에 `-Remove`를 붙입니다. WSL 서비스 해제는 `sudo systemctl disable --now kdca-press-tunnel kdca-press`입니다. 프로그램이나 인증 파일을 자동 삭제하지 않습니다. 모든 기존 연결을 폐기하려면 서비스를 중지하고 `~/.config/kdca-press/auth`를 안전하게 백업 또는 삭제한 뒤 재시작합니다. 그 후 모든 AI에서 다시 연결해야 합니다.

## 무엇이 남고 무엇이 사라지는가

- 인증: GitHub 사용자 ID·로그인명, OAuth 클라이언트 등록과 토큰 해시·만료/폐기 상태를 PC의 `auth/auth.sqlite`에 보존합니다. 유효기간·접근 허용 목록은 계속 적용됩니다.
- 문서: 원문·초안은 요청 처리 중에만 사용하며 문서 DB는 만들지 않습니다. HWPX·본문·미리보기·검사 결과는 메모리에 최대 30분, 또는 MCP 재시작 전까지만 있습니다.
- 인증 DB를 유지하면 재시작 자체가 연결을 끊지 않습니다. 토큰 만료·폐기·주소 변경·계정 제한 때문에 재로그인이 필요한 경우는 남습니다.
- AI 대화·PC에 내려받은 파일·Cloudflare 요청 메타데이터에는 각 서비스 또는 본인의 별도 보관 정책이 적용됩니다.

## 공식 참고 문서

- [WSL systemd](https://learn.microsoft.com/ko-kr/windows/wsl/systemd)
- [WSL systemd와 인스턴스 유지](https://devblogs.microsoft.com/commandline/systemd-support-is-now-available-in-wsl/)
- [Cloudflare Tunnel 생성과 도메인](https://developers.cloudflare.com/tunnel/get-started/)
- [cloudflared 공식 패키지](https://pkg.cloudflare.com/)
- [터널 token-file 옵션](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/)
- [GitHub OAuth App 생성](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)
