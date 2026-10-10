# Cloudflare 무료 구성으로 KDCA MCP 운영

독립 도메인이나 Render 없이 `https://kdca-press.<계정하위도메인>.workers.dev/mcp`를 사용합니다. 운영자 PC를 계속 켜 둘 필요가 없고, 이용자는 별도 프로그램이나 AI API 키를 설치·입력하지 않습니다. **현재 MCP 주소: `https://kdca-press.on0740.workers.dev/mcp`.** 2026-10-10 한국 시각 기준, 두 Worker 배포와 공개 상태·OAuth 안내·미인증 요청 거부를 확인했습니다. 기본 허용 사용자는 운영자 `dudrnjs8300`이며, 로그인 후 문서 생성·실제 CPU 측정은 아직 남아 있습니다.

## 처리 시간에 대한 결론

일반 Workers Free 요청의 CPU 한도는 10ms입니다. HWPX 생성 전체를 이 안에 넣는 구성으로 개발하지 않았습니다. **무료 플랜에서 지원하는 SQLite 기반 Durable Objects의 요청당 기본 CPU 한도 30초**를 사용합니다. 이는 Cloudflare가 제공하는 별도 실행 제품의 정식 한도입니다.

| 실행 부분 | 처리 내용 |
| --- | --- |
| 일반 Worker | 주소 확인 후 요청 전달 |
| JavaScript Durable Object | 기존 MCP SDK·GitHub OAuth/PKCE·임시 다운로드 |
| Python Durable Object | Skill과 동일한 Python 코드로 원문 대조·HWPX 생성·XML 검사 |

Python 엔진에는 공개 `workers.dev` 주소가 없습니다. 인증된 MCP 어댑터만 내부 바인딩으로 호출합니다. 별도 AI를 실행하거나 외부 AI API를 호출하지 않습니다.

로컬 `workerd`의 Python/WASM에서 심포지엄·통계·사업 예시를 반복 생성해 검증합니다. `test-output/workers/benchmark.json`은 **MCP 호출 전체의 경과 시간**을 기록합니다. 이를 Cloudflare 과금 기준 CPU 시간으로 해석하지 마세요. 실제 계정 배포 후의 CPU 사용량·콜드 스타트·한도 초과 여부는 아직 확인이 필요합니다.

## 무료 범위

2026-10-09 공식 문서 확인 기준입니다. 계정 내 다른 앱의 사용량과 합산됩니다.

- 일반 Workers: 하루 100,000 요청, 요청당 CPU 10ms.
- SQLite Durable Objects: 하루 100,000 요청과 13,000 GB-s 실행량. 기본 CPU 한도는 요청당 30초.
- Durable Objects 저장소: 무료 일일 읽기·쓰기 및 용량 한도가 별도로 적용됩니다.
- 문서 한 건은 인증·검사·생성·다운로드 등 여러 요청을 사용합니다. 하루 10만 **문서**를 보장하는 의미가 아닙니다.
- 무료 한도를 넘으면 정상 처리가 제한될 수 있습니다. 이 프로젝트는 유료 플랜 전환이나 도메인 구매를 수행하지 않습니다.

원문은 DB에 저장하지 않습니다. 생성 파일은 최대 30분 동안 임시 저장하고, 만료 시 읽기를 거부하고 알람으로 삭제합니다. 로그인 정보와 연결 승인은 별도 보존합니다. 문서 목록·검색·영구 보관함은 제공하지 않습니다. 요청 본문과 토큰을 로그에 기록하지 않으며, 공개 어댑터의 자동 요청 로그는 끕니다. Python 엔진의 실행 기록에는 원문이 포함되지 않습니다.

## GitHub에서 배포하기 — 운영자만 1회 설정

