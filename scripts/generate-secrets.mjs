// Generates every secret the site needs into vercel-env.secret.txt (git-ignored).
// Prints nothing secret. Refuses to overwrite an existing file.
//
//   npm run secrets
//
// Copy the values into Vercel (Settings → Environment Variables) and the Apps
// Script properties, then delete the file. Values must match on both sides:
//   CLUB_API_SECRET (Vercel) = PROPOSAL_SECRET (Apps Script)
//   CRON_SECRET     (Vercel) = CRON_SECRET     (Apps Script)
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateVAPIDKeys } from "web-push";

const SITE = process.env.SITE_URL ?? "https://aftercltomoon.vercel.app";
const out = fileURLToPath(new URL("../vercel-env.secret.txt", import.meta.url));

if (existsSync(out)) {
  console.log(`이미 있어요: ${out}\n새로 만들려면 기존 파일을 지우고 다시 실행하세요. (Vercel과 Apps Script 값도 함께 바꿔야 해요)`);
  process.exit(0);
}

const token = (bytes) => randomBytes(bytes).toString("base64url");
const vapid = generateVAPIDKeys();
const clubApiSecret = token(32);
const cronSecret = token(32);

const text = `# AFTER CL TO MOON — generated secrets (git-ignored; delete after copying)
# Never paste these into chat, issues or commits.

######## 1) Vercel → Settings → Environment Variables (Production) ########
AUTH_SECRET=${token(48)}
CRON_SECRET=${cronSecret}
CLUB_API_SECRET=${clubApiSecret}
CLUB_API_URL=<Apps Script 웹앱 /exec URL>
GOOGLE_CLIENT_ID=<…apps.googleusercontent.com>
GOOGLE_CLIENT_SECRET=<GOCSPX-…>
NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapid.publicKey}
VAPID_PRIVATE_KEY=${vapid.privateKey}
VAPID_SUBJECT=mailto:<운영진 연락 메일>

######## 2) Apps Script → 프로젝트 설정 → 스크립트 속성 ########
PROPOSAL_SECRET=${clubApiSecret}
CRON_SECRET=${cronSecret}
SITE_URL=${SITE}

######## 3) Google OAuth 클라이언트 → 승인된 리디렉션 URI ########
${SITE}/api/auth/callback/google
http://localhost:3000/api/auth/callback/google
`;

writeFileSync(out, text, { encoding: "utf8", flag: "wx" });
console.log(`만들었어요: ${out}`);
