"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HourlySeriesPoint } from "@/lib/types";
import { CHART, axisProps, gridProps, tooltipStyle } from "./theme";

export function HourlyExposureChart({
  data,
  height = 260,
}: {
  data: HourlySeriesPoint[];
  height?: number;
}) {
  const rows = data.map((point) => ({
    label: point.label ?? `H${point.hour}`,
    heatIndex: point.heat_index,
    excess: point.excess_heat,
    contribution: point.contribution,
  }));

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="excessFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.rose} stopOpacity={0.35} />
              <stop offset="100%" stopColor={CHART.rose} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
          <YAxis {...axisProps} width={44} unit="°" />
          <Tooltip
            {...tooltipStyle}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                heatIndex: "Heat index",
                excess: "Excess heat above reference",
              };
              return [`${value.toFixed(1)} °C`, labels[name] ?? name];
            }}
          />
          <Area
            type="monotone"
            dataKey="excess"
            stroke="none"
            fill="url(#excessFill)"
            name="excess"
          />
          <Line
            type="monotone"
            dataKey="heatIndex"
            stroke={CHART.emerald}
            strokeWidth={2}
            dot={{ r: 2.5, fill: CHART.emerald, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            name="heatIndex"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
