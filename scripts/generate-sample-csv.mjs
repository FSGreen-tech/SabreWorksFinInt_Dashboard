/* ------------------------------------------------------------------ */
/*  Generates a complete, self-consistent sample sheet.                 */
/*      node scripts/generate-sample-csv.mjs                            */
/*                                                                     */
/*  Writes one CSV per tab into sample-data/, ready to paste straight   */
/*  into Google Sheets.                                                 */
/*                                                                     */
/*  The ledger is generated to hit the four bucket totals EXACTLY, so   */
/*  the resulting sheet reconciles against the same golden-master       */
/*  figures the dashboard was built from. With all 82 rows present the  */
/*  transcribed fallback in raw.js stops firing and every headline      */
/*  figure becomes ledger-derived — which is the point of the exercise. */
/*                                                                     */
/*  Deterministic: a fixed PRNG seed means re-running produces byte-     */
/*  identical files, so the CSVs diff cleanly in review.                */
/* ------------------------------------------------------------------ */

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { normalizePayload } from "../src/data/normalize.js";
import { buildDashboard, reconcile, daysBetween } from "../src/data/derive.js";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "sample-data");
const AS_OF = "2026-07-19";

/* ------------------------------------------------------------------ */
/*  Deterministic PRNG                                                  */
/* ------------------------------------------------------------------ */

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260719);
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (lo, hi) => lo + rand() * (hi - lo);

/* ------------------------------------------------------------------ */
/*  Targets — the figures the dashboard has always reported.            */
/* ------------------------------------------------------------------ */

const BUCKET_TARGETS = [
  { key: "le30",  count: 16, principal: 500_000_000, payable: 631_173_750,   dayRange: [0, 30] },
  { key: "31-60", count: 14, principal: 318_632_500, payable: 434_375_556,   dayRange: [31, 60] },
  { key: "61-90", count: 10, principal: 142_002_500, payable: 200_264_069,   dayRange: [61, 90] },
  { key: "90+",   count: 42, principal: 907_380_000, payable: 1_220_747_275, dayRange: [91, 210] },
];

/**
 * The seven ledger rows that were legible in the source export, verbatim.
 * They all fall in the ≤30-day bucket, so the generator only has to invent
 * the remaining nine rows of that bucket.
 */
const REAL_ROWS = [
  { customer: "SODIPO SAMSON OLAKUNLE",       realtor: "HAFBAM",      invested: 50_000_000,  at_maturity: 62_500_000,  start_date: "2026-04-19", maturity_date: "2026-07-19" },
  { customer: "FASHINA KHADIJAT ABIOSE",      realtor: "HAFBAM",      invested: 100_000_000, at_maturity: 125_000_000, start_date: "2026-04-21", maturity_date: "2026-07-21" },
  { customer: "MISS DAODU MODUPE OLUWABUNMI", realtor: "MADAM ALICE", invested: 5_000_000,   at_maturity: 6_092_500,   start_date: "2026-04-22", maturity_date: "2026-07-22" },
  { customer: "MISS ELABOR REJOICE EHIZOMO",  realtor: "DUNNI",       invested: 1_000_000,   at_maturity: 1_095_000,   start_date: "2026-04-23", maturity_date: "2026-07-23" },
  { customer: "FEHINTOLA JULIUS OLATOYE",     realtor: "MADAM ALICE", invested: 20_000_000,  at_maturity: 28_000_000,  start_date: "2026-04-24", maturity_date: "2026-07-24" },
  { customer: "AGBONTALOR ELIZABETH ODEGUA",  realtor: "ZIKAN",       invested: 17_000_000,  at_maturity: 24_140_000,  start_date: "2026-04-26", maturity_date: "2026-07-26" },
  { customer: "MRS ATUNNISE ARINOLA",         realtor: "ARINOLA",     invested: 20_000_000,  at_maturity: 24_000_000,  start_date: "2026-04-27", maturity_date: "2026-07-27" },
];

