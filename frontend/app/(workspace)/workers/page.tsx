"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import type { WorkerListResponse } from "@/lib/types";
import { formatDate, formatNumber } from "@/lib/utils";

type Draft = {
  label: string;
  occupation: string;
  hourly_income: string;
  work_intensity: string;
  shift_hours: string;
  workload: string;
  incentive_sensitivity: string;
  break_need: string;
  heat_tolerance: string;
};

const DEFAULT_DRAFT: Draft = {
  label: "",
  occupation: "Warehouse associate",
  hourly_income: "3.50",
  work_intensity: "0.75",
  shift_hours: "8",
  workload: "0.70",
  incentive_sensitivity: "0.50",
  break_need: "0.50",
  heat_tolerance: "1.00",
};

const NUMERIC_FIELDS: {
  key: keyof Omit<Draft, "label" | "occupation">;
  label: string;
  min: number;
  max: number;
  step: number;
  hint: string;
}[] = [
  { key: "hourly_income", label: "Hourly income", min: 0, max: 10000, step: 0.1, hint: "Local currency per hour" },
  { key: "shift_hours", label: "Shift hours", min: 0.25, max: 16, step: 0.25, hint: "Typical shift length" },
  { key: "work_intensity", label: "Work intensity", min: 0.15, max: 1, step: 0.01, hint: "0.15 light · 1.00 very heavy" },
  { key: "workload", label: "Workload", min: 0, max: 1, step: 0.01, hint: "Share of shift under load" },
  { key: "incentive_sensitivity", label: "Incentive sensitivity", min: 0, max: 1, step: 0.01, hint: "How strongly bonuses drive skipped breaks" },
  { key: "break_need", label: "Break need", min: 0, max: 1, step: 0.01, hint: "Rest requirement for this role" },
  { key: "heat_tolerance", label: "Heat tolerance", min: 0.75, max: 1.3, step: 0.01, hint: "1.00 is the population average" },
];

