/* ------------------------------------------------------------------ */
/*  Golden-master check for the data layer.    `npm run verify:data`    */
/*                                                                     */
/*  Every expected figure below is lifted from the original hand-typed  */
/*  constants in App.jsx before Phase 1 replaced them with selectors.   */
/*  If a selector regresses, or the sheet ever goes internally          */
/*  inconsistent, this fails loudly instead of shipping a wrong number. */
/* ------------------------------------------------------------------ */

import { rawPayload } from "../src/data/raw.js";
import {
  normalizePayload,
  parseNumber,
  parseDate,
  parsePeriod,
} from "../src/data/normalize.js";
import { buildDashboard, reconcile } from "../src/data/derive.js";

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const ok = Object.is(actual, expected);
  if (ok) passed += 1;
  else failures.push({ name, actual, expected });
}

const naira = (n) =>
  typeof n === "number" ? `₦${n.toLocaleString("en-NG")}` : String(n);

/* --- 1. Cell coercion ---------------------------------------------- */

check("parseNumber: plain number", parseNumber(50_000_000), 50_000_000);
check("parseNumber: formatted currency", parseNumber("₦50,000,000.00"), 50_000_000);
check("parseNumber: thousands separators", parseNumber("1,868,015,000"), 1_868_015_000);
check("parseNumber: accountancy negative", parseNumber("(1,234)"), -1234);
check("parseNumber: leading minus", parseNumber("-1234"), -1234);
check("parseNumber: blank cell", parseNumber(""), null);
check("parseNumber: em-dash placeholder", parseNumber("—"), null);
check("parseNumber: non-numeric text", parseNumber("N/A"), null);
check("parseNumber: null", parseNumber(null), null);

check("parseDate: ISO passthrough", parseDate("2026-07-19"), "2026-07-19");
check("parseDate: ISO with time", parseDate("2026-07-19T00:00:00.000Z"), "2026-07-19");
check("parseDate: Date object", parseDate(new Date("2026-07-19T00:00:00Z")), "2026-07-19");
check("parseDate: DD/MM/YYYY", parseDate("19/07/2026"), "2026-07-19");
check("parseDate: blank cell", parseDate(""), null);

check("parsePeriod: YYYY-MM", parsePeriod("2026-07"), "2026-07");
check("parsePeriod: single-digit month", parsePeriod("2026-7"), "2026-07");
check("parsePeriod: full ISO date", parsePeriod("2026-07-19"), "2026-07");
check("parsePeriod: Date cell", parsePeriod(new Date("2026-07-19T00:00:00Z")), "2026-07");
check("parsePeriod: month name", parsePeriod("July 2026"), "2026-07");
check("parsePeriod: abbreviated month", parsePeriod("Jul 2026"), "2026-07");
check("parsePeriod: uppercase month", parsePeriod("JULY 2026"), "2026-07");
check("parsePeriod: MM/YYYY", parsePeriod("07/2026"), "2026-07");
check("parsePeriod: DD/MM/YYYY", parsePeriod("19/07/2026"), "2026-07");
check("parsePeriod: month 13 rejected", parsePeriod("2026-13"), null);
check("parsePeriod: blank cell", parsePeriod(""), null);
check("parsePeriod: nonsense", parsePeriod("sometime"), null);

/* --- 2. Build the dashboard ----------------------------------------- */

const normalized = normalizePayload(rawPayload);
const dash = buildDashboard(normalized);

check("no rows rejected during normalization", normalized.issues.length, 0);
check("all 7 legible ledger rows survived", dash.investments.length, 7);

/* --- 3. Derived days-left and bucketing ----------------------------- */
/*  Reproduces the days_left column that used to be typed into the      */
/*  ledger by hand, computed instead from maturity_date vs. as_of.      */

check("derived days-left matches the original hand-typed column",
  dash.investments.map((i) => i.daysLeft).join(","),
  "0,2,3,4,5,7,8");

check("all sample rows bucket as ≤30 days",
  dash.investments.every((i) => i.bucketKey === "le30"),
  true);

/* --- 4. Golden-master headline figures ------------------------------ */

const kpi = (id) => dash.kpis.find((k) => k.id === id).value;

check("KPI: Total Investments Collected", kpi("invested"), 1_868_015_000);
check("KPI: Total Payable at Maturity",   kpi("payable"),  2_486_560_650);
check("KPI: Total Cash Balances",         kpi("cash"),     843_921_924);
check("KPI: Available to Spend",          kpi("available"), 212_748_174);
check("82 active deposits", dash.depositCount, 82);

/* --- 5. Bucket figures ---------------------------------------------- */

const expectedBuckets = [
  { key: "le30",  payable: 631_173_750,   principal: 500_000_000, count: 16 },
  { key: "31-60", payable: 434_375_556,   principal: 318_632_500, count: 14 },
  { key: "61-90", payable: 200_264_069,   principal: 142_002_500, count: 10 },
  { key: "90+",   payable: 1_220_747_275, principal: 907_380_000, count: 42 },
];