/**
 * Realtor mix, weighted so the volume ranking resembles the source bar chart
 * (HAFBAM and ZIKAN dominant). Exact per-realtor totals were only ever
 * estimates read off bar lengths, so they are not treated as targets — once
 * the ledger is complete the rollup is derived from it and becomes the truth.
 */
const MAJOR_REALTORS = [
  ["HAFBAM", 14], ["ZIKAN", 12], ["QUEEN OLIJE REALTY", 8],
  ["ARINOLA", 7], ["HAFBAM GLOBAL LTD", 5],
];

const MID_REALTORS = [
  ["MADAM ALICE", 5], ["QUEEN", 4],
  ["PRING CITY REALTORS AND ESTATE LIMITED", 4], ["BANIRE ADETOUN ELIZABETH", 3],
];

const MINOR_REALTORS = [
  ["MR. KADIRI", 2], ["MRS EROMOSELE EBERE JOY", 2], ["OLABISI TAIWO", 2],
  ["NAS", 2], ["DUNNI", 2], ["SOPHIA", 2], ["EGO", 1], ["MR TOLU", 1],
  ["MR KUNLE", 1], ["UNASSIGNED", 2],
];

const expand = (list) =>
  list.flatMap(([name, weight]) => Array.from({ length: weight }, () => name));

const MAJOR_POOL = expand(MAJOR_REALTORS);
const MID_POOL = expand([...MAJOR_REALTORS, ...MID_REALTORS]);
const ALL_POOL = expand([...MAJOR_REALTORS, ...MID_REALTORS, ...MINOR_REALTORS]);

/**
 * Deposit size and realtor are correlated on purpose. Assigning them
 * independently let a one-deposit minor realtor draw a ₦100m ticket and top
 * the volume chart, which contradicts the source data it is standing in for.
 */
function realtorFor(principal) {
  if (principal >= 40_000_000) return pick(MAJOR_POOL);
  if (principal >= 10_000_000) return pick(MID_POOL);
  return pick(ALL_POOL);
}

/**
 * Names are split by gender so titles pair correctly — a random title against
 * a random first name produces "MISS TUNDE" and "MR ZAINAB", which any
 * Nigerian reader would spot as fake on the first glance at the ledger.
 */
const MALE_NAMES = [
  "ADEBAYO", "IBRAHIM", "EMEKA", "TUNDE", "CHINEDU", "MUSA", "SEGUN",
  "OBINNA", "KAYODE", "BABATUNDE", "IFEANYI", "SULEIMAN", "OLADIMEJI",
  "GBENGA", "NNAMDI", "SAMUEL", "AHMED", "OKECHUKWU", "UCHENNA", "KELECHI",
  "OLUWASEUN", "EKENE", "CHUKWUEMEKA", "ADEWALE", "OLUMIDE", "NURUDEEN",
];

const FEMALE_NAMES = [
  "CHIAMAKA", "NGOZI", "FOLASADE", "AISHA", "BLESSING", "YETUNDE",
  "AMARACHI", "HALIMA", "ZAINAB", "MOTUNRAYO", "CHIOMA", "RUKAYAT",
  "ADAEZE", "MARYAM", "BUKOLA", "PRECIOUS", "TITILAYO", "UCHECHI",
  "FUNMILAYO", "NKECHI", "OLAMIDE", "TEMITOPE", "ADAOBI", "KUDIRAT",
];

const MALE_TITLES = ["MR", "MR", "DR", ""];
const FEMALE_TITLES = ["MRS", "MISS", "MRS", "DR", ""];

const SURNAMES = [
  "ADEYEMI", "OKONKWO", "BALOGUN", "ELUEMUNOR", "ABUBAKAR", "OGUNDIPE",
  "NWACHUKWU", "LAWAL", "ADESANYA", "OKAFOR", "BELLO", "OYELARAN", "EZEUGWU",
  "SALAMI", "ADEBAMBO", "ANYANWU", "SHOYEBO", "IBEKWE", "AKINTOLA", "UZOMA",
  "OGUNLEYE", "MADUEKE", "OLANIYAN", "CHUKWU", "ADENIRAN", "ONYEKA",
  "FAGBEMI", "NWOSU", "ADEGOKE", "ILOABACHIE", "SANUSI", "OKORIE",
  "ARIYIBI", "EMEKWUE", "OLUWOLE", "NDUKWE", "TIJANI", "OBIAGELI",
];

