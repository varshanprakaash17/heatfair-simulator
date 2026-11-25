"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CloudSun, LogOut, MapPin } from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/utils";
const LABELS: Record<string, string> = {
  dashboard: "Overview",
  weather: "Live weather & location",
  policies: "Workplace policy builder",
  workers: "Worker profiles",
  simulate: "Simulation control centre",
  results: "Simulation results",
  optimizer: "Policy optimizer",
  reports: "Reports",
  scenarios: "Climate scenarios",
};

export function Topbar() {
  const pathname = usePathname();
  const { location, user, signOut } = useWorkspace();
  const segments = pathname.split("/").filter(Boolean);
  const label = LABELS[segments[0] ?? ""] ?? "Workspace";

  return (
    <header className="hidden items-center justify-between gap-4 border-b border-line bg-white/80 px-7 py-3.5 backdrop-blur lg:flex">
      <div className="flex items-center gap-2 text-[12px]">
        <span className="text-ink-muted">Workspace</span>
        <span className="text-navy-200">/</span>
        <span className="font-medium text-navy-900">{label}</span>
      </div>

              <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 rounded-full border border-line bg-mist-50 px-2.5 py-1 text-[10.5px] text-ink-muted">
          <MapPin className="h-3 w-3 text-teal-700" />
          {location ? location.name : "No workplace selected"}
        </span>
        <Link
          href="/weather"
          className={cn(
            "flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[10.5px] font-semibold text-teal-800",
            "transition-colors hover:bg-teal-100",
          )}
        >
          <CloudSun className="h-3 w-3" /> Live weather
        </Link>
        <div className="flex items-center gap-2 border-l border-line pl-3">
          {user ? (
            <>
              <div className="text-right">
                <p className="text-[11.5px] font-medium leading-tight text-navy-900">
                  {user.name ?? user.email}
                </p>
                <p className="text-[10px] leading-tight text-ink-muted">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                aria-label="Sign out"
                className="grid h-8 w-8 place-items-center rounded-full bg-navy-900 text-white transition-colors hover:bg-navy-700"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <Link
              href="/auth/signin"
              className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-[11px] font-semibold text-teal-800 transition-colors hover:bg-teal-100"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
