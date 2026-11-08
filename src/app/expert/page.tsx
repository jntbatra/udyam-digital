"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type React from "react";
import { api } from "@/lib/client";
import { payoutFor, PAYOUT } from "@/lib/payouts";
import { Button, inr } from "@/components/ui";
import { DiscountForm } from "@/components/staff/DiscountForm";
import {
  DiscountStatusBadge, Empty, ErrorNote, REASON_LABEL, RefreshNote, SEGMENT_NAME, Stat, pct,
  BarChart, type DiscountsResponse, type DiscountView, type Expert, type LeadView, type LeadsResponse,
} from "@/components/staff/shared";

const REFRESH_MS = 5000;

const relevantTo = (l: LeadView, id: string) =>
  l.assignedExpertId === id || l.offers.some((o) => o.expertId === id && o.offeredAt && o.status === "offered");

export default function ExpertPage() {
  const [experts, setExperts] = useState<Expert[]>([]);
  const [expertId, setExpertId] = useState<string | null>(null);
  const [leads, setLeads] = useState<LeadView[]>([]);
  const [discounts, setDiscounts] = useState<DiscountView[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // First load: experts + pick default (first expert who has leads, else E01).
  useEffect(() => {
    api<LeadsResponse>("/api/leads")
      .then((r) => {
        setExperts(r.experts);
        const withLeads = r.experts.find((e) => r.leads.some((l) => relevantTo(l, e.id)));
        setExpertId((cur) => cur ?? withLeads?.id ?? r.experts.find((e) => e.id === "E01")?.id ?? r.experts[0]?.id ?? "E01");
      })
      .catch((x: unknown) => setErr(x instanceof Error ? x.message : String(x)));
  }, []);

  const refresh = useCallback(async () => {
    if (!expertId) return;
    try {
      const [r, d] = await Promise.all([
        api<LeadsResponse>(`/api/leads?expertId=${encodeURIComponent(expertId)}`),
        api<DiscountsResponse>("/api/discounts"),
      ]);
      setLeads(r.leads);
      setExperts(r.experts);
      setDiscounts(d.requests.filter((x) => x.expertId === expertId));
      setUpdatedAt(new Date());
      setErr(null);
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    }
  }, [expertId]);

  useEffect(() => {
    if (!expertId) return;
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
  }, [expertId, refresh]);

  const me = experts.find((e) => e.id === expertId);
  const mine = useMemo(() => leads.filter((l) => l.assignedExpertId === expertId), [leads, expertId]);
  const [filter, setFilter] = useState<"all" | "offers" | "active" | "won" | "lost">("all");
  const offers = leads.filter((l) => l.assignedExpertId !== expertId);
  const active = mine.filter((l) => l.status === "assigned" || l.status === "contacted");
  const shown = leads.filter((l) =>
    filter === "all" ? true : filter === "offers" ? l.assignedExpertId !== expertId : filter === "active" ? active.includes(l) : l.status === filter);
  const paid = mine.filter((l) => l.status === "won").reduce((s, l) => s + payoutFor(l.customer?.monthly ?? 0).onConnection, 0);
  const pipeline = mine.filter((l) => l.status !== "won" && l.status !== "lost").reduce((s, l) => s + payoutFor(l.customer?.monthly ?? 0).base, 0);
  const avgAct = experts.reduce((s, e) => s + e.activationRate, 0) / (experts.length || 1);
  const initials = (me?.name ?? "?").replace(/\(.*\)/, "").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
  const filters = [
    { id: "all", label: "All", n: leads.length },
    { id: "offers", label: "New offers", n: offers.length },
    { id: "active", label: "In progress", n: active.length },
    { id: "won", label: "Won", n: mine.filter((l) => l.status === "won").length },
    { id: "lost", label: "Lost", n: mine.filter((l) => l.status === "lost").length },
  ] as const;

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-8 py-8">
      <header className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <span className="size-14 rounded-2xl bg-brand text-white grid place-items-center text-lg font-semibold shadow-[0_8px_24px_rgba(228,0,0,0.25)]">{initials}</span>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-brand">Local Accel Expert</p>
            <h1 className="text-2xl font-semibold tracking-tight">{me?.name ?? "Expert"}</h1>
            <p className="text-sm text-muted">{me ? `${me.city}, ${me.state} · ${me.languages.join(", ")} · ★ ${me.rating.toFixed(1)} · ${me.kind === "field" ? "Field sales" : "Partner"}` : "Loading…"}</p>
          </div>
        </div>
        <div className="md:ml-auto flex flex-col items-start md:items-end gap-1">
          <select id="expert-pick" aria-label="Signed in as (demo picker)" value={expertId ?? ""} onChange={(e) => setExpertId(e.target.value)}
            className="h-10 rounded-full border border-black/10 bg-white/70 px-4 text-sm min-w-64">
            {experts.map((e) => <option key={e.id} value={e.id}>{e.id} · {e.name}</option>)}
          </select>
          <RefreshNote at={updatedAt} />
        </div>
      </header>
      <ErrorNote text={err} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Kpi hot label="New offers" value={String(offers.length)} sub={offers.length ? "accept before they pass on" : "none waiting"} />
        <Kpi label="In progress" value={String(active.length)} sub={`${active.filter((l) => l.slot).length} scheduled`} />
        <Kpi label="Earned (mock)" value={inr(paid)} sub={`${Math.round(PAYOUT.onConnection * 100)}% paid on connection`} />
        <Kpi label="Pipeline" value={inr(pipeline)} sub="incentive if all open leads win" />
        <Kpi label="Activation rate" value={me ? pct(me.activationRate) : "—"} sub={me ? `${me.activationRate >= avgAct ? "▲ above" : "▼ below"} team avg ${pct(avgAct)}` : ""} />
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="min-w-0">
          <div className="glass rounded-full p-1 flex gap-1 overflow-x-auto mb-4 w-fit max-w-full" role="tablist">
            {filters.map((f) => (
              <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
                className={`shrink-0 h-9 px-4 rounded-full text-sm font-medium inline-flex items-center gap-2 transition-colors ${filter === f.id ? "bg-foreground text-white" : "text-muted hover:text-foreground"}`}>
                {f.label}<span className={`text-[11px] min-w-5 h-5 px-1.5 rounded-full grid place-items-center ${filter === f.id ? "bg-white/20" : f.id === "offers" && f.n ? "bg-brand text-white" : "bg-black/[0.06]"}`}>{f.n}</span>
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <Empty>No leads here yet. Escalations from the AI advisor appear here.</Empty>
          ) : (
            <div className="space-y-4">
              {shown.map((l) => (
                <LeadCard key={l.id} lead={l} expertId={expertId!} discounts={discounts.filter((d) => d.sessionId === l.sessionId && d.sessionId !== "DEMO")} onChange={refresh} />
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20">
          <SidePanel title="Schedule"><Calendar leads={mine} /></SidePanel>
          <SidePanel title="Earnings"><Earnings leads={mine} /></SidePanel>
          <SidePanel title="My performance">{me ? <Performance me={me} all={experts} /> : <Empty>Pick an expert.</Empty>}</SidePanel>
          <SidePanel title="Pipeline"><PipelineVisual leads={leads} /></SidePanel>
        </aside>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, hot }: { label: string; value: string; sub: string; hot?: boolean }) {
  return (
    <div className={`rounded-3xl p-5 ${hot ? "bg-brand text-white shadow-[0_10px_30px_rgba(228,0,0,0.25)]" : "glass"}`}>
      <div className={`text-xs ${hot ? "text-white/80" : "text-muted"}`}>{label}</div>
      <div className="text-3xl font-semibold tracking-tight mt-1">{value}</div>
      <div className={`text-xs mt-1 ${hot ? "text-white/80" : "text-muted"}`}>{sub}</div>
    </div>
  );
}

function SidePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-3xl p-5">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}

function PipelineVisual({ leads }: { leads: LeadView[] }) {
  const statuses = (["new", "assigned", "contacted", "won", "lost"] as const).map((status) => ({
    label: status[0].toUpperCase() + status.slice(1),
    value: leads.filter((l) => l.status === status).length,
  }));
  return <BarChart data={statuses} />;
}

const STATUS_STYLE: Record<LeadView["status"], string> = {
  new: "bg-brand text-white", assigned: "bg-foreground text-white", contacted: "bg-black/[0.08] text-foreground", won: "bg-foreground text-white", lost: "bg-black/[0.05] text-muted",
};
const STATUS_TEXT: Record<LeadView["status"], string> = { new: "New offer", assigned: "Accepted", contacted: "Contacted", won: "✓ Won", lost: "Lost" };

function LeadCard({ lead: l, expertId, discounts, onChange }: { lead: LeadView; expertId: string; discounts: DiscountView[]; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showDiscount, setShowDiscount] = useState(false);
  const [open, setOpen] = useState(false);
  const offer = l.offers.find((o) => o.expertId === expertId);
  const assignedToMe = l.assignedExpertId === expertId;
  const pendingOffer = !assignedToMe && offer?.status === "offered" && !!offer.offeredAt;
  const isDemo = l.sessionId === "DEMO";
  const c = l.customer;
  const earn = payoutFor(c?.monthly ?? 0);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/leads/${l.id}`, { method: "POST", json: body });
      onChange();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`glass rounded-3xl p-5 ${pendingOffer ? "ring-2 ring-brand/40" : ""}`}>
      <div className="flex items-start gap-4">
        <ScoreRing score={l.score} priority={l.priority} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-lg tracking-tight">{c?.business ?? "Business"}</h3>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[l.status]}`}>{STATUS_TEXT[l.status]}</span>
            {isDemo && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/[0.06] text-muted font-semibold" title="From the hackathon dataset (smb_leads.csv)">Dataset</span>}
          </div>
          <p className="text-sm text-muted mt-0.5">
            {[c?.city, c?.segment ? SEGMENT_NAME[c.segment] ?? c.segment : undefined, c?.employees != null ? `${c.employees} staff` : undefined, c?.sites != null ? `${c.sites} site${c.sites === 1 ? "" : "s"}` : undefined, c?.language].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-semibold tracking-tight">{inr(c?.monthly ?? 0)}<span className="text-xs text-muted font-normal">/mo</span></div>
          <div className="text-xs text-muted">you earn {inr(earn.base)}</div>
        </div>
      </div>

      <div className="mt-4 grid md:grid-cols-3 gap-3 text-sm">
        <div className="rounded-2xl bg-brand-soft/60 p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted">Why the AI handed over</div>
          <div className="font-medium mt-0.5">{REASON_LABEL[l.reason] ?? l.reason}</div>
          {l.note && <div className="text-xs text-muted mt-1">{l.note}</div>}
        </div>
        <div className="rounded-2xl bg-black/[0.03] p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted">Contact</div>
          <div className="font-medium mt-0.5">{c?.name ?? "—"}{c?.role ? <span className="text-muted font-normal"> · {c.role}</span> : null}</div>
          <div className="text-xs text-muted mt-1">{c?.phone ? <span className="font-mono">{c.phone}</span> : isDemo ? "Phone not in dataset" : "—"}</div>
          {!l.consentAt && <div className="text-xs text-warn mt-1">! Masked until the owner consents</div>}
        </div>
        <div className="rounded-2xl bg-black/[0.03] p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted">{l.mode === "visit" ? "Site visit" : l.mode === "call" ? "Phone call" : "Nurture"}</div>
          <div className="font-medium mt-0.5">{l.slot ?? (pendingOffer ? "Accept to schedule" : "To schedule")}</div>
          {offer?.why && <div className="text-xs text-muted mt-1">Picked: {offer.why}</div>}
        </div>
      </div>

      {c && c.bundle.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {c.bundle.map((b) => <span key={b.productId} className="text-xs px-2.5 py-1 rounded-full bg-white/70 border border-black/5">{b.qty > 1 ? `${b.qty} × ` : ""}{b.name ?? b.productId}</span>)}
        </div>
      )}

      <button onClick={() => setOpen((v) => !v)} className="mt-3 text-xs text-muted hover:text-foreground">{open ? "Hide details ▴" : "Score factors and conversation ▾"}</button>
      {open && (
        <div className="mt-2 grid md:grid-cols-2 gap-3 text-sm">
          <ul className="space-y-1">
            {l.scoreFactors.slice(0, 3).map((f) => (
              <li key={f.label} className="flex items-center gap-2">
                <span className={f.impact >= 0 ? "text-foreground" : "text-brand"} aria-hidden>{f.impact >= 0 ? "▲" : "▼"}</span>
                <span>{f.label}</span>
                <span className="ml-auto font-mono text-xs">{f.impact >= 0 ? "+" : ""}{f.impact.toFixed(2)}</span>
              </li>
            ))}
          </ul>
          {c?.conversation && <p className="text-muted italic">“{c.conversation}”</p>}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-black/5 flex flex-wrap gap-2 items-center">
        {pendingOffer && (
          <>
            <Button disabled={busy} onClick={() => post({ action: "accept", expertId })}>✓ Accept lead</Button>
            <Button variant="outline" disabled={busy} onClick={() => post({ action: "decline", expertId })}>Decline</Button>
            <span className="text-xs text-muted">Declining passes it to the next expert.</span>
          </>
        )}
        {assignedToMe && (
          <div className="flex gap-1 rounded-full bg-black/[0.04] p-1">
            {(["contacted", "won", "lost"] as const).map((s) => (
              <button key={s} disabled={busy || l.status === s} onClick={() => post({ action: "status", status: s })}
                className={`h-8 px-3.5 rounded-full text-sm font-medium transition-colors ${l.status === s ? (s === "lost" ? "bg-white text-muted" : "bg-foreground text-white") : "text-muted hover:text-foreground"}`}>
                {s === "contacted" ? "Contacted" : s === "won" ? "Won" : "Lost"}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex gap-2">
          {assignedToMe && !isDemo && (
            <Button size="sm" variant="ghost" onClick={() => setShowDiscount((v) => !v)} aria-expanded={showDiscount}>{showDiscount ? "Hide special price" : "₹ Special price"}</Button>
          )}
          {!isDemo && (
            <a href={`/quote?session=${encodeURIComponent(l.sessionId)}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center h-8 px-3.5 rounded-full text-sm font-medium border border-black/10 bg-white/70 hover:bg-white">↗ Assisted journey</a>
          )}
        </div>
      </div>
      <ErrorNote text={err} />

      {discounts.length > 0 && (
        <ul className="mt-3 text-sm space-y-1">
          {discounts.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2">
              <DiscountStatusBadge s={d.status} />
              <span>{d.pct}% · {inr(d.monthly)} → {inr(d.monthlyAfter)}/month</span>
              {d.managerNote && <span className="text-muted">“{d.managerNote}”</span>}
            </li>
          ))}
        </ul>
      )}
      {assignedToMe && showDiscount && (
        <div className="mt-3 border-t border-black/5 pt-3">
          <DiscountForm sessionId={l.sessionId} expertId={expertId} onDone={onChange} />
        </div>
      )}
    </div>
  );
}

function ScoreRing({ score, priority }: { score: number; priority: LeadView["priority"] }) {
  const v = Math.min(Math.max(score, 0), 100);
  return (
    <div className="relative size-14 shrink-0" title={`Model: ${score}% chance to activate (${priority} priority)`}>
      <svg viewBox="0 0 36 36" className="size-14 -rotate-90">
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(0,0,0,.07)" strokeWidth="3" />
        <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${Math.max(v, 2) * 0.974} 100`} />
      </svg>
      <span className="absolute inset-0 grid place-items-center leading-none text-center">
        <span><span className="block text-sm font-semibold">{score}%</span><span className="block text-[9px] text-muted uppercase">{priority}</span></span>
      </span>
    </div>
  );
}

function Calendar({ leads }: { leads: LeadView[] }) {
  const items = leads.filter((l) => l.mode !== "nurture" && l.status !== "won" && l.status !== "lost");
  if (!items.length) return <Empty>No accepted calls or visits yet.</Empty>;
  return (
    <div>
      <ul className="divide-y divide-black/5 text-sm">
        {items.map((l) => (
          <li key={l.id} className="py-2 flex items-center gap-2">
            <span aria-hidden>{l.mode === "visit" ? "⌂" : "☎"}</span>
            <div className="min-w-0">
              <div className="font-medium truncate">{l.customer?.business ?? l.id}</div>
              <div className="text-xs text-muted">{l.mode === "visit" ? "Site visit" : "Call"} · {l.customer?.city ?? ""}</div>
            </div>
            <span className={`ml-auto text-xs whitespace-nowrap ${l.slot ? "" : "text-warn"}`}>{l.slot ?? "To schedule"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Earnings({ leads }: { leads: LeadView[] }) {
  const rows = leads
    .filter((l) => l.status !== "lost")
    .map((l) => ({ l, p: payoutFor(l.customer?.monthly ?? 0) }));
  // Mock ledger: won → connection payout paid, retention pending (6 months); open → pipeline.
  const won = rows.filter((r) => r.l.status === "won");
  const open = rows.filter((r) => r.l.status !== "won");
  const paid = won.reduce((s, r) => s + r.p.onConnection, 0);
  const pending = won.reduce((s, r) => s + r.p.retentionBonus, 0);
  const pipeline = open.reduce((s, r) => s + r.p.base, 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Paid (mock)" value={inr(paid)} hint={`${Math.round(PAYOUT.onConnection * 100)}% on connection`} tone="good" />
        <Stat label="Pending" value={inr(pending)} hint={`${Math.round(PAYOUT.retention * 100)}% at ${PAYOUT.retentionMonths} mo`} tone="warn" />
        <Stat label="Pipeline" value={inr(pipeline)} hint="if won" />
      </div>
      {rows.length ? (
        <ul className="text-sm divide-y divide-border">
          {rows.map(({ l, p }) => (
            <li key={l.id} className="py-1.5 flex items-center gap-2">
              <span className="truncate">{l.customer?.business ?? l.id}</span>
              <span className="ml-auto text-xs text-muted whitespace-nowrap">
                {l.status === "won" ? `✓ ${inr(p.onConnection)} paid · … ${inr(p.retentionBonus)} pending` : `… ${inr(p.onConnection)} + ${inr(p.retentionBonus)} if won`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No accepted leads yet.</p>
      )}
      <p className="text-xs text-muted">
        Base = 1 month of bundle value. Connection payout is clawed back if the customer churns within {PAYOUT.clawbackMonths} months. Manager-approved discounts do not reduce your incentive.
      </p>
    </div>
  );
}

function Performance({ me, all }: { me: Expert; all: Expert[] }) {
  const avgAct = all.reduce((s, e) => s + e.activationRate, 0) / (all.length || 1);
  const avgChurn = all.reduce((s, e) => s + e.churn6m, 0) / (all.length || 1);
  const rank = [...all].sort((a, b) => b.activationRate - a.activationRate).findIndex((e) => e.id === me.id) + 1;
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Activation rate" value={pct(me.activationRate)} hint={`${me.activationRate >= avgAct ? "▲ above" : "▼ below"} avg ${pct(avgAct)}`} tone={me.activationRate >= avgAct ? "good" : "warn"} />
        <Stat label="6-month churn" value={pct(me.churn6m)} hint={`${me.churn6m <= avgChurn ? "▲ better than" : "▼ worse than"} avg ${pct(avgChurn)}`} tone={me.churn6m <= avgChurn ? "good" : "warn"} />
        <Stat label="Rating" value={`★ ${me.rating.toFixed(1)}`} hint="out of 5" />
        <Stat label="Open load" value={me.load} hint={`Rank #${rank} of ${all.length} on activation`} />
      </div>
      <p className="text-xs text-muted mt-2">{me.kind === "field" ? "Field sales" : "Partner (Local Accel Expert)"} · {me.city}, {me.state} · {me.languages.join(", ")}</p>
    </div>
  );
}
