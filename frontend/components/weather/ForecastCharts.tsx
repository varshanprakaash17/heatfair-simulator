"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/display";
import { CHART, axisProps, gridProps, tooltipStyle } from "@/components/charts/theme";
import { formatNumber } from "@/lib/utils";

export type ForecastChartRow = Record<string, string | number | null>;

function ChartCard({
  title,
  subtitle,
  data,
  color,
  type,
  dataKey,
  unit,
}: {
  title: string;
  subtitle: string;
  data: ForecastChartRow[];
  color: string;
  type: "area" | "line" | "bar";
  dataKey: string;
  unit: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-navy-950">{title}</h3>
          <p className="mt-0.5 text-[10.5px] text-ink-muted">{subtitle}</p>
        </div>
        <Badge tone="neutral">FORECAST</Badge>
      </div>
      <div className="mt-3 h-[180px]">
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            {type === "bar" ? (
              <BarChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -20 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="hour" {...axisProps} interval={1} tick={{ fill: CHART.axis, fontSize: 9 }} />
                <YAxis {...axisProps} width={40} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value: number) => [`${formatNumber(value, 1)}${unit}`, title]}
                />
                <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : type === "line" ? (
              <LineChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -20 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="hour" {...axisProps} interval={1} tick={{ fill: CHART.axis, fontSize: 9 }} />
                <YAxis {...axisProps} width={40} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value: number) => [`${formatNumber(value, 1)}${unit}`, title]}
                />
                <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
              </LineChart>
            ) : (
              <AreaChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.24} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="hour" {...axisProps} interval={1} tick={{ fill: CHART.axis, fontSize: 9 }} />
                <YAxis {...axisProps} width={40} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value: number) => [`${formatNumber(value, 1)}${unit}`, title]}
                />
                <Area
                  type="monotone"
                  dataKey={dataKey}
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#grad-${dataKey})`}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        ) : (
          <div className="grid h-full place-items-center text-[11px] text-ink-muted">
            No hourly rows available
          </div>
        )}
      </div>
    </div>
  );
}

export function ForecastCharts({
  data,
  dateLabel,
}: {
  data: ForecastChartRow[];
  dateLabel: string;
}) {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <ChartCard
        title="Hourly temperature"
        subtitle={`Forecast for ${dateLabel} · °C`}
        data={data}
        color={CHART.heat}
        type="area"
        dataKey="temperature"
        unit="°C"
      />
      <ChartCard
        title="Hourly apparent temperature"
        subtitle="Provider feels-like estimate · °C"
        data={data}
        color={CHART.heat}
        type="line"
        dataKey="apparent"
        unit="°C"
      />
      <ChartCard
        title="Hourly relative humidity"
        subtitle="Modelled humidity · %"
        data={data}
        color={CHART.teal}
        type="area"
        dataKey="humidity"
        unit="%"
      />
      <ChartCard
        title="Hourly solar radiation"
        subtitle="Shortwave radiation · W/m²"
        data={data}
        color={CHART.navy}
        type="bar"
        dataKey="solar"
        unit=" W/m²"
      />
    </section>
  );
}
