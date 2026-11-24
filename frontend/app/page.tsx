import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CloudSun,
  FileText,
  GitBranch,
  HeartHandshake,
  LineChart,
  MapPin,
  ShieldCheck,
  Sparkles,
  ThermometerSun,
  Users,
  Wallet,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: CloudSun,
    title: "Live climate context",
    body: "Open-Meteo current conditions and hourly forecasts for the exact workplace coordinates, with visible provenance and timestamps.",
  },
  {
    icon: Users,
    title: "Synthetic worker populations",
    body: "Generate reproducible 100–1,000 worker populations across occupations, wage bands, heat tolerance and break need. No personal data required.",
  },
  {
    icon: ThermometerSun,
    title: "Heat exposure estimate",
    body: "A documented comparative indicator built from hourly heat and work intensity — explicitly not WBGT or a medical risk score.",
  },
  {
    icon: Wallet,
    title: "Income-impact analysis",
    body: "See how incentive structure, break compensation and unpaid rest interact with estimated take-home pay and retention.",
  },
  {
    icon: GitBranch,
    title: "Genuine Pareto optimizer",
    body: "Evaluate dozens of alternative policies on the same weather snapshot, then compare the real non-dominated frontier of trade-offs.",
  },
  {
    icon: FileText,
    title: "Auditable PDF reports",
    body: "Every report records the weather snapshot, model version, seed, assumptions, limitations and candidates for human review.",
  },
];

