/* ------------------------------------------------------------------ */
/*  Local stand-in for the Google Sheet payload.                       */
/*                                                                     */
/*  This file is shaped EXACTLY like the JSON the Apps Script endpoint  */
/*  will return in Phase 2 — snake_case keys, ISO date strings, one     */
/*  array per sheet tab. When the endpoint lands, `source.js` fetches   */
/*  this same shape over the wire and this file is deleted. Nothing     */
/*  downstream of `normalize.js` needs to change.                      */
/*                                                                     */
/*  Figures transcribed from SABREFLEXX PAYABLES JUL-DEC 2026.xlsx.     */
/* ------------------------------------------------------------------ */

/** Tab: `meta` — a single row of run-level context. */
const meta = {
  as_of: "2026-07-19",
  currency: "NGN",
  // Authoritative deposit count from the source export. Used to decide
  // whether the ledger below is complete enough to aggregate from.
  deposit_count: 82,
};

/**
 * Tab: `investments` — the spine of the dashboard.
 *
 * Only 7 of the 82 rows were legible in the source export before its table
 * view was cut off. Note there is no `days_left` or `bucket` column: both
 * are derived from `maturity_date` against `meta.as_of`, so the maturity
 * schedule re-rolls itself as time passes without anyone editing the sheet.
 */
const investments = [
  { customer: "SODIPO SAMSON OLAKUNLE",        realtor: "HAFBAM",      invested: 50_000_000, at_maturity: 62_500_000, start_date: "2026-04-19", maturity_date: "2026-07-19", status: "active" },
  { customer: "FASHINA KHADIJAT ABIOSE",       realtor: "HAFBAM",      invested: 100_000_000, at_maturity: 125_000_000, start_date: "2026-04-21", maturity_date: "2026-07-21", status: "active" },
  { customer: "MISS DAODU MODUPE OLUWABUNMI",  realtor: "MADAM ALICE", invested: 5_000_000,  at_maturity: 6_092_500,  start_date: "2026-04-22", maturity_date: "2026-07-22", status: "active" },
  { customer: "MISS ELABOR REJOICE EHIZOMO",   realtor: "DUNNI",       invested: 1_000_000,  at_maturity: 1_095_000,  start_date: "2026-04-23", maturity_date: "2026-07-23", status: "active" },
  { customer: "FEHINTOLA JULIUS OLATOYE",      realtor: "MADAM ALICE", invested: 20_000_000, at_maturity: 28_000_000, start_date: "2026-04-24", maturity_date: "2026-07-24", status: "active" },
  { customer: "AGBONTALOR ELIZABETH ODEGUA",   realtor: "ZIKAN",       invested: 17_000_000, at_maturity: 24_140_000, start_date: "2026-04-26", maturity_date: "2026-07-26", status: "active" },
  { customer: "MRS ATUNNISE ARINOLA",          realtor: "ARINOLA",     invested: 20_000_000, at_maturity: 24_000_000, start_date: "2026-04-27", maturity_date: "2026-07-27", status: "active" },
];

/** Tab: `cash` — complete, every account from the source export. */
const cash = [
  { account: "BROADVIEW",          type: "Bank",      balance: 420_000_000, estimated: true },
  { account: "SKY CAPITAL",        type: "Bank",      balance: 180_000_000, estimated: true },
  { account: "GTB Bank",           type: "Bank",      balance: 92_224_209,  estimated: false },
  { account: "MD",                 type: "Placement", balance: 78_000_000,  estimated: false },
  { account: "KEYSTONE BANK",      type: "Bank",      balance: 51_866_985,  estimated: false },
  { account: "FCMB BANK",          type: "Bank",      balance: 7_326_106,   estimated: false },
  { account: "UNITY BANK",         type: "Bank",      balance: 4_418_967,   estimated: false },
  { account: "UBA BANK",           type: "Bank",      balance: 3_621_583,   estimated: false },
  { account: "ALTERNATIVE BANK",   type: "Bank",      balance: 3_500_000,   estimated: false },
  { account: "IMPERIAL MORTGAGE",  type: "Placement", balance: 2_000_000,   estimated: false },
  { account: "GTB",                type: "Bank",      balance: 500_000,     estimated: false },
  { account: "ZENITH BANK",        type: "Bank",      balance: 397_913,     estimated: false },
  { account: "FIDELITY BANK",      type: "Bank",      balance: 46_161,      estimated: false },
  { account: "WEMA BANK",          type: "Bank",      balance: 20_000,      estimated: false },
];

/** Tab: `projects` — scenario inputs, editable in the UI. */
const projects = [
  { name: "Lekki Phase 2 Estate",         budget: 89_999_966, status: "planned" },
  { name: "Ibeju-Lekki Land Acquisition", budget: 59_999_979, status: "planned" },
  { name: "Ajah Terraces Development",    budget: 40_000_000, status: "planned" },
  { name: "Epe Commercial Plaza",         budget: 20_000_000, status: "planned" },
];

