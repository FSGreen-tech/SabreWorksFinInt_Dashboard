/* ------------------------------------------------------------------ */
/*  Pure selectors. No fetching, no React, no side effects.            */
/*                                                                     */
/*  Every aggregate the dashboard displays is computed here from the    */
/*  ledger + cash rows. Nothing is transcribed. `scripts/verify-data.mjs`*/
/*  asserts these selectors against the golden-master figures taken     */
/*  from the original hand-typed constants.                             */
/* ------------------------------------------------------------------ */

/** Maturity buckets, ordered nearest-first. `max` is inclusive days-left. */
export const BUCKETS = [
  { key: "le30", label: "≤30 days", max: 30, color: "#F87171" },
  { key: "31-60", label: "31–60 days", max: 60, color: "#FBBF24" },
  { key: "61-90", label: "61–90 days", max: 90, color: "#60A5FA" },
  { key: "90+", label: "90+ days", max: Infinity, color: "#34D399" },
];

const MS_PER_DAY = 86_400_000;

/**
 * Whole days from `fromISO` to `toISO`. Both are `YYYY-MM-DD`, parsed as UTC
 * midnight, so the result never drifts with the viewer's timezone or DST.
 * Negative when the maturity date has already passed.
 */
export function daysBetween(fromISO, toISO) {
  const from = Date.parse(fromISO);
  const to = Date.parse(toISO);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / MS_PER_DAY);
}

/** The bucket a given days-left value falls into. Overdue rows land in ≤30. */
export function bucketFor(daysLeft) {
  return BUCKETS.find((b) => daysLeft <= b.max) ?? BUCKETS[BUCKETS.length - 1];
}

/**
 * Attach `daysLeft` and bucket identity to each ledger row, measured against
 * `asOf`. This is why the sheet carries no days_left/bucket columns: the
 * maturity schedule re-rolls itself every time `asOf` advances.
 */
export function withDerivedFields(investments, asOf) {
  return investments.map((inv) => {
    const daysLeft = daysBetween(asOf, inv.maturityDate) ?? 0;
    const bucket = bucketFor(daysLeft);
    return {
      ...inv,
      daysLeft,
      bucket: bucket.label,
      bucketKey: bucket.key,
      bucketColor: bucket.color,
    };
  });
}

/** Roll the ledger up into the four maturity buckets. */
export function deriveBuckets(derivedInvestments) {
  return BUCKETS.map((def) => {
    const rows = derivedInvestments.filter((i) => i.bucketKey === def.key);
    return {
      key: def.key,
      label: def.label,
      color: def.color,
      count: rows.length,
      principal: sumBy(rows, "invested"),
      payable: sumBy(rows, "atMaturity"),
    };
  });
}

/** Roll the ledger up by realtor, highest volume first. */
export function deriveRealtors(derivedInvestments) {
  const byName = new Map();

  for (const inv of derivedInvestments) {
    const existing = byName.get(inv.realtor);
    if (existing) {
      existing.deposits += 1;
      existing.invested += inv.invested;
      existing.atMaturity += inv.atMaturity;
    } else {
      byName.set(inv.realtor, {
        id: inv.realtor,
        name: inv.realtor,
        deposits: 1,
        invested: inv.invested,
        atMaturity: inv.atMaturity,
        estimated: false,
      });
    }
  }

  return [...byName.values()].sort((a, b) => b.invested - a.invested);
}

export function sumBy(rows, key) {
  return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
}

/**
 * Cash freed up for project spend: everything in the bank, less what must be
 * paid out to clients maturing inside 30 days.
 */
export function deriveAvailablePool(totalCash, nearTermPayable) {
  return totalCash - nearTermPayable;
}

/**
 * The four headline figures. Returns stable `id`s rather than icons or
 * Tailwind classes — presentation stays in the component layer.
 */
export function deriveKpis({
  totalPrincipal,
  depositCount,
  totalPayable,
  totalCash,
  availablePool,
}) {
  return [
    {
      id: "invested",
      label: "Total Investments Collected",
      value: totalPrincipal,
      sub: `${depositCount} active deposits`,
    },
    {
      id: "payable",
      label: "Total Payable at Maturity",
      value: totalPayable,
      sub: "Principal + ROI owed to clients",
    },
    {
      id: "cash",
      label: "Total Cash Balances",
      value: totalCash,
      sub: "Banks + placements",
    },
    {
      id: "available",
      label: "Available to Spend on Projects",
      value: availablePool,
      sub: "Cash − <30-day maturities",
    },
  ];
}

/**
 * Total maturity value and count for investments whose status is
 * "fully liquidated" (compared case-insensitively).
 */