const WORKFLOW = [
  { label: "Live weather data", icon: CloudSun, tone: "heat" },
  { label: "Workplace policies", icon: ShieldCheck, tone: "navy" },
  { label: "Synthetic workers", icon: Users, tone: "teal" },
  { label: "Simulation", icon: LineChart, tone: "navy" },
  { label: "Policy comparison", icon: BarChart3, tone: "teal" },
  { label: "Better decisions", icon: HeartHandshake, tone: "heat" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-ink">
      <header className="sticky top-0 z-50 border-b border-line/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Brand />
          <nav className="hidden items-center gap-7 text-[12.5px] font-medium text-ink-soft md:flex">
            <a href="#problem" className="transition-colors hover:text-navy-900">
              The problem
            </a>
            <a href="#how-it-works" className="transition-colors hover:text-navy-900">
              How it works
            </a>
            <a href="#features" className="transition-colors hover:text-navy-900">
              Features
            </a>
            <a href="#limitations" className="transition-colors hover:text-navy-900">
              Limitations
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/dashboard">Explore dashboard</Link>
            </Button>
            <Button asChild variant="navy" size="sm">
              <Link href="/simulate">
                Run a simulation <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-mist-50">
        <div className="absolute inset-0 bg-hero-glow" aria-hidden />
        <div className="absolute inset-y-0 right-0 hidden w-1/2 grid-lines opacity-60 lg:block" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
          <div className="animate-fade-up">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="teal" className="gap-1.5 px-2.5 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                LIVE CLIMATE · POLICY SIMULATION
              </Badge>
              <Badge tone="navy" className="px-2.5 py-1">
                Decision-support prototype
              </Badge>
            </div>

            <h1 className="mt-6 max-w-[16ch] font-display text-[40px] font-bold leading-[1.06] tracking-[-0.035em] text-navy-950 sm:text-5xl lg:text-[58px]">
              Extreme heat is a workplace problem.{" "}
              <span className="text-teal-700">Your policies matter.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-7 text-ink-soft">
              HeatFair helps organizations simulate how real climate conditions interact with
              workplace policies, helping them protect outdoor workers while balancing income and
              operational needs.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" variant="navy">
                <Link href="/dashboard">
                  Explore Dashboard <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="#how-it-works">
                  See How It Works <ArrowDownIcon />
                </Link>
              </Button>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-ink-muted">
              <span className="flex items-center gap-1.5">
                <CloudSun className="h-3.5 w-3.5 text-teal-700" /> Open-Meteo live forecasts
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-teal-700" /> Synthetic workers only
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-teal-700" /> Human review required
              </span>
            </div>
          </div>

          {/* Product preview */}
          <div className="relative animate-fade-up lg:pl-4" style={{ animationDelay: "120ms" }}>
            <div className="absolute -inset-6 rounded-[2.2rem] bg-gradient-to-br from-teal-500/10 via-transparent to-heat-400/10 blur-2xl" aria-hidden />
            <div className="relative rounded-[1.35rem] border border-line bg-white p-3 shadow-lift">
              <div className="flex items-center justify-between rounded-xl bg-navy-950 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-teal-400" />
                  <span className="text-[11px] font-semibold text-white">HeatFair · policy stress test</span>
                </div>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/70">
                  Illustrative
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-line bg-mist-50 p-3.5">
                  <p className="label-caps">Workplace</p>
                  <p className="mt-1.5 flex items-center gap-1 text-[13px] font-semibold text-navy-900">
                    <MapPin className="h-3.5 w-3.5 text-teal-700" /> Chennai, India
                  </p>
                  <p className="mt-1 text-[10px] text-ink-muted">13.08°N · 80.28°E · Asia/Kolkata</p>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="metric text-[30px] font-bold leading-none">33.4</span>
                    <span className="pb-1 text-[11px] text-ink-muted">°C modelled</span>
                  </div>
                  <p className="mt-1.5 text-[10px] text-ink-muted">Feels 38.1°C · 71% humidity</p>
                </div>
                <div className="rounded-xl border border-line bg-white p-3.5">
                  <p className="label-caps">Shift window</p>
                  <p className="mt-1.5 text-[13px] font-semibold text-navy-900">08:00 – 16:00</p>
                  <p className="mt-1 text-[10px] text-ink-muted">Forecast hours · local time</p>
                  <div className="mt-3 space-y-2">
                    {[
                      ["Exposure index", "64.2", "heat"],
                      ["Income retention", "91.8%", "teal"],
                      ["Break access", "58.4%", "navy"],
                    ].map(([label, value, tone]) => (
                      <div key={label} className="flex items-center justify-between text-[10.5px]">
                        <span className="text-ink-muted">{label}</span>
                        <span
                          className={
                            tone === "heat"
                              ? "font-mono font-semibold text-heat-700"
                              : tone === "teal"
                                ? "font-mono font-semibold text-teal-700"
                                : "font-mono font-semibold text-navy-800"
                          }
                        >
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-line p-3.5">
                <div className="flex items-center justify-between">
                  <p className="label-caps">Policy trade-off · illustrative candidates</p>
                  <Badge tone="amber">Pareto frontier</Badge>
                </div>
                <div className="mt-3 flex h-[92px] items-end gap-2">
                  {[42, 55, 38, 68, 72, 61, 84, 78, 91, 86].map((height, index) => (
                    <div key={index} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className={`w-full rounded-t-md ${
                          index === 7 ? "bg-heat-400" : index === 4 ? "bg-teal-500" : "bg-navy-100"
                        }`}
                        style={{ height: `${height}%` }}
                      />
                      <span className="text-[8px] text-ink-muted">{index + 1}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[9.5px] text-ink-muted">
                  Illustrative interface. Values are not a real workplace assessment.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Credibility strip */}
      <section className="border-y border-line bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-line px-5 md:grid-cols-4 lg:px-8">
          {[
            ["5", "linked model estimates"],
            ["100–1,000", "synthetic workers per run"],
            ["3", "objectives on the Pareto frontier"],
            ["1", "auditable weather snapshot"],
          ].map(([value, label]) => (
            <div key={label} className="px-4 py-6 first:pl-0">
              <p className="font-display text-[24px] font-bold tracking-tight text-navy-950">{value}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Problem */}
      <section id="problem" className="bg-white py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="label-caps text-heat-700">The problem</p>
              <h2 className="mt-3 max-w-xl font-display text-[32px] font-bold leading-tight tracking-tight text-navy-950 lg:text-[40px]">
                Heat stress is shaped by policy, not temperature alone.
              </h2>
              <p className="mt-5 max-w-lg text-[14px] leading-7 text-ink-soft">
                A delivery driver, a construction crew and a warehouse team can face the same
                forecast and very different outcomes. Deadlines, bonuses, penalties and break rules
                determine whether a worker can actually stop, drink water and recover.
              </p>
              <p className="mt-4 max-w-lg text-[14px] leading-7 text-ink-soft">
                Financial pressure turns a hot day into a choice between safety and income. HeatFair
                makes that interaction visible before an organization changes a policy.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                {
                  icon: ThermometerSun,
                  title: "Exposure is uneven",
                  text: "Outdoor and heavy-work roles accumulate heat load across a shift, not at a single daily maximum.",
                },
                {
                  icon: Wallet,
                  title: "Income pressure is real",
                  text: "Uncompensated breaks and bonus dependency can make protective rest feel unaffordable.",
                },
                {
                  icon: ShieldCheck,
                  title: "Rules decide access",
                  text: "A break that exists on paper is not accessible if deadlines and penalties discourage taking it.",
                },
                {
                  icon: BarChart3,
                  title: "Trade-offs are hidden",
                  text: "More rest can reduce exposure while affecting coverage and cost. Those trade-offs need to be compared, not guessed.",
                },
              ].map((card) => (
                <div key={card.title} className="rounded-2xl border border-line bg-mist-50 p-5 transition-shadow hover:shadow-card">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-heat-600 shadow-sm">
                    <card.icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
                  </span>
                  <h3 className="mt-3 text-[13.5px] font-semibold text-navy-900">{card.title}</h3>
                  <p className="mt-1.5 text-[12px] leading-5 text-ink-muted">{card.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Why weather apps are insufficient */}
      <section className="border-y border-line bg-mist-50 py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="label-caps text-teal-700">The gap</p>
            <h2 className="mt-3 font-display text-[30px] font-bold leading-tight tracking-tight text-navy-950 lg:text-[38px]">
              Weather apps tell you when it is hot. They do not tell you who can afford to stop.
            </h2>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              ["Forecast, not policy", "A temperature reading does not say whether a protected break will actually be taken."],
              ["Averages hide workers", "A single city value cannot represent different occupations, wages and workload pressures."],
              ["No comparison", "Existing tools rarely evaluate alternative policies against the same conditions and assumptions."],
            ].map(([title, text], index) => (
              <div key={title} className="relative rounded-2xl border border-line bg-white p-6 shadow-card">
                <span className="font-mono text-[11px] font-semibold text-teal-700">0{index + 1}</span>
                <h3 className="mt-3 text-[15px] font-semibold text-navy-950">{title}</h3>
                <p className="mt-2 text-[12.5px] leading-6 text-ink-muted">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What HeatFair does */}
      <section className="bg-white py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="label-caps text-teal-700">What HeatFair does</p>
              <h2 className="mt-3 font-display text-[32px] font-bold leading-tight tracking-tight text-navy-950 lg:text-[40px]">
                A policy stress test built on the day your workers actually face.
              </h2>
              <p className="mt-5 text-[14px] leading-7 text-ink-soft">
                HeatFair combines a real weather forecast for your coordinates with a synthetic
                workforce and your saved workplace policy. The engine estimates exposure, incentive
                pressure, break access, income retention and operational efficiency, then evaluates
                alternative policies on the same snapshot.
              </p>
              <div className="mt-7 space-y-3">
                {[
                  "Real Open-Meteo forecast, not a hand-picked climate scenario",
                  "Every result tied to a stored weather snapshot, seed and model version",
                  "Real Pareto frontier, not a decorative chart or a single 'best' answer",
                ].map((line) => (
                  <div key={line} className="flex items-start gap-2.5">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-teal-50 text-teal-700">
                      <ShieldCheck className="h-3 w-3" />
                    </span>
                    <p className="text-[12.5px] leading-6 text-ink-soft">{line}</p>
                  </div>
                ))}
              </div>
              <Button asChild variant="navy" className="mt-7">
                <Link href="/weather">
                  Start with a live location <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="rounded-3xl border border-line bg-mist-50 p-5 lg:p-7">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Environmental exposure", "64.2", "Comparative index /100", "heat"],
                  ["Incentive pressure", "82.6", "Policy-level index /100", "navy"],
                  ["Break accessibility", "58.4%", "Hypothetical model estimate", "teal"],
                  ["Income retention", "91.8%", "Estimated vs. baseline", "navy"],
                  ["Operational efficiency", "88.1%", "Estimated coverage-adjusted", "teal"],
                  ["Workers simulated", "500", "Synthetic profiles", "heat"],
                ].map(([label, value, note, tone]) => (
                  <div key={label} className="rounded-2xl border border-line bg-white p-4">
                    <p className="text-[10.5px] font-medium leading-tight text-ink-muted">{label}</p>
                    <p
                      className={`mt-2 font-display text-[24px] font-bold tracking-tight ${
                        tone === "heat" ? "text-heat-700" : tone === "teal" ? "text-teal-700" : "text-navy-900"
                      }`}
                    >
                      {value}
                    </p>
                    <p className="mt-1 text-[9.5px] leading-snug text-ink-muted">{note}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-center text-[9.5px] text-ink-muted">
                Illustrative output. HeatFair is decision support, not a safety certification.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works workflow */}
      <section id="how-it-works" className="border-y border-line bg-navy-950 py-20 text-white lg:py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="max-w-2xl">
            <p className="label-caps text-teal-300">How HeatFair works</p>
            <h2 className="mt-3 font-display text-[32px] font-bold leading-tight tracking-tight text-white lg:text-[40px]">
              From live weather to a defensible policy decision.
            </h2>
            <p className="mt-4 text-[13.5px] leading-7 text-white/65">
              Six connected steps. Each one keeps its inputs visible so a manager, safety lead or
              researcher can inspect how a conclusion was produced.
            </p>
          </div>

          <div className="mt-12 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            {WORKFLOW.map((step, index) => (
              <div key={step.label} className="relative">
                <div className="h-full rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                  <span
                    className={`grid h-8 w-8 place-items-center rounded-lg ${
                      step.tone === "teal"
                        ? "bg-teal-500/20 text-teal-300"
                        : step.tone === "heat"
                          ? "bg-heat-400/15 text-heat-300"
                          : "bg-white/10 text-white/80"
                    }`}
                  >
                    <step.icon className="h-4 w-4" strokeWidth={1.8} />
                  </span>
                  <p className="mt-3 text-[11.5px] font-semibold leading-snug text-white">{step.label}</p>
                  <p className="mt-1 font-mono text-[9px] text-white/35">0{index + 1}</p>
                </div>
                {index < WORKFLOW.length - 1 ? (
                  <ArrowRight className="absolute -right-3.5 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-white/20 lg:block" />
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[10.5px] text-white/55">
            <Sparkles className="h-3.5 w-3.5 text-heat-300" />
            LIVE WEATHER DATA + WORKPLACE POLICIES + SYNTHETIC WORKERS
            <ArrowRight className="h-3 w-3" /> SIMULATION
            <ArrowRight className="h-3 w-3" /> POLICY COMPARISON
            <ArrowRight className="h-3 w-3" /> BETTER DECISIONS
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-white py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="label-caps text-teal-700">Core features</p>
              <h2 className="mt-3 max-w-xl font-display text-[30px] font-bold leading-tight tracking-tight text-navy-950 lg:text-[38px]">
                Everything needed to reason about heat, income and operations together.
              </h2>
            </div>
            <p className="max-w-sm text-[12.5px] leading-6 text-ink-muted">
              Built as a working full-stack platform: live weather retrieval, a Python simulation
              engine, a real optimizer, persistence and PDF reporting.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="group rounded-2xl border border-line p-5 transition-all hover:border-teal-200 hover:shadow-card">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-mist-100 text-teal-700 transition-colors group-hover:bg-teal-50">
                  <feature.icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                </span>
                <h3 className="mt-3.5 text-[14px] font-semibold text-navy-950">{feature.title}</h3>
                <p className="mt-1.5 text-[12px] leading-[1.45] text-ink-muted">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="border-y border-line bg-mist-50 py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="label-caps text-heat-700">Benefits for organizations</p>
              <h2 className="mt-3 font-display text-[32px] font-bold leading-tight tracking-tight text-navy-950">
                Make the trade-off explicit before it becomes a crisis.
              </h2>
              <p className="mt-4 text-[13px] leading-7 text-ink-soft">
                HeatFair does not prescribe a policy. It gives operations, safety and finance a
                shared, inspectable basis for discussing one.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["See policy risk earlier", "Identify when deadlines and penalties may discourage protective rest."],
                ["Protect income and safety", "Compare break compensation options against estimated retention."],
                ["Plan coverage", "Understand the operational cost of protected rest and flexible deadlines."],
                ["Document your reasoning", "Export a report with provenance, assumptions and limitations."],
                ["Compare fairly", "Evaluate alternatives on one weather snapshot and one worker population."],
                ["Keep humans in the loop", "Use model estimates as a starting point for worker and safety review."],
              ].map(([title, text], index) => (
                <div key={title} className="rounded-2xl border border-line bg-white p-5">
                  <span className="font-mono text-[10px] font-semibold text-teal-700">0{index + 1}</span>
                  <h3 className="mt-2 text-[13px] font-semibold text-navy-900">{title}</h3>
                  <p className="mt-1 text-[11.5px] leading-5 text-ink-muted">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-white py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-navy-950 px-6 py-12 text-center shadow-lift lg:px-16 lg:py-16">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_0%,rgba(20,168,143,0.22),transparent_70%)]" aria-hidden />
            <div className="relative mx-auto max-w-2xl">
              <Badge tone="teal" className="border-teal-400/20 bg-teal-400/10 text-teal-200">
                Start with the weather your workers face
              </Badge>
              <h2 className="mt-5 font-display text-[32px] font-bold leading-tight tracking-tight text-white lg:text-[42px]">
                Climate risk shouldn&apos;t become a worker&apos;s financial burden.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[13.5px] leading-7 text-white/60">
                Search a workplace, load the live forecast, and test whether your policy makes a hot
                shift harder or safer.
              </p>
              <p className="mx-auto mt-5 max-w-2xl border-t border-white/10 pt-5 text-[12.5px] leading-6 text-teal-100/80">
                Weather applications tell people when it is hot. HeatFair helps organizations
                understand whether their workplace policies make working in that heat harder for
                workers — and what they can change.
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Button asChild size="lg" variant="primary">
                  <Link href="/weather">
                    Select a workplace <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/20 text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href="/dashboard">Open dashboard</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="limitations" className="border-t border-line bg-mist-50">
        <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
            <div>
              <Brand />
              <p className="mt-4 max-w-xs text-[11.5px] leading-5 text-ink-muted">
                A climate-aware workplace policy simulator. Built for delivery, logistics,
                construction, outdoor workforce and safety teams.
              </p>
              <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-ink-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-500" /> Live data via Open-Meteo
              </p>
            </div>
            <div>
              <p className="label-caps">Platform</p>
              <ul className="mt-3 space-y-2 text-[12px] text-ink-soft">
                <li><Link href="/dashboard" className="hover:text-teal-700">Dashboard</Link></li>
                <li><Link href="/weather" className="hover:text-teal-700">Live weather</Link></li>
                <li><Link href="/policies" className="hover:text-teal-700">Policy builder</Link></li>
                <li><Link href="/simulate" className="hover:text-teal-700">Simulation centre</Link></li>
              </ul>
            </div>
            <div>
              <p className="label-caps">Analysis</p>
              <ul className="mt-3 space-y-2 text-[12px] text-ink-soft">
                <li><Link href="/dashboard" className="hover:text-teal-700">Results</Link></li>
                <li><Link href="/dashboard" className="hover:text-teal-700">Pareto optimizer</Link></li>
                <li><Link href="/reports" className="hover:text-teal-700">PDF reports</Link></li>
                <li><a href="#how-it-works" className="hover:text-teal-700">Methodology</a></li>
              </ul>
            </div>
            <div>
              <p className="label-caps">Important limits</p>
              <p className="mt-3 text-[10.5px] leading-5 text-ink-muted">
                Synthetic workers are not employee records. Weather is modelled forecast data, not
                an on-site sensor. Indicators are comparative estimates, not certified occupational
                safety assessments. Always use qualified human review.
              </p>
            </div>
          </div>
          <div className="mt-10 flex flex-col gap-2 border-t border-line pt-5 text-[10.5px] text-ink-muted sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} HeatFair. Decision-support prototype.</p>
            <p>Weather data © Open-Meteo · Map © OpenStreetMap contributors</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ArrowDownIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
      <path d="M8 3v9m0 0 3.5-3.5M8 12 4.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
