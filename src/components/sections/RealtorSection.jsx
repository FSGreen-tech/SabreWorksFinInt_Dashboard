import React, { Suspense, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Card, ChartSkeleton, EstBadge, SearchInput, SectionHeading } from "../ui";
import { HorizontalBarChart } from "../charts/lazy";
import { formatNaira } from "../../lib/format";

export default function RealtorSection({ realtors, ledgerComplete, ledgerTotal }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => realtors.filter((r) => r.name.toLowerCase().includes(search.toLowerCase())),
    [realtors, search]
  );

  const top = useMemo(() => realtors.slice(0, 10), [realtors]);

  return (
    <section>
      <SectionHeading
        eyebrow="Realtor Performance"
        title="Top realtors by volume"
        subtitle="Total deposits sold"
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <Suspense fallback={<ChartSkeleton height="h-80" />}>
            <HorizontalBarChart data={top} dataKey="invested" valueLabel="Invested" />
          </Suspense>
          {!ledgerComplete && (
            <p className="mt-2 text-[11px] text-slate-500">
              Bar values are estimated from the source chart proportions
              <EstBadge /> &mdash; they switch to ledger-derived totals once all{" "}
              {ledgerTotal} deposits are in the sheet.
            </p>
          )}
        </Card>

        <Card className="flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-sm font-semibold text-white">All realtors</p>
            <SearchInput
              icon={Search}
              size="sm"
              value={search}
              onChange={setSearch}
              placeholder="Search realtor..."
            />
          </div>
          <div className="overflow-y-auto max-h-72 -mx-5 px-5">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-800">
                  <th className="py-2 font-medium">Realtor</th>
                  <th className="py-2 font-medium text-right">Deposits</th>
                  <th className="py-2 font-medium text-right">Invested</th>
                  <th className="py-2 font-medium text-right">At maturity</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-slate-800/60">
                    <td className="py-2 pr-2 text-slate-300">
                      {r.name}
                      {r.estimated && <EstBadge />}
                    </td>
                    <td className="py-2 text-right text-slate-400">
                      {r.deposits ?? "—"}
                    </td>
                    <td className="py-2 text-right text-slate-300">
                      {formatNaira(r.invested)}
                    </td>
                    <td className="py-2 text-right text-slate-400">
                      {r.atMaturity ? formatNaira(r.atMaturity) : "—"}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500">
                      No realtors match &ldquo;{search}&rdquo;
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </section>
  );
}
