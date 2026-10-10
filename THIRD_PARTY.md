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

서식 원본: 사용자가 제공한 질병관리청 「[10.8.목.조간] 임신당뇨병 산모의 자녀, 당뇨병 위험 최대 4배 이상 높아」 HWPX, 2026년 10월 8일 조간.

- 원본 SHA-256: `dbc9fd05d8286b4e2d6946b9bbafc0c80385713ae4a1067971c74c7b272ea4a9`
- 기관 마크, 대체불가 대한민국, 건강한 동행 슬로건, 1339 이미지를 원본 그대로 보존합니다.
- `templates/kdca-press.hwpx`와 `packages/kdca-press/assets/template.json`은 원본의 고정 서식에서 연구 본문·연구용 그림·작성자 메타데이터·연락처·이전 미리보기를 제거한 템플릿입니다.
- 원본 글꼴 이름과 크기는 보존하며 글꼴 파일은 배포하지 않습니다. 기관 이미지·표장에 프로젝트 코드의 MIT 라이선스를 적용하거나 별도 권리를 주장하지 않습니다.
- `scripts/import-kdca-template.py`로 해당 원본에서 템플릿을 다시 추출할 수 있습니다. 다른 문서 구조에 그대로 적용하는 범용 변환기는 아닙니다.

## 편집 참고

아래 문서에서는 구성 방식만 참고해 자체 편집 규칙을 작성했습니다. 원문 전문이나 그 통계·발언을 새 보도자료로 재배포하지 않습니다.

- 질병관리청 HIV 검사기관 워크숍: https://www.kdca.go.kr/bbs/kdca/42/311547/artclView.do?layout=unknown
- 행정안전부 출생등록 통계: https://www.mois.go.kr/frt/bbs/type010/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000008&nttId=122882
- 행정안전부 혜택알리미: https://www.mois.go.kr/frt/bbs/type010/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000008&nttId=115068
- 국립국어원 보도자료 작성 길잡이: https://www.korean.go.kr/front/etcData/etcDataView.do?etc_seq=663&mn_id=216&pageIndex=1

`examples/`의 인물 없는 기관·일정·수치·장소는 기능 검증을 위해 만든 가상 사례이며 실제 발표가 아닙니다.