export default function WorkersPage() {
  const { bootstrap } = useWorkspace();
  const organizationId = bootstrap?.organization.id;
  const [data, setData] = useState<WorkerListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.workers(organizationId, { includeSynthetic: false }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load worker profiles.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const validation = useMemo(() => {
    if (draft.occupation.trim().length < 2) return "Occupation needs at least two characters.";
    for (const field of NUMERIC_FIELDS) {
      const value = Number(draft[field.key]);
      if (!Number.isFinite(value)) return `${field.label} must be a number.`;
      if (value < field.min || value > field.max) {
        return `${field.label} must be between ${field.min} and ${field.max}.`;
      }
    }
    return null;
  }, [draft]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!organizationId || validation) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const created = await api.createWorker({
        organization_id: organizationId,
        label: draft.label.trim() || null,
        occupation: draft.occupation.trim(),
        hourly_income: Number(draft.hourly_income),
        work_intensity: Number(draft.work_intensity),
        shift_hours: Number(draft.shift_hours),
        workload: Number(draft.workload),
        incentive_sensitivity: Number(draft.incentive_sensitivity),
        break_need: Number(draft.break_need),
        heat_tolerance: Number(draft.heat_tolerance),
      });
      setDraft(DEFAULT_DRAFT);
      setNotice(`${created.label ?? created.occupation} (${created.synthetic_id}) saved. The next simulation can include it.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save this worker profile.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!organizationId) return;
    if (!window.confirm(`Delete "${name}"? This saved profile will no longer be used in new runs.`)) {
      return;
    }
    setDeleting(id);
    setError(null);
    setNotice(null);
    try {
      await api.deleteWorker(id, organizationId);
      setNotice(`${name} deleted.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete this worker profile.");
    } finally {
      setDeleting(null);
    }
  }

  const saved = data?.workers ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Worker profiles"
        title="Add the workers you actually want simulated"
        description="Saved profiles are your own inputs, not real employee records and not synthetic sampling. A simulation adds them to the population first and fills the remaining slots with synthetic profiles."
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        }
      />

      {error ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-3 text-[12px] text-teal-900">
          {notice}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-[10.5px] font-medium text-ink-muted">Saved profiles</p>
          <p className="mt-1 font-display text-[26px] font-bold text-navy-950">{data?.saved_total ?? 0}</p>
          <p className="mt-0.5 text-[9.5px] text-ink-muted">Included in new simulations</p>
        </div>
        <div className="card p-4">
          <p className="text-[10.5px] font-medium text-ink-muted">Generated profiles</p>
          <p className="mt-1 font-display text-[26px] font-bold text-navy-950">{data?.synthetic_total ?? 0}</p>
          <p className="mt-0.5 text-[9.5px] text-ink-muted">Last synthetic batch stored for this organization</p>
        </div>
        <div className="card p-4">
          <p className="text-[10.5px] font-medium text-ink-muted">Population source</p>
          <p className="mt-1 text-[13px] font-semibold text-navy-950">Saved first, synthetic fills</p>
          <p className="mt-0.5 text-[9.5px] text-ink-muted">
            A run of 500 with 3 saved profiles evaluates 497 synthetic + 3 saved workers.
          </p>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.25fr]">
        <form onSubmit={submit} className="card h-fit p-5">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-teal-700" />
            <h2 className="text-[14px] font-semibold text-navy-950">Add a worker profile</h2>
          </div>
          <p className="mt-1 text-[10.5px] leading-4 text-ink-muted">
            Describe the role, not the person. Ranges match the simulation engine so the row is
            actually evaluated.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Label (optional)" hint="Non-identifying, e.g. “Rider A”.">
              <Input
                value={draft.label}
                onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                maxLength={80}
                placeholder="Rider A"
              />
            </Field>
            <Field label="Occupation">
              <Input
                value={draft.occupation}
                onChange={(event) => setDraft({ ...draft, occupation: event.target.value })}
                maxLength={120}
                required
              />
            </Field>
            {NUMERIC_FIELDS.map((field) => (
              <Field key={field.key} label={field.label} hint={field.hint}>
                <Input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={draft[field.key]}
                  onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                  className="font-mono"
                  required
                />
              </Field>
            ))}
          </div>

          {validation ? <p className="mt-3 text-[10.5px] text-heat-700">{validation}</p> : null}

          <Button
            type="submit"
            variant="navy"
            size="sm"
            className="mt-4 w-full"
            disabled={saving || Boolean(validation) || !organizationId}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {saving ? "Saving profile…" : "Save worker profile"}
          </Button>
          <p className="mt-2 text-[10px] leading-4 text-ink-muted">
            Saved profiles are model inputs you control. They are not measured observations of a
            real person&apos;s heat tolerance or income.
          </p>
        </form>

        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-[14px] font-semibold text-navy-950">Saved roster</h2>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                Profiles appended to every new simulation for this organization.
              </p>
            </div>
            <Badge tone="teal">{saved.length} saved</Badge>
          </div>

          {loading && !data ? (
            <div className="flex items-center gap-2 px-5 py-10 text-[12px] text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading saved worker profiles…
            </div>
          ) : saved.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Users className="mx-auto h-6 w-6 text-ink-muted" />
              <p className="mt-2 text-[12px] font-medium text-navy-900">No saved profiles yet</p>
              <p className="mt-1 text-[11px] text-ink-muted">
                Add one on the left, then run a simulation with “Include my saved worker profiles”
                checked.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-[11.5px]">
                <thead>
                  <tr className="border-b border-line bg-mist-50 text-[9.5px] uppercase tracking-[0.07em] text-ink-muted">
                    <th className="px-5 py-2.5 font-semibold">Worker</th>
                    <th className="px-3 py-2.5 font-semibold">Occupation</th>
                    <th className="px-3 py-2.5 font-semibold">Income/h</th>
                    <th className="px-3 py-2.5 font-semibold">Intensity</th>
                    <th className="px-3 py-2.5 font-semibold">Shift</th>
                    <th className="px-3 py-2.5 font-semibold">Incentive</th>
                    <th className="px-3 py-2.5 font-semibold">Break need</th>
                    <th className="px-3 py-2.5 font-semibold">Heat tol.</th>
                    <th className="px-3 py-2.5 font-semibold">Added</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {saved.map((worker) => (
                    <tr key={worker.id} className="border-b border-line/70 last:border-0 hover:bg-mist-100/60">
                      <td className="px-5 py-2.5">
                        <p className="font-medium text-navy-900">{worker.label ?? worker.synthetic_id}</p>
                        <p className="mt-0.5 font-mono text-[9.5px] text-ink-muted">{worker.synthetic_id}</p>
                      </td>
                      <td className="px-3 py-2.5 text-ink-soft">{worker.occupation}</td>
                      <td className="px-3 py-2.5 font-mono text-ink-soft">{formatNumber(worker.hourly_income, 2)}</td>
                      <td className="px-3 py-2.5 font-mono text-ink-soft">{formatNumber(worker.work_intensity, 2)}</td>
                      <td className="px-3 py-2.5 font-mono text-ink-soft">{formatNumber(worker.shift_hours, 2)} h</td>
                      <td className="px-3 py-2.5 font-mono text-ink-soft">{formatNumber(worker.incentive_sensitivity, 2)}</td>
                      <td className="px-3 py-2.5 font-mono text-ink-soft">{formatNumber(worker.break_need, 2)}</td>
                      <td className="px-3 py-2.5 font-mono text-ink-soft">{formatNumber(worker.heat_tolerance, 2)}</td>
                      <td className="px-3 py-2.5 text-[10px] text-ink-muted">{formatDate(worker.created_at)}</td>
                      <td className="px-5 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void remove(worker.id, worker.label ?? worker.synthetic_id)}
                          disabled={deleting === worker.id}
                          aria-label={`Delete ${worker.label ?? worker.synthetic_id}`}
                        >
                          {deleting === worker.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5 text-heat-700" />
                          )}
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-line bg-mist-50 px-5 py-2.5 text-[9.5px] leading-4 text-ink-muted">
            Generated synthetic profiles are replaced whenever a new generation batch is stored, so
            they are not listed or editable here. Use the{" "}
            <Link href="/simulate" className="font-medium text-teal-700 hover:underline">
              simulation page
            </Link>{" "}
            to generate a batch.
          </p>
        </section>
      </div>
    </div>
  );
}
