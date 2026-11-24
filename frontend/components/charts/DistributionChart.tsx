"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART, axisProps, gridProps, tooltipStyle } from "./theme";

export function DistributionChart({
  distribution,
  height = 220,
  color = CHART.emerald,
  unit = "",
}: {
  distribution: { labels: string[]; counts: number[] } | undefined;
  height?: number;
  color?: string;
  unit?: string;
}) {
  const rows =
    distribution?.labels.map((label, index) => ({
      label,
      count: distribution.counts[index] ?? 0,
    })) ?? [];

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} interval={Math.max(0, Math.floor(rows.length / 6))} />
          <YAxis {...axisProps} width={40} allowDecimals={false} />
          <Tooltip
            {...tooltipStyle}
            formatter={(value: number) => [`${value} workers`, "Count"]}
            labelFormatter={(label) => `Range ${label}${unit}`}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {rows.map((row) => (
              <Cell
                key={row.label}
                fill={color}
                fillOpacity={0.35 + 0.6 * (row.count / Math.max(1, ...rows.map((r) => r.count)))}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
