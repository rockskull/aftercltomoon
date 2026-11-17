# AFTER HOURS — The Little Club v7 · 개발자 납품 검수표

**기준일:** 2026-11-17. **실제 사이트 구현과 Neon 연동은 이 패키지만으로 검증된 것이 아님. 아래는 미검증 작업 목록.**

## 실제 사이트 기능 확인 (초기 상태: NOT VERIFIED)

| 검증 항목 | 상태 |
|---|---|
| 로그인 + 유효 회원권 검사: 페이지·API 직접 호출 보호, 만료 계정 차단 | NOT VERIFIED |
| 별명·MBTI 최초 입력/저장/수정, 게임에서 `별명 · MBTI · ON/OFF` 표시 | NOT VERIFIED |
| 16 MBTI 달토끼의 구별되는 행동 모션, 내 로컬 조작, 다른 회원 안정적 랜덤 위치 | NOT VERIFIED |
| 다른 회원 좌표·모션 저장/조회 API 0건 | NOT VERIFIED |
| 실내/실외 동일한 말풍선 최신 1건 저장·수정·삭제·영구 보존 | NOT VERIFIED |
| OFF 회원 토끼와 말풍선 유지, 채팅/메시지 히스토리 없음 | NOT VERIFIED |
| 다른 회원 말풍선 수정/삭제가 전경 화면에서 대체로 30초 내 자동 반영 | NOT VERIFIED |
| 말풍선과 타 회원 ON/OFF가 단일 `sync` 응답에 함께 포함 | NOT VERIFIED |
| 게임 진입 시 1회 + 활성 중 30초마다 단일 sync / 별도 반복 heartbeat 없음 | NOT VERIFIED |
| 자신의 탭 세션 정상 종료 이벤트(최선 노력), 다른 회원에게 다음 sync에서 OFF 표시 | NOT VERIFIED |
| 비정상 종료 마지막 heartbeat 75초 TTL + 타 브라우저 30초 polling OFF 반영 | NOT VERIFIED |
| 2개 탭/기기 중 하나 종료해도 나머지 탭 ON 유지 | NOT VERIFIED |
| 화면 숨김/다른 페이지/닫은 뒤 반복 sync 0건, 전경 복귀 시 즉시 최신 상태 | NOT VERIFIED |
| 기존 `MOON PROBLEMS` 실제 문제 링크(볼더링 벽 탭) | NOT VERIFIED |
| 기존 AFTER HOURS RADIO 실제 재생, 장면 이동 후 유지 여부 | NOT VERIFIED |
| 내 프로필 실제 스탬프 조회, 게임 행동→스탬프 자동 지급 없음 | NOT VERIFIED |
| 실제 공간 좌측 워크아웃 / 우측 암장 / 암장 앞 테이블 / 암장 뒤 라운지 | NOT VERIFIED |
| 일반/나이트 조명, 두 강아지, `매달려야 산다`, 공식 로고 원본 | NOT VERIFIED |
| 모바일 390px 기본 레이아웃·터치·모션 축소/저사양 테스트 | NOT VERIFIED |
| 공개 동의·권한/회원권 만료 시 타 회원 정보 미노출 | NOT VERIFIED |
| 기존 홈페이지와 합산한 Neon CU-hours/Vercel 함수 요청량 배포 전후 비교 | NOT VERIFIED |

## v7 사용량 및 지연 기준 — 예측 (실측 아님)

- **회원:** 9명 / **주:** 3회 / **세션:** 4분 → 월 `9 × 3 × 52 / 12 ≈ 117`회 / 월 누적 약 **7.8시간**.
- **sync:** 회당 시작 포함 **8~9회**, 월 약 **936~1,053 HTTP 요청**. 정상 종료 알림은 최대 약 **117회 추가 시도**. DB SQL 건수와 동일하다고 주장하지 않음.
- **전경 동기화 주기:** 30초. 정상 변경 반영 목표는 약 30초 이내, 비정상 종료 OFF는 마지막 신호에서 **75초 TTL + 30초 조회 주기 ≈ 105초 이내** 목표(오류/브라우저 제한 없다는 전제).
- 숨김/게임 이탈은 0 sync. 복귀는 즉시 sync. 말풍선은 직접 수정·삭제 전까지 유지.
- 정확한 **Neon 요금·CU-hours는 실측 전 NOT VERIFIED**. 기존 클럽 홈페이지와 함께 사용량 확인.

## 패키지 유효 범위

- `demo/index.html`은 독립 HTML 게임 데모. 실제 회원권·말풍선·Neon·라디오·문제·스탬프 연결이 구현됐다는 근거가 아님.
- `AFTER_HOURS_LITTLE_CLUB_CONCEPT.gif`는 6프레임 콘셉트 시안. 공식 원본 로고는 기존 사이트 에셋을 써야 함.
- `references`의 공사 중 사진 및 공간 콘셉트 자료는 최신 실측 도면으로 해석하지 않음.
- 개발자는 실제 브라우저 네트워크 로그, 권한별 API 호출, DB 값, 기기별 동작으로만 PASS 표시. 모든 항목이 실측 완료되는 것은 아님.

**완료 보고:** 구현된 파일/커밋, DB 변경사항과 롤백, 테스트 기기, PASS/FAIL/NOT VERIFIED 결과 및 스크린샷/로그, 미완료 원인을 전달. `DONE ≠ VERIFIED`.
