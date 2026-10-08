# KDCA 보도자료 작성 도구

공개 원문을 질병관리청 보도자료 문체로 작성·퇴고하고 **편집 가능한 HWPX**로 만드는 Skill + MCP입니다. 심포지엄·통계발표·사업발표를 우선 지원합니다. 기관 공식 서비스가 아닌 개인 개발 도구입니다.

**v0.2.0: 소스·설치 파일을 공개합니다. 실행 코드·표준 MCP 연결 시험은 완료했으며 세 플랫폼 계정별 설치 시험과 원격 MCP 호스팅은 남아 있습니다.** [검증 현황](docs/STATUS.md)을 먼저 확인하세요.

## 설치 파일 받기

- [Claude · 공통 Skill ZIP](https://github.com/dudrnjs8300/kdca-press/raw/refs/heads/main/downloads/kdca-press-skill.zip)
- [Gemini Skill ZIP](https://github.com/dudrnjs8300/kdca-press/raw/refs/heads/main/downloads/kdca-press-gemini.zip)
- [ChatGPT / Codex 플러그인 패키지](https://github.com/dudrnjs8300/kdca-press/raw/refs/heads/main/downloads/kdca-press-plugin.zip)
- [체크섬](downloads/SHA256SUMS.txt) · [설치 안내](docs/DEPLOYMENT.md)

안내 사이트 파일은 `gh-pages` 브랜치에 게시합니다. 최초 공개에는 저장소 Settings → Pages → Deploy from a branch → gh-pages / (root) → Save 설정이 필요합니다.

## 사용 방식

> 아래 공개 원문을 KDCA 보도자료로 다듬고 HWPX로 만들어 줘. 핵심 메시지를 제목과 리드에 담고, 없는 발언·일정·수치는 만들지 말아 줘.
>
> [공개 가능한 원문 붙여넣기]

AI가 메시지를 정리하고 문장을 퇴고합니다. 공통 생성 엔진은 원문 대조 검사와 HWPX 조립을 담당합니다. 별도의 유료 AI API 키는 필요하지 않습니다. 이용하는 AI 서비스의 요금·실행 한도는 적용됩니다.

| 경로 | 역할 | 이용자 PC 설치 | 별도 서버 |
| --- | --- | --- | --- |
| Skill | 작성 지침 + Python 생성 코드 + KDCA 참고 서식 | AI의 코드 실행 환경이 있으면 불필요 | 불필요 |
| 원격 MCP | AI가 호출하는 사실 검사·HWPX 생성·임시 다운로드 | 불필요 | 운영자가 호스팅 |
| 로컬 MCP | 개발자·로컬 에이전트용 stdio 연결 | Node 24, Python 3.10+ | 불필요 |

**Skill과 MCP를 함께 연결하면 같은 작성 지침과 같은 생성 엔진을 사용합니다.** MCP가 없어도 Skill이 AI의 실행 환경 안에서 HWPX를 만들 수 있습니다. GitHub Pages는 안내·설치 파일을 배포하며 서버 코드를 실행하지 않습니다. Render는 원격 MCP를 운영할 때 선택하는 호스팅 중 하나입니다. 영구 문서함은 없습니다.

## 플랫폼별 설치 파일

위 링크에서 설치 ZIP을 바로 받을 수 있습니다. 직접 빌드하려면 `npm run build:packages`를 실행합니다. Releases 배포용 워크플로도 포함되어 있습니다.

| 플랫폼 | 준비한 배포물 | 필요한 기능과 확인 범위 |
| --- | --- | --- |
| ChatGPT / Codex | 개인 Skill 및 `kdca-press-plugin.zip` | Skills·코드 실행을 제공하는 환경. 범용 ChatGPT 플러그인 디렉터리 등록은 별도 절차 |
| Claude | `kdca-press-skill.zip` | 사용자 Skill 업로드와 코드 실행. Skill 이름 폴더가 ZIP 최상위에 있음 |
| Gemini Spark / Skills | `kdca-press-gemini.zip` | SKILL.md가 ZIP 최상위. 외부 인터넷·패키지 설치 없이 실행하도록 구성 |
| 원격 MCP 지원 클라이언트 | 배포 주소의 `/mcp` | Streamable HTTP, OAuth/PKCE, 사용자 정의 MCP 연결 지원 필요 |

Gemini의 사용자 정의 MCP는 현재 공식 안내상 미국·영어 조건이 있어 한국 사용자는 Skill을 우선 사용합니다. 세 서비스의 실제 계정에서 설치부터 파일 다운로드까지 완료한 상태는 아닙니다. [설치·배포 안내](docs/DEPLOYMENT.md)에 계정 기능 확인과 시험 절차가 있습니다.

## 개발자 빠른 실행

Python 3.10+만으로 예시 문서를 생성할 수 있습니다. 이 JSON의 draft는 회귀 시험용 기준 초안이며 새 AI 작성 결과는 `evals/forward/`에 따로 있습니다.

```bash
python3 packages/kdca-press/scripts/kdca_press.py generate --input examples/statistics.json --output result.hwpx
```

HWPX, Markdown, 내용 확인용 HTML, 검사 JSON이 생성됩니다. 동일 파일명 덮어쓰기를 거부합니다. HTML은 한컴 페이지 조판을 재현한 화면이 아닙니다.

Node 24와 Python을 준비한 MCP 호스트에서는:

```bash
npm ci
npm run mcp:stdio
```

stdio 클라이언트 설정 예시(경로는 실제 절대 경로로 변경):

```json
{"mcpServers":{"kdca-press":{"command":"node","args":["/absolute/path/kdca-press/src/stdio.js"]}}}
```

원격 서버의 로컬 확인:

```bash
npm run build:packages
npm run demo
```

`http://127.0.0.1:3000`에서 안내 페이지와 데모 로그인을 확인합니다. 로컬 데모 인증은 공개 서버에서 실행되지 않습니다. 원격 운영 설정은 [배포 안내](docs/DEPLOYMENT.md)를 따릅니다.

## MCP 도구

| 이름 | 하는 일 |
| --- | --- |
| `kdca_guide` | 편집 원칙·입력 형식 읽기 |
| `kdca_prepare` | 원문 수치·작성 유형 확인 |
| `kdca_review` | 초안의 수치·단위·근거·인용·표 검사 |
| `kdca_generate` | 검사 통과 초안을 HWPX로 생성 |
| `kdca_get_artifact` | 생성 파일을 MCP resource로 읽기 |

프롬프트 `kdca-write`, 편집 지침 resource와 생성물 resource도 제공합니다. 도구 입력 `draft` 형식은 [공통 형식](packages/kdca-press/references/draft-format.md)을 참고하세요. 생성 결과는 30분 또는 서버 재시작 중 먼저 발생하는 시점까지 보관합니다. 다운로드 토큰을 가진 사람은 만료 전 파일을 받을 수 있습니다.

## 품질과 한계

원문에 없는 숫자·인용, %와 %p 혼동, 일부 계획→완료 변경을 검사합니다. 자동 검사는 문장의 의미 전체를 보증하지 않습니다. 제목·리드·표·해석을 원문과 다시 대조하도록 Skill에 명시했습니다. 빠진 담당자·연락처·공식 발언은 만들어 넣지 않습니다.

공개 KDCA 서식의 문서 구조를 참고하되 원래 본문·이미지·작성자 정보는 제거했습니다. 한컴오피스에서의 실제 열기·편집·저장 검증은 남아 있습니다. Kordoc SVG 미리보기와 실제 한글 조판은 다를 수 있습니다. PDF는 생성하지 않습니다.

- [구조와 플랫폼 근거](docs/ARCHITECTURE_OPTIONS.md)
- [품질 평가와 세 가지 원문 시험](docs/QUALITY.md)
- [개인정보·임시 저장](docs/SECURITY.md)
- [출처와 라이선스](THIRD_PARTY.md)

```bash
npm run check
npm test
npm run build:packages
npm run build:pages
```

자체 코드 MIT. 제3자 서식·의존성에는 각 원래 조건이 적용됩니다. `src/index.js`와 `public/`의 v0.1 영구 문서함 프로토타입은 회귀 비교용이며 기본 실행 경로가 아닙니다.
