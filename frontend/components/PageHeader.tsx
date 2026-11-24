import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="space-y-1.5">
        {eyebrow ? <p className="label-caps text-teal-700">{eyebrow}</p> : null}
        <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight text-navy-950 md:text-[31px]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-[13px] leading-relaxed text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
