# 집에서 이어하기 — 실데이터 연결 체크리스트

> 2026-11-11 기준 정리. 위에서부터 순서대로 하면 됩니다. 자세한 설명은 [README](../README.md).
> Claude Code로 이어서 할 때는 "docs/HANDOFF.md 보고 이어서 하자"로 시작하면 됩니다.

## 지금 상태

| 항목 | 상태 |
|---|---|
| 사이트 | https://aftercltomoon.vercel.app — **데모 모드** (시트 미연결, 데모 계정으로 회원·운영진 화면 확인 가능) |
| 코드 | GitHub `rockskull/aftercltomoon` `main` · Vercel이 연결되어 **push하면 자동 배포** |
| 완료 | 캘린더·이벤트·제안서(로그인 필요), Google 로그인 코드, 회원권 기간 계산(**달 단위: 1일 시작 · 말일 종료**), 첫 등록 가격(1개월 10만 원), 입금 승인, 거래내역 매칭, 알림, PWA, 관리 화면, 동의서, 회계 장부, 사이트 결제 요청 제거, 초대장(`/invite`), 포스터 생성기(08), MOON STAMPS(06) |
| 실서비스 반영 | 스탬프(**StampDefinitions · StampAwards**)와 라디오(**RadioTracks**)는 시트 탭이 있고 Apps Script 배포가 새 버전이어야 동작해요 → 아래 "새 Code.gs 반영" |
| 남은 일 | ① Apps Script로 시트 연결 ② Google 로그인 설정 ③ Vercel 환경변수 ④ 데이터 채우기 |

---

## 0. 집 PC 준비 (처음 한 번)

```bash
git clone https://github.com/rockskull/aftercltomoon.git
cd aftercltomoon
git config user.email "vmftidls@naver.com"   # 이 저장소에만! (아래 주의)
npm install
npm run dev                                   # http://localhost:3000 (데모 모드)
```

- **커밋 메일 주의:** 이 프로젝트는 `vmftidls@naver.com`으로만 커밋합니다. 다른 메일로 커밋하면 Vercel이 배포를 막습니다(Blocked). 전역 설정(`--global`)은 바꾸지 마세요. 다른 프로젝트는 회사 메일을 씁니다.
- **회사 PC에만 있는 파일**(Git 제외)은 집에서 다시 만듭니다.
  - 비밀값: `npm run secrets` → `vercel-env.secret.txt` 생성
    - 회사 PC 파일의 값을 이미 Vercel에 넣었다면, 새 값으로 Vercel도 바꾸거나 회사 PC 파일을 안전하게 옮겨 쓰세요. **Vercel과 Apps Script의 값이 서로 같아야** 합니다.
  - 기존 회비 사용 내역: Google Drive에서 그 시트를 `.xlsx`로 다운로드 → `npm run ledger:convert -- "다운로드한파일.xlsx"` → `private/ledger-import.xlsx` 생성. 잔액이 **678,492원**으로 나오면 정상입니다.

---

## 1. 스프레드시트 + Apps Script (15분)

