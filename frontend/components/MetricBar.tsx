import { cn } from "@/lib/utils";

const TONES = {
  good: "bg-teal-500",
  warn: "bg-heat-400",
  bad: "bg-rose-500",
  info: "bg-navy-700",
};

export function MetricBar({
  label,
  value,
  max = 100,
  tone = "info",
  caption,
}: {
  label: string;
  value: number;
  max?: number;
  tone?: keyof typeof TONES;
  caption?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] text-ink-soft">{label}</span>
        <span className="metric text-[13px] font-semibold">
          {value.toFixed(1)}
          <span className="ml-0.5 text-[10px] font-normal text-ink-muted">/{max}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-mist-300">
        <div
          className={cn("h-full rounded-full transition-all duration-700", TONES[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {caption ? <p className="text-[11px] leading-snug text-ink-muted">{caption}</p> : null}
    </div>
  );
}
