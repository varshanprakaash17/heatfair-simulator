"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, CloudSun, LogOut, MapPin } from "lucide-react";
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

function initialsFor(name: string | null, email: string) {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const letters = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  return (letters || source.slice(0, 2)).toUpperCase();
}

export function Topbar() {
  const pathname = usePathname();
  const { bootstrap, location, user, signOut } = useWorkspace();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const segments = pathname.split("/").filter(Boolean);
  const label = LABELS[segments[0] ?? ""] ?? "Workspace";

  // Navigate away, click outside, or press Escape to dismiss the account menu.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

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
        <div className="border-l border-line pl-3">
          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className={cn(
                  "flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-2.5 text-left transition-colors",
                  "hover:bg-mist-50",
                  menuOpen && "border-teal-200 bg-teal-50/60",
                )}
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-navy-900 text-[10.5px] font-semibold text-white">
                  {initialsFor(user.name, user.email)}
                </span>
                <span className="min-w-0">
                  <span className="block max-w-[150px] truncate text-[11.5px] font-medium leading-tight text-navy-900">
                    {user.name ?? user.email}
                  </span>
                  <span className="block max-w-[150px] truncate text-[10px] leading-tight text-ink-muted">
                    {user.email}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "h-3 w-3 shrink-0 text-ink-muted transition-transform",
                    menuOpen && "rotate-180",
                  )}
                />
              </button>

              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-xl border border-line bg-white shadow-[0_16px_40px_-18px_rgba(15,32,66,0.35)]"
                >
                  <div className="border-b border-line px-3.5 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                      Signed in
                    </p>
                    {user.name ? (
                      <p className="mt-1 truncate text-[12.5px] font-medium text-navy-950">{user.name}</p>
                    ) : null}
                    <p className="truncate text-[11px] text-ink-muted">{user.email}</p>
                  </div>
                  <dl className="space-y-1 px-3.5 py-2.5 text-[11px]">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-ink-muted">Organisation</dt>
                      <dd className="truncate font-medium text-ink-soft">
                        {bootstrap?.organization.name ?? "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-ink-muted">Workplace</dt>
                      <dd className="truncate font-medium text-ink-soft">{location?.name ?? "—"}</dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      void signOut();
                    }}
                    className="flex w-full items-center gap-2 border-t border-line px-3.5 py-2.5 text-left text-[11.5px] font-medium text-rose-700 transition-colors hover:bg-rose-50"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Sign out
                  </button>
                </div>
              ) : null}
            </div>
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
