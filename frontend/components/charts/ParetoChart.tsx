"use client";

import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { Candidate } from "@/lib/types";
import { CHART, axisProps, gridProps, tooltipStyle } from "./theme";

type Point = Candidate & { x: number; y: number; z: number };

function toPoint(candidate: Candidate): Point {
  return {
    ...candidate,
    x: candidate.objectives.income_loss,
    y: candidate.objectives.exposure,
    z: Math.max(40, 120 - candidate.objectives.disruption * 6),
  };
}

type TooltipEntry = { payload?: Point };

function ParetoTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="rounded-xl border border-panel-border bg-[#0B1526] px-3 py-2.5 text-[11px] shadow-2xl">
      <div className="mb-1 flex items-center gap-2">
        <span className="font-semibold text-slate-100">{point.label}</span>
        {point.on_frontier ? (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-emerald-300">
            Pareto
          </span>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
        <dt>Exposure</dt>
        <dd className="font-mono text-slate-200">{point.objectives.exposure.toFixed(1)}</dd>
        <dt>Income loss</dt>
        <dd className="font-mono text-slate-200">{point.objectives.income_loss.toFixed(1)}%</dd>
        <dt>Disruption</dt>
        <dd className="font-mono text-slate-200">{point.objectives.disruption.toFixed(1)}</dd>
        <dt>Break</dt>
        <dd className="font-mono text-slate-200">
          {point.policy.protected_break_minutes.toFixed(0)} min
        </dd>
        <dt>Compensation</dt>
        <dd className="font-mono text-slate-200">
          {(point.policy.break_compensation * 100).toFixed(0)}%
        </dd>
        <dt>Flexible</dt>
        <dd className="font-mono text-slate-200">{point.policy.flexible_deadlines ? "yes" : "no"}</dd>
      </dl>
    </div>
  );
}

export function ParetoChart({
  candidates,
  frontier,
  height = 360,
  highlightId,
}: {
  candidates: Candidate[];
  frontier: Candidate[];
  height?: number;
  highlightId?: string | null;
}) {
  // Ordered by income loss so the connecting line reads as a trade-off curve
  // rather than jumping around the two-dimensional projection.
  const frontierPoints = frontier.map(toPoint).sort((a, b) => a.x - b.x);
  const dominatedPoints = candidates.filter((c) => !c.on_frontier).map(toPoint);
  const highlight = candidates.filter((c) => c.id === highlightId).map(toPoint);

  // Explicit numeric domains: string offsets such as "dataMin - 2" are unreliable
  // once several series share the axes.
  const xs = candidates.map((candidate) => candidate.objectives.income_loss);
  const ys = candidates.map((candidate) => candidate.objectives.exposure);
  const xDomain: [number, number] = xs.length
    ? [Math.max(0, Math.floor(Math.min(...xs) - 1)), Math.ceil(Math.max(...xs) + 1)]
    : [0, 20];
  const yDomain: [number, number] = ys.length
    ? [Math.max(0, Math.floor(Math.min(...ys) - 2)), Math.min(100, Math.ceil(Math.max(...ys) + 2))]
    : [0, 100];

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 12, right: 16, left: -12, bottom: 8 }}>
          <CartesianGrid {...gridProps} />
          <XAxis
            type="number"
            dataKey="x"
            name="Income loss"
            unit="%"
            {...axisProps}
            domain={xDomain}
            tickFormatter={(value: number) => `${value.toFixed(0)}%`}
            label={{
              value: "Income loss (% of baseline) →",
              position: "insideBottom",
              offset: -4,
              fill: CHART.axis,
              fontSize: 10,
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Exposure"
            {...axisProps}
            width={44}
            domain={yDomain}
            allowDecimals={false}
            label={{
              value: "Exposure index →",
              angle: -90,
              position: "insideLeft",
              fill: CHART.axis,
              fontSize: 10,
            }}
          />
          <ZAxis type="number" dataKey="z" range={[35, 150]} />
          <Tooltip content={<ParetoTooltip />} cursor={{ strokeDasharray: "3 3" }} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          <Scatter
            name="Dominated candidates"
            data={dominatedPoints}
            fill={CHART.slate}
            fillOpacity={0.35}
            stroke={CHART.slate}
          />
          <Scatter
            name="Pareto frontier"
            data={frontierPoints}
            fill={CHART.emerald}
            fillOpacity={0.85}
            stroke={CHART.emeraldSoft}
            line={{ stroke: CHART.emerald, strokeWidth: 1.5, strokeOpacity: 0.45 }}
            shape="circle"
          />
          {highlight.length > 0 ? (
            <Scatter
              name="Selected"
              data={highlight}
              fill={CHART.cyan}
              stroke="#fff"
              strokeWidth={1}
            />
          ) : null}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
