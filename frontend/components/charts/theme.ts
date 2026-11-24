export const CHART = {
  teal: "#0C8774",
  tealSoft: "#38C8AE",
  navy: "#17314D",
  heat: "#E8870A",
  heatSoft: "#FCC04D",
  rose: "#E11D48",
  violet: "#7C3AED",
  slate: "#6B7F94",
  grid: "#E2E9F0",
  panel: "#FFFFFF",
  axis: "#6B7F94",
  emerald: "#0C8774",
  emeraldSoft: "#38C8AE",
  cyan: "#0C8774",
  amber: "#E8870A",
};

export const axisProps = {
  stroke: CHART.grid,
  tick: { fill: CHART.axis, fontSize: 10.5 },
  tickLine: false,
  axisLine: { stroke: CHART.grid },
} as const;

export const tooltipStyle = {
  contentStyle: {
    background: "#FFFFFF",
    border: "1px solid #E2E9F0",
    borderRadius: 12,
    padding: "10px 12px",
    boxShadow: "0 20px 40px -24px rgba(15,35,56,0.28)",
    fontSize: 12,
  },
  labelStyle: { color: "#0F2338", fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: "#3B536B", padding: 0 },
  wrapperStyle: { outline: "none" },
} as const;

export const gridProps = {
  stroke: CHART.grid,
  strokeDasharray: "3 3",
  vertical: false,
} as const;
