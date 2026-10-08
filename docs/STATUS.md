# v0.2.0 검증 현황

기록일: 2026-10-08 UTC / 2026-10-09 한국.

| 항목 | 상태 |
| --- | --- |
| KDCA Skill 지침·공통 Python 엔진 | 구현, 실제 원문 세 유형 생성 시험 |
| 현재 ChatGPT Work 개인 Skill | 설치·저장 확인; 새 대화에서 사용 가능 |
| Skill 단독 실행 | 추가 Python 패키지 없이 생성·구조 검사 확인 |
| stdio MCP | 공식 SDK 클라이언트로 도구·프롬프트·생성물 읽기 확인 |
| 원격 HTTP MCP | 로컬 실제 HTTP 서버에서 OAuth/PKCE·파일 전달 시험 |
| 임시 파일 격리·만료 | 다른 사용자 접근 차단, 잘못된 토큰, 만료 시험 |
| Claude용·Gemini용 Skill ZIP, 플러그인 ZIP | 각각 압축 해제 후 격리된 Python 실행 시험 통과 |
| 전체 자동 시험 | 12개 통과; 최종 서식 수정 후 공통 MCP·엔진 시험 5개 재통과 |
| 화면 확인 | 데스크톱·모바일 오류/가로 넘침 없음, 다운로드·데모 로그인 확인 |
| HWPX 참고 미리보기 | 세 유형 모두 2쪽, Kordoc 경고 없음; 눈으로 본문·표 확인 |
| 배포 설정 | Render Blueprint와 플러그인 manifest 공식 JSON Schema 검증 통과 |
| GitHub 공개 저장소 | main에 소스·설치 파일 게시 |
| 안내 사이트 | https://dudrnjs8300.github.io/kdca-press/ 공개 및 HTTP 200 확인 |
| GitHub 원격 자동 검사 | checks 성공: 설치·구문·전체 시험·배포물 빌드 통과 |
| GitHub Releases | 태그 기반 자동화 준비; 별도 release 게시 전 |
| 외부 원격 MCP 호스트 | 미배포 |
| ChatGPT·Claude·Gemini 각 실제 계정 연결 | 미검증; 현재 실행 환경의 Skill 시험과 구분 |
| 한컴오피스 열기·저장·재열기 | 미검증 |

자동 시험 통과는 모든 AI 플랫폼에서 설치가 끝났다는 뜻이 아닙니다. 플랫폼별 계정 기능·인증 호환성과 실제 한글 조판 검증이 남아 있습니다. 저장소는 dudrnjs8300/kdca-press입니다. 안내 사이트와 Skill 다운로드는 공개되었으며, 원격 MCP 호스팅은 별도로 남아 있습니다.
