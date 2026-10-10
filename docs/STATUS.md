# v0.5.1 검증 현황

기록일: 2026-10-11 한국.

## 실제 양식 반영

첨부된 2026년 10월 8일 보도자료의 로고 네 개, 글꼴·문단 스타일, 제목·배포 시점 표, 쪽번호와 꼬리말을 보존하도록 공통 생성기를 수정했습니다. 불필요한 시험용·초안·AI 작성 표기는 제거했습니다. 이미지 SHA-256과 원본 스타일 전체 보존, 본문·표 보존, 원본 연구·담당자 정보 제거를 회귀 검사합니다. 세부 내용은 [TEMPLATE.md](TEMPLATE.md)를 참고하세요.

## 자간 조정

본문·요약의 짧은 마지막 줄에만 자간을 −1%에서 최대 −4%까지 조정합니다. 조정 효과가 없으면 원래 자간을 유지하며 글자 크기와 장평은 그대로입니다. 표준 라이브러리의 폭 추정이며 한글 조판 검증은 별도로 필요합니다.

## OAuth 승인 페이지 수정

- 기존 `no-referrer` 정책은 브라우저의 HTML 승인 폼 POST에서 `Origin: null`을 만들어 정상 요청도 CSRF 검사에서 거부할 수 있었습니다. 승인 페이지만 `strict-origin`으로 바꾸고 Origin·CSRF 토큰 검사는 유지합니다.
- 승인 후 AI 앱으로 돌아가는 리디렉션을 위해 해당 요청에 등록된 callback origin만 CSP `form-action`에 추가합니다. 다른 CSP 지시문은 그대로 유지합니다.
- 자동 브라우저 검사는 기존 정책의 동일한 403 오류 재현, 수정된 허용·취소, PKCE 토큰 교환, URL 쿼리의 Referer 유출 방지를 확인합니다. 운영 배포 전 필수 검사로 실행하며, 실제 ChatGPT 계정 연결 완료와는 구분합니다.

| 항목 | 상태 |
| --- | --- |
| KDCA Skill 지침·공통 Python 엔진 | 구현, 실제 원문 세 유형 생성 시험 |
| 현재 ChatGPT Work 개인 Skill | 설치·저장 확인; 새 대화에서 사용 가능 |
| Skill 단독 실행 | 추가 Python 패키지 없이 생성·구조 검사 확인 |
| stdio MCP | 공식 SDK 클라이언트로 도구·프롬프트·생성물 읽기 확인 |
| 원격 HTTP MCP | 로컬 실제 HTTP 서버에서 OAuth/PKCE·파일 전달 시험 |
| 임시 파일 격리·만료 | 다른 사용자 접근 차단, 잘못된 토큰, 만료 시험 |
| Claude용·Gemini용 Skill ZIP, 플러그인 ZIP | 각각 압축 해제 후 격리된 Python 실행 시험 통과 |
| 전체 자동 시험 | 18개 Node 시험 + Python 설치 설정 시험 2개 통과; Workers 실제 런타임 통합 시험 별도 통과 |
| 화면 확인 | 데스크톱·모바일 오류/가로 넘침 없음, 다운로드·데모 로그인 확인 |
| HWPX 참고 미리보기 | 세 유형 모두 2쪽, Kordoc 경고 없음; 눈으로 본문·표 확인 |
| 배포 설정 | Render Blueprint와 플러그인 manifest 공식 JSON Schema 검증 통과 |
| GitHub 공개 저장소 | main에 소스·설치 파일 게시 |
| 안내 사이트 | https://dudrnjs8300.github.io/kdca-press/ 공개 및 HTTP 200 확인 |
| GitHub 원격 자동 검사 | checks 성공: 설치·구문·전체 시험·배포물 빌드 통과 |
| GitHub Releases | 태그 기반 자동화 준비; 별도 release 게시 전 |
| PC 서비스 설정 검사 | systemd unit 문법·비밀값 분리·파일 권한 검사 통과 |
| PC 설치·자동 시작 파일 | WSL 설치기·systemd 2개 서비스·Windows 로그인 작업 제공; 실제 Windows 실행 미검증 |
| 재시작 인증 유지 | OAuth 등록·세션·액세스/갱신·폐기 상태 유지와 생성 파일 소멸 자동 시험 통과 |
| 외부 원격 MCP 호스트 | Cloudflare 두 Worker 배포·OAuth 비밀값 설정 완료; `/healthz`·OAuth discovery·미인증 401 확인. ChatGPT OAuth 연결 후 세 유형 생성·파일 반환 확인; Cloudflare CPU 실측은 미검증 |
| ChatGPT 실제 계정 연결 | 연결된 MCP의 prepare·review·generate·get_artifact로 세 유형 실행 확인 |
| Claude·Gemini 각 실제 계정 연결 | 미검증 |
| 한컴오피스 열기·저장·재열기 | 미검증 |

