import React, { Suspense, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Boxes, Trophy, Wallet } from "lucide-react";

import { Card, ChartSkeleton, SectionHeading } from "../ui";
import { HorizontalBarChart } from "../charts/lazy";
import { formatNaira, formatPeriod, formatShare } from "../../lib/format";

/** Product inflow is one series, so it takes the dashboard's primary blue. */
const SALES_COLOR = "#3B82F6";

/** Sortable columns. `numeric` decides which direction a first click means. */
const COLUMNS = [
  { key: "name", label: "Product", numeric: false, align: "text-left" },
  { key: "inflow", label: "Inflow (₦)", numeric: true, align: "text-right" },
  { key: "share", label: "% of total", numeric: true, align: "text-right" },
];

function StatTile({ icon: Icon, accent, border, label, value, sub, children }) {
  return (
    <Card className={`border-l-4 ${border}`}>
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${accent}`}
        >
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-sm font-medium text-slate-300">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      {children}
    </Card>
  );
}

/** Sort caret. Absent on the columns that are not currently sorted. */
function SortMark({ active, direction }) {
  if (!active) return null;
  const Icon = direction === "asc" ? ArrowUp : ArrowDown;
  return <Icon size={11} className="ml-1 inline-block align-middle" />;
}

export default function SalesSection({ sales }) {
  // Ranked by value is how the section is read; the chart beside it is in the
  // same order, so the two never disagree at a glance.
  const [sort, setSort] = useState({ key: "inflow", direction: "desc" });

  // `sales` already carries the month the sheet says is current; this only
  // holds a viewer's departure from it. Falling back to `sales` means a month
  // that disappears from the sheet on the next refetch reverts to the current
  // one rather than emptying the section.
  const [period, setPeriod] = useState(sales.period);
  const active = sales.byPeriod[period] ?? sales;

  const sorted = useMemo(() => {
    const column = COLUMNS.find((c) => c.key === sort.key) ?? COLUMNS[1];
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...active.products].sort((a, b) =>
      column.numeric
        ? factor * (a[column.key] - b[column.key])
        : factor * String(a[column.key]).localeCompare(String(b[column.key]))
    );
  }, [active.products, sort]);

  // The chart always shows the ranking, whatever the table is sorted by —
  // an alphabetically-sorted bar chart answers no question anyone asked.
  const ranked = useMemo(() => active.products.slice(0, 10), [active.products]);

  const toggleSort = (column) =>
    setSort((prev) =>
      prev.key === column.key
        ? { key: column.key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key: column.key, direction: column.numeric ? "desc" : "asc" }
    );

  const periodLabel = formatPeriod(active.period);

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading
          eyebrow={`Sales — Product Inflow (${periodLabel})`}
          title="Inflow by product"
          subtitle={`${periodLabel} inflow across all company products`}
        />
        {sales.periods.length > 1 && (
          <select
            value={active.period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            aria-label="Reporting month"
          >
            {sales.periods.map((p) => (
              <option key={p} value={p}>
                {formatPeriod(p)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          icon={Wallet}
          accent="text-blue-400 bg-blue-500/10"
          border="border-l-blue-400"
          value={formatNaira(active.total)}
          label="Total inflow"
          sub={`${periodLabel} · all products, gross`}
        />
        <StatTile
          icon={Boxes}
          accent="text-violet-400 bg-violet-500/10"
          border="border-l-violet-400"
          value={active.productCount}
          label="Products tracked"
          sub="Reporting inflow this month"
        />
        {active.top && (
          <StatTile
            icon={Trophy}
            accent="text-emerald-400 bg-emerald-500/10"
            border="border-l-emerald-400"
            value={active.top.name}
            label={formatNaira(active.top.inflow)}
            sub={`${formatShare(active.top.share)} of month inflow`}
          >
            {/* The share bar repeats the number above it on purpose: it is the
                one figure people compare month to month, and a bar is read
                faster than a percentage. */}
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-400"
                style={{ width: `${Math.min(100, active.top.share * 100)}%` }}
              />
            </div>
          </StatTile>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <p className="text-sm font-semibold text-white">Inflow by product</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Ranked by {periodLabel} inflow
          </p>
          <div className="mt-2">
            <Suspense fallback={<ChartSkeleton height="h-80" />}>
              <HorizontalBarChart
                data={ranked}
                dataKey="inflow"
                color={SALES_COLOR}
                labelWidth={110}
                valueLabel="Inflow"
              />
            </Suspense>
          </div>
          {active.productCount > ranked.length && (
            <p className="mt-2 text-[11px] text-slate-500">
              Top {ranked.length} of {active.productCount} products &mdash; the full
              list is in the breakdown table.
            </p>
          )}
        </Card>

        <Card className="flex flex-col">
          <p className="text-sm font-semibold text-white">Product breakdown</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {periodLabel} inflow &middot; total {formatNaira(active.total)} &middot;
            click headers to sort
          </p>
          <div className="-mx-5 mt-3 max-h-80 overflow-y-auto px-5">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-left text-slate-500">
                  {COLUMNS.map((column) => {
                    const isSorted = sort.key === column.key;
                    return (
                      <th
                        key={column.key}
                        className={`py-2 font-medium ${column.align}`}
                        aria-sort={
                          isSorted
                            ? sort.direction === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(column)}
                          className={`inline-flex items-center font-medium transition-colors hover:text-slate-300 focus:outline-none focus-visible:text-slate-200 ${
                            isSorted ? "text-slate-300" : ""
                          }`}
                        >
                          {column.label}
                          <SortMark active={isSorted} direction={sort.direction} />
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sorted.map((product) => (
                  <tr key={product.id} className="border-b border-slate-800/60">
                    <td className="py-2 pr-2 text-slate-300">{product.name}</td>
                    <td className="py-2 text-right font-medium text-slate-200">
                      {formatNaira(product.inflow)}
                    </td>
                    <td className="py-2 text-right text-slate-400">
                      {formatShare(product.share)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* The total sits outside the scroll box on purpose: it is the one
              figure that must stay on screen once a long product list starts
              scrolling. */}
          <div className="mt-3 flex items-baseline justify-between border-t border-slate-800 pt-3 text-xs">
            <span className="font-semibold text-white">Total</span>
            <span className="font-bold text-white">{formatNaira(active.total)}</span>
          </div>
        </Card>
      </div>
    </section>
  );
}
