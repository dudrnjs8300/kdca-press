# 설치와 배포

Cloudflare 무료 구성을 사용하려면 [Workers + Durable Objects 배포 안내](CLOUDFLARE.md)를 참고하세요. 아래 PC·Render 방식은 선택 가능한 대안입니다.

## 1. 서버 없이 Skill 사용

배포 패키지는 `npm run build:packages`로 만듭니다. Python 3.10+가 빌드 호스트에 있으면 추가 Python 패키지는 필요 없습니다.

- ChatGPT/Codex: Skills를 지원하는 환경의 개인 Skill을 사용합니다. `kdca-press-plugin.zip`은 Skill이 들어 있는 표준 플러그인 배포물이며, 모든 ChatGPT 계정에서 ZIP 업로드나 공개 설치를 보장하지 않습니다. 공개 플러그인 디렉터리 등록은 별도 심사·등록 절차입니다.
- Claude: 코드 실행을 켜고 사용자 Skill 업로드에서 `kdca-press-skill.zip`을 선택합니다. ZIP 내부 최상위 `kdca-press/` 아래에 SKILL.md가 있습니다.
- Gemini Spark/Skills: 사용자 Skill 등록에서 `kdca-press-gemini.zip`을 선택합니다. ZIP 최상위에 SKILL.md가 있고 나머지도 UTF-8 텍스트입니다. Gemini가 현재 계정에 표시하는 업로드 규칙이 우선합니다.

설치 후 “아래 공개 원문을 KDCA 보도자료로 다듬고 HWPX로 만들어 줘”와 원문을 입력합니다. AI 서비스의 코드 실행 기능이 꺼져 있고 MCP도 연결되지 않으면 본문 초안까지만 만들 수 있습니다. 파일을 생성했다고 가장하지 않도록 지침에 명시했습니다.

