"""PDF report generation with ReportLab.

The report is a self-contained, print-ready brief: configuration, metrics,
baseline comparison, policy comparisons, Pareto-efficient alternatives,
recommendations, assumptions and limitations. No charts are rasterised; the
layout uses typographic tables so it renders identically on any host.
"""

from __future__ import annotations

import io
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

NAVY = colors.HexColor("#0B1220")
PANEL = colors.HexColor("#111C2E")
EMERALD = colors.HexColor("#10B981")
CYAN = colors.HexColor("#22D3EE")
GREY = colors.HexColor("#94A3B8")
LIGHT = colors.HexColor("#E2E8F0")

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm


def _styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="Brand", fontName="Helvetica-Bold", fontSize=22, textColor=NAVY, leading=26
        )
    )
    styles.add(
        ParagraphStyle(
            name="Sub", fontName="Helvetica", fontSize=10, textColor=colors.HexColor("#475569"),
            leading=14,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H1x", fontName="Helvetica-Bold", fontSize=13, textColor=NAVY,
            spaceBefore=14, spaceAfter=6, leading=16,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Small", fontName="Helvetica", fontSize=8.5, textColor=colors.HexColor("#334155"),
            leading=11.5, alignment=TA_LEFT,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Tiny", fontName="Helvetica", fontSize=7.5, textColor=colors.HexColor("#64748B"),
            leading=9.5,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Cell", fontName="Helvetica", fontSize=8, textColor=colors.HexColor("#1E293B"),
            leading=10,
        )
    )
    return styles


def _fmt(value, digits: int = 1, suffix: str = "") -> str:
    if value is None:
        return "—"
    try:
        return f"{float(value):,.{digits}f}{suffix}"
    except (TypeError, ValueError):
        return str(value)


def _kv_table(rows, styles, col_widths=None):
    data = [
        [Paragraph(f"<b>{k}</b>", styles["Cell"]), Paragraph(str(v), styles["Cell"])]
        for k, v in rows
    ]
    table = Table(data, colWidths=col_widths or [62 * mm, 100 * mm], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F1F5F9")),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def _data_table(header, rows, styles, widths=None, highlight_rows=()):
    data = [[Paragraph(f"<b>{h}</b>", styles["Cell"]) for h in header]]
    for row in rows:
        data.append([Paragraph(str(cell), styles["Cell"]) for cell in row])
    table = Table(data, colWidths=widths, hAlign="LEFT", repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0B1220")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
    ]
    for idx in highlight_rows:
        style.append(("BACKGROUND", (0, idx), (-1, idx), colors.HexColor("#ECFDF5")))
    table.setStyle(TableStyle(style))
    return table


class _ReportDoc(BaseDocTemplate):
    def __init__(self, buffer, org_name: str, **kwargs):
        super().__init__(buffer, pagesize=A4, **kwargs)
        self.org_name = org_name
        frame = Frame(MARGIN, MARGIN + 12 * mm, PAGE_W - 2 * MARGIN, PAGE_H - 2 * MARGIN - 18 * mm, id="body")
        self.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=self._decorate)])

    def _decorate(self, canvas, doc):
        canvas.saveState()
        canvas.setFillColor(NAVY)
        canvas.rect(0, PAGE_H - 10 * mm, PAGE_W, 10 * mm, stroke=0, fill=1)
        canvas.setFillColor(EMERALD)
        canvas.setFont("Helvetica-Bold", 9)
        canvas.drawString(MARGIN, PAGE_H - 6.6 * mm, "HEATFAIR")
        canvas.setFillColor(LIGHT)
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 6.6 * mm, "Climate fairness policy simulation")
        canvas.setStrokeColor(colors.HexColor("#CBD5E1"))
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, 14 * mm, PAGE_W - MARGIN, 14 * mm)
        canvas.setFillColor(colors.HexColor("#64748B"))
        canvas.setFont("Helvetica", 7.5)
        canvas.drawString(MARGIN, 10 * mm, self.org_name)
        canvas.drawRightString(PAGE_W - MARGIN, 10 * mm, f"Page {canvas.getPageNumber()}")
        canvas.restoreState()


