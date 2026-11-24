"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART, axisProps, gridProps, tooltipStyle } from "./theme";

export function ClimateChart({
  data,
  height = 240,
}: {
  data: { label: string; temperature: number; humidity: number; heat_index?: number }[];
  height?: number;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
          <YAxis yAxisId="temp" {...axisProps} width={40} domain={["dataMin - 2", "dataMax + 2"]} />
          <YAxis
            yAxisId="humidity"
            orientation="right"
            {...axisProps}
            width={38}
            domain={[0, 100]}
          />
          <Tooltip
            {...tooltipStyle}
            formatter={(value: number, name: string) =>
              name === "temperature"
                ? [`${value.toFixed(1)} °C`, "Temperature"]
                : name === "humidity"
                  ? [`${value.toFixed(0)} %`, "Relative humidity"]
                  : [`${value.toFixed(1)} °C`, "Heat index"]
            }
          />
          <Line
            yAxisId="temp"
            type="monotone"
            dataKey="temperature"
            stroke={CHART.amber}
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="temp"
            type="monotone"
            dataKey="heat_index"
            stroke={CHART.rose}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
          />
          <Line
            yAxisId="humidity"
            type="monotone"
            dataKey="humidity"
            stroke={CHART.cyan}
            strokeWidth={1.5}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
