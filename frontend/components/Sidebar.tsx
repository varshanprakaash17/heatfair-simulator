"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  CloudSun,
  FileText,
  GitBranch,
  LayoutDashboard,
  MapPin,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { recallSimulation, useWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import { Brand } from "./Brand";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/weather", label: "Live weather", icon: CloudSun },
  { href: "/policies", label: "Policies", icon: Settings2 },
  { href: "/workers", label: "Workers", icon: Users },
  { href: "/simulate", label: "Simulation", icon: Activity },
];

const ANALYSIS = [
  { href: "/reports", label: "Reports", icon: FileText },
];

export function Sidebar() {
  const pathname = usePathname();
  const { bootstrap, location } = useWorkspace();
  const [health, setHealth] = useState<"checking" | "ok" | "down">("checking");
  const [lastId, setLastId] = useState<string | null>(null);

  useEffect(() => {
    setLastId(recallSimulation() ?? bootstrap?.latest_simulation?.id ?? null);
    api
      .health()
      .then(() => setHealth("ok"))
      .catch(() => setHealth("down"));
  }, [pathname, bootstrap?.latest_simulation?.id]);

  const dynamicNav = lastId
    ? [
        { href: `/results/${lastId}`, label: "Latest results", icon: BarChart3 },
        { href: `/optimizer/${lastId}`, label: "Policy optimizer", icon: GitBranch },
      ]
    : [];

  const linkClass = (active: boolean) =>
    cn(
      "group flex items-center gap-2.5 rounded-xl px-3 py-2 text-[12.5px] font-medium transition-colors",
      active
        ? "bg-teal-50 text-teal-800 shadow-[inset_0_0_0_1px_rgba(12,135,116,0.14)]"
        : "text-ink-soft hover:bg-mist-100 hover:text-navy-900",
    );

  const nav = [...NAV, ...dynamicNav, ...ANALYSIS];

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[252px] shrink-0 flex-col border-r border-line bg-white px-4 py-5 lg:flex">
        <div className="w-fit rounded-xl px-1">
          <Brand />
        </div>

        <nav className="mt-8 space-y-1">
          <p className="label-caps px-3 pb-2">Workspace</p>
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} className={linkClass(active)}>
                <item.icon className="h-[17px] w-[17px]" strokeWidth={1.9} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <nav className="mt-7 space-y-1">
          <p className="label-caps px-3 pb-2">Analysis</p>
          {dynamicNav.length > 0 ? (
            dynamicNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={linkClass(pathname.startsWith(item.href.split("/").slice(0, 2).join("/")))}
              >
                <item.icon className="h-[17px] w-[17px]" strokeWidth={1.9} />
                {item.label}
              </Link>
            ))
          ) : (
            <p className="px-3 text-[11px] leading-relaxed text-ink-muted">
              Run a simulation to unlock result and optimizer views.
            </p>
          )}
          {ANALYSIS.map((item) => (
            <Link key={item.href} href={item.href} className={linkClass(pathname === item.href)}>
              <item.icon className="h-[17px] w-[17px]" strokeWidth={1.9} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto space-y-3 pt-6">
          <div className="rounded-xl border border-line bg-mist-50 p-3">
            <div className="flex items-center gap-2 text-[11px] font-medium text-ink-soft">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  health === "ok"
                    ? "bg-teal-500"
                    : health === "down"
                      ? "bg-rose-500"
                      : "animate-pulse bg-navy-300",
                )}
              />
              {health === "ok" ? "Engine online" : health === "down" ? "API unreachable" : "Checking engine"}
            </div>
            <p className="mt-1.5 truncate text-[11px] text-ink-muted">
              {bootstrap?.organization.name ?? "Loading organisation…"}
            </p>
          </div>

          <div className="rounded-xl border border-line bg-mist-50 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              <MapPin className="h-3 w-3" /> Workplace
            </p>
            <p className="mt-1 truncate text-[12px] font-medium text-navy-900">
              {location?.name ?? "No location selected"}
            </p>
            <p className="mt-0.5 text-[10.5px] text-ink-muted">
              {location ? `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}` : "Set it on Live weather"}
            </p>
          </div>

          <div className="flex items-center gap-1.5 px-1 text-[10px] uppercase tracking-[0.1em] text-ink-muted">
            <ShieldCheck className="h-3 w-3 text-teal-700" />
            Synthetic worker data
          </div>
        </div>
      </aside>

      <div className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Brand compact />
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-teal-700">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                health === "ok" ? "bg-teal-500" : health === "down" ? "bg-rose-500" : "bg-navy-300",
              )}
            />
            Live data
          </span>
        </div>
        <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium",
                  active ? "bg-teal-600 text-white" : "bg-mist-100 text-ink-soft",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
