# 출처와 구현 범위

KDCA 공개 보도자료의 참고 양식을 바탕으로 본문·이미지·이전 작성자 메타데이터를 제거한 템플릿을 사용한다. 기관 공식 배포 도구가 아니다.

- 공개 문서: https://www.kdca.go.kr/bbs/kdca/41/312552/artclView.do?layout=unknown
- HWPX 첨부: https://www.kdca.go.kr/bbs/kdca/42/309587/download.do
- 원본 SHA-256: 8f98831189a73e1fc93389bb4dfdedfb3239efc3c727a0868312ecce6c5627cb
- 이용 표시는 원 공개 페이지의 공공누리 출처 표시 조건을 따른다. 공공 로고·원문 사진은 이 패키지에 포함하지 않는다.

Python 생성·검사 코드는 이 프로젝트에서 작성한 코드이며 추가 패키지를 설치하거나 인터넷에 접속하지 않는다. HWPX 내부 XML을 assets/template.json에 보관하고 실행 시 문서를 조립한다. HWPX 구조 검사는 한컴오피스 조판 인증이 아니다.

참고 프로젝트:
- Kordoc: https://github.com/chrisryugj/kordoc — MIT, Copyright (c) 2026 chrisryugj. MCP 패키지가 사용하는 HWPX 검사·미리보기 엔진. 이 오프라인 Skill에는 Kordoc 실행 코드를 포함하지 않는다.
- hwp-auto-docfit: https://github.com/haijun93/hwp-auto-docfit — MIT, Copyright (c) 2026 haijun93. 문서 검사와 서식 정리의 구성 방식을 참고했다. Windows/한글 자동화 코드와 DLL은 포함하지 않는다.
