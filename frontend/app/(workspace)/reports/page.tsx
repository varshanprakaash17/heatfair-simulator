"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";
import type { SimulationListRow } from "@/lib/types";
import { API_URL, formatDate, formatNumber, formatPercent } from "@/lib/utils";

type ReportRow = {
  id: string;
  simulation_id: string;
  report_url: string;
  title: string;
  created_at: string;
};

const CONTENTS = [
  "Organization and workplace location",
  "Weather source, retrieval timestamp and forecast period",
  "Selected policy and synthetic population size",
  "Model version, random seed and assumptions",
  "Exposure, break access, income and operational metrics",
  "Alternative policy comparisons and Pareto candidates",
  "Methodology, limitations and human-review recommendations",
];

export default function ReportsPage() {
  const { bootstrap } = useWorkspace();
  const [simulations, setSimulations] = useState<SimulationListRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(organizationId: string) {
    setLoading(true);
    setError(null);
    try {
      const [runs, existing] = await Promise.all([
        api.simulations(organizationId, 30),
        api.reports(),
      ]);
      const completed = runs.filter((run) => run.status === "completed");
      setSimulations(completed);
      setReports(existing);
      setSelectedId((current) => current || completed[0]?.id || "");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load reports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (bootstrap?.organization.id) void load(bootstrap.organization.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap?.organization.id]);

  const reportCounts = useMemo(() => {
    const map = new Map<string, number>();
    reports.forEach((report) => map.set(report.simulation_id, (map.get(report.simulation_id) ?? 0) + 1));
    return map;
  }, [reports]);

  const selectedRun = simulations.find((run) => run.id === selectedId);

  function generate() {
    if (!selectedId) return;
    setGenerating(true);
    setNotice(null);
    window.open(api.reportUrl(selectedId), "_blank", "noopener,noreferrer");
    window.setTimeout(async () => {
      setGenerating(false);
      setNotice("Report generated and recorded. If the PDF tab did not open, use the report link in the table.");
      if (bootstrap?.organization.id) {
        try {
          setReports(await api.reports());
        } catch {
          /* the download can still succeed if listing fails */
        }
      }
    }, 3500);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports"
        title="Auditable PDF policy reports"
        description="A report is generated from stored simulation results, not from the current screen. It records model provenance and limitations so another person can review how the conclusion was produced."
        actions={
          <Button variant="secondary" size="sm" onClick={() => bootstrap && load(bootstrap.organization.id)}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
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
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{notice}</p>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <section className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-teal-700" />
              <h2 className="text-[14px] font-semibold text-navy-950">Generate a report</h2>
            </div>
            <p className="mt-1 text-[11px] leading-5 text-ink-muted">
              ReportLab builds the PDF server-side from the stored simulation, weather snapshot and any
              saved Pareto candidates. Only completed simulations can be reported.
            </p>
          </div>

          <div className="p-5">
            <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Completed simulation
              <Select
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className="mt-1.5"
                disabled={loading || simulations.length === 0}
              >
                {simulations.length === 0 ? <option value="">No completed simulations</option> : null}
                {simulations.map((run) => (
                  <option key={run.id} value={run.id}>
                    {(run.label || run.id.slice(0, 8)) + " · " + formatDate(run.created_at)}
                  </option>
                ))}
              </Select>
            </label>

            {selectedRun ? (
              <div className="mt-4 rounded-xl border border-line bg-mist-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[12.5px] font-semibold text-navy-900">
                      {selectedRun.label || selectedRun.id.slice(0, 8)}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[10.5px] text-ink-muted">
                      <MapPin className="h-3 w-3" />
                      {selectedRun.weather_location ?? selectedRun.scenario_name ?? "Stored scenario"}
                    </p>
                  </div>
                  <Badge tone="teal">COMPLETED</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-2.5 sm:grid-cols-4">
                  <ReportFact label="Workers" value={String(selectedRun.population_size ?? "—")} />
                  <ReportFact label="Exposure" value={formatNumber(selectedRun.exposure_index, 1)} />
                  <ReportFact label="Retention" value={formatPercent(selectedRun.income_retention, 1)} />
                  <ReportFact label="Break access" value={formatPercent(selectedRun.break_accessibility, 1)} />
                </div>
                <p className="mt-2 text-[9.5px] text-ink-muted">
                  Existing reports for this run: {reportCounts.get(selectedRun.id) ?? 0}
                  {selectedRun.weather_type ? ` · ${selectedRun.weather_type} weather` : ""}
                </p>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="navy" onClick={generate} disabled={!selectedId || generating}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {generating ? "Generating PDF…" : "Generate PDF report"}
              </Button>
              {selectedId ? (
                <Button asChild variant="secondary">
                  <Link href={`/results/${selectedId}`}>View results</Link>
                </Button>
              ) : null}
            </div>
            <p className="mt-2 text-[9.5px] leading-4 text-ink-muted">
              The PDF opens in a new tab. Generating does not change the simulation or its metrics.
            </p>

            <div className="mt-5 border-t border-line pt-4">
              <p className="label-caps">What the report contains</p>
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                {CONTENTS.map((item) => (
                  <div key={item} className="flex items-start gap-2 text-[10.5px] leading-4 text-ink-muted">
                    <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-teal-700" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="space-y-4">
          <section className="card p-5">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-teal-700" />
              <h2 className="text-[13.5px] font-semibold text-navy-950">How to read the report</h2>
            </div>
            <div className="mt-3 space-y-3">
              {[
                ["Provenance first", "Check the weather source, retrieval time and forecast period before the metrics."],
                ["Comparative, not certified", "Indicators support a policy comparison; they are not occupational safety limits."],
                ["Human review", "Recommendations are prompts for safety leads and worker consultation, not instructions."],
              ].map(([title, text]) => (
                <div key={title}>
                  <p className="text-[11px] font-semibold text-navy-900">{title}</p>
                  <p className="mt-0.5 text-[10px] leading-4 text-ink-muted">{text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl bg-navy-950 p-5 text-white">
            <ShieldCheck className="h-5 w-5 text-teal-300" />
            <h2 className="mt-2 font-display text-[17px] font-bold leading-snug">Assumptions stay visible</h2>
            <p className="mt-1.5 text-[11px] leading-5 text-white/60">
              Synthetic workers are not employee records. Open-Meteo values are modelled forecasts, not
              on-site measurements. Coefficients are illustrative and unvalidated. HeatFair does not
              diagnose health conditions or replace professional guidance.
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[10px] text-white/45">
              <Users className="h-3 w-3" /> Synthetic population only
            </div>
          </section>
        </div>
      </div>

      {/* Generated report records */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-navy-950">Generated reports</h2>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              Server-side report records. Downloads are limited to PDFs generated by this application.
            </p>
          </div>
          <Badge tone="neutral">{reports.length} records</Badge>
        </div>
        {reports.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-line bg-mist-50 text-[9.5px] uppercase tracking-[0.07em] text-ink-muted">
                  <th className="px-5 py-2.5 font-semibold">Report</th>
                  <th className="px-3 py-2.5 font-semibold">Simulation</th>
                  <th className="px-3 py-2.5 font-semibold">Generated</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Download</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id} className="border-b border-line/70 last:border-0">
                    <td className="px-5 py-3 font-medium text-navy-900">{report.title}</td>
                    <td className="px-3 py-3">
                      <Link href={`/results/${report.simulation_id}`} className="font-mono text-[10.5px] text-teal-700 hover:underline">
                        {report.simulation_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-[10.5px] text-ink-muted">{formatDate(report.created_at)}</td>
                    <td className="px-5 py-3 text-right">
                      <a
                        href={`${API_URL}${report.report_url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[10.5px] font-medium text-teal-700 hover:underline"
                      >
                        <Download className="h-3 w-3" /> PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-10 text-center">
            <FileText className="mx-auto h-6 w-6 text-ink-muted" />
            <p className="mt-2 text-[11.5px] text-ink-muted">
              No reports generated yet. Choose a completed simulation above.
            </p>
          </div>
        )}
      </section>

      {/* Simulation report availability */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-navy-950">Completed simulations</h2>
            <p className="mt-0.5 text-[11px] text-ink-muted">Any completed run can be reported on demand.</p>
          </div>
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-ink-muted" /> : <Badge tone="neutral">{simulations.length}</Badge>}
        </div>
        {simulations.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-line bg-mist-50 text-[9.5px] uppercase tracking-[0.07em] text-ink-muted">
                  <th className="px-5 py-2.5 font-semibold">Run</th>
                  <th className="px-3 py-2.5 font-semibold">Workplace</th>
                  <th className="px-3 py-2.5 font-semibold">Policy</th>
                  <th className="px-3 py-2.5 font-semibold">Created</th>
                  <th className="px-3 py-2.5 font-semibold">Reports</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {simulations.slice(0, 12).map((run) => (
                  <tr key={run.id} className="border-b border-line/70 last:border-0">
                    <td className="px-5 py-3">
                      <Link href={`/results/${run.id}`} className="font-medium text-navy-900 hover:text-teal-700">
                        {run.label || run.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-ink-soft">{run.weather_location ?? run.scenario_name ?? "—"}</td>
                    <td className="max-w-[200px] truncate px-3 py-3 text-ink-soft">{run.policy_name ?? "—"}</td>
                    <td className="px-3 py-3 text-[10.5px] text-ink-muted">{formatDate(run.created_at)}</td>
                    <td className="px-3 py-3 font-mono text-ink-soft">{reportCounts.get(run.id) ?? 0}</td>
                    <td className="px-5 py-3 text-right">
                      <a
                        href={api.reportUrl(run.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[10.5px] font-medium text-teal-700 hover:underline"
                      >
                        <Download className="h-3 w-3" /> Generate
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-10 text-center text-[11.5px] text-ink-muted">
            No completed simulations yet.{" "}
            <Link href="/simulate" className="font-medium text-teal-700 hover:underline">
              Run one first
            </Link>
            .
          </div>
        )}
      </section>
    </div>
  );
}

function ReportFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9.5px] text-ink-muted">{label}</p>
      <p className="font-mono text-[11.5px] font-semibold text-navy-900">{value}</p>
    </div>
  );
}
