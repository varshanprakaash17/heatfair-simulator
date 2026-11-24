import Link from "next/link";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-navy-900 via-navy-800 to-teal-700 shadow-[0_6px_16px_-8px_rgba(8,27,46,0.7)]",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path d="M12 3v10.2" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="17" r="4" stroke="#7DE3CE" strokeWidth="1.8" />
        <path d="M12 6.5 15 9M12 9.5l3 2.5" stroke="#F9C15A" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M4.5 6.5h2M4.5 10h2M4.5 13.5h2" stroke="#7DE3CE" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Brand({
  compact = false,
  href = "/",
  dark = false,
}: {
  compact?: boolean;
  href?: string;
  dark?: boolean;
}) {
  return (
    <Link href={href} className="focus-ring inline-flex items-center gap-2.5 rounded-xl">
      <BrandMark />
      {!compact ? (
        <span className="flex flex-col leading-none">
          <span className={cn("font-display text-[17px] font-bold tracking-tight", dark ? "text-white" : "text-navy-900")}>
            HeatFair
          </span>
          <span className={cn("mt-1 text-[9px] font-medium uppercase tracking-[0.16em]", dark ? "text-white/55" : "text-ink-muted")}>
            Climate fairness
          </span>
        </span>
      ) : null}
    </Link>
  );
}
