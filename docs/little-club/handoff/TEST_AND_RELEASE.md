# QA / 배포 차단 기준 — DONE ≠ VERIFIED

| 분류 | 테스트 케이스 | 판정 | 증거 |
|---|---|---|---|
| P0 | 비로그인 사용자의 직접 URL 접근 차단 | NOT VERIFIED | |
| P0 | `applicant`, `inactive`, 만료, 시작 전, 회비 미등록 계정 차단 | NOT VERIFIED | |
| P0 | `active` + 유효 회원권 계정 정상 진입 | NOT VERIFIED | |
| P0 | 게임 API 직접 호출도 동일 인증/인가 정책 | NOT VERIFIED | |
| P0 | 타인의 별명/MBTI/스탬프 교차 조회 불가 | NOT VERIFIED | |
| P0 | 최초 별명/MBTI 저장·변경·재로그인 후 유지 | NOT VERIFIED | |
| P0 | 실내/실외 현재 말풍선, 이력·채팅 없음 | NOT VERIFIED | |
| P0 | 우측 벽 클릭 → 실제 `/problems` 데이터/링크 | NOT VERIFIED | |
| P0 | 실제 `/radio` 플레이어 동작·폴백 / 허위 재생 없음 | NOT VERIFIED | |
| P0 | 실제 스탬프만 조회, 게임 보상 자동 지급 없음 | NOT VERIFIED | |
| P1 | 왼쪽 운동기구/오른쪽 벽/앞 테이블/뒤 라운지 | NOT VERIFIED | |
| P1 | 실제 야간 조명 참고, 공간 원본 구조 보존 | NOT VERIFIED | |
| P1 | 승인 원본 로고, `매달려야 산다` 정확한 표기 | NOT VERIFIED | |
| P1 | 두 강아지 외형 및 자연스러운 동작 | NOT VERIFIED | |
| P1 | 달토끼 16 MBTI 각기 구분 가능한 모션, 이름표 | NOT VERIFIED | |
| P1 | 모바일 390px 가로 스크롤·터치 오류 없음 | NOT VERIFIED | |
| P1 | 키보드 WASD/방향키/E, 모달 포커스/닫기 | NOT VERIFIED | |
| P1 | `prefers-reduced-motion`, 비활성 탭 렌더 중지 | NOT VERIFIED | |
| P1 | 기존 `/me`·`/radio`·`/problems` 기능 회귀 없음 | NOT VERIFIED | |
| P1 | 이미지/애니메이션 성능·네트워크 요청 과다 없음 | NOT VERIFIED | |

## 개발자 검증 기록 형식

- 기준 배포 URL / 커밋 / 빌드 로그:
- DB 마이그레이션 파일 및 롤백:
- 서버 회원권 판정 함수/코드 경로:
- 화면 캡처(데스크톱/모바일)와 사용 브라우저:
- 각 항목 `PASS / FAIL / NOT VERIFIED`, 근거와 담당자:
- 실패/미구현/미검증의 후속 조건:

## 데모와 운영 검증의 차이

`demo/index.html`은 파일로 로컬 오픈하면 데모 동작을 허용하지만, 운영 사이트에서 회원권을 안전하게 확인하는 구현이 아닙니다. 로컬 데모의 버튼·애니메이션 동작 통과는 서버 권한, Neon 저장, 실제 라디오·문제·스탬프 연동의 PASS를 의미하지 않습니다.