def build_report_pdf(
    organization_name: str,
    simulation_id: str,
    model_version: str,
    created_at: datetime | None,
    policy: dict,
    scenario: dict,
    metrics: dict,
    baseline: dict | None,
    results: dict,
    frontier: list[dict] | None = None,
    recommendations: list[dict] | None = None,
    weather: dict | None = None,
) -> bytes:
    buffer = io.BytesIO()
    styles = _styles()
    doc = _ReportDoc(
        buffer,
        org_name=organization_name,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN + 8 * mm,
        bottomMargin=MARGIN,
        title="HeatFair policy impact report",
        author="HeatFair",
    )

    story: list = []
    story.append(Paragraph("Policy impact report", styles["Brand"]))
    story.append(Spacer(1, 2 * mm))
    story.append(
        Paragraph(
            "Synthetic climate-fairness simulation · comparative estimates, not occupational safety certification",
            styles["Sub"],
        )
    )
    story.append(Spacer(1, 5 * mm))

    generated = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")
    story.append(
        _kv_table(
            [
                ("Organisation", organization_name),
                ("Report generated", generated),
                ("Simulation ID", simulation_id),
                ("Model version", model_version),
                ("Simulation created", created_at.strftime("%d %b %Y, %H:%M UTC") if created_at else "—"),
            ],
            styles,
        )
    )

    story.append(Paragraph("1. Executive summary", styles["H1x"]))
    exposure = metrics.get("exposure_index")
    access = metrics.get("break_accessibility")
    retention = metrics.get("income_retention")
    disruption = metrics.get("operational_disruption")
    summary_text = (
        f"Under the <b>{policy.get('name', 'selected policy')}</b> policy and the "
        f"<b>{scenario.get('name', 'selected scenario')}</b> climate scenario, the simulated "
        f"population records an environmental exposure index of <b>{_fmt(exposure)}</b>/100, "
        f"break accessibility of <b>{_fmt(access)}%</b>, income retention of "
        f"<b>{_fmt(retention)}%</b> and operational disruption of <b>{_fmt(disruption)}</b>/100. "
        "All figures are comparative estimates produced by the HeatFair simulation engine on "
        "synthetic worker profiles."
    )
    story.append(Paragraph(summary_text, styles["Small"]))
    story.append(Spacer(1, 3 * mm))

    kpi_rows = [
        ["Environmental exposure index", _fmt(exposure, 1, " / 100")],
        ["Incentive pressure index", _fmt(metrics.get("incentive_pressure_index"), 1, " / 100")],
        ["Break accessibility", _fmt(access, 1, " %")],
        ["Income retention", _fmt(retention, 1, " %")],
        ["Operational disruption", _fmt(disruption, 1, " / 100")],
        ["Operational efficiency", _fmt(metrics.get("operational_efficiency"), 1, " %")],
        ["Workers simulated", _fmt(metrics.get("population", {}).get("workers") if isinstance(metrics.get("population"), dict) else None, 0)],
        ["Income loss per worker-shift", _fmt(metrics.get("income_loss_per_worker_shift"), 2)],
    ]
    story.append(_kv_table(kpi_rows, styles))

    story.append(Paragraph("2. Simulation configuration", styles["H1x"]))
    story.append(
        _kv_table(
            [
                ("Worker population", _fmt(results.get("workers_summary", {}).get("size"), 0) + " synthetic profiles"),
                ("Population seed", str(results.get("workers_summary", {}).get("seed", "—"))),
                ("Random seed", str(results.get("reproducibility", {}).get("random_seed", "—"))),
                ("Simulation duration", f"{results.get('reproducibility', {}).get('days', 1)} working day(s)"),
                ("Model version", model_version),
                ("Data provenance", "Synthetic workers · " + str(scenario.get("source", "synthetic")) + " climate"),
            ],
            styles,
        )
    )

    story.append(Paragraph("3. Climate scenario", styles["H1x"]))
    location = scenario.get("location") or {}
    climate_rows = [
                ("Scenario", scenario.get("name", "—")),
                ("Mean temperature", _fmt(scenario.get("temperature_c") or scenario.get("temperature"), 1, " °C")),
                ("Mean relative humidity", _fmt(scenario.get("relative_humidity") or scenario.get("humidity"), 0, " %")),
                ("Work duration", _fmt(scenario.get("work_duration_hours") or scenario.get("work_duration"), 1, " h")),
                ("Work intensity class", str(scenario.get("work_intensity", "—")).replace("_", " ")),
                ("Location", location.get("name") or "Not specified"),
                ("Hourly conditions", str(scenario.get("hourly_conditions_origin", "synthetic diurnal profile")).replace("_", " ")),
                ("Data source", str(scenario.get("source", "synthetic"))),
    ]
    if weather:
        shift = weather.get("shift") or {}
        climate_rows.extend(
            [
                ("Weather provider", str(weather.get("provider", "Open-Meteo"))),
                ("Weather data type", "Modelled forecast — not direct on-site measurement"),
                ("Forecast date", str(shift.get("date") or weather.get("forecast_date") or "—")),
                (
                    "Work window",
                    f"{shift.get('start_hour', '—'):02d}:00–{shift.get('end_hour', '—'):02d}:00 local"
                    if isinstance(shift.get("start_hour"), int) and isinstance(shift.get("end_hour"), int)
                    else "—",
                ),
                ("Coordinates", f"{_fmt(weather.get('latitude'), 3)}, {_fmt(weather.get('longitude'), 3)}"),
                ("Provider retrieved at", str(weather.get("retrieved_at", "—"))),
                ("Provider source timestamp", str(weather.get("source_timestamp", "—"))),
                ("Weather snapshot ID", str(weather.get("snapshot_id", "—"))),
                ("Missing variables", ", ".join(weather.get("missing_variables") or []) or "None"),
            ]
        )
    story.append(_kv_table(climate_rows, styles))
    if weather:
        story.append(Spacer(1, 1.5 * mm))
        story.append(Paragraph(str(weather.get("data_note", "")), styles["Tiny"]))

    story.append(Paragraph("4. Policy under evaluation", styles["H1x"]))
    story.append(
        _kv_table(
            [
                ("Policy", policy.get("name", "—")),
                ("Deadline pressure", _fmt(policy.get("deadline_pressure"), 2)),
                ("Bonus dependency", _fmt(policy.get("bonus_dependency"), 2)),
                ("Penalty severity", _fmt(policy.get("penalty_severity"), 2)),
                ("Break compensation", _fmt(policy.get("break_compensation"), 0, " % of wage")),
                ("Protected break", _fmt(policy.get("protected_break_minutes"), 0, " min/shift")),
                ("Flexible deadlines", "Yes" if policy.get("flexible_deadlines") else "No"),
                ("Budget limit", _fmt(policy.get("budget_limit"), 2) + " per worker-shift"),
            ],
            styles,
        )
    )

    story.append(Paragraph("5. Estimated impact versus no-protection baseline", styles["H1x"]))
    baseline = baseline or {}
    delta = metrics.get("delta_vs_baseline") or {}
    story.append(
        _data_table(
            ["Indicator", "Policy", "Baseline", "Delta"],
            [
                ["Exposure index", _fmt(exposure), _fmt(baseline.get("exposure_index")), _fmt(delta.get("exposure_index"))],
                ["Break accessibility (%)", _fmt(access), _fmt(baseline.get("break_accessibility")), _fmt(delta.get("break_accessibility"))],
                ["Income retention (%)", _fmt(retention), _fmt(baseline.get("income_retention")), _fmt(delta.get("income_retention"))],
                ["Operational disruption", _fmt(disruption), _fmt(baseline.get("operational_disruption")), _fmt(delta.get("operational_disruption"))],
                ["Operational efficiency (%)", _fmt(metrics.get("operational_efficiency")), _fmt(baseline.get("operational_efficiency")), _fmt(delta.get("operational_efficiency"))],
            ],
            styles,
            widths=[62 * mm, 32 * mm, 32 * mm, 32 * mm],
        )
    )
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(str(baseline.get("note", "")), styles["Tiny"]))

    stats = metrics.get("exposure_stats") or {}
    retention_stats = metrics.get("income_retention_stats") or {}
    story.append(Paragraph("6. Distribution of simulated outcomes", styles["H1x"]))
    story.append(
        _data_table(
            ["Statistic", "Exposure index", "Income retention (%)"],
            [
                ["Mean", _fmt(stats.get("mean")), _fmt(retention_stats.get("mean"))],
                ["Median", _fmt(stats.get("median")), _fmt(retention_stats.get("median"))],
                ["Minimum", _fmt(stats.get("min")), _fmt(retention_stats.get("min"))],
                ["90th percentile", _fmt((stats.get("percentiles") or {}).get("p90")), _fmt((retention_stats.get("percentiles") or {}).get("p90"))],
                ["Maximum", _fmt(stats.get("max")), _fmt(retention_stats.get("max"))],
            ],
            styles,
            widths=[45 * mm, 45 * mm, 45 * mm],
        )
    )

    if frontier:
        story.append(Paragraph("7. Pareto-efficient policy alternatives", styles["H1x"]))
        story.append(
            Paragraph(
                "Non-dominated candidates from the multi-objective search. Every row was evaluated by "
                "the simulation engine; objectives are shown in their original units.",
                styles["Small"],
            )
        )
        story.append(Spacer(1, 2 * mm))
        rows = []
        for cand in frontier[:8]:
            pol = cand.get("policy", {})
            obj = cand.get("objectives", {})
            rows.append(
                [
                    str(cand.get("label", ""))[:26],
                    _fmt(obj.get("exposure")),
                    _fmt(obj.get("income_loss")),
                    _fmt(obj.get("disruption")),
                    _fmt(pol.get("protected_break_minutes"), 0),
                    _fmt(pol.get("break_compensation"), 2),
                    "Yes" if pol.get("flexible_deadlines") else "No",
                ]
            )
        story.append(
            _data_table(
                ["Candidate", "Exposure", "Income loss %", "Disruption", "Break min", "Comp.", "Flex"],
                rows,
                styles,
                widths=[45 * mm, 22 * mm, 25 * mm, 22 * mm, 20 * mm, 16 * mm, 14 * mm],
            )
        )

    story.append(Paragraph("8. Recommended policy changes", styles["H1x"]))
    for rec in (recommendations or [])[:5]:
        block = [
            Paragraph(f"<b>{rec.get('title')}</b> — {rec.get('metric', '')}", styles["Small"]),
            Paragraph(f"Action: {rec.get('action', '')}", styles["Tiny"]),
            Paragraph(rec.get("rationale", ""), styles["Tiny"]),
            Spacer(1, 2 * mm),
        ]
        story.append(KeepTogether(block))

    story.append(Paragraph("9. Model assumptions", styles["H1x"]))
    assumptions = results.get("assumptions") or {}
    assumption_rows = [
        ("Exposure metric", assumptions.get("exposure_model", {}).get("heat_metric", "NWS heat index")),
        ("Exposure formula", assumptions.get("exposure_model", {}).get("exposure_formula", "")),
        ("Incentive formula", assumptions.get("incentive_model", {}).get("formula", "")),
        ("Break model", assumptions.get("break_model", {}).get("formula", "")),
        ("Income model", assumptions.get("income_model", {}).get("formula", "")),
        ("Operational model", assumptions.get("operational_model", {}).get("formula", "")),
        ("Synthetic population", "Documented distributions, fixed seeds, no personal data"),
    ]
    story.append(_kv_table(assumption_rows, styles))

    story.append(Paragraph("10. Limitations", styles["H1x"]))
    limitations = results.get("limitations") or []
    for item in limitations:
        story.append(Paragraph(f"• {item}", styles["Tiny"]))
    story.append(Spacer(1, 3 * mm))
    story.append(
        Paragraph(
            f"This report was generated by HeatFair model {model_version} for comparative policy analysis. "
            "It is not medical advice, not an injury-prevention certification and not a substitute for a "
            "qualified occupational-health assessment.",
            styles["Tiny"],
        )
    )
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph("11. Recommendations for human review", styles["H1x"]))
    story.append(
        Paragraph(
            "Before changing a workplace policy, a responsible manager should (1) verify the "
            "location, shift window and weather provenance above; (2) compare the model estimates "
            "with local conditions, worker reports and applicable heat-safety regulation; "
            "(3) consult workers and safety representatives; (4) confirm budget and staffing "
            "assumptions with operations; and (5) monitor outcomes after implementation. "
            "HeatFair is decision support only and must not be used as the sole basis for a "
            "safety decision.",
            styles["Tiny"],
        )
    )

    doc.build(story)
    return buffer.getvalue()
