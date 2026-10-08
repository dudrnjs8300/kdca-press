# Skill과 MCP의 역할

AI 서비스가 문장을 작성하고, Skill이 편집 절차를 안내하며, Python 공통 엔진이 검사·HWPX 생성을 수행합니다. MCP는 이 엔진을 외부에서 호출할 수 있게 하는 접속 방식입니다. 이 저장소는 모델 API를 별도로 호출하지 않습니다.

| 구성 | 구현 | 책임 |
| --- | --- | --- |
| 편집 Skill | `packages/kdca-press/SKILL.md`, references | 핵심 메시지 선정, 제목·리드·문단 퇴고, 의미 대조 |
| 공통 엔진 | `scripts/kdca_press.py` | 수치·근거 검사, KDCA 참고 서식 HWPX, 구조·내용 보존 검사 |
| 로컬 MCP | `src/stdio.js` | 표준 입출력 MCP, 메모리 생성물 resource |
| 원격 MCP | `src/remote.js`, `src/mcp-v2.js` | Streamable HTTP, GitHub 인증을 이용한 OAuth/PKCE, 임시 다운로드 |
| 추가 미리보기 | Kordoc worker | HWPX 검사와 SVG; 실패해도 생성 파일 전달 가능 |
| GitHub Pages | `site-dist/` | 소개·설치 파일 다운로드; AI 생성 서버 아님 |

Skill은 Python 표준 라이브러리만 사용합니다. HWPX 안의 XML을 UTF-8 JSON 자산으로 묶어 실행 시 ZIP으로 조립합니다. Gemini에서 스크립트의 외부 인터넷 연결이 없어도 필요한 자산이 모두 있습니다. Windows·한컴 COM·DLL과 사용자 PC 설치에 의존하지 않습니다.

공통 Python 코드의 줄 높이 계산은 보수적인 글자 폭 추정입니다. Kordoc의 모든 편집 기능이나 hwp-auto-docfit의 한컴 조판 자동화를 이식한 것은 아닙니다. 파일은 한컴이 다시 조판할 수 있도록 문단·표·스타일을 보존합니다.

## 플랫폼 적용 근거

공식 문서 기준으로 구현한 지원 경로입니다. 기능 노출은 계정·플랜·지역·관리자 설정에 따라 달라집니다. 문서 지원과 실제 계정 시험 결과를 구분합니다.

- [OpenAI Skills](https://developers.openai.com/plugins/build/skills): Skill에 지침·참고 자료·실행 코드를 포함할 수 있습니다.
- [OpenAI Plugins](https://developers.openai.com/plugins/build/plugins): `plugin.json`과 skills 폴더로 배포물을 구성합니다. 플러그인 ZIP을 만든 것과 공개 디렉터리 등록은 다릅니다. MCP 매핑은 실제 서버 등록 후 추가합니다.
- [Claude custom Skills](https://support.claude.com/en/articles/12512198-how-to-create-custom-skills): 코드 실행을 켜고 Skill 폴더가 들어 있는 ZIP을 업로드합니다.
- [Gemini Skills](https://support.google.com/gemini/answer/17094296?hl=en): SKILL.md, 텍스트 자산과 Python 스크립트를 포함합니다. 인터넷 접근·바이너리 파일 제약을 고려했습니다.
- [Gemini Spark](https://support.google.com/gemini/answer/17094507?hl=en), [Skills 발표](https://blog.google/products-and-platforms/products/gemini/automate-tasks-with-skills/): Gemini에서도 Skill 활용 경로를 제공합니다.
- [MCP 구조](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture): MCP는 호스트·클라이언트·서버 사이 도구와 resource 연결입니다.

Google 공식 [사용자 정의 MCP 안내](https://support.google.com/gemini/answer/17209137?hl=en-ID)는 현재 미국·영어·개인 계정 조건을 명시합니다(2026-10-08 확인). 따라서 한국 사용자의 Gemini 경로는 Skill을 우선합니다.

일반 채팅창에 GitHub 주소만 넣는 것으로 실행 코드가 자동 설치되지는 않습니다. Skill 설치 기능 또는 MCP 연결 기능이 필요합니다. 원격 MCP는 각 서비스가 제공하는 사용자 정의 MCP 메뉴에서 배포된 HTTPS URL을 등록해야 합니다. 본 버전의 OAuth/DCR 조합이 각 계정에서 허용되는지는 접속 시험으로 확인해야 합니다.

## 호스팅 선택

Skill만 사용하면 별도 호스팅은 필요 없습니다. 원격 MCP에는 Node·Python 실행과 HTTPS를 제공하는 Render, 컨테이너 호스팅 또는 직접 운영 서버가 필요합니다. GitHub Pages는 정적 사이트이므로 원격 MCP를 대신하지 않습니다. 특정 제공업체의 데이터베이스·영구 디스크를 전제로 하지 않습니다.

제공한 Render 설정은 시험용 free 인스턴스입니다. 인증 정보와 파일을 메모리에만 보관하여 재시작·휴면 후 재연결이 필요합니다. 장기 운영 시에는 문서 저장과 별도로 인증 상태 지속성, 가용성, 사용자 수를 검토해야 합니다. 영구 문서함이 필요해서 Render를 쓰는 구조가 아닙니다.
