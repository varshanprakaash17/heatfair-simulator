"use client";

import { useWorkspace } from "@/lib/workspace";

/**
 * Makes a dead or misconfigured API impossible to miss.
 *
 * Every workspace page renders empty placeholders when the backend cannot be
 * reached, which previously looked like "nothing happens". This banner states
 * the problem and how to fix it, and offers a retry.
 */
export function ApiStatusBanner() {
  const { error, loading, refresh } = useWorkspace();

  if (!error && !loading) return null;

  if (loading) {
    return (
      <div
        role="status"
        className="mb-5 rounded-xl border border-line bg-white px-4 py-3 text-[12px] text-ink-soft"
      >
        Connecting to the HeatFair engine…
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-900"
    >
      <p className="font-semibold">The HeatFair API is not reachable, so no data can load.</p>
      <p className="mt-1 text-[11.5px] leading-relaxed">
        {error} Policies, worker profiles, simulations and reports all need the FastAPI service. The
        deployment must expose it at <code className="font-mono">/api/v1</code> (same origin) or set{" "}
        <code className="font-mono">HEATFAIR_API_URL</code> to it.
      </p>
      <button
        type="button"
        onClick={() => void refresh()}
        className="mt-2 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
      >
        Retry
      </button>
    </div>
  );
}
