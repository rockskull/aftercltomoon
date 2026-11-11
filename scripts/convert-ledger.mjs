// Converts the crew's old "회비 사용 내역" sheet into rows for the Ledger tab.
//
//   1. Google Drive에서 기존 회비 사용 내역 시트를 열고 파일 → 다운로드 → .xlsx
//   2. npm run ledger:convert -- "<다운로드한 파일.xlsx>"
//   3. private/ledger-import.xlsx 가 생기면, 실데이터 시트의 Ledger 탭 2행부터 붙여넣기
//
// Expected layout of the old sheet (as it was on 2026-11-11):
//   - a row with "회비 납부" followed by contributor names
//   - a row with "투자금" with each contributor's amount under their name
//   - a header row "날짜 | 사용목적 | 사용금액", then one expense per row
// The output contains real names and amounts: it goes to the git-ignored private/ folder.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const src = process.argv[2];
if (!src) {
  console.error('사용법: npm run ledger:convert -- "<회비 사용 내역.xlsx>"');
  process.exit(1);
}
const outDir = fileURLToPath(new URL("../private/", import.meta.url));
const out = `${outDir}ledger-import.xlsx`;

const HEADERS = ["entry_id", "date", "category", "description", "amount", "person", "method", "receipt_url", "memo", "status", "created_by", "created_at", "updated_at"];

const CATEGORY_RULES = [
  [/계약비|보증금/, "보증금"],
  [/월세|관리비/, "임대료·관리비"],
  [/수수료/, "수수료"],
  [/보험/, "보험"],
  [/벽|설치|공사/, "시설·공사"],
  [/용달|스타리아|퀵|택배/, "운송"],
  [/식사|음료|편의점|커피/, "식음료"],
  [/마대|피스|테이프|다이소|청소용품/, "소모품"],
  [/청소기|사다리|멀티탭|냉장고|매트|홀드/, "장비·용품"],
];
const categoryOf = (purpose) => CATEGORY_RULES.find(([re]) => re.test(purpose))?.[1] ?? "기타 지출";

// The ESM build of SheetJS has no file access of its own: read/write buffers with node:fs.
const wb = XLSX.read(readFileSync(src), { cellDates: true });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
const text = (v) => String(v ?? "").trim();
const find = (label) => {
  for (let r = 0; r < rows.length; r++) {
    const c = rows[r].findIndex((v) => text(v) === label);
    if (c !== -1) return { r, c };
  }
  return null;
};

const namesAt = find("회비 납부");
const investAt = find("투자금");
const headerAt = find("사용목적");
if (!namesAt || !investAt || !headerAt) {
  console.error("시트 구조를 찾지 못했어요. '회비 납부', '투자금', '사용목적' 칸이 있는지 확인해 주세요.");
  process.exit(1);
}

const contributors = [];
rows[namesAt.r].forEach((v, c) => {
  const name = text(v);
  if (c > namesAt.c && name && name.toUpperCase() !== "TOTAL") {
    const amount = Number(rows[investAt.r][c]);
    if (Number.isFinite(amount) && amount > 0) contributors.push({ name, amount });
  }
});

const header = rows[headerAt.r].map(text);
const dateCol = header.indexOf("날짜");
const purposeCol = header.indexOf("사용목적");
const amountCol = header.indexOf("사용금액");

const expenses = [];
for (const row of rows.slice(headerAt.r + 1)) {
  const d = row[dateCol];
  const purpose = text(row[purposeCol]);
  const amount = Number(row[amountCol]);
  if (d instanceof Date && purpose && Number.isFinite(amount) && amount > 0) {
    // SheetJS returns local-midnight dates; read the calendar day as written in the sheet.
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expenses.push({ date, purpose, amount });
  }
}
if (!expenses.length) {
  console.error("지출 행을 찾지 못했어요.");
  process.exit(1);
}

const firstDate = expenses.map((e) => e.date).sort()[0];
const nowIso = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19) + "+09:00";
let n = 0;
const id = () => `LG-IMPORT-${String(++n).padStart(3, "0")}`;
const ledger = [
  ...contributors.map((c) => ({
    entry_id: id(), date: firstDate, category: "출자금", description: "초기 출자", amount: c.amount, person: c.name,
    memo: "원본 시트에 날짜 없음: 첫 지출일로 기록",
  })),
  ...expenses.map((e) => ({
    entry_id: id(), date: e.date, category: categoryOf(e.purpose), description: e.purpose, amount: e.amount, person: "",
    memo: /계약비/.test(e.purpose) ? "계약금: 보증금 일부로 분류 (확인 필요)" : "",
  })),
].map((r) => ({ method: "", receipt_url: "", status: "active", created_by: "import", created_at: nowIso, updated_at: nowIso, ...r }));

const toDate = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const sheet = XLSX.utils.aoa_to_sheet([HEADERS, ...ledger.map((r) => HEADERS.map((h) => (h === "date" ? toDate(r[h]) : r[h])))], {
  cellDates: true,
  dateNF: "yyyy-mm-dd",
});
const outWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(outWb, sheet, "Ledger");
mkdirSync(outDir, { recursive: true });
writeFileSync(out, XLSX.write(outWb, { type: "buffer", bookType: "xlsx" }));

const income = contributors.reduce((s, c) => s + c.amount, 0);
const expense = expenses.reduce((s, e) => s + e.amount, 0);
const others = ledger.filter((r) => r.category === "기타 지출").map((r) => r.description);
console.log(`만들었어요: ${out}`);
console.log(`출자 ${contributors.length}명 · 지출 ${expenses.length}건 · 수입 ${income.toLocaleString()}원 · 지출 ${expense.toLocaleString()}원 · 잔액 ${(income - expense).toLocaleString()}원`);
console.log(`원본 시트의 "차액"과 잔액이 같은지 확인하세요.${others.length ? ` 기타 지출로 분류: ${others.join(", ")}` : ""}`);
