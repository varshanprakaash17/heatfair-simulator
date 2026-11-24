import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  unit,
  hint,
  delta,
  deltaTone = "neutral",
  icon,
  series,
  accent = "teal",
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  delta?: number | null;
  deltaTone?: "good" | "bad" | "neutral";
  icon?: React.ReactNode;
  series?: number[];
  accent?: "teal" | "navy" | "heat" | "rose" | "violet";
}) {
  const accentColor = {
    teal: "#0C8774",
    navy: "#17314D",
    heat: "#E8870A",
    rose: "#E11D48",
    violet: "#7C3AED",
  }[accent];

  const path = series && series.length > 1 ? sparkline(series) : null;

  return (
    <div className="card relative overflow-hidden p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label-caps">{label}</p>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="metric text-[27px] font-bold leading-none">{value}</span>
            {unit ? <span className="text-[11px] font-medium text-ink-muted">{unit}</span> : null}
          </div>
        </div>
        {icon ? (
          <span
            className="grid h-9 w-9 place-items-center rounded-xl"
            style={{ background: `${accentColor}12`, color: accentColor }}
          >
            {icon}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex min-h-[16px] items-center justify-between gap-2">
        {typeof delta === "number" ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[11px] font-medium",
              Math.abs(delta) < 0.05
                ? "text-ink-muted"
                : deltaTone === "good"
                  ? "text-teal-700"
                  : deltaTone === "bad"
                    ? "text-rose-600"
                    : "text-ink-muted",
            )}
          >
            {delta > 0.05 ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : delta < -0.05 ? (
              <ArrowDownRight className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            {Math.abs(delta) < 0.05 ? "no change" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`}
            {hint ? <span className="font-normal text-ink-muted"> · {hint}</span> : null}
          </span>
        ) : hint ? (
          <span className="text-[11px] text-ink-muted">{hint}</span>
        ) : (
          <span />
        )}
      </div>

      {path ? (
        <svg viewBox="0 0 100 22" preserveAspectRatio="none" className="mt-3 h-8 w-full">
          <path d={path} fill="none" stroke={accentColor} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ) : null}
    </div>
  );
}

function sparkline(values: number[]): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 20 - ((value - min) / span) * 18;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
