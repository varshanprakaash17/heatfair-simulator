"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
  {
    variants: {
      tone: {
        neutral: "border-line bg-mist-100 text-ink-soft",
        teal: "border-teal-200 bg-teal-50 text-teal-800",
        navy: "border-navy-200 bg-navy-50 text-navy-800",
        amber: "border-heat-200 bg-heat-50 text-heat-800",
        rose: "border-rose-200 bg-rose-50 text-rose-700",
        violet: "border-violet-200 bg-violet-50 text-violet-700",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-lg bg-mist-300/70", className)} {...props} />;
}

export function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-line", className)} role="separator" />;
}

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("inline-flex items-center gap-1 rounded-xl border border-line bg-mist-100 p-1", className)}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "focus-ring rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-ink-muted transition-colors",
      "data-[state=active]:bg-white data-[state=active]:text-navy-900 data-[state=active]:shadow-sm",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("mt-4", className)} {...props} />
));
TabsContent.displayName = "TabsContent";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("[&_tr]:border-b [&_tr]:border-line", className)} {...props} />;
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("border-b border-line/80 transition-colors hover:bg-mist-100/70", className)}
      {...props}
    />
  );
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("h-9 px-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-muted", className)}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-3 align-middle text-[12.5px] text-ink-soft", className)} {...props} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-navy-200 bg-mist-100/70 px-6 py-12 text-center">
      {icon ? <div className="text-teal-600">{icon}</div> : null}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mx-auto max-w-md text-[12.5px] leading-relaxed text-ink-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function Progress({ value, label }: { value: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="space-y-1.5">
      {label ? (
        <div className="flex items-center justify-between text-[11px] text-ink-muted">
          <span>{label}</span>
          <span className="font-mono">{Math.round(clamped)}%</span>
        </div>
      ) : null}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-mist-300">
        <div
          className="h-full rounded-full bg-teal-500 transition-all duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export function DataTag({
  kind,
  children,
}: {
  kind: "synthetic" | "estimated" | "measured" | "forecast";
  children?: React.ReactNode;
}) {
  const tone =
    kind === "measured" ? "teal" : kind === "synthetic" ? "violet" : kind === "forecast" ? "amber" : "navy";
  const label = children ?? kind;
  return (
    <Badge tone={tone as "teal" | "violet" | "amber" | "navy"} className="uppercase tracking-[0.08em]">
      {label}
    </Badge>
  );
}
