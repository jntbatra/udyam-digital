"use client";
import { useCallback, useEffect, useState } from "react";
import type React from "react";
import { api } from "@/lib/client";
import { Badge, Button, Card, Section, inr } from "@/components/ui";
import {
  CASE_LABEL, DiscountStatusBadge, Empty, ErrorNote, LeadStatusBadge, ModeBadge, OfferStatusBadge, PriorityBadge, REASON_LABEL, RefreshNote, Stat, pct, timeLeft,
  BarChart, StackedBarChart, type DiscountsResponse, type DiscountView, type Expert, type InsightsResponse, type LeadView, type LeadsResponse,
} from "@/components/staff/shared";

const REFRESH_MS = 5000;

export default function ManagerPage() {
  const [leads, setLeads] = useState<LeadView[]>([]);
  const [experts, setExperts] = useState<Expert[]>([]);
  const [disc, setDisc] = useState<DiscountsResponse | null>(null);
  const [ins, setIns] = useState<InsightsResponse | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [l, d, i] = await Promise.all([
        api<LeadsResponse>("/api/leads"),
        api<DiscountsResponse>("/api/discounts"),
        api<InsightsResponse>("/api/insights"),
      ]);
      setLeads(l.leads);
      setExperts(l.experts);
      setDisc(d);
      setIns(i);
      setUpdatedAt(new Date());
      setErr(null);
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const nameOf = (id?: string) => experts.find((e) => e.id === id)?.name ?? id ?? "—";
  const [tab, setTab] = useState<"overview" | "approvals" | "leads" | "experts" | "insights">("overview");
  const pending = disc?.requests.filter((r) => r.status === "pending") ?? [];
  const openLeads = leads.filter((l) => l.status !== "won" && l.status !== "lost").length;
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "approvals", label: "Discount approvals", count: pending.length },
    { id: "leads", label: "Leads", count: openLeads },
    { id: "experts", label: "Experts", count: experts.length },
    { id: "insights", label: "Insights" },
  ] as const;

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-8 py-8">
      <header className="flex flex-col sm:flex-row sm:items-end gap-3 mb-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-brand">Accel Business · back office</p>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">Manager console</h1>
          <p className="text-sm text-muted mt-1">Approve rare discounts, rescue leads the AI could not close, keep experts honest.</p>
        </div>
        <div className="sm:ml-auto"><RefreshNote at={updatedAt} /></div>
      </header>
      <ErrorNote text={err} />

      <HeroStats disc={disc} leads={leads} ins={ins} />

      <nav className="glass rounded-full p-1 flex gap-1 overflow-x-auto mb-6 w-fit max-w-full" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`shrink-0 h-9 px-4 rounded-full text-sm font-medium transition-colors inline-flex items-center gap-2 ${tab === t.id ? "bg-foreground text-white" : "text-muted hover:text-foreground"}`}>
            {t.label}
            {"count" in t && t.count > 0 && <span className={`text-[11px] min-w-5 h-5 px-1.5 rounded-full grid place-items-center ${tab === t.id ? "bg-white/20" : t.id === "approvals" ? "bg-brand text-white" : "bg-black/[0.06]"}`}>{t.count}</span>}
          </button>
        ))}
      </nav>

      {tab === "overview" && <Overview disc={disc} leads={leads} experts={experts} ins={ins} nameOf={nameOf} go={setTab} />}
      {tab === "approvals" && <DiscountQueue disc={disc} nameOf={nameOf} onChange={refresh} />}
      {tab === "leads" && <><OperationalOverview disc={disc} leads={leads} ins={ins} /><LeadsTable leads={leads} experts={experts} nameOf={nameOf} onChange={refresh} /></>}
      {tab === "experts" && <><VendorTable experts={experts} leads={leads} /><div className="mt-2"><PerformanceQuadrant experts={experts} /></div></>}
      {tab === "insights" && <><ManagerVisuals experts={experts} leads={leads} ins={ins} /><Insights ins={ins} /></>}
    </div>
  );
}