expectedBuckets.forEach((expected) => {
  const actual = dash.buckets.find((b) => b.key === expected.key);
  check(`bucket ${expected.key}: payable`,   actual.payable,   expected.payable);
  check(`bucket ${expected.key}: principal`, actual.principal, expected.principal);
  check(`bucket ${expected.key}: count`,     actual.count,     expected.count);
});

/* --- 6. Cash --------------------------------------------------------- */

check("14 cash accounts", dash.cash.length, 14);
check("cash total", dash.totalCash, 843_921_924);

/* --- 7. Realtors ----------------------------------------------------- */

check("19 realtors listed", dash.realtors.length, 19);
check("top realtor by volume", dash.realtors[0].name, "HAFBAM");
check("realtor ids are unique",
  new Set(dash.realtors.map((r) => r.id)).size,
  dash.realtors.length);

/* --- 8. Sales — product inflow --------------------------------------- */
/*  Figures from the Sabreworks July Inflow report. The eight products   */
/*  must still sum to the printed total, and the shares must still sum   */
/*  to a whole 100% after rounding.                                      */

check("sales: reporting period", dash.sales.period, "2026-07");
check("sales: products tracked", dash.sales.productCount, 8);
check("sales: total July inflow", dash.sales.total, 764_897_250);
check("sales: top product", dash.sales.top.name, "SabreFlexx");
check("sales: top product inflow", dash.sales.top.inflow, 519_036_000);
check("sales: top product share", dash.sales.top.share.toFixed(3), "0.679");
check(
  "sales: product inflows sum to the total",
  dash.sales.products.reduce((sum, p) => sum + p.inflow, 0),
  764_897_250,
);
check(
  "sales: shares sum to 1",
  dash.sales.products.reduce((sum, p) => sum + p.share, 0).toFixed(6),
  "1.000000",
);
check(
  "sales: products are ranked by inflow",
  dash.sales.products.every((p, i, all) => i === 0 || all[i - 1].inflow >= p.inflow),
  true,
);

/* A sheet with no sales tab must leave the section out entirely rather  */
/* than rendering an empty one.                                          */
check(
  "sales: absent tab derives to null",
  buildDashboard(normalizePayload({ ...rawPayload, sales: [] })).sales,
  null,
);

/* Repeat rows for one product are summed, so per-deal lines and a       */
/* monthly total give the same answer.                                   */
const splitRows = buildDashboard(
  normalizePayload({
    ...rawPayload,
    sales: [
      { product: "SabreFlexx", period: "2026-07", inflow: 19_036_000 },
      { product: "SabreFlexx", period: "July 2026", inflow: 500_000_000 },
    ],
  }),
).sales;
check("sales: repeat product rows are summed", splitRows.top.inflow, 519_036_000);
check("sales: repeat product rows collapse to one", splitRows.productCount, 1);

/* The newest month wins when several are present.                       */
const twoMonths = buildDashboard(
  normalizePayload({
    ...rawPayload,
    sales: [
      { product: "SabreFlexx", period: "2026-07", inflow: 519_036_000 },
      { product: "SabreFlexx", period: "2026-08", inflow: 12_000_000 },
    ],
  }),
).sales;
check("sales: newest period is active", twoMonths.period, "2026-08");
check("sales: earlier periods stay available", twoMonths.periods.join(","), "2026-08,2026-07");
check("sales: earlier period still summarised", twoMonths.byPeriod["2026-07"].total, 519_036_000);

/* An unreadable period cell is reported, never quietly refiled.         */
const badPeriod = normalizePayload({
  ...rawPayload,
  sales: [{ product: "SabreFlexx", period: "sometime", inflow: 1_000 }],
});
check("sales: unreadable period is raised as an issue", badPeriod.issues.length, 1);
check("sales: unreadable period row is skipped", badPeriod.sales.length, 0);

/* --- 9. The five reconciliation identities --------------------------- */

for (const result of reconcile(dash)) {
  check(`reconcile: ${result.name}`, result.actual, result.expected);
}

/* --- Report ---------------------------------------------------------- */

if (failures.length === 0) {
  console.log(`\n  ✓ data layer verified — ${passed} checks passed\n`);
  console.log(`    ledger        ${dash.ledgerShown} of ${dash.ledgerTotal} rows` +
    (dash.ledgerComplete ? " (complete)" : " — aggregates still using transcribed fallback"));
  console.log(`    as of         ${dash.asOf}`);
  console.log(`    invested      ${naira(kpi("invested"))}`);
  console.log(`    payable       ${naira(kpi("payable"))}`);
  console.log(`    cash          ${naira(kpi("cash"))}`);
  console.log(`    available     ${naira(kpi("available"))}`);
  console.log(`    sales         ${naira(dash.sales.total)} across ` +
    `${dash.sales.productCount} products (${dash.sales.period})\n`);
} else {
  console.error(`\n  ✗ ${failures.length} check(s) failed (${passed} passed)\n`);
  for (const f of failures) {
    console.error(`    ${f.name}`);
    console.error(`      expected: ${naira(f.expected)}`);
    console.error(`      actual:   ${naira(f.actual)}\n`);
  }
  process.exit(1);
}
