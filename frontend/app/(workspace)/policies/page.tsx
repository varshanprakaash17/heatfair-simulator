"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Copy,
  Gauge,
  Info,
  Loader2,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, SliderField, Switch } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import type { Policy } from "@/lib/types";
import { formatDate, formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Draft = {
  name: string;
  deadline_pressure: number;
  bonus_dependency: number;
  penalty_severity: number;
  break_compensation: number;
  protected_break_minutes: number;
  flexible_deadlines: boolean;
  paid_breaks: boolean;
  penalise_safety_delays: boolean;
  max_shift_hours: number;
  budget_limit: number;
};

const BLANK: Draft = {
  name: "",
  deadline_pressure: 65,
  bonus_dependency: 55,
  penalty_severity: 50,
  break_compensation: 30,
  protected_break_minutes: 30,
  flexible_deadlines: false,
  paid_breaks: true,
  penalise_safety_delays: true,
  max_shift_hours: 9,
  budget_limit: 5000,
};

function draftFromPolicy(policy: Policy): Draft {
  return {
    name: policy.name,
    deadline_pressure: Math.round(policy.deadline_pressure * 100),
    bonus_dependency: Math.round(policy.bonus_dependency * 100),
    penalty_severity: Math.round(policy.penalty_severity * 100),
    break_compensation: Math.round(policy.break_compensation * 100),
    protected_break_minutes: Math.round(policy.protected_break_minutes),
    flexible_deadlines: policy.flexible_deadlines,
    paid_breaks: policy.paid_breaks,
    penalise_safety_delays: policy.penalise_safety_delays,
    max_shift_hours: policy.max_shift_hours,
    budget_limit: policy.budget_limit,
  };
}

function payloadFromDraft(draft: Draft) {
  return {
    name: draft.name.trim(),
    deadline_pressure: draft.deadline_pressure / 100,
    bonus_dependency: draft.bonus_dependency / 100,
    penalty_severity: draft.penalty_severity / 100,
    break_compensation: draft.break_compensation / 100,
    protected_break_minutes: draft.protected_break_minutes,
    flexible_deadlines: draft.flexible_deadlines,
    paid_breaks: draft.paid_breaks,
    penalise_safety_delays: draft.penalise_safety_delays,
    max_shift_hours: draft.max_shift_hours,
    budget_limit: draft.budget_limit,
  };
}

export default function PoliciesPage() {
  const { bootstrap, policies, refresh } = useWorkspace();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const initialised = useRef(false);

  useEffect(() => {
    if (initialised.current || policies.length === 0) return;
    initialised.current = true;
    setEditingId(policies[0].id);
    setDraft(draftFromPolicy(policies[0]));
  }, [policies]);

  const selected = policies.find((policy) => policy.id === editingId) ?? null;
  const issue = validate(draft, selected ? "edit" : "create");

  const dirty = useMemo(() => {
    if (!selected) return draft.name.trim().length > 0;
    return JSON.stringify(draftFromPolicy(selected)) !== JSON.stringify(draft);
  }, [draft, selected]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice(null);
    setError(null);
  }

  function startCreate() {
    setEditingId(null);
    setDraft({ ...BLANK, name: "" });
    setError(null);
    setNotice(null);
  }

  function selectPolicy(policy: Policy) {
    setEditingId(policy.id);
    setDraft(draftFromPolicy(policy));
    setError(null);
    setNotice(null);
  }

  async function save() {
    if (!bootstrap) return;
    if (issue) {
      setError(issue);
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (editingId) {
        const updated = await api.updatePolicy(editingId, payloadFromDraft(draft));
        setEditingId(updated.id);
        setDraft(draftFromPolicy(updated));
        setNotice("Policy updated. Future simulations use the new values.");
      } else {
        const created = await api.createPolicy({
          organization_id: bootstrap.organization.id,
          ...payloadFromDraft(draft),
        });
        setEditingId(created.id);
        setDraft(draftFromPolicy(created));
        setNotice("Policy saved. You can run a simulation with it now.");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The policy could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function duplicate() {
    if (!bootstrap) return;
    if (issue) {
      setError(issue);
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const created = await api.createPolicy({
        organization_id: bootstrap.organization.id,
        ...payloadFromDraft({ ...draft, name: `${draft.name.trim()} (copy)` }),
      });
      setEditingId(created.id);
      setDraft(draftFromPolicy(created));
      setNotice("Policy duplicated as a new saved policy.");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The policy could not be duplicated.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selected) return;
    if (!window.confirm(`Delete “${selected.name}”? Simulations that already used it are not altered.`)) return;
    setDeleting(true);
    setError(null);
    setNotice(null);
    try {
      await api.deletePolicy(selected.id);
      const next = policies.find((policy) => policy.id !== selected.id);
      if (next) {
        setEditingId(next.id);
        setDraft(draftFromPolicy(next));
      } else {
        startCreate();
      }
      setNotice("Policy deleted. Historical simulations keep their original configuration.");
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "The policy could not be deleted. It may be referenced by a simulation.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workplace policy builder"
        title="Design the rules a worker actually experiences"
        description="Deadlines, bonuses, penalties and break rules are the policy levers HeatFair evaluates. Saved policies can be reused across simulations and compared on the same weather snapshot."
        actions={
          <Button size="sm" variant="navy" onClick={startCreate}>
            <Plus className="h-3.5 w-3.5" /> New policy
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
        <div className="flex items-start gap-2.5 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-[12px] text-teal-900">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{notice}</p>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.55fr]">
        {/* Saved policies */}
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
            <div>
              <h2 className="text-[13.5px] font-semibold text-navy-950">Saved policies</h2>
              <p className="mt-0.5 text-[10.5px] text-ink-muted">Select one to edit</p>
            </div>
            <Badge tone="neutral">{policies.length}</Badge>
          </div>

          <div className="max-h-[620px] divide-y divide-line/70 overflow-y-auto">
            {policies.map((policy) => {
              const active = policy.id === editingId;
              return (
                <button
                  key={policy.id}
                  type="button"
                  onClick={() => selectPolicy(policy)}
                  className={cn(
                    "w-full px-4 py-3.5 text-left transition-colors",
                    active ? "bg-teal-50/70" : "hover:bg-mist-100",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={cn("truncate text-[12.5px] font-semibold", active ? "text-teal-900" : "text-navy-900")}>
                        {policy.name}
                      </p>
                      <p className="mt-0.5 text-[10px] text-ink-muted">
                        {policy.protected_break_minutes} min protected · {policy.max_shift_hours} h max shift
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                        policy.incentive_pressure_index >= 65
                          ? "bg-heat-50 text-heat-800"
                          : policy.incentive_pressure_index >= 40
                            ? "bg-amber-50 text-amber-700"
                            : "bg-teal-50 text-teal-800",
                      )}
                    >
                      {formatNumber(policy.incentive_pressure_index, 0)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {policy.paid_breaks ? <Badge tone="teal">Paid breaks</Badge> : <Badge tone="neutral">Unpaid breaks</Badge>}
                    {policy.flexible_deadlines ? <Badge tone="navy">Flexible</Badge> : null}
                    {policy.penalise_safety_delays ? <Badge tone="amber">Safety-delay penalty</Badge> : null}
                  </div>
                </button>
              );
            })}
            {policies.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Settings2 className="mx-auto h-5 w-5 text-ink-muted" />
                <p className="mt-2 text-[11.5px] text-ink-muted">No saved policies yet.</p>
              </div>
            ) : null}
          </div>

          <div className="border-t border-line bg-mist-50 px-4 py-3">
            <p className="flex items-start gap-1.5 text-[10px] leading-4 text-ink-muted">
              <Info className="mt-0.5 h-3 w-3 shrink-0 text-teal-700" />
              The number beside each policy is its published incentive-pressure index, an illustrative
              weighted formula — not a behavioural prediction.
            </p>
          </div>
        </section>

        {/* Editor */}
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[14px] font-semibold text-navy-950">
                  {selected ? "Edit policy" : "Create a policy"}
                </h2>
                {selected ? (
                  <Badge tone={selected.deadline_pressure >= 0.7 ? "amber" : "teal"}>
                    {formatNumber(selected.incentive_pressure_index, 0)}/100 pressure
                  </Badge>
                ) : (
                  <Badge tone="navy">UNSAVED</Badge>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                {selected ? `Saved ${formatDate(selected.created_at)}` : "Start from the defaults and adjust the levers."}
              </p>
            </div>
            {selected ? (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={duplicate} disabled={saving}>
                  <Copy className="h-3.5 w-3.5" /> Duplicate
                </Button>
                <Button size="sm" variant="ghost" onClick={remove} disabled={deleting} className="text-rose-600 hover:bg-rose-50">
                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Delete
                </Button>
              </div>
            ) : null}
          </div>

          <div className="space-y-6 p-5">
            <Field label="Policy name" hint="A short internal name, e.g. “Monsoon peak-week policy”.">
              <Input
                value={draft.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="e.g. Protected-break delivery policy"
                maxLength={120}
              />
            </Field>

            <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
              <SliderField
                label="Deadline pressure"
                value={draft.deadline_pressure}
                onChange={(value) => update("deadline_pressure", value)}
                hint="How strongly deadlines push workers to skip recovery."
              />
              <SliderField
                label="Bonus dependency"
                value={draft.bonus_dependency}
                onChange={(value) => update("bonus_dependency", value)}
                hint="Share of expected pay tied to speed or completion."
              />
              <SliderField
                label="Penalty severity"
                value={draft.penalty_severity}
                onChange={(value) => update("penalty_severity", value)}
                hint="Consequence of missing a target or taking longer."
              />
              <SliderField
                label="Break compensation protection"
                value={draft.break_compensation}
                onChange={(value) => update("break_compensation", value)}
                hint="Degree to which protected rest is income-neutral."
              />
            </div>

            <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
              <div>
                <div className="flex items-center justify-between">
                  <Label>Protected break duration</Label>
                  <span className="font-mono text-[11px] font-medium text-navy-800">
                    {draft.protected_break_minutes} min
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={180}
                    step={5}
                    value={draft.protected_break_minutes}
                    onChange={(event) => update("protected_break_minutes", Number(event.target.value))}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-mist-300 accent-teal-600"
                    aria-label="Protected break duration in minutes"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={180}
                    value={draft.protected_break_minutes}
                    onChange={(event) =>
                      update(
                        "protected_break_minutes",
                        Math.max(0, Math.min(180, Number(event.target.value) || 0)),
                      )
                    }
                    className="h-9 w-[76px] text-center font-mono text-[12px]"
                  />
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-ink-muted">
                  Formal rest entitlement during the shift. The engine compares it with a 9 min/hour reference.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label>Maximum shift duration</Label>
                  <span className="font-mono text-[11px] font-medium text-navy-800">
                    {draft.max_shift_hours} h
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min={4}
                    max={16}
                    step={1}
                    value={draft.max_shift_hours}
                    onChange={(event) => update("max_shift_hours", Number(event.target.value))}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-mist-300 accent-teal-600"
                    aria-label="Maximum shift duration in hours"
                  />
                  <Input
                    type="number"
                    min={1}
                    max={16}
                    value={draft.max_shift_hours}
                    onChange={(event) =>
                      update("max_shift_hours", Math.max(1, Math.min(16, Number(event.target.value) || 1)))
                    }
                    className="h-9 w-[76px] text-center font-mono text-[12px]"
                  />
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-ink-muted">
                  Caps the evaluated shift length. Longer requested shifts are truncated by the engine.
                </p>
              </div>
            </div>

            <div className="grid gap-4 rounded-xl border border-line bg-mist-50 p-4 md:grid-cols-2">
              <ToggleField
                label="Flexible deadlines"
                description="Allows work to be moved within the day when heat peaks."
                checked={draft.flexible_deadlines}
                onChange={(value) => update("flexible_deadlines", value)}
              />
              <ToggleField
                label="Paid breaks"
                description="Protected rest does not reduce estimated take-home pay."
                checked={draft.paid_breaks}
                onChange={(value) => update("paid_breaks", value)}
              />
              <ToggleField
                label="Penalties for approved safety delays"
                description="Adds behavioural pressure when safety-driven delays are penalised."
                checked={draft.penalise_safety_delays}
                onChange={(value) => update("penalise_safety_delays", value)}
              />
              <Field
                label="Operational budget (per shift)"
                hint="Reported for comparison; it does not silently constrain the model."
              >
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-ink-muted">
                    $
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={1_000_000}
                    step={1}
                    value={draft.budget_limit}
                    onChange={(event) =>
                      update("budget_limit", Math.max(0, Math.min(1_000_000, Number(event.target.value) || 0)))
                    }
                    className="pl-6 font-mono text-[12.5px]"
                  />
                </div>
              </Field>
            </div>

            {issue ? <p className="text-[11.5px] text-rose-600">{issue}</p> : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md bg-mist-200 px-2 py-1 text-[10px] text-ink-soft">
                  <Gauge className="h-3 w-3" /> Pressure {formatNumber(
                    (0.3 * draft.deadline_pressure + 0.3 * draft.bonus_dependency + 0.25 * draft.penalty_severity + 0.15 * (100 - draft.break_compensation)),
                    0,
                  )}/100
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-mist-200 px-2 py-1 text-[10px] text-ink-soft">
                  <ShieldCheck className="h-3 w-3" /> {draft.protected_break_minutes} min / shift
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-mist-200 px-2 py-1 text-[10px] text-ink-soft">
                  <Wallet className="h-3 w-3" /> ${formatNumber(draft.budget_limit, 0)} budget
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={startCreate} disabled={saving}>
                  Cancel
                </Button>
                <Button variant="navy" size="sm" onClick={save} disabled={saving || Boolean(issue)}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {editingId ? "Update policy" : "Save policy"}
                </Button>
              </div>
            </div>
            {dirty ? (
              <p className="-mt-2 text-right text-[10px] text-heat-700">Unsaved changes</p>
            ) : null}
          </div>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Explainer
          icon={<Gauge className="h-4 w-4" />}
          title="Incentive pressure"
          body="Published weighted index: 0.30 × deadline + 0.30 × bonus dependency + 0.25 × penalty − 0.15 × uncompensated break. Inputs are normalised to 0–1."
        />
        <Explainer
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Break accessibility"
          body="A logistic estimate combining protected break coverage, financial protection, effective incentive pressure and workload. Hypothetical, not observed worker behaviour."
        />
        <Explainer
          icon={<Users className="h-4 w-4" />}
          title="Who this is for"
          body="Safety leads, operations managers and climate researchers reasoning about delivery, logistics, construction and other outdoor work. Always pair with worker consultation."
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white px-5 py-4">
        <div>
          <p className="text-[12.5px] font-semibold text-navy-950">Ready to test this policy against live weather?</p>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            Choose a workplace, shift window and synthetic population in the simulation control centre.
          </p>
        </div>
        <Button asChild variant="navy" size="sm">
          <Link href="/simulate">Open simulation centre</Link>
        </Button>
      </div>
    </div>
  );
}

function validate(draft: Draft, mode: "create" | "edit"): string | null {
  if (draft.name.trim().length < 2) return "Give the policy a name of at least two characters.";
  if (draft.name.trim().length > 120) return "Keep the policy name under 120 characters.";
  if (draft.deadline_pressure < 0 || draft.deadline_pressure > 100) return "Deadline pressure must be between 0 and 100.";
  if (draft.bonus_dependency < 0 || draft.bonus_dependency > 100) return "Bonus dependency must be between 0 and 100.";
  if (draft.penalty_severity < 0 || draft.penalty_severity > 100) return "Penalty severity must be between 0 and 100.";
  if (draft.break_compensation < 0 || draft.break_compensation > 100) return "Break compensation must be between 0 and 100.";
  if (draft.protected_break_minutes < 0 || draft.protected_break_minutes > 180) return "Protected breaks must be between 0 and 180 minutes.";
  if (draft.max_shift_hours < 1 || draft.max_shift_hours > 16) return "Maximum shift duration must be between 1 and 16 hours.";
  if (draft.budget_limit < 0) return "Operational budget cannot be negative.";
  void mode;
  return null;
}

function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[12px] font-medium text-ink-soft">{label}</p>
        <p className="mt-0.5 text-[10.5px] leading-4 text-ink-muted">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function Explainer({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-mist-100 text-teal-700">{icon}</span>
      <h3 className="mt-2.5 text-[12.5px] font-semibold text-navy-950">{title}</h3>
      <p className="mt-1 text-[11px] leading-5 text-ink-muted">{body}</p>
    </div>
  );
}
