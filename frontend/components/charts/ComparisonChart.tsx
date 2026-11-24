"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART, axisProps, gridProps, tooltipStyle } from "./theme";

export type ComparisonRow = {
  indicator: string;
  policy: number;
  baseline: number;
};

export function ComparisonChart({
  rows,
  height = 240,
  baselineLabel = "No-protection baseline",
}: {
  rows: ComparisonRow[];
  height?: number;
  baselineLabel?: string;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={4}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="indicator" {...axisProps} tick={{ fill: CHART.axis, fontSize: 10 }} />
          <YAxis {...axisProps} width={40} domain={[0, 100]} />
          <Tooltip
            {...tooltipStyle}
            formatter={(value: number, name: string) => [
              value.toFixed(1),
              name === "policy" ? "Selected policy" : baselineLabel,
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
          <Bar
            dataKey="baseline"
            name={baselineLabel}
            fill={CHART.slate}
            fillOpacity={0.35}
            radius={[3, 3, 0, 0]}
          />
          <Bar dataKey="policy" name="Selected policy" fill={CHART.emerald} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
