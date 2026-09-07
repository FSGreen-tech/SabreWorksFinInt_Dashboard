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

export default function RealtorBarChart({ data }) {
  return (
    <div className="h-80">
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
            dataKey="name"
            width={150}
            stroke="#475569"
            fontSize={11}
            tick={{ fill: "#94A3B8" }}
          />
          <Tooltip
            formatter={(v) => formatNaira(v)}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: "#E2E8F0" }}
          />
          <Bar dataKey="invested" fill="#3B82F6" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
