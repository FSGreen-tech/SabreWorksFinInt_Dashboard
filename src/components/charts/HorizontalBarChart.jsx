import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { compactNaira, formatNaira } from "../../lib/format";
import { TOOLTIP_STYLE } from "./DonutCard";

/**
 * Ranked magnitude-by-category, horizontal so long names read straight.
 *
 * Shared by realtor volume and product inflow: same question, same shape, so
 * the same chart — a second component would only be the first one with a
 * different `dataKey`, and would drift.
 *
 * One series, one colour. Painting each bar differently would encode rank as
 * hue, which is what the bar length already says; the colour would carry no
 * information and would change meaning every time the ranking moved.
 */
export default function HorizontalBarChart({
  data,
  dataKey = "invested",
  nameKey = "name",
  color = "#3B82F6",
  height = "h-80",
  labelWidth = 150,
  valueLabel,
}) {
  return (
    <div className={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" horizontal={false} />
          <XAxis type="number" tickFormatter={compactNaira} stroke="#475569" fontSize={11} />
          <YAxis
            type="category"
            dataKey={nameKey}
            width={labelWidth}
            stroke="#475569"
            fontSize={11}
            tick={{ fill: "#94A3B8" }}
          />
          <Tooltip
            formatter={(v) => [formatNaira(v), valueLabel]}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: "#E2E8F0" }}
            cursor={{ fill: "#1E293B60" }}
          />
          <Bar dataKey={dataKey} fill={color} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