export function deriveLiquidated(derivedInvestments) {
  const rows = derivedInvestments.filter(
    (i) => (i.status || "").toLowerCase().trim() === "fully liquidated",
  );
  return {
    count: rows.length,
    principal: sumBy(rows, "invested"),
    payable: sumBy(rows, "atMaturity"),
  };
}

/* ------------------------------------------------------------------ */
/*  Assembly                                                           */
/* ------------------------------------------------------------------ */

/**
 * Build everything the dashboard renders from a normalized payload.
 *
 * Bucket and realtor rollups come from the ledger whenever it is complete.
 * While the sheet still holds fewer rows than `meta.deposit_count`, the
 * transcribed `aggregates` block stands in — deriving 82 deposits' worth of
 * totals from 7 rows would quietly understate every headline figure by ~90%.
 * The fallback retires itself the moment the row count catches up.
 */
export function buildDashboard(normalized) {
  const { meta, cash, projects, aggregates, issues } = normalized;
  const asOf = meta.asOf;

  const investments = withDerivedFields(normalized.investments, asOf);
  const ledgerComplete =
    meta.depositCount == null || investments.length >= meta.depositCount;

  const ledgerBuckets = deriveBuckets(investments);
  const buckets = ledgerComplete
    ? ledgerBuckets
    : mergeBucketFallback(ledgerBuckets, aggregates?.buckets);

  const realtors = ledgerComplete
    ? deriveRealtors(investments)
    : (aggregates?.realtors ?? [])
        .map((r, i) => ({ ...r, id: `agg-${i}-${r.name}` }))
        .sort((a, b) => b.invested - a.invested);

  // A half-populated sheet with no fallback would silently understate every
  // headline figure — say so loudly rather than rendering a plausible lie.
  const allIssues = [...issues];
  if (!ledgerComplete && !aggregates?.buckets?.length) {
    allIssues.push({
      tab: "meta",
      row: "—",
      reason:
        `sheet holds ${investments.length} of ${meta.depositCount} deposits and no fallback ` +
        `aggregates — totals below cover only the rows present`,
    });
  }

  const totalCash = sumBy(cash, "balance");
  const totalPayable = sumBy(buckets, "payable");
  const totalPrincipal = sumBy(buckets, "principal");
  const depositCount = sumBy(buckets, "count");
  const availablePool = deriveAvailablePool(totalCash, buckets[0].payable);
  const liquidated = deriveLiquidated(investments);

  return {
    asOf,
    currency: meta.currency,
    ledgerComplete,
    // What the ledger table can actually show today vs. what exists in total.
    ledgerShown: investments.length,
    ledgerTotal: meta.depositCount ?? investments.length,
    investments,
    cash,
    projects,
    buckets,
    realtors,
    totalCash,
    totalPayable,
    totalPrincipal,
    depositCount,
    availablePool,
    liquidated,
    kpis: deriveKpis({
      totalPrincipal,
      depositCount,
      totalPayable,
      totalCash,
      availablePool,
    }),
    issues: allIssues,
  };
}

/** Keep the bucket shape/colors from BUCKETS, take the figures from fallback. */
function mergeBucketFallback(ledgerBuckets, fallback) {
  if (!fallback?.length) return ledgerBuckets;
  return ledgerBuckets.map((b) => {
    const match = fallback.find((f) => f.key === b.key);
    return match
      ? {
          ...b,
          payable: match.payable,
          principal: match.principal,
          count: match.count,
        }
      : b;
  });
}

/* ------------------------------------------------------------------ */
/*  Reconciliation                                                     */
/*                                                                     */
/*  The five identities that held across the original hand-typed        */
/*  constants. They must keep holding — if a selector regresses or the  */
/*  sheet goes internally inconsistent, one of these trips.             */
/* ------------------------------------------------------------------ */
export function reconcile(dashboard) {
  const { buckets, kpis, totalCash, cash, availablePool } = dashboard;
  const kpi = (id) => kpis.find((k) => k.id === id).value;

  return [
    {
      name: "bucket principals sum to Total Investments Collected",
      expected: sumBy(buckets, "principal"),
      actual: kpi("invested"),
    },
    {
      name: "bucket payables sum to Total Payable at Maturity",
      expected: sumBy(buckets, "payable"),
      actual: kpi("payable"),
    },
    {
      name: "cash rows sum to Total Cash Balances",
      expected: sumBy(cash, "balance"),
      actual: kpi("cash"),
    },
    {
      name: "available pool is total cash less <30-day payable",
      expected: totalCash - buckets[0].payable,
      actual: availablePool,
    },
    {
      name: "bucket counts sum to the deposit count",
      expected: sumBy(buckets, "count"),
      actual: dashboard.depositCount,
    },
  ].map((check) => ({ ...check, ok: check.expected === check.actual }));
}
