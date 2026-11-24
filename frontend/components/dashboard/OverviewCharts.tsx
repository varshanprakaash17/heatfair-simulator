"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART, axisProps, gridProps, tooltipStyle } from "@/components/charts/theme";
import { formatNumber } from "@/lib/utils";

export type ExposurePoint = { hour: string; heat: number; contribution: number };
export type IncomePoint = { bucket: string; workers: number };

/** Recharts lives in this lazily loaded chunk so the Overview paints first. */
export function ExposureTrendChart({ data }: { data: ExposurePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="heatFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART.heat} stopOpacity={0.22} />
            <stop offset="100%" stopColor={CHART.heat} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="hour" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...axisProps} domain={[0, "auto"]} width={40} />
        <Tooltip
          {...tooltipStyle}
          formatter={(value: number, name: string) => [
            value,
            name === "heat" ? "Heat index" : "Contribution",
          ]}
        />
        <Area type="monotone" dataKey="heat" stroke={CHART.heat} strokeWidth={2} fill="url(#heatFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BreakAccessibilityDonut({ value }: { value: number }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={[
            { name: "Accessible", value },
            { name: "Not accessible", value: Math.max(0, 100 - value) },
          ]}
          dataKey="value"
          innerRadius={55}
          outerRadius={74}
          startAngle={90}
          endAngle={-270}
          stroke="none"
        >
          <Cell fill={CHART.teal} />
          <Cell fill="#EDF2F7" />
        </Pie>
        <Tooltip
          {...tooltipStyle}
          formatter={(amount: number) => [`${formatNumber(amount, 1)}%`, "Estimate"]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function IncomeImpactChart({ data }: { data: IncomePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: -22 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="bucket" {...axisProps} tick={{ fill: CHART.axis, fontSize: 8.5 }} interval={2} />
        <YAxis {...axisProps} width={38} />
        <Tooltip {...tooltipStyle} formatter={(value: number) => [`${value} workers`, "Workers"]} />
        <Bar dataKey="workers" fill={CHART.teal} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