/**
 * Tab: `sales` — product inflow, one row per product per month.
 *
 * Unlike the ledger this arrived complete, so nothing here is estimated.
 * The tab is append-only: August's rows go underneath July's with their own
 * `period`, and `deriveSales` shows whichever month is newest. Figures from
 * the Sabreworks July Inflow report.
 */
const sales = [
  { product: "SabreFlexx",   period: "2026-07", inflow: 519_036_000 },
  { product: "OPIC",         period: "2026-07", inflow: 178_000_000 },
  { product: "Oranje",       period: "2026-07", inflow: 50_000_000 },
  { product: "Grosvenors",   period: "2026-07", inflow: 10_000_000 },
  { product: "Ikise",        period: "2026-07", inflow: 4_155_909 },
  { product: "Other Income", period: "2026-07", inflow: 2_675_341 },
  { product: "Moniya",       period: "2026-07", inflow: 1_000_000 },
  { product: "Mowe",         period: "2026-07", inflow: 30_000 },
];

/* ------------------------------------------------------------------ */
/*  TEMPORARY BRIDGE — retires automatically in Phase 2.               */
/*                                                                     */
/*  The maturity buckets and realtor rollups below are DERIVED data    */
/*  that was transcribed by hand, because only 7 of 82 ledger rows     */
/*  survived the export. `derive.js` computes both from the ledger and  */
/*  only falls back to these while `investments.length < deposit_count`. */
/*  Once the sheet carries all 82 rows the fallback stops firing on its */
/*  own and this whole block can be deleted.                           */
/* ------------------------------------------------------------------ */
const aggregates = {
  buckets: [
    { key: "le30",  payable: 631_173_750,   count: 16, principal: 500_000_000 },
    { key: "31-60", payable: 434_375_556,   count: 14, principal: 318_632_500 },
    { key: "61-90", payable: 200_264_069,   count: 10, principal: 142_002_500 },
    { key: "90+",   payable: 1_220_747_275, count: 42, principal: 907_380_000 },
  ],
  // Names and rank order are exact; the source bar chart carried no numeric
  // axis, so volumes are read off bar length and flagged estimated.
  realtors: [
    { name: "HAFBAM",                                 deposits: null, invested: 465_000_000, at_maturity: null,      estimated: true },
    { name: "ZIKAN",                                  deposits: null, invested: 375_000_000, at_maturity: null,      estimated: true },
    { name: "QUEEN OLIJE REALTY",                     deposits: null, invested: 195_000_000, at_maturity: null,      estimated: true },
    { name: "ARINOLA",                                deposits: null, invested: 175_000_000, at_maturity: null,      estimated: true },
    { name: "HAFBAM GLOBAL LTD",                      deposits: null, invested: 85_000_000,  at_maturity: null,      estimated: true },
    { name: "MADAM ALICE",                            deposits: null, invested: 78_000_000,  at_maturity: null,      estimated: true },
    { name: "QUEEN",                                  deposits: null, invested: 65_000_000,  at_maturity: null,      estimated: true },
    { name: "PRING CITY REALTORS AND ESTATE LIMITED", deposits: null, invested: 55_000_000,  at_maturity: null,      estimated: true },
    { name: "BANIRE ADETOUN ELIZABETH",               deposits: null, invested: 28_000_000,  at_maturity: null,      estimated: true },
    { name: "UNASSIGNED",                             deposits: null, invested: 22_000_000,  at_maturity: null,      estimated: true },
    { name: "MR. KADIRI",                             deposits: 1,    invested: 5_500_000,   at_maturity: 7_459_375, estimated: false },
    { name: "MRS EROMOSELE EBERE JOY",                deposits: 1,    invested: 5_000_000,   at_maturity: 6_900_000, estimated: false },
    { name: "OLABISI TAIWO",                          deposits: 1,    invested: 4_282_500,   at_maturity: 6_113_269, estimated: false },
    { name: "NAS",                                    deposits: 1,    invested: 4_000_000,   at_maturity: 4_950_000, estimated: false },
    { name: "DUNNI",                                  deposits: 3,    invested: 3_000_000,   at_maturity: 3_285_000, estimated: false },
    { name: "SOPHIA",                                 deposits: 2,    invested: 2_000_000,   at_maturity: 2_600_000, estimated: false },
    { name: "EGO",                                    deposits: 1,    invested: 2_000_000,   at_maturity: 2_475_000, estimated: false },
    { name: "MR TOLU",                                deposits: 1,    invested: 2_000_000,   at_maturity: 2_361_000, estimated: false },
    { name: "MR KUNLE",                               deposits: 1,    invested: 1_000_000,   at_maturity: 1_380_000, estimated: false },
  ],
};

/** The complete payload, byte-compatible with the future endpoint response. */
export const rawPayload = { meta, investments, cash, projects, sales, aggregates };