1. 실데이터 시트를 **Apps Script를 쓸 수 있는 계정**(개인 또는 크루 공용)으로 엽니다. 회사 계정은 Apps Script가 막혀 있을 수 있어요.
2. **확장 프로그램 → Apps Script** → `apps-script/Code.gs` 전체를 붙여넣고 저장합니다.
3. 함수 목록에서 **`setupSheets`**를 실행하고 권한을 승인합니다. 탭 16개, 머리글, 드롭다운, 기본 상품, 스탬프 4종, 설정이 만들어지고 시트 시간대가 서울로 바뀝니다. 템플릿을 이미 가져왔어도 안전합니다(빠진 것만 추가).
4. **프로젝트 설정(톱니) → 스크립트 속성**에 `vercel-env.secret.txt` 2번 섹션의 3개를 넣습니다: `PROPOSAL_SECRET`, `CRON_SECRET`, `SITE_URL`
5. **배포 → 새 배포 → 유형: 웹 앱** · 실행: **나** · 액세스: **모든 사용자** → 배포 → `/exec`로 끝나는 URL을 복사합니다.
6. **확인:** 그 URL을 브라우저에서 열어 `{"ok":true, ... "events":[...]}` 같은 JSON이 보이면 성공입니다.
7. (선택) 편집기에서 **+ → 스크립트**로 `Tick` 파일을 만들고 `apps-script/Tick.gs`를 붙여넣은 뒤 **`installTick`** 실행 → 15분마다 알림 스케줄러를 호출합니다(신청 시작·마감 알림이 더 제때 나감). 권한 2개(외부 서비스 연결·사용자 부재 시 실행)가 더 필요해서 `Code.gs`와 분리했습니다. 승인이 차단되면 `Tick` 파일을 지우세요 — Vercel Cron이 하루 한 번은 돌립니다.

> `Code.gs`를 고친 뒤에는 **배포 관리 → 수정(연필) → 버전: 새 버전 → 배포**. URL은 그대로 유지됩니다.

### 새 Code.gs 반영 (MOON STAMPS · AFTER HOURS RADIO, 2026-11-12)

이미 시트를 연결했다면 이것만 하면 됩니다. 순서대로:
1. Apps Script의 `Code.gs`를 저장소의 최신 `apps-script/Code.gs`로 **통째로 바꿔 붙여넣고** 저장 (`Tick.gs`는 없는 상태로)
2. **`setupSheets`** 실행 → `StampDefinitions`(스탬프 4종), `StampAwards`, `RadioTracks`(기본곡 14곡) 탭과 Settings의 `radio_player`(off)가 새로 생겨요. 기존 데이터는 그대로예요. 기본곡은 탭을 처음 만들 때 한 번만 들어가요.
3. **배포 관리 → 수정 → 새 버전 → 배포** (URL은 그대로)
4. 확인: ADMIN → 회원 → 아무 회원 → **Moon stamps** 칸에 "스탬프 발급" 버튼이 보이면 끝(배포 후 관리 화면 캐시 때문에 최대 1분 걸릴 수 있어요). "Apps Script 배포가 아직 이전 버전" 안내가 보이면 **3번(새 버전 배포)** 을 안 한 거예요. 탭이 시트에 있어도 배포를 올려야 사이트가 읽어요. **새 배포**가 아니라 **기존 배포 수정**이어야 URL이 그대로예요.

이 순서를 하기 전에 사이트를 배포해도 괜찮아요. 회원 화면은 스탬프를 "아직"으로만 보여 주고, 발급 버튼은 안내 문구로 바뀌며, `/radio`는 "준비하고 있어요"로 보여요. 다른 기능에는 영향이 없어요.

**라디오 플레이어 켜기:** 아지트에서 음악을 함께 트는 것은 이용 권한을 확인한 뒤로 정해서, 플레이어는 꺼진 채로 시작해요(목록·신청·삭제는 바로 됨). 확인되면 Settings 탭 `radio_player`를 `on`으로 바꾸면 1분 안에 켜져요. RIDE ON TIME은 공식 전곡 업로드가 없어 팬 업로드로 연결돼 있어요.

---

## 2. 시트 데이터 채우기