1. Cloudflare의 **Workers 및 Pages** 화면에서 자신의 `workers.dev` 하위 도메인과 Account ID를 확인합니다. **도메인 등록/구매 화면은 사용하지 않습니다.** Workers Free 계정에 배포합니다.
2. Cloudflare API 토큰을 만듭니다. 배포할 계정에 `Workers Scripts Write`와 `Account Settings Read` 권한을 부여합니다. 이 권한으로 실제 배포를 확인했습니다. GitHub 호스팅 실행기의 IP가 달라질 수 있으므로 토큰의 선택 항목인 클라이언트 IP 필터링은 설정하지 않습니다. 이 앱은 Zone/DNS 변경, R2, 유료 컨테이너가 필요하지 않습니다.
3. GitHub의 [OAuth Apps](https://github.com/settings/developers)에서 개인용 OAuth App을 생성합니다. Homepage URL은 `https://kdca-press.<내하위도메인>.workers.dev`, callback은 같은 주소 뒤에 `/auth/github/callback`을 붙입니다. 기존 앱을 다른 서버에서 계속 쓰는 경우 별도 앱을 만드세요.
4. [저장소의 Actions secrets](https://github.com/dudrnjs8300/kdca-press/settings/secrets/actions)에 아래 네 값을 등록합니다. **토큰과 client secret을 채팅·코드·일반 repository variables에 넣지 마세요.**

| GitHub Actions secret 이름 | 값 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare 배포용 토큰 |
| `CLOUDFLARE_ACCOUNT_ID` | 배포할 Cloudflare 계정 ID |
| `KDCA_GITHUB_CLIENT_ID` | OAuth App Client ID |
| `KDCA_GITHUB_CLIENT_SECRET` | OAuth App Client secret |

5. [deploy Cloudflare MCP](https://github.com/dudrnjs8300/kdca-press/actions/workflows/cloudflare.yml) → **Run workflow**. `public_base_url`에 위 HTTPS 주소를 끝 `/` 없이 입력합니다. 실행은 런타임 검사 → 비공개 Python 엔진 → MCP 어댑터 → OAuth 설정 → 접속 검사를 진행합니다. 검사에 실패하면 이후 배포 단계로 넘어가지 않습니다.
6. 완료되면 `<주소>/healthz`에서 `status: ok`를 확인하고, AI의 사용자 정의 MCP 연결에 `<주소>/mcp`를 등록하여 GitHub 로그인·승인을 진행합니다. 기본 허용 계정은 `dudrnjs8300`의 숫자 ID `61446131`입니다.

현재 운영 저장소에서는 `main`의 서버·엔진·의존성 변경 시 같은 검사 후 자동 재배포합니다. 기본 대상은 `https://kdca-press.on0740.workers.dev`이며, 다른 저장소로 복제한 경우 자동 배포하지 않습니다. 수동 **Run workflow**도 계속 사용할 수 있습니다. 브라우저 승인 회귀 검사나 Workers 검사에 실패하면 배포하지 않습니다.

`/mcp`는 브라우저로 열어 사용하는 페이지가 아닙니다. 일반 브라우저 GET 또는 승인 없는 호출에서 401이 나오는 것은 정상입니다. 서비스별 원격 MCP 제공 여부와 계정/지역 조건은 [설치 안내](DEPLOYMENT.md)를 따릅니다. 세 플랫폼의 실제 계정에서 연결 완료를 검증한 상태는 아닙니다.

## 로컬 개발·회귀 검사

운영 시 이용자에게는 필요 없는 개발자용 절차입니다. Node 24, Python, uv를 준비합니다.

```bash
npm ci
python3 scripts/build-worker-engine.py
cd workers/engine
uv run --locked pywrangler deploy --dry-run
cd ../..
node test/workers-runtime.mjs
```

시험은 로컬에서만 허용되는 데모 로그인, OAuth PKCE, SDK 연결, 세 예시 각 5회 생성, 원본 Python 결과의 모든 ZIP 항목 내용 일치, HWPX 구조, 다운로드 SHA256, 잘못된 링크 토큰, 원문에 없는 수치 거부를 확인합니다. 실제 한컴의 열기·편집·저장은 별도 확인해야 합니다. Workers 경로에서는 SVG 쪽 미리보기를 생성하지 않습니다.

`workers/engine/src/kdca_core.py`와 `bundled_assets.py`는 자동 생성물입니다. 전자는 `packages/kdca-press/scripts/kdca_press.py`의 바이트 단위 복사본이며 독립적으로 수정하지 않습니다.

## 배포 후 CPU 최종 확인

1. AI에서 심포지엄·통계·사업 예시를 각각 호출합니다. 가능하면 처음 호출과 반복 호출을 모두 확인합니다.
2. Cloudflare Workers의 Metrics에서 `kdca-press`와 `kdca-press-engine`을 각각 확인합니다. 일반 Worker와 Durable Object 호출을 구분해 CPU 시간, 오류, 메모리 한도 초과 여부를 확인합니다. Python 엔진의 Observability 실행 기록에서도 CPU 시간과 wall time을 구분합니다.
3. `Exceeded CPU Time Limits`/`exceededCpu`/1102가 없어야 합니다. 일반 Worker CPU는 10ms보다 충분히 낮아야 하고, 문서 생성 Durable Object는 30초보다 충분히 낮아야 합니다.
4. 이 결과를 확인하기 전까지 **무료 운영 실측 완료**로 표시하지 않습니다. 단순 HTTP 응답 시간이나 로컬 벤치마크만으로 이 검사를 대체하지 않습니다.

공식 근거: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Python Durable Objects](https://developers.cloudflare.com/changelog/post/2025-05-14-python-worker-durable-object/), [workers.dev 주소](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).
