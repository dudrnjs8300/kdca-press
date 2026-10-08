# 참고 자료 및 라이선스

애플리케이션의 자체 코드는 MIT License입니다. 의존성과 참고 자료는 각자의 원래 조건을 따릅니다.

## Kordoc

- https://github.com/chrisryugj/kordoc
- 이 버전은 npm `kordoc@4.21.0`을 사용합니다.
- MIT License, Copyright (c) 2026 chrisryugj. 배포 시 npm 패키지에 포함된 LICENSE를 유지합니다.
- HWPX 컨테이너 검사와 SVG 미리보기에 사용합니다. 우리 서비스의 내용 편집·개인 인증·저장은 별도 구현입니다.

`hwp-auto-docfit`(https://github.com/haijun93/hwp-auto-docfit, MIT, Copyright (c) 2026 haijun93)은 검사·서식 처리 구조를 참고했으며 그 코드를 포함하지 않습니다. 사용자 PC 또는 Windows 한컴 COM 자동화에 의존하지 않도록 구성했습니다.

Skill에 포함된 Python 생성 코드는 자체 구현이고 표준 라이브러리만 사용합니다. Kordoc 코드는 오프라인 Skill 안에 포함되지 않으며 원격·로컬 MCP의 추가 미리보기에 사용합니다. `packages/kdca-press/assets/template.json`은 아래 파생 서식의 내부 XML을 UTF-8 텍스트로 보관한 것입니다.

## 질병관리청 공개 보도자료

서식 참고 원본: 질병관리청, Kor-GLASS 관련 보도자료 HWPX.

- 게시물: https://www.kdca.go.kr/bbs/kdca/41/312552/artclView.do?layout=unknown
- 첨부: https://www.kdca.go.kr/bbs/kdca/42/309587/download.do
- 원본 SHA-256: `8f98831189a73e1fc93389bb4dfdedfb3239efc3c727a0868312ecce6c5627cb`
- 원 게시물의 공공누리 출처표시 이용 안내를 참고했습니다. 기관 로고·사진·서드파티 자료에 대한 별도 권리를 주장하지 않습니다.

`templates/kdca-press.hwpx`는 참고 양식을 바탕으로 본문·개인정보·저자 메타데이터·이미지·원래 발언을 제거한 파생 서식입니다. 생성물에는 기관 로고가 없고 '참고 양식 / 보도자료 초안' 표시가 들어갑니다. 기관의 승인·보증·공식 서비스를 의미하지 않습니다. 원본 문서의 글꼴 파일은 포함하지 않습니다.

## 편집 참고

아래 문서에서는 구성 방식만 참고해 자체 편집 규칙을 작성했습니다. 원문 전문이나 그 통계·발언을 새 보도자료로 재배포하지 않습니다.

- 질병관리청 HIV 검사기관 워크숍: https://www.kdca.go.kr/bbs/kdca/42/311547/artclView.do?layout=unknown
- 행정안전부 출생등록 통계: https://www.mois.go.kr/frt/bbs/type010/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000008&nttId=122882
- 행정안전부 혜택알리미: https://www.mois.go.kr/frt/bbs/type010/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000008&nttId=115068
- 국립국어원 보도자료 작성 길잡이: https://www.korean.go.kr/front/etcData/etcDataView.do?etc_seq=663&mn_id=216&pageIndex=1

`examples/`의 인물 없는 기관·일정·수치·장소는 기능 검증을 위해 만든 가상 사례이며 실제 발표가 아닙니다.
