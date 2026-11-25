"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, ShieldCheck } from "lucide-react";
import { API_URL } from "@/lib/utils";

const ERROR_MESSAGES: Record<string, string> = {
  google_unconfigured:
    "Google sign-in is not configured on this deployment yet. Ask your administrator to add the Google credentials.",
  no_account:
    "That Google account has not been invited to HeatFair. Ask your organisation administrator to add this email address.",
  google_cancelled: "Google sign-in was cancelled. You can try again whenever you are ready.",
  google_expired: "That sign-in attempt expired. Please start again.",
  google_unverified: "Google has not verified that email address, so we cannot sign you in.",
  google_unavailable: "We could not reach Google just now. Please try again in a moment.",
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.53 5.53 0 0 1-2.4 3.63v3.01h3.87c2.27-2.09 3.59-5.17 3.59-8.83Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.9l-3.87-3.01c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.28a12 12 0 0 0 0 10.78l3.99-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l3.99 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

export default function SignInPage() {
  const [error, setError] = useState<string | null>(null);

  // The API redirects back here with ?error=… when sign-in cannot finish.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) setError(ERROR_MESSAGES[code] ?? "Sign-in could not be completed. Please try again.");
  }, []);

  function signInWithGoogle() {
    setError(null);
    const params = new URLSearchParams({
      origin: window.location.origin,
      next: "/dashboard",
    });
    window.location.href = `${API_URL}/api/v1/auth/google/start?${params.toString()}`;
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

          <h1 className="mt-3 text-[18px] font-semibold text-navy-950">Sign in with Google</h1>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
            Use the Google account for the work email your organisation administrator invited.
            There is no public sign-up.
          </p>

          {error ? (
            <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-[11.5px] leading-relaxed text-rose-700">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={signInWithGoogle}
            className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-white px-4 py-2.5 text-[13px] font-medium text-navy-900 transition-colors hover:bg-mist-50"
          >
            <GoogleMark />
            Continue with Google
          </button>

          <p className="mt-4 text-center text-[10.5px] leading-relaxed text-ink-muted">
            Decision-support prototype — not a certified occupational-safety assessment.
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