자동 시험 통과는 모든 AI 플랫폼에서 설치가 끝났다는 뜻이 아닙니다. 플랫폼별 계정 기능·인증 호환성과 실제 한글 조판 검증이 남아 있습니다. 저장소는 dudrnjs8300/kdca-press입니다. 안내 사이트와 Skill 다운로드는 공개되었으며, 원격 MCP 주소는 `https://kdca-press.on0740.workers.dev/mcp`입니다. 현재 허용 계정은 `dudrnjs8300`입니다.

## Cloudflare Workers 추가 검증

- 로컬 workerd + Python/WASM + 실제 MCP SDK: 세 예시 각 5회, 총 15회 생성·다운로드 통과.
- 24개 문단·60개 근거 항목으로 확대한 입력도 생성 통과. 이는 모든 허용 입력 조합의 최악 시간을 보장하지 않습니다.
- 모든 예시 HWPX의 압축 해제된 ZIP 항목은 공통 Python 생성기의 결과와 일치했습니다.
- OAuth PKCE, 코드 재사용 거부, 토큰 폐기, 잘못된 다운로드 토큰, 없는 수치 거부 확인.
- SQL 어댑터의 로그인·임시 파일 복구, 사용자 격리, 만료 파일 삭제, 호출 제한 보존 시험 통과.
- [기록된 결과](../evals/workers/local-runtime.json)는 로컬 전체 경과 시간이며 실제 Cloudflare CPU 측정값이 아닙니다.
- Workers 경로에서는 SVG 쪽 미리보기를 제공하지 않습니다. HWPX 본문·표·서식은 동일합니다.
- 새 버전의 GitHub CI 결과는 해당 커밋의 Actions를 확인하세요. Cloudflare 배포 워크플로 실행에는 운영자의 계정 설정이 필요합니다.

## 실제 배포 확인 — 2026-10-10 한국

- 배포 실행: [GitHub Actions #2](https://github.com/dudrnjs8300/kdca-press/actions/runs/37988067631), 서버 코드 `ffbc2c41ccf0ad5f420afae16b5d0c2c12aae4ac`.
- 비공개 Python 엔진과 공개 MCP 어댑터 업로드, GitHub OAuth 설정 저장 완료.
- 배포 직후 `/healthz`가 일시적으로 404를 반환했으나 후속 실접속 검사에서 상태·OAuth 메타데이터·미인증 401이 모두 통과했습니다. v0.4.1은 공개 상태 검사에 한정한 횟수 제한 재시도를 추가합니다.
- 배포 로그의 Worker Startup Time은 요청당 CPU나 문서 생성 시간으로 해석하지 않습니다.
- 이후 인증된 ChatGPT 연결에서 세 유형의 문서 생성·파일 반환을 확인했습니다. Cloudflare CPU 사용량과 Claude·Gemini 실제 계정 설치 검증은 남아 있습니다.