Google 공식 안내(2026-10-08 확인)는 사용자 정의 MCP 앱을 미국·영어·개인 계정으로 제한합니다. 한국 사용자에게는 Gemini Skill을 우선 경로로 제공합니다. [공식 MCP 조건](https://support.google.com/gemini/answer/17209137?hl=en-ID)을 확인하세요. Skill 제공 여부와 MCP 제공 여부는 다릅니다.

## 2. GitHub 공개 배포

저장소: [dudrnjs8300/kdca-press](https://github.com/dudrnjs8300/kdca-press). `main`에는 소스와 `downloads/`의 설치 ZIP이 있고, `gh-pages`에는 안내 사이트와 다운로드 파일이 있습니다.

현재 안내 사이트: **https://dudrnjs8300.github.io/kdca-press/**. 이 저장소에서는 Pages 활성화와 첫 배포가 완료되었습니다.

다른 저장소로 복제할 때의 최초 안내 사이트 공개:

1. 저장소 Settings → Pages로 이동합니다.
2. Build and deployment의 Source를 **Deploy from a branch**로 선택합니다.
3. Branch를 **gh-pages**, 폴더를 **/(root)**로 지정하고 Save를 누릅니다.
4. GitHub가 보여주는 사이트 주소로 접속합니다. 첫 게시에는 수 분이 걸릴 수 있습니다.

Pages 설정이 없는 새 복제본에서는 저장소 소유자가 이 항목을 지정합니다. 현재 저장소는 활성화되어 있으므로 추가 설정 없이 사이트와 main의 downloads에서 Skill ZIP을 받을 수 있습니다.

향후 GitHub Actions로 자동 배포하려면 Source를 GitHub Actions로 바꾸고 `public connection guide` 워크플로를 실행합니다. API 호스팅 주소가 생기면 repository variable `PUBLIC_BASE_URL`에 HTTPS origin을 넣고 재실행합니다.

`v0.2.0` 같은 태그를 게시하면 release 워크플로가 검증 후 ZIP들과 SHA256SUMS를 Releases에 올립니다. 태그를 만들기 전 `docs/STATUS.md`의 계정 시험 상태를 실제 결과에 맞게 갱신합니다. 저장소에는 실제 업무 원문·생성물·비밀키를 포함하지 않습니다. examples/evals는 가상 자료입니다.

## 3. 원격 MCP 실행 장소

본인 Windows PC에서 운영하려면 **[WSL 설치·자동 시작 안내](SELF_HOST_WSL.md)**를 따릅니다. PC 설치기는 `AUTH_DATA_DIR`를 설정해 인증만 보존하고, `HOST=127.0.0.1`에서 Cloudflare Tunnel을 통해 제공합니다. 원문·생성물의 영구 저장소는 만들지 않습니다.

### 선택: Render 호스팅

호스트 요구사항: Node 24, Python 3.10+, HTTPS. Dockerfile에 두 런타임이 포함되어 있습니다. npm 의존성은 package-lock으로 고정합니다. 영구 디스크·데이터베이스는 필요 없습니다.

Render를 사용한다면 제공한 `render.yaml`을 Blueprint로 가져옵니다. `plan: free`이며 영구 디스크·유료 DB를 만들지 않습니다. [Free 제한](https://render.com/docs/free)에 따라 휴면·콜드 스타트와 사용량 제한이 있습니다. 무료 설정이 모든 이용량의 비용 면제를 보장하지는 않습니다. 실제 서비스를 만들기 전에 계정의 워크스페이스와 적용 요금을 확인합니다.

환경 변수:

| 이름 | 값 |
| --- | --- |
| `PUBLIC_BASE_URL` | 실제 서비스의 HTTPS origin; 경로·쿼리 없이 입력 |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | 같은 앱의 secret; 호스팅의 비밀 환경 변수로 등록 |
| `ALLOWED_GITHUB_IDS` | 초기 개인 시험은 `61446131`; 여러 숫자 ID는 쉼표 구분 |
| `NODE_ENV` | production |
| `PORT` | Render에서는 10000 |
| `TRUST_PROXY` | Render 앞단 프록시에서는 1 |
| `DEMO_MODE` | false |

GitHub OAuth App의 callback은 `PUBLIC_BASE_URL/auth/github/callback`입니다. secret을 저장소·채팅·스크린샷에 넣지 않습니다. `ALLOWED_GITHUB_IDS`가 비어 있으면 모든 GitHub 계정에 접속을 허용하므로 초기 개인 시험에서는 ID를 지정합니다.

호스트가 실제로 실행된 다음:

```bash
PUBLIC_BASE_URL=https://actual-service.example.com npm run verify:remote
```

공개 메타데이터·401 인증 요구를 검사합니다. OAuth로 발급된 토큰을 환경 변수 `MCP_ACCESS_TOKEN`에 직접 제공하면 도구 목록도 확인합니다. 토큰을 채팅으로 전달할 필요는 없습니다.

각 AI의 사용자 정의 MCP 설정에 `https://실제호스트/mcp`를 등록하고 OAuth에 동의합니다. 계정이 해당 인증 조합을 지원하지 않으면 Skill 경로로 사용합니다. MCP URL은 GitHub 저장소 URL과 다릅니다.

## 4. 운영 특성

다운로드는 토큰을 가진 사람에게 열려 있고 30분 만료입니다. 생성물은 메모리에 있으며 서버 휴면·재시작 시 사라집니다. OAuth 상태는 기본적으로 메모리에 있지만, PC 설치기는 `AUTH_DATA_DIR`의 인증 전용 SQLite에 보존합니다. PC 재시작 후에도 유효한 인증은 유지됩니다. Render 무료 설정에는 영구 디스크가 없으므로 인증 보존을 별도로 구성하지 않으면 재연결이 필요합니다. 여러 인스턴스로 수평 확장하는 설정은 본 버전에서 검증하지 않았습니다.

예전 영구 문서함 코드는 `npm run demo:legacy`로만 실행할 수 있으며 공개 배포의 기본 경로가 아닙니다. 신규 호스팅은 `npm start`를 사용합니다.

## 5. 계정별 수용 시험

ChatGPT·Claude·Gemini 각각에 대해 설치/연결 → 새 대화 → 원문만 입력 → 퇴고 초안 → HWPX 다운로드 → 한컴에서 열기·수정·저장·재열기를 확인합니다. 플랫폼·기능·모델·날짜·재연결 여부와 실패 내용을 기록합니다. 이 절차가 끝난 플랫폼만 실제 연결 완료로 표시합니다.