| 탭 | 넣을 것 |
|---|---|
| **Settings** | `sheet_url`(이 시트 주소) · `apply_notice`(신청 후 안내 문구, **계좌번호·금액은 넣지 않기**) · 동의서 주소(기본값 있음). 예전 템플릿의 `joining_fee` 행이 있다면 지워도 됩니다(더 이상 쓰지 않음) |
| **Plans** | `first_price` 열 확인: `PLAN-1M`에 **100000**(처음 등록하는 사람의 1개월권 가격), 나머지는 비워 두기. `setupSheets`가 이 열을 새로 만들 때 1개월권에 자동으로 채워요 |
| **Members** | 첫 운영진 한 줄 + 기존 회원. `member_id`는 겹치지 않게(예: `M-001`), `email`은 **Google 로그인 메일**, `role`(member/operator/admin), `status`=`active`, **`joined_at`(가입일)은 꼭** — 비어 있으면 첫 신청 때 1개월권이 첫 등록 가격(10만 원)으로 잡힙니다. 동의서를 이미 받았다면 `member_consent_at`에 날짜 |
| **Memberships** | 기존 회원의 현재 이용 기간: `membership_id`(예: `MS-001`), `member_id`, `plan_id`(`PLAN-1M`/`PLAN-6M`/`PLAN-12M`), `start_date`(**1일**), `end_date`(**말일**), `status`=`active`. 회원권은 달 단위예요. 이미 넣은 중간 날짜 기간(예: 11.11–12.10)은 그대로 둬도 되지만, 그 뒤 연장은 겹치지 않게 그다음 달 1일부터 시작해요. 맞추려면 ADMIN 회원 상세의 "기간·상태 수정"에서 달을 고르세요 |
| **Ledger** | `private/ledger-import.xlsx`의 내용을 2행부터 붙여넣기. "계약비"를 보증금으로 분류했고 출자금 날짜는 첫 지출일로 넣었으니 확인 |
| **Events / Enrollment** | 일정. `status`=`published`, Events는 `visibility`=`public`이어야 공개 |

---

## 3. Google 로그인 설정 (무료)

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트를 만듭니다(결제 등록 불필요).
2. **Google Auth Platform**
   - 브랜딩: 앱 이름, 지원 이메일 (**로고는 생략 권장** — 올리면 브랜드 확인 때문에 며칠 걸릴 수 있음)
   - 대상: 외부 → **프로덕션으로 게시** (테스트 상태면 등록한 사용자만 로그인 가능)
3. **클라이언트 → 클라이언트 만들기 → 웹 애플리케이션**
   - 승인된 리디렉션 URI: `vercel-env.secret.txt` 3번 섹션의 2개
4. 클라이언트 ID(`…apps.googleusercontent.com`)와 비밀번호(`GOCSPX-…`)를 복사합니다.

---

## 4. Vercel 환경변수 → 다시 배포

Vercel → `aftercltomoon` → **Settings → Environment Variables** → 환경 **Production**에 추가:

`AUTH_SECRET` · `CLUB_API_URL` · `CLUB_API_SECRET` · `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `CRON_SECRET` · `NEXT_PUBLIC_VAPID_PUBLIC_KEY` · `VAPID_PRIVATE_KEY` · `VAPID_SUBJECT`

- `DEMO_MODE`가 있다면 **삭제**하세요.
- 저장만으로는 적용되지 않습니다. **Deployments → 최신 배포 → Redeploy** (특히 `NEXT_PUBLIC_` 값은 빌드 때 들어갑니다).

---

## 5. 확인 체크리스트

- [ ] 상단 "데모 모드" 배너가 사라졌다
- [ ] `/login`에 **Google로 계속하기**가 있고, 운영진 메일로 로그인하면 헤더에 **ADMIN**이 보인다
- [ ] `/admin`에 Members 명단과 회원권이 보인다
- [ ] 다른 Google 계정으로 회원권 신청 → 운영진 **입금 확인**에서 승인 → 그 계정 MY에 **ACTIVE**
- [ ] `/admin/money` 잔액 = 678,492원 + 이후 승인한 회비
- [ ] **알림** 화면에서 푸시 켜기 (Android Chrome, iPhone은 홈 화면에 설치한 앱에서)
- [ ] 크론 수동 호출: `curl -H "Authorization: Bearer <CRON_SECRET>" https://aftercltomoon.vercel.app/api/cron/notifications` → `{"ok":true,...}`
- [x] Events 탭에 이벤트를 하나 넣고 1~2분 뒤 캘린더에 보인다 (2026-11-11 개관식으로 확인)
- [ ] **ADMIN → 이벤트**에서 이벤트를 등록·수정하면 캘린더에 바로 보인다
- [ ] 운영진으로 이벤트 상세 → **Make a poster** → FEED·STORY 각각 Save PNG (휴대폰은 공유 화면의 "이미지 저장")
- [ ] 로그아웃 상태에서 홈 맨 아래 **View invitation** → 초대장 → **Share invitation**으로 카톡 공유
- [ ] 회원권 신청 화면에 **시작 월** 선택이 보이고, 승인 카드에 "승인하면 ○○.01 – ○○.말일"로 나온다
- [ ] (새 Code.gs 반영 후) 운영진으로 회원 상세 → **Moon stamps → 스탬프 발급** → 그 회원 MY의 **My Moon Stamps**에 날짜와 함께 보이고 **Save stamp**로 카드 저장
- [ ] (새 Code.gs 반영 후) `/radio`에 기본곡 14곡이 보이고, 회원으로 YouTube 링크를 신청하면 바로 15번째로 붙는다. admin 계정에만 **Delete track**이 보인다
- [ ] admin으로 **ADMIN → 라디오**에서 순서 ▲▼, 표시 이름·메모 수정, 삭제 → 되돌리기가 된다 (operator는 보기만)

