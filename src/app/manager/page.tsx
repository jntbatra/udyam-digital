"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Badge, Button, Card, Section, inr } from "@/components/ui";
import {
  CASE_LABEL, DiscountStatusBadge, Empty, ErrorNote, LeadStatusBadge, ModeBadge, OfferStatusBadge, PriorityBadge, REASON_LABEL, RefreshNote, Stat, pct, timeLeft,
  BarChart, type DiscountsResponse, type DiscountView, type Expert, type InsightsResponse, type LeadView, type LeadsResponse,
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex flex-col sm:flex-row sm:items-end gap-2 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Manager · back-office</h1>
          <p className="text-sm text-muted">Discount approvals, leads the AI could not close, vendor performance and rule-engine insights.</p>
        </div>
        <div className="sm:ml-auto"><RefreshNote at={updatedAt} /></div>
      </div>
      <ErrorNote text={err} />

      <DiscountQueue disc={disc} nameOf={nameOf} onChange={refresh} />
      <ManagerVisuals experts={experts} leads={leads} ins={ins} />
      <LeadsTable leads={leads} experts={experts} nameOf={nameOf} onChange={refresh} />
      <VendorTable experts={experts} leads={leads} />
      <Insights ins={ins} />
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
  const pending = reqs.filter((r) => r.status === "pending");
  const decided = reqs.filter((r) => r.status !== "pending");
  const approved = reqs.filter((r) => r.status === "approved");
  const rate = decided.length ? approved.length / decided.length : 0;
  const avgPct = approved.length ? approved.reduce((s, r) => s + r.pct, 0) / approved.length : 0;

  return (
    <Section title="Discount approval queue" right={<Badge tone={pending.length ? "warn" : "neutral"}>{pending.length} pending</Badge>}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Stat label="Approved discounts" value={disc?.spend.approvedCount ?? 0} />
        <Stat label="Discount spend" value={`${inr(disc?.spend.monthlyDiscountInr ?? 0)}/mo`} hint="monthly revenue given up" />
        <Stat label="Approval rate" value={decided.length ? pct(rate) : "—"} hint={`${approved.length} of ${decided.length} decided`} />
        <Stat label="Avg approved discount" value={approved.length ? `${avgPct.toFixed(1)}%` : "—"} hint={`${reqs.length} requests total`} />
      </div>
      <p className="text-xs text-muted mb-2">Allowed only for competitor match (with proof), multi-site / manufacturer, or bundles ≥ ₹5,000/month. SLA 2 h; quote held 48 h.</p>
      {pending.length === 0 ? (
        <Empty>No discount requests waiting. Expert requests appear here for approval.</Empty>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {pending.map((d) => <DiscountCard key={d.id} d={d} now={now} nameOf={nameOf} onChange={onChange} />)}
        </div>
      )}
      {decided.length > 0 && (
        <details className="mt-3">
          <summary className="text-sm text-muted cursor-pointer">Decided ({decided.length})</summary>
          <ul className="mt-2 text-sm divide-y divide-border bg-surface border border-border rounded-xl">
            {decided.map((d) => (
              <li key={d.id} className="px-3 py-2 flex flex-wrap items-center gap-2">
                <DiscountStatusBadge s={d.status} />
                <span className="font-medium">{d.business ?? d.sessionId}</span>
                <span className="text-muted">{CASE_LABEL[d.caseType]} · {d.pct}% · {inr(d.monthly)} → {inr(d.monthlyAfter)}</span>
                {d.managerNote && <span className="text-muted italic">“{d.managerNote}”</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}

function DiscountCard({ d, now, nameOf, onChange }: { d: DiscountView; now: number; nameOf: (id?: string) => string; onChange: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const slaMs = new Date(d.createdAt).getTime() + 2 * 3600000 - now;
  const left = timeLeft(d.holdUntil, now);

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
    <Card className="!p-4 text-sm space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{d.business ?? "Business"}</span>
        <span className="text-muted">{d.city}</span>
        <span className="ml-auto"><DiscountStatusBadge s={d.status} /></span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge tone="brand">{CASE_LABEL[d.caseType]}</Badge>
        <Badge tone={slaMs > 0 ? "neutral" : "bad"}>{slaMs > 0 ? `⏱ SLA ${Math.ceil(slaMs / 60000)} min left` : "! SLA breached"}</Badge>
        <Badge tone={left === "expired" ? "bad" : "neutral"}>⌛ Quote hold: {left}</Badge>
      </div>
      <div>
        <span className="text-2xl font-semibold">{d.pct}%</span>{" "}
        <span className="text-muted">{inr(d.monthly)} → <span className="text-foreground font-medium">{inr(d.monthlyAfter)}</span>/month</span>
      </div>
      <div><span className="text-xs text-muted">Proof: </span>{d.proof || <span className="text-muted">none given</span>}</div>
      <div className="text-xs text-muted">Requested by {nameOf(d.expertId)} · {new Date(d.createdAt).toLocaleString("en-IN")}</div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to expert (optional)" aria-label="Manager note" className="w-full border border-border rounded-lg px-2 py-1.5 bg-surface" />
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => decide(true)}>✓ Approve</Button>
        <Button size="sm" variant="danger" disabled={busy} onClick={() => decide(false)}>✕ Reject</Button>
      </div>
      <ErrorNote text={err} />
    </Card>
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