function Panel({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`glass rounded-3xl p-5 flex flex-col min-w-0 ${className}`}>
      <div className="flex items-center mb-4"><h3 className="text-sm font-semibold">{title}</h3><div className="ml-auto">{action}</div></div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

function Overview({ disc, leads, experts, ins, nameOf, go }: { disc: DiscountsResponse | null; leads: LeadView[]; experts: Expert[]; ins: InsightsResponse | null; nameOf: (id?: string) => string; go: (t: "approvals" | "leads" | "experts" | "insights") => void }) {
  const [now, setNow] = useState(0);
  useEffect(() => { const t = setTimeout(() => setNow(Date.now()), 0); const i = setInterval(() => setNow(Date.now()), 30000); return () => { clearTimeout(t); clearInterval(i); }; }, []);
  const pending = (disc?.requests.filter((r) => r.status === "pending") ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const decided = disc?.requests.filter((r) => r.status !== "pending") ?? [];
  const byCase = (["competitor_match", "multisite_mfg", "high_value"] as const).map((c) => ({ label: CASE_LABEL[c].split(" (")[0], value: (disc?.requests ?? []).filter((r) => r.caseType === c).length }));
  const top = [...experts].sort((a, b) => b.activationRate - a.activationRate).slice(0, 6);
  const maxAct = Math.max(...top.map((e) => e.activationRate), 0.01);
  const reasons = Object.entries(leads.reduce<Record<string, number>>((m, l) => { const k = REASON_LABEL[l.reason] ?? l.reason; m[k] = (m[k] ?? 0) + 1; return m; }, {})).sort(([, a], [, b]) => b - a).map(([label, value]) => ({ label, value }));
  const RULE_LABEL: Record<string, string> = { city_tier: "Not sold in that city", requires_gstin: "Needed a GSTIN", requires_one_of: "Missing base plan", min_employees: "Business too small", min_sites: "Needs more sites", unknown: "Unknown product" };
  const rules = ins ? Object.entries(ins.replay.byRule).sort(([, a], [, b]) => b - a).slice(0, 5).map(([k, value]) => ({ label: RULE_LABEL[k] ?? k, value })) : [];
  const b = ins?.baseline, p = ins?.prototype;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Panel className="lg:col-span-5" title="Needs your decision" action={<button onClick={() => go("approvals")} className="text-xs text-brand font-medium">Open approvals →</button>}>
          {pending.length === 0 ? <Empty>Nothing waiting.</Empty> : (
            <ul className="space-y-2">
              {pending.map((d) => {
                const slaMin = now ? Math.ceil((Date.parse(d.createdAt) + 2 * 3600000 - now) / 60000) : 120;
                return (
                  <li key={d.id}>
                    <button onClick={() => go("approvals")} className="w-full text-left rounded-2xl bg-white/60 hover:bg-white px-4 py-3 flex items-center gap-3 transition-colors">
                      <span className="text-2xl font-semibold w-14 tracking-tight">{d.pct}%</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium truncate">{d.business}{d.demo && <span className="ml-2 align-middle"><DemoTag /></span>}</span>
                        <span className="block text-xs text-muted truncate">{CASE_LABEL[d.caseType].split(" (")[0]} · {nameOf(d.expertId)}</span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="block text-sm font-medium">−{inr(d.monthly - d.monthlyAfter)}/mo</span>
                        <span className={`block text-xs ${slaMin <= 0 ? "text-brand font-semibold" : "text-muted"}`}>{slaMin <= 0 ? "SLA breached" : `${slaMin} min left`}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel className="lg:col-span-4" title="Lead funnel (live demo)">
          {!p ? <Empty>Loading…</Empty> : (() => {
            const stages = [
              { label: "Advisor sessions", value: p.sessions },
              { label: "Got a bundle", value: p.withBundle },
              { label: "KYC verified", value: p.kycVerified },
              { label: "Orders", value: p.orders },
              { label: "Live", value: p.live },
            ];
            const max = Math.max(stages[0].value, 1);
            return (
              <div className="space-y-2.5">
                {stages.map((st, i) => (
                  <div key={st.label}>
                    <div className="flex text-xs mb-1"><span className="text-muted">{st.label}</span><span className="ml-auto font-medium">{st.value}{i > 0 && stages[i - 1].value ? <span className="text-muted font-normal"> · {Math.round((st.value / stages[i - 1].value) * 100)}%</span> : null}</span></div>
                    <div className="h-3 rounded-full bg-black/[0.05] overflow-hidden"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.max((st.value / max) * 100, st.value ? 3 : 0)}%`, opacity: 1 - i * 0.14 }} /></div>
                  </div>
                ))}
                <p className="text-xs text-muted pt-1">{p.closedByAiOnly} of {p.orders} orders closed by the AI alone · {p.leadsToExperts} sent to experts</p>
              </div>
            );
          })()}
        </Panel>

        <Panel className="lg:col-span-3" title="Discount mix">
          <div className="space-y-3">
            {byCase.map((c) => (
              <div key={c.label} className="flex items-center gap-3">
                <span className="text-xs w-28 text-muted">{c.label}</span>
                <div className="flex-1 h-3 rounded-full bg-black/[0.05] overflow-hidden"><div className="h-full rounded-full bg-foreground" style={{ width: `${(c.value / Math.max(...byCase.map((x) => x.value), 1)) * 100}%` }} /></div>
                <span className="text-xs font-medium w-4 text-right">{c.value}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-5 text-center">
            <div className="rounded-2xl bg-black/[0.03] p-3"><div className="text-xl font-semibold">{decided.length ? pct(decided.filter((d) => d.status === "approved").length / decided.length) : "—"}</div><div className="text-[11px] text-muted">approval rate</div></div>
            <div className="rounded-2xl bg-black/[0.03] p-3"><div className="text-xl font-semibold">15%</div><div className="text-[11px] text-muted">hard cap</div></div>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Panel className="lg:col-span-4" title="Top experts by activation" action={<button onClick={() => go("experts")} className="text-xs text-brand font-medium">All experts →</button>}>
          <ul className="space-y-2.5">
            {top.map((e, i) => (
              <li key={e.id} className="flex items-center gap-3 text-sm">
                <span className={`size-6 rounded-full grid place-items-center text-[11px] font-semibold ${i === 0 ? "bg-brand text-white" : "bg-black/[0.06]"}`}>{i + 1}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium text-xs">{e.name}</span>
                  <span className="block h-1.5 rounded-full bg-black/[0.05] mt-1 overflow-hidden"><span className="block h-full bg-brand rounded-full" style={{ width: `${(e.activationRate / maxAct) * 100}%` }} /></span></span>
                <span className="text-xs font-mono w-10 text-right">{pct(e.activationRate)}</span>
                <span className={`text-xs font-mono w-12 text-right ${e.churn6m >= 0.12 ? "text-brand" : "text-muted"}`}>{pct(e.churn6m)} ch</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel className="lg:col-span-4" title="Why leads reach experts" action={<button onClick={() => go("leads")} className="text-xs text-brand font-medium">All leads →</button>}>
          <BarChart data={reasons} empty="No escalated leads yet. Ask the advisor for a human to create one." />
        </Panel>
        <Panel className="lg:col-span-4" title="Rule engine: mistakes blocked (history replay)" action={<button onClick={() => go("insights")} className="text-xs text-brand font-medium">Insights →</button>}>
          {!ins ? <Empty>Loading…</Empty> : (
            <>
              <div className="flex gap-6 mb-4">
                <div><div className="text-3xl font-semibold tracking-tight">{ins.replay.violations}</div><div className="text-[11px] text-muted">bad line items</div></div>
                <div><div className="text-3xl font-semibold tracking-tight text-brand">{ins.replay.activatedOnBadGstin}</div><div className="text-[11px] text-muted">sales on bad GSTIN</div></div>
              </div>
              <BarChart data={rules} empty="No violations." />
            </>
          )}
        </Panel>
      </div>

      {b && p && (
        <div className="glass rounded-3xl p-5 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[
            { k: "Baseline activation", v: pct(b.activationRate, 1), s: `${b.leads.toLocaleString("en-IN")} historic leads` },
            { k: "Avg days to live", v: `${b.avgDays} → ${p.avgDaysToLive != null ? p.avgDaysToLive.toFixed(1) : "—"}`, s: "baseline → prototype" },
            { k: "Status-chase calls", v: `${b.chaseCalls} → ${p.statusChaseCalls}`, s: "per order, live tracker" },
            { k: "6-month churn", v: pct(b.churn6m, 1), s: "baseline" },
            { k: "Blended CAC", v: inr(b.cac), s: "baseline" },
            { k: "Products / customer", v: p.productsPerCustomer != null ? p.productsPerCustomer.toFixed(1) : "—", s: `${p.orders} demo orders` },
          ].map((x) => (
            <div key={x.k}><div className="text-[11px] text-muted">{x.k}</div><div className="text-lg font-semibold mt-0.5">{x.v}</div><div className="text-[11px] text-muted">{x.s}</div></div>
          ))}
        </div>
      )}
    </div>
  );
}

function HeroStats({ disc, leads, ins }: { disc: DiscountsResponse | null; leads: LeadView[]; ins: InsightsResponse | null }) {
  const [now, setNow] = useState(0);
  useEffect(() => { const t = setTimeout(() => setNow(Date.now()), 0); const i = setInterval(() => setNow(Date.now()), 30000); return () => { clearTimeout(t); clearInterval(i); }; }, []);
  const pending = disc?.requests.filter((r) => r.status === "pending") ?? [];
  const breached = now ? pending.filter((r) => Date.parse(r.createdAt) + 2 * 3600000 <= now).length : 0;
  const atStake = pending.reduce((sum, r) => sum + (r.monthly - r.monthlyAfter), 0);
  const items = [
    { label: "Awaiting your decision", value: String(pending.length), sub: breached ? `${breached} past 2-hour SLA` : "all within SLA", hot: breached > 0 },
    { label: "Revenue at stake", value: `${inr(atStake)}`, sub: "per month, if all approved" },
    { label: "Discount given", value: `${inr(disc?.spend.monthlyDiscountInr ?? 0)}`, sub: `per month · ${disc?.spend.approvedCount ?? 0} approved` },
    { label: "Open expert leads", value: String(leads.filter((l) => l.status !== "won" && l.status !== "lost").length), sub: `${ins?.prototype.live ?? 0} live connections` },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {items.map((x, i) => (
        <div key={x.label} className={`rounded-3xl p-5 ${i === 0 ? "bg-brand text-white shadow-[0_10px_30px_rgba(228,0,0,0.25)]" : "glass"}`}>
          <div className={`text-xs ${i === 0 ? "text-white/80" : "text-muted"}`}>{x.label}</div>
          <div className="text-3xl font-semibold tracking-tight mt-1">{x.value}</div>
          <div className={`text-xs mt-1 ${i === 0 ? (x.hot ? "font-semibold" : "text-white/80") : "text-muted"}`}>{x.hot ? "! " : ""}{x.sub}</div>
        </div>
      ))}
    </div>
  );
}

function ManagerVisuals({ experts, leads, ins }: { experts: Expert[]; leads: LeadView[]; ins: InsightsResponse | null }) {
  const vendorData = [...experts]
    .sort((a, b) => b.activationRate - a.activationRate)
    .map((e) => ({ label: e.name, value: e.activationRate * 100, display: `${pct(e.activationRate)} act.` }));
  const reasonData = Object.entries(
    leads.reduce<Record<string, number>>((counts, lead) => {
      const label = REASON_LABEL[lead.reason] ?? lead.reason;
      counts[label] = (counts[label] ?? 0) + 1;
      return counts;
    }, {}),
  )
    .sort(([, a], [, b]) => b - a)
    .map(([label, value]) => ({ label, value }));
  const ruleData = ins
    ? Object.entries(ins.replay.byRule)
        .sort(([, a], [, b]) => b - a)
        .map(([label, value]) => ({ label, value }))
    : [];

  return (
    <Section title="Decision visuals">
      <div className="grid lg:grid-cols-3 gap-3">
        <Card className="!p-4">
          <h3 className="text-sm font-semibold mb-3">Expert activation rate</h3>
          <BarChart data={vendorData} empty="No experts loaded." />
        </Card>
        <Card className="!p-4">
          <h3 className="text-sm font-semibold mb-3">Why leads escalate</h3>
          <BarChart data={reasonData} empty="No escalated leads yet." />
        </Card>
        <Card className="!p-4">
          <h3 className="text-sm font-semibold mb-3">Rule violations prevented</h3>
          <BarChart data={ruleData} empty={ins ? "No rule violations found." : "Loading replay data…"} />
        </Card>
      </div>
      <div className="grid lg:grid-cols-2 gap-3 mt-3">
        <ConversionFunnel leads={leads} ins={ins} />
        <EscalationOutcomes leads={leads} />
      </div>
      <div className="mt-3">
        <PerformanceQuadrant experts={experts} />
      </div>
    </Section>
  );
}

function ConversionFunnel({ leads, ins }: { leads: LeadView[]; ins: InsightsResponse | null }) {
  if (!ins) return <Card className="!p-4"><h3 className="text-sm font-semibold mb-3">Lead conversion funnel</h3><Empty>Loading funnel…</Empty></Card>;
  const stages = [
    { label: "Advisor sessions", value: ins.prototype.sessions },
    { label: "With bundle", value: ins.prototype.withBundle },
    { label: "Escalated to experts", value: ins.prototype.leadsToExperts },
    { label: "Assigned / contacted", value: leads.filter((l) => ["assigned", "contacted", "won"].includes(l.status)).length },
    { label: "Won", value: leads.filter((l) => l.status === "won").length },
    { label: "Live connection", value: ins.prototype.live },
  ];
  const max = Math.max(stages[0].value, 1);
  return (
    <Card className="!p-4">
      <h3 className="text-sm font-semibold mb-3">Lead conversion funnel</h3>
      <div className="space-y-2">
        {stages.map((stage) => (
          <div key={stage.label} className="flex items-center gap-2 text-sm">
            <span className="w-32 truncate" title={stage.label}>{stage.label}</span>
            <div className="flex-1 h-5 rounded bg-black/[0.05] overflow-hidden"><div className="h-full bg-brand rounded-r" style={{ width: `${Math.max((stage.value / max) * 100, stage.value ? 3 : 0)}%` }} /></div>
            <span className="font-mono text-xs w-8 text-right">{stage.value}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted mt-3">Live connections include orders at live or first-bill stages.</p>
    </Card>
  );
}

function EscalationOutcomes({ leads }: { leads: LeadView[] }) {
  const reasons = [...new Set(leads.map((l) => l.reason))];
  const data = reasons.map((reason) => ({
    label: REASON_LABEL[reason] ?? reason,
    values: (["new", "assigned", "contacted", "won", "lost"] as const).map((status) => leads.filter((l) => l.reason === reason && l.status === status).length),
  })).sort((a, b) => b.values.reduce((x, y) => x + y, 0) - a.values.reduce((x, y) => x + y, 0));
  return (
    <Card className="!p-4">
      <h3 className="text-sm font-semibold mb-3">Escalation reason versus outcome</h3>
      <StackedBarChart
        data={data}
        series={[
          { label: "New", className: "bg-slate-400" },
          { label: "Assigned", className: "bg-slate-500" },
          { label: "Contacted", className: "bg-amber-500" },
          { label: "Won", className: "bg-brand" },
          { label: "Lost", className: "bg-black/30" },
        ]}
        empty="No escalated leads yet."
      />
    </Card>
  );
}

function PerformanceQuadrant({ experts }: { experts: Expert[] }) {
  if (!experts.length) return <Card className="!p-4"><h3 className="text-sm font-semibold mb-3">Expert performance quadrant</h3><Empty>No experts loaded.</Empty></Card>;
  const width = 760, height = 360;
  const pad = { top: 28, right: 24, bottom: 52, left: 58 };
  const rates = experts.map((e) => e.activationRate);
  const churns = experts.map((e) => e.churn6m);
  const minRate = Math.max(0, Math.floor((Math.min(...rates) - 0.02) * 10) / 10);
  const maxRate = Math.min(1, Math.ceil((Math.max(...rates) + 0.02) * 10) / 10);
  const maxChurn = Math.max(0.2, Math.ceil((Math.max(...churns) + 0.02) * 20) / 20);
  const x = (rate: number) => pad.left + ((rate - minRate) / Math.max(maxRate - minRate, 0.01)) * (width - pad.left - pad.right);
  const y = (churn: number) => height - pad.bottom - (churn / maxChurn) * (height - pad.top - pad.bottom);
  const avgRate = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  const avgChurn = churns.reduce((sum, churn) => sum + churn, 0) / churns.length;
  const xTicks = Array.from({ length: 5 }, (_, i) => minRate + (maxRate - minRate) * (i / 4));
  const yTicks = Array.from({ length: 4 }, (_, i) => maxChurn * (i / 3));
  return (
    <Card className="!p-4">
      <h3 className="text-sm font-semibold mb-1">Expert performance quadrant</h3>
      <p className="text-xs text-muted mb-2">Best zone is above average activation and below average churn. Bubble size reflects open load.</p>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[620px] h-80" role="img" aria-label="Expert activation rate versus six-month churn">
          <rect x={x(avgRate)} y={pad.top} width={width - pad.right - x(avgRate)} height={y(avgChurn) - pad.top} className="fill-brand/10" />
          {yTicks.map((tick) => <g key={`y-${tick}`}><line x1={pad.left} y1={y(tick)} x2={width - pad.right} y2={y(tick)} stroke="currentColor" opacity=".1" /><text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" className="fill-muted text-[10px]">{pct(tick)}</text></g>)}
          {xTicks.map((tick) => <g key={`x-${tick}`}><line x1={x(tick)} y1={pad.top} x2={x(tick)} y2={height - pad.bottom} stroke="currentColor" opacity=".08" /><text x={x(tick)} y={height - pad.bottom + 18} textAnchor="middle" className="fill-muted text-[10px]">{pct(tick)}</text></g>)}
          <line x1={x(avgRate)} y1={pad.top} x2={x(avgRate)} y2={height - pad.bottom} stroke="currentColor" strokeDasharray="4 4" opacity=".35" />
          <line x1={pad.left} y1={y(avgChurn)} x2={width - pad.right} y2={y(avgChurn)} stroke="currentColor" strokeDasharray="4 4" opacity=".35" />
          <text x={width - pad.right - 4} y={pad.top + 14} textAnchor="end" className="fill-brand text-[11px]">Best zone</text>
          <text x={width / 2} y={height - 8} textAnchor="middle" className="fill-muted text-[11px]">Activation rate →</text>
          <text x="13" y={height / 2} textAnchor="middle" transform={`rotate(-90 13 ${height / 2})`} className="fill-muted text-[11px]">6-mo churn →</text>
          {experts.map((e) => {
            const cx = x(e.activationRate), cy = y(e.churn6m), radius = 6 + Math.min(e.load, 8);
            return <g key={e.id}><circle cx={cx} cy={cy} r={radius} className="fill-brand/75 stroke-white stroke-2" /><title>{`${e.name} (${e.id}): ${pct(e.activationRate)} activation, ${pct(e.churn6m)} churn, ${e.load} open leads`}</title></g>;
          })}
        </svg>
      </div>
      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-1 text-xs text-muted">
        {experts.map((e) => <div key={e.id} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" /><span className="font-medium text-foreground">{e.id}</span><span>{pct(e.activationRate)} act. · {pct(e.churn6m)} churn</span></div>)}
      </div>
    </Card>
  );
}

function OperationalOverview({ disc, leads, ins }: { disc: DiscountsResponse | null; leads: LeadView[]; ins: InsightsResponse | null }) {
  const pendingDiscounts = disc?.requests.filter((r) => r.status === "pending") ?? [];
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 30000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);
  const slaBreached = pendingDiscounts.filter((r) => new Date(r.createdAt).getTime() + 2 * 3600000 <= now).length;
  const awaitingResponse = leads.filter((l) => l.status === "new" || (l.status === "assigned" && !l.assignedExpertId)).length;
  const unassigned = leads.filter((l) => !l.assignedExpertId && l.mode !== "nurture").length;
  const health = [
    { label: "Pending discounts", value: pendingDiscounts.length, hint: "awaiting manager decision" },
    { label: "SLA-breached discounts", value: slaBreached, hint: "past 2-hour SLA" },
    { label: "Unassigned action leads", value: unassigned, hint: "call or visit required" },
    { label: "Leads awaiting response", value: awaitingResponse, hint: "new or assigned" },
    { label: "Live connections", value: ins?.prototype.live ?? 0, hint: "live or first bill" },
    { label: "Rule violations prevented", value: ins?.replay.violations ?? 0, hint: "historical replay" },
  ];
  return (
    <Section title="Live operational health">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {health.map((item) => <Stat key={item.label} label={item.label} value={item.value.toLocaleString("en-IN")} hint={item.hint} tone={item.value > 0 && (item.label.includes("SLA") || item.label.includes("awaiting") || item.label.includes("Unassigned")) ? "warn" : undefined} />)}
      </div>
    </Section>
  );
}

/* ---------------- Discounts ---------------- */

function DiscountQueue({ disc, nameOf, onChange }: { disc: DiscountsResponse | null; nameOf: (id?: string) => string; onChange: () => void }) {
  const [now, setNow] = useState(0); // set after mount (no clock reads during prerender)
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 30000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);
  const reqs = disc?.requests ?? [];
  const pending = reqs.filter((r) => r.status === "pending").sort((a, b) => a.createdAt.localeCompare(b.createdAt)); // oldest (closest to SLA) first
  const decided = reqs.filter((r) => r.status !== "pending");
  const approved = reqs.filter((r) => r.status === "approved");
  const rate = decided.length ? approved.length / decided.length : 0;
  const avgPct = approved.length ? approved.reduce((s, r) => s + r.pct, 0) / approved.length : 0;

  return (
    <section>
      <div className="glass rounded-3xl p-4 mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="font-medium">Discount policy</span>
        <span className="text-muted">Only 3 cases:</span>
        {Object.values(CASE_LABEL).map((c) => <span key={c} className="px-3 py-1 rounded-full bg-black/[0.04] text-xs">{c}</span>)}
        <span className="text-muted text-xs sm:ml-auto">Max 15% · decide within 2 h · quote held 48 h</span>
      </div>
      {pending.length === 0 ? (
        <Empty>No discount requests waiting. Expert requests appear here for approval.</Empty>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {pending.map((d) => <DiscountCard key={d.id} d={d} now={now} nameOf={nameOf} onChange={onChange} />)}
        </div>
      )}

      <div className="mt-8 flex items-center gap-3 mb-3">
        <h2 className="font-semibold tracking-tight">Decision history</h2>
        <span className="text-xs text-muted">{decided.length ? `${pct(rate)} approved · avg ${avgPct.toFixed(1)}% when approved` : "no decisions yet"}</span>
      </div>
      {decided.length > 0 && (
        <div className="glass rounded-3xl divide-y divide-black/5 overflow-hidden">
          {decided.map((d) => (
            <div key={d.id} className="px-5 py-3 flex flex-wrap items-center gap-3 text-sm">
              <span className={`size-8 rounded-full grid place-items-center text-xs font-semibold ${d.status === "approved" ? "bg-foreground text-white" : "bg-brand-soft text-brand"}`}>{d.status === "approved" ? "✓" : "✕"}</span>
              <div className="min-w-40">
                <div className="font-medium flex items-center gap-2">{d.business ?? d.sessionId}{d.demo && <DemoTag />}</div>
                <div className="text-xs text-muted">{CASE_LABEL[d.caseType]} · by {nameOf(d.expertId)}</div>
              </div>
              <div className="text-muted">{d.pct}% · {inr(d.monthly)} → {inr(d.monthlyAfter)}</div>
              {d.managerNote && <div className="text-xs text-muted italic sm:ml-auto">“{d.managerNote}”</div>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DemoTag() {
  return <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/[0.06] text-muted font-semibold" title="Built from the hackathon dataset (smb_leads.csv)">Dataset</span>;
}

function DiscountCard({ d, now, nameOf, onChange }: { d: DiscountView; now: number; nameOf: (id?: string) => string; onChange: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const slaTotal = 2 * 3600000;
  const slaMs = now ? Date.parse(d.createdAt) + slaTotal - now : slaTotal;
  const slaUsed = Math.min(Math.max(1 - slaMs / slaTotal, 0), 1);
  const left = timeLeft(d.holdUntil, now);
  const saving = d.monthly - d.monthlyAfter;
  const weakProof = d.caseType === "competitor_match" && !/₹|\d{3,}/.test(d.proof);

  async function decide(approve: boolean) {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/discounts/${d.id}`, { method: "POST", json: { approve, note: note || undefined } });
      onChange();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass rounded-3xl p-5 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <div className="font-semibold flex items-center gap-2 flex-wrap">{d.business ?? "Business"}{d.demo && <DemoTag />}</div>
          <div className="text-xs text-muted mt-0.5">{d.city} · requested by {nameOf(d.expertId)}</div>
        </div>
        <span className="ml-auto shrink-0 px-2.5 py-1 rounded-full bg-brand-soft text-brand text-xs font-medium">{CASE_LABEL[d.caseType].split(" (")[0]}</span>
      </div>

      <div className="flex items-end gap-4">
        <div className="text-5xl font-semibold tracking-tight leading-none">{d.pct}<span className="text-2xl">%</span></div>
        <div className="text-sm pb-0.5">
          <div className="text-muted line-through">{inr(d.monthly)}/mo</div>
          <div className="font-semibold">{inr(d.monthlyAfter)}/mo</div>
        </div>
        <div className="ml-auto text-right text-xs text-muted pb-0.5">
          <div>gives up</div>
          <div className="text-foreground font-semibold text-sm">{inr(saving)}/mo</div>
          <div>{inr(saving * 24)} over 24 mo</div>
        </div>
      </div>
      <div>
        <div className="flex justify-between text-[11px] text-muted mb-1"><span>vs 15% cap</span><span>{Math.round((d.pct / 15) * 100)}% of cap</span></div>
        <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden"><div className={`h-full rounded-full ${d.pct >= 12 ? "bg-brand" : "bg-foreground"}`} style={{ width: `${(d.pct / 15) * 100}%` }} /></div>
      </div>

      {d.bundle && <div className="text-xs text-muted"><span className="text-foreground font-medium">Bundle:</span> {d.bundle}</div>}
      <div className={`rounded-2xl p-3 text-sm ${weakProof ? "bg-brand-soft/70" : "bg-black/[0.03]"}`}>
        <div className="text-[11px] uppercase tracking-wider text-muted mb-0.5">Proof {weakProof && <span className="text-brand normal-case tracking-normal font-medium">· no competitor price shown</span>}</div>
        {d.proof || <span className="text-muted">none given</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="flex justify-between mb-1"><span className="text-muted">Decision SLA</span><span className={slaMs <= 0 ? "text-brand font-semibold" : "font-medium"}>{slaMs > 0 ? `${Math.ceil(slaMs / 60000)} min left` : "breached"}</span></div>
          <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden"><div className={`h-full ${slaMs <= 0 ? "bg-brand" : slaUsed > 0.6 ? "bg-brand/70" : "bg-foreground/60"}`} style={{ width: `${slaUsed * 100}%` }} /></div>
        </div>
        <div>
          <div className="flex justify-between mb-1"><span className="text-muted">Quote hold</span><span className="font-medium">{left}</span></div>
          <div className="h-1.5 rounded-full bg-black/[0.06]" />
        </div>
      </div>

      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the expert (optional)" aria-label="Manager note" className="w-full h-10 rounded-2xl border border-black/10 bg-white/70 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30" />
      <div className="grid grid-cols-2 gap-2">
        <Button disabled={busy} onClick={() => decide(true)}>✓ Approve {d.pct}%</Button>
        <Button variant="outline" disabled={busy} onClick={() => decide(false)}>✕ Reject</Button>
      </div>
      <ErrorNote text={err} />
    </div>
  );
}

/* ---------------- Leads ---------------- */

function LeadsTable({ leads, experts, nameOf, onChange }: { leads: LeadView[]; experts: Expert[]; nameOf: (id?: string) => string; onChange: () => void }) {
  return (
    <Section title="Leads the AI could not close" right={<Badge tone="neutral">{leads.length} total</Badge>}>
      {leads.length === 0 ? (
        <Empty>No leads yet — escalations from the advisor appear here.</Empty>
      ) : (
        <div className="overflow-x-auto bg-surface border border-border rounded-2xl">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="text-xs text-muted text-left">
              <tr className="border-b border-border">
                <th className="p-3">Lead</th>
                <th className="p-3">Reason</th>
                <th className="p-3">Priority / score</th>
                <th className="p-3">Mode</th>
                <th className="p-3">Offered to</th>
                <th className="p-3">Assigned</th>
                <th className="p-3">Override</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => <LeadRow key={l.id} l={l} experts={experts} nameOf={nameOf} onChange={onChange} />)}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function LeadRow({ l, experts, nameOf, onChange }: { l: LeadView; experts: Expert[]; nameOf: (id?: string) => string; onChange: () => void }) {
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function override() {
    if (!pick) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/leads/${l.id}`, { method: "POST", json: { action: "override", expertId: pick } });
      setPick("");
      onChange();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-b border-border last:border-0 align-top">
      <td className="p-3">
        <div className="font-medium">{l.customer?.business ?? "—"}</div>
        <div className="text-xs text-muted">{l.customer?.city ?? ""} · {l.id}</div>
        <div className="mt-1"><LeadStatusBadge s={l.status} /></div>
      </td>
      <td className="p-3">
        <div>{REASON_LABEL[l.reason] ?? l.reason}</div>
        {l.note && <div className="text-xs text-muted">{l.note}</div>}
      </td>
      <td className="p-3 space-y-1">
        <PriorityBadge p={l.priority} />
        <div className="font-mono text-xs">{l.score}%</div>
      </td>
      <td className="p-3"><ModeBadge m={l.mode} /></td>
      <td className="p-3">
        {l.offers.length === 0 ? (
          <span className="text-xs text-muted">None (nurture)</span>
        ) : (
          <ul className="space-y-1">
            {l.offers.map((o) => (
              <li key={o.expertId} className="flex flex-wrap items-center gap-1">
                <span className="text-xs">{nameOf(o.expertId)}</span>
                <OfferStatusBadge s={o.status} live={!!o.offeredAt} />
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="p-3">
        {l.assignedExpertId ? (
          <>
            <div>{nameOf(l.assignedExpertId)}</div>
            {l.overriddenBy && <div className="text-xs text-warn"><span aria-hidden>⇄ </span>Override by {l.overriddenBy}</div>}
          </>
        ) : (
          <span className="text-xs text-muted">Unassigned</span>
        )}
      </td>
      <td className="p-3">
        <div className="flex gap-1">
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label={`Override expert for ${l.id}`} className="border border-border rounded-lg px-2 py-1 bg-surface text-xs max-w-44">
            <option value="">Choose expert…</option>
            {experts.map((e) => (
              <option key={e.id} value={e.id}>{e.id} · {e.name} ({e.city})</option>
            ))}
          </select>
          <Button size="sm" variant="outline" disabled={!pick || busy} onClick={override}>Assign</Button>
        </div>
        <ErrorNote text={err} />
      </td>
    </tr>
  );
}

/* ---------------- Vendors ---------------- */

function VendorTable({ experts, leads }: { experts: Expert[]; leads: LeadView[] }) {
  const rows = [...experts].sort((a, b) => b.activationRate - a.activationRate);
  const won = (id: string) => leads.filter((l) => l.assignedExpertId === id && l.status === "won").length;
  return (
    <Section title="Vendor performance">
      {rows.length === 0 ? (
        <Empty>No experts loaded.</Empty>
      ) : (
        <div className="overflow-x-auto bg-surface border border-border rounded-2xl">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-xs text-muted text-left">
              <tr className="border-b border-border">
                <th className="p-3">Expert</th>
                <th className="p-3">Type</th>
                <th className="p-3 text-right">Activation</th>
                <th className="p-3 text-right">6-mo churn</th>
                <th className="p-3 text-right">Open load</th>
                <th className="p-3 text-right">Rating</th>
                <th className="p-3 text-right">Won (demo)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <div className="font-medium">{e.name}</div>
                    <div className="text-xs text-muted">{e.id} · {e.city}, {e.state}</div>
                  </td>
                  <td className="p-3 text-xs">{e.kind === "field" ? "Field sales" : "Partner"}</td>
                  <td className="p-3 text-right font-mono">{pct(e.activationRate)}</td>
                  <td className={`p-3 text-right font-mono ${e.churn6m >= 0.12 ? "text-bad" : ""}`}>
                    {e.churn6m >= 0.12 && <span aria-label="high churn">! </span>}{pct(e.churn6m)}
                  </td>
                  <td className="p-3 text-right font-mono">{e.load}</td>
                  <td className="p-3 text-right">★ {e.rating.toFixed(1)}</td>
                  <td className="p-3 text-right font-mono">{won(e.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted mt-2">“!” marks 6-month churn at or above 12%.</p>
    </Section>
  );
}

/* ---------------- Insights ---------------- */

function Insights({ ins }: { ins: InsightsResponse | null }) {
  if (!ins) return <Section title="Insights"><Empty>Loading insights…</Empty></Section>;
  const { baseline: b, replay: r, prototype: p } = ins;
  const byRule = Object.entries(r.byRule).sort((a, c) => c[1] - a[1]);
  const protoAct = p.sessions ? p.orders / p.sessions : null;
  return (
    <Section title="Insights">
      <Card className="!p-4 mb-4">
        <h3 className="font-semibold mb-1">Historical replay through the rule engine</h3>
        <p className="text-sm">
          Our rule engine would have blocked <strong>{r.violations.toLocaleString("en-IN")}</strong> rule-breaking line items and{" "}
          <strong>{r.activatedOnBadGstin.toLocaleString("en-IN")}</strong> activations on cancelled/suspended GSTIN, across{" "}
          {r.activations.toLocaleString("en-IN")} historical activations.
        </p>
        {byRule.length > 0 ? (
          <ul className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {byRule.map(([rule, n]) => (
              <li key={rule} className="flex gap-2 border-b border-border py-1">
                <span className="text-muted">{rule}</span>
                <span className="ml-auto font-mono">{n.toLocaleString("en-IN")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted mt-2">No rule violations found in the replay.</p>
        )}
      </Card>

      <h3 className="font-semibold mb-2">Baseline (historical) vs prototype (live demo)</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        <Stat label="Activation rate" value={protoAct != null ? pct(protoAct, 1) : "—"} hint={`baseline ${pct(b.activationRate, 1)} · prototype = orders / sessions`} />
        <Stat label="Avg days to live" value={p.avgDaysToLive != null ? p.avgDaysToLive.toFixed(1) : "—"} hint={`baseline ${b.avgDays} days`} />
        <Stat label="Status-chase calls" value={`${b.chaseCalls} → ${p.statusChaseCalls}`} hint="per order (live tracker)" tone="good" />
        <Stat label="Products per customer" value={p.productsPerCustomer != null ? p.productsPerCustomer.toFixed(1) : "—"} hint={`${p.orders} orders`} />
        <Stat label="Closed by AI only" value={p.closedByAiOnly} hint={`of ${p.orders} orders · ${p.leadsToExperts} to experts`} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
        <Stat label="Sessions" value={p.sessions} hint={`${p.withBundle} with a bundle`} />
        <Stat label="KYC verified" value={p.kycVerified} />
        <Stat label="Live connections" value={p.live} />
        <Stat label="Baseline 6-mo churn" value={pct(b.churn6m, 1)} hint={`CAC ${inr(b.cac)} · ${b.leads.toLocaleString("en-IN")} leads`} />
      </div>
    </Section>
  );
}
