# v0.4.0 검증 현황

기록일: 2026-10-10 한국.

| 항목 | 상태 |
| --- | --- |
| KDCA Skill 지침·공통 Python 엔진 | 구현, 실제 원문 세 유형 생성 시험 |
| 현재 ChatGPT Work 개인 Skill | 설치·저장 확인; 새 대화에서 사용 가능 |
| Skill 단독 실행 | 추가 Python 패키지 없이 생성·구조 검사 확인 |
| stdio MCP | 공식 SDK 클라이언트로 도구·프롬프트·생성물 읽기 확인 |
| 원격 HTTP MCP | 로컬 실제 HTTP 서버에서 OAuth/PKCE·파일 전달 시험 |
| 임시 파일 격리·만료 | 다른 사용자 접근 차단, 잘못된 토큰, 만료 시험 |
| Claude용·Gemini용 Skill ZIP, 플러그인 ZIP | 각각 압축 해제 후 격리된 Python 실행 시험 통과 |
| 전체 자동 시험 | 15개 Node 시험 + Python 설치 설정 시험 2개 통과; Workers 실제 런타임 통합 시험 별도 통과 |
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
| 외부 원격 MCP 호스트 | Cloudflare 무료 Durable Objects 어댑터 추가; 사용자 계정 배포·CPU 실측 전 |
| ChatGPT·Claude·Gemini 각 실제 계정 연결 | 미검증; 현재 실행 환경의 Skill 시험과 구분 |
| 한컴오피스 열기·저장·재열기 | 미검증 |

자동 시험 통과는 모든 AI 플랫폼에서 설치가 끝났다는 뜻이 아닙니다. 플랫폼별 계정 기능·인증 호환성과 실제 한글 조판 검증이 남아 있습니다. 저장소는 dudrnjs8300/kdca-press입니다. 안내 사이트와 Skill 다운로드는 공개되었으며, 원격 MCP 호스팅은 별도로 남아 있습니다.

## Cloudflare Workers 추가 검증

- 로컬 workerd + Python/WASM + 실제 MCP SDK: 세 예시 각 5회, 총 15회 생성·다운로드 통과.
- 24개 문단·60개 근거 항목으로 확대한 입력도 생성 통과. 이는 모든 허용 입력 조합의 최악 시간을 보장하지 않습니다.
- 모든 예시 HWPX의 압축 해제된 ZIP 항목은 공통 Python 생성기의 결과와 일치했습니다.
- OAuth PKCE, 코드 재사용 거부, 토큰 폐기, 잘못된 다운로드 토큰, 없는 수치 거부 확인.
- SQL 어댑터의 로그인·임시 파일 복구, 사용자 격리, 만료 파일 삭제, 호출 제한 보존 시험 통과.
- [기록된 결과](../evals/workers/local-runtime.json)는 로컬 전체 경과 시간이며 실제 Cloudflare CPU 측정값이 아닙니다.
- Workers 경로에서는 SVG 쪽 미리보기를 제공하지 않습니다. HWPX 본문·표·서식은 동일합니다.
- 새 버전의 GitHub CI 결과는 해당 커밋의 Actions를 확인하세요. Cloudflare 배포 워크플로 실행에는 운영자의 계정 설정이 필요합니다.