## 막힐 때

| 증상 | 확인할 것 |
|---|---|
| 로그인 버튼이 없다 | `GOOGLE_CLIENT_ID`/`SECRET`이 **Production**에 있는지, 재배포했는지 |
| `redirect_uri_mismatch` | Google 클라이언트의 리디렉션 URI 철자 (`https://aftercltomoon.vercel.app/api/auth/callback/google`) |
| 로그인했는데 "미등록 계정" | Members `email`이 로그인한 Google 메일과 같은지 |
| 관리 화면이 404 | Members `role`이 operator/admin이고 `status`가 active인지 |
| "시트에 저장하지 못했어요" | `CLUB_API_URL`/`CLUB_API_SECRET`, Apps Script 액세스가 "모든 사용자"인지, `PROPOSAL_SECRET`이 같은지 |
| `setupSheets` 승인 시 **"차단된 앱"** | ① 회사(Workspace) 계정은 관리자 정책이라 우회 불가 → 개인 계정 ② 시크릿 창에서 개인 계정 **하나만** 로그인(여러 계정이면 승인이 첫 계정으로 감) ③ `Code.gs` 1번 줄이 `/** @OnlyCurrentDoc */`이고 `Tick.gs`는 아직 넣지 않았는지 (개요 화면의 OAuth 범위가 스프레드시트 1개여야 함) |
| "Google 계정 액세스가 필요합니다" 경고 | 승인 창을 끝까지 안 거친 것. 확인되지 않은 앱 → **고급 → 이동(안전하지 않음)**, 권한 체크박스는 **모두 선택** |
| `missing columns … (run setupSheets)` | Apps Script에서 `setupSheets` 다시 실행 |
| Vercel 배포가 Blocked | 커밋 메일이 `vmftidls@naver.com`인지 (`git log -1 --format=%ae`) |

## 남은 결정·확인

- [ ] 카카오뱅크 모임통장 **거래내역 엑셀 실제 파일**로 파서 검증 (가린 파일을 `private/`에 넣고 요청)
- [ ] 이벤트 상세의 **참가비 표시** 유지 여부 (Vercel 무료 요금제 조건)
- [ ] 기존 **회비 사용 내역 시트**의 공유 범위 ("링크가 있는 모든 사용자" → 제한 권장)
- [ ] 예전 공개 저장소 `rockskull/aftermoon` 보관(Archive) 또는 삭제
- [ ] 카카오뱅크 거래내역 화면 등 실제 운영해 보며 불편한 점 정리
