"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity, ArrowLeft, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in right now.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist-100 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-navy-900">
            <Activity className="h-5 w-5 text-white" strokeWidth={2.2} />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-navy-950">HeatFair</p>
            <p className="text-[10px] text-ink-muted">
              Climate-aware workplace policy simulation
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-teal-700" /> Staff &amp; worker sign-in
          </div>

          <h1 className="mt-3 text-[18px] font-semibold text-navy-950">Sign in with your email</h1>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
            Accounts are created by your organization administrator. Use the work email and
            password you were given.
          </p>

          <form onSubmit={onSubmit} className="mt-5 space-y-3">
            <label className="block">
              <span className="text-[11px] font-medium text-ink-soft">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-navy-900 outline-none focus:border-teal-500"
                placeholder="you@example.com"
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-medium text-ink-soft">Password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-navy-900 outline-none focus:border-teal-500"
                placeholder="••••••••"
              />
            </label>

            {error ? (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700">{error}</p>
            ) : null}

            <Button type="submit" variant="navy" size="sm" className="w-full" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-4 text-center text-[10.5px] leading-relaxed text-ink-muted">
            HeatFair is for illustrative policy simulation only and is not an occupational-safety
            certification.
          </p>
        </div>

        <Link
          href="/"
          className="flex items-center gap-1.5 text-[11.5px] text-ink-soft transition-colors hover:text-navy-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to HeatFair
        </Link>
      </div>
    </div>
  );
}