const usedNames = new Set();

function customerName() {
  for (let attempt = 0; attempt < 500; attempt++) {
    const male = rand() < 0.5;
    const title = pick(male ? MALE_TITLES : FEMALE_TITLES);
    const first = pick(male ? MALE_NAMES : FEMALE_NAMES);
    const name = `${title} ${first} ${pick(SURNAMES)}`.trim();
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
  throw new Error("Ran out of unique customer names");
}

/* ------------------------------------------------------------------ */
/*  Ledger generation                                                   */
/* ------------------------------------------------------------------ */

const addDays = (iso, days) =>
  new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Produce `count` principals summing to exactly `total`.
 *
 * Deposits are drawn from a realistic mix of retail and institutional sizes,
 * scaled to the target, rounded to the nearest ₦100,000, then the rounding
 * residual is absorbed by the largest row — where it is proportionally
 * smallest and so least visible.
 */
function splitPrincipal(count, total) {
  let raw = Array.from({ length: count }, () => {
    const roll = rand();
    if (roll < 0.45) return between(1_000_000, 10_000_000);
    if (roll < 0.8) return between(10_000_000, 40_000_000);
    return between(40_000_000, 120_000_000);
  });

  const scale = total / raw.reduce((a, b) => a + b, 0);
  let values = raw.map((v) => Math.max(500_000, Math.round((v * scale) / 100_000) * 100_000));

  const largest = values.indexOf(Math.max(...values));
  values[largest] += total - values.reduce((a, b) => a + b, 0);

  if (values.some((v) => v < 500_000)) throw new Error("principal split went negative");
  return values;
}

/**
 * Assign an at-maturity value to each principal so the bucket sums to exactly
 * `totalPayable`, with per-row ROI jittered around the bucket's blended rate.
 */
function splitPayable(principals, totalPayable) {
  const blended = totalPayable / principals.reduce((a, b) => a + b, 0);

  let values = principals.map((p) =>
    Math.round(p * blended * between(0.88, 1.12))
  );

  const largest = principals.indexOf(Math.max(...principals));
  values[largest] += totalPayable - values.reduce((a, b) => a + b, 0);

  // An at-maturity below principal would mean a client lost money — never
  // right for a fixed-return deposit, and a sign the jitter was too wide.
  principals.forEach((p, i) => {
    if (values[i] < p) throw new Error(`row ${i}: at_maturity below principal`);
  });
  return values;
}

function buildLedger() {
  const rows = [];

  for (const target of BUCKET_TARGETS) {
    const seeded = target.key === "le30" ? REAL_ROWS : [];

    const remaining = target.count - seeded.length;
    const remainingPrincipal =
      target.principal - seeded.reduce((s, r) => s + r.invested, 0);
    const remainingPayable =
      target.payable - seeded.reduce((s, r) => s + r.at_maturity, 0);

    const principals = splitPrincipal(remaining, remainingPrincipal);
    const payables = splitPayable(principals, remainingPayable);

    rows.push(...seeded.map((r) => ({ ...r, status: "active" })));

    const [lo, hi] = target.dayRange;
    for (let i = 0; i < remaining; i++) {
      // Spread evenly across the bucket's window rather than clustering.
      const daysLeft = Math.round(lo + ((hi - lo) * i) / Math.max(1, remaining - 1));
      const maturity = addDays(AS_OF, daysLeft);
      const tenor = pick([90, 120, 180, 270, 365]);

      rows.push({
        customer: customerName(),
        realtor: realtorFor(principals[i]),
        invested: principals[i],
        at_maturity: payables[i],
        start_date: addDays(maturity, -tenor),
        maturity_date: maturity,
        status: "active",
      });
    }
  }

  return rows;
}

/* ------------------------------------------------------------------ */
/*  The other three tabs                                                */
/* ------------------------------------------------------------------ */

const CASH = [
  { account: "BROADVIEW",         type: "Bank",      balance: 420_000_000, estimated: "TRUE" },
  { account: "SKY CAPITAL",       type: "Bank",      balance: 180_000_000, estimated: "TRUE" },
  { account: "GTB Bank",          type: "Bank",      balance: 92_224_209,  estimated: "FALSE" },
  { account: "MD",                type: "Placement", balance: 78_000_000,  estimated: "FALSE" },
  { account: "KEYSTONE BANK",     type: "Bank",      balance: 51_866_985,  estimated: "FALSE" },
  { account: "FCMB BANK",         type: "Bank",      balance: 7_326_106,   estimated: "FALSE" },
  { account: "UNITY BANK",        type: "Bank",      balance: 4_418_967,   estimated: "FALSE" },
  { account: "UBA BANK",          type: "Bank",      balance: 3_621_583,   estimated: "FALSE" },
  { account: "ALTERNATIVE BANK",  type: "Bank",      balance: 3_500_000,   estimated: "FALSE" },
  { account: "IMPERIAL MORTGAGE", type: "Placement", balance: 2_000_000,   estimated: "FALSE" },
  { account: "GTB",               type: "Bank",      balance: 500_000,     estimated: "FALSE" },
  { account: "ZENITH BANK",       type: "Bank",      balance: 397_913,     estimated: "FALSE" },
  { account: "FIDELITY BANK",     type: "Bank",      balance: 46_161,      estimated: "FALSE" },
  { account: "WEMA BANK",         type: "Bank",      balance: 20_000,      estimated: "FALSE" },
];

const PROJECTS = [
  { name: "Lekki Phase 2 Estate",         budget: 89_999_966, status: "planned" },
  { name: "Ibeju-Lekki Land Acquisition", budget: 59_999_979, status: "planned" },
  { name: "Ajah Terraces Development",    budget: 40_000_000, status: "planned" },
  { name: "Epe Commercial Plaza",         budget: 20_000_000, status: "planned" },
];

/**
 * Product inflow for the reporting month, from the Sabreworks July Inflow
 * report. Complete as printed — nothing here is reconstructed.
 *
 * `period` is explicit on every row even though it could be inferred from
 * meta.as_of, because the tab is append-only: next month's rows go underneath
 * these with their own period, and the dashboard shows the newest month it
 * finds.
 */
const SALES_PERIOD = AS_OF.slice(0, 7);

const SALES = [
  { product: "SabreFlexx",   period: SALES_PERIOD, inflow: 519_036_000 },
  { product: "OPIC",         period: SALES_PERIOD, inflow: 178_000_000 },
  { product: "Oranje",       period: SALES_PERIOD, inflow: 50_000_000 },
  { product: "Grosvenors",   period: SALES_PERIOD, inflow: 10_000_000 },
  { product: "Ikise",        period: SALES_PERIOD, inflow: 4_155_909 },
  { product: "Other Income", period: SALES_PERIOD, inflow: 2_675_341 },
  { product: "Moniya",       period: SALES_PERIOD, inflow: 1_000_000 },
  { product: "Mowe",         period: SALES_PERIOD, inflow: 30_000 },
];

const META = [{ as_of: AS_OF, currency: "NGN", deposit_count: 82 }];

/* ------------------------------------------------------------------ */
/*  CSV                                                                 */
/* ------------------------------------------------------------------ */

function toCSV(rows, columns) {
  const escape = (v) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    columns.join(","),
    ...rows.map((row) => columns.map((c) => escape(row[c])).join(",")),
  ].join("\n") + "\n";
}

/** Minimal RFC-4180 reader, used to round-trip what we just wrote. */
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }

  const [header, ...body] = rows;
  return body
    .filter((r) => r.some((c) => c !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

/* ------------------------------------------------------------------ */
/*  Run                                                                 */
/* ------------------------------------------------------------------ */

const ledger = buildLedger();

const files = {
  "investments.csv": toCSV(ledger, [
    "customer", "realtor", "invested", "at_maturity",
    "start_date", "maturity_date", "status",
  ]),
  "cash.csv": toCSV(CASH, ["account", "type", "balance", "estimated"]),
  "projects.csv": toCSV(PROJECTS, ["name", "budget", "status"]),
  "sales.csv": toCSV(SALES, ["product", "period", "inflow"]),
  "meta.csv": toCSV(META, ["as_of", "currency", "deposit_count"]),
};

/* --- Round-trip the CSVs back through the real pipeline ------------- */

const payload = {
  meta: parseCSV(files["meta.csv"])[0],
  investments: parseCSV(files["investments.csv"]),
  cash: parseCSV(files["cash.csv"]),
  projects: parseCSV(files["projects.csv"]),
  sales: parseCSV(files["sales.csv"]),
};

const dash = buildDashboard(normalizePayload(payload));

const failures = [];
const expect = (name, actual, expected) => {
  if (!Object.is(actual, expected)) failures.push({ name, actual, expected });
};

expect("no rows rejected", dash.issues.length, 0);
expect("82 deposits", dash.depositCount, 82);
expect("ledger reads as complete", dash.ledgerComplete, true);

const kpi = (id) => dash.kpis.find((k) => k.id === id).value;
expect("Total Investments Collected", kpi("invested"), 1_868_015_000);
expect("Total Payable at Maturity",   kpi("payable"),  2_486_560_650);
expect("Total Cash Balances",         kpi("cash"),     843_921_924);
expect("Available to Spend",          kpi("available"), 212_748_174);

for (const target of BUCKET_TARGETS) {
  const b = dash.buckets.find((x) => x.key === target.key);
  expect(`bucket ${target.key} count`,     b.count,     target.count);
  expect(`bucket ${target.key} principal`, b.principal, target.principal);
  expect(`bucket ${target.key} payable`,   b.payable,   target.payable);
}

expect("8 products tracked", dash.sales.productCount, 8);
expect("July product inflow", dash.sales.total, 764_897_250);
expect("top product", dash.sales.top.name, "SabreFlexx");
expect("sales period", dash.sales.period, SALES_PERIOD);

for (const check of reconcile(dash)) {
  expect(`reconcile: ${check.name}`, check.actual, check.expected);
}

// Every row must sit in the bucket its maturity date implies.
ledger.forEach((row, i) => {
  const days = daysBetween(AS_OF, row.maturity_date);
  if (row.at_maturity < row.invested) {
    failures.push({ name: `row ${i + 2}: at_maturity below principal`, actual: row.at_maturity, expected: `>= ${row.invested}` });
  }
  if (days < 0) {
    failures.push({ name: `row ${i + 2}: matures before as_of`, actual: days, expected: ">= 0" });
  }
});

const naira = (n) => (typeof n === "number" ? `₦${n.toLocaleString("en-NG")}` : String(n));

if (failures.length) {
  console.error(`\n  ✗ generated data failed ${failures.length} check(s) — nothing written\n`);
  failures.forEach((f) =>
    console.error(`    ${f.name}\n      expected: ${naira(f.expected)}\n      actual:   ${naira(f.actual)}\n`)
  );
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(OUT_DIR, name), content, "utf8");
}

console.log(`\n  ✓ sample sheet generated and reconciled — sample-data/\n`);
console.log(`    investments.csv   ${ledger.length} rows`);
console.log(`    cash.csv          ${CASH.length} rows`);
console.log(`    projects.csv      ${PROJECTS.length} rows`);
console.log(`    sales.csv         ${SALES.length} rows`);
console.log(`    meta.csv          1 row\n`);
console.log(`    invested          ${naira(kpi("invested"))}`);
console.log(`    payable           ${naira(kpi("payable"))}`);
console.log(`    cash              ${naira(kpi("cash"))}`);
console.log(`    available         ${naira(kpi("available"))}`);
console.log(`    july inflow       ${naira(dash.sales.total)} across ${dash.sales.productCount} products`);
console.log(`    realtors          ${dash.realtors.length} derived from the ledger`);
console.log(`    ledger complete   ${dash.ledgerComplete} (fallback aggregates retired)\n`);
