"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { payoutFor, PAYOUT } from "@/lib/payouts";
import { Badge, Button, Card, Section, inr } from "@/components/ui";
import { DiscountForm } from "@/components/staff/DiscountForm";
import {
  DiscountStatusBadge, Empty, ErrorNote, LeadStatusBadge, ModeBadge, PriorityBadge, REASON_LABEL, RefreshNote, SEGMENT_NAME, Stat, pct,
  type DiscountsResponse, type DiscountView, type Expert, type LeadView, type LeadsResponse,
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Local Accel Expert</h1>
          <p className="text-sm text-muted">Leads the AI advisor handed over, your calendar, earnings and performance.</p>
        </div>
        <div className="sm:ml-auto flex flex-col gap-1">
          <label htmlFor="expert-pick" className="text-xs text-muted">Signed in as (demo picker)</label>
          <select
            id="expert-pick"
            value={expertId ?? ""}
            onChange={(e) => setExpertId(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 bg-surface text-sm min-w-64"
          >
            {experts.map((e) => (
              <option key={e.id} value={e.id}>{e.id} · {e.name} — {e.city}</option>
            ))}
          </select>
          <RefreshNote at={updatedAt} />
        </div>
      </div>
      <ErrorNote text={err} />

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div>
          <Section title="Leads for you" right={<Badge tone="brand">{leads.length} open</Badge>}>
            {leads.length === 0 ? (
              <Empty>No leads yet — escalations from the advisor appear here.</Empty>
            ) : (
              <div className="space-y-4">
                {leads.map((l) => (
                  <LeadCard key={l.id} lead={l} expertId={expertId!} discounts={discounts.filter((d) => d.sessionId === l.sessionId)} onChange={refresh} />
                ))}
              </div>
            )}
          </Section>
        </div>

        <aside>
          <Section title="Calendar">
            <Calendar leads={mine} />
          </Section>
          <Section title="Earnings">
            <Earnings leads={mine} />
          </Section>
          <Section title="My performance">
            {me ? <Performance me={me} all={experts} /> : <Empty>Pick an expert.</Empty>}
          </Section>
        </aside>
      </div>
    </div>
  );
}

function LeadCard({ lead: l, expertId, discounts, onChange }: { lead: LeadView; expertId: string; discounts: DiscountView[]; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showDiscount, setShowDiscount] = useState(false);
  const offer = l.offers.find((o) => o.expertId === expertId);
  const assignedToMe = l.assignedExpertId === expertId;
  const pendingOffer = !assignedToMe && offer?.status === "offered" && !!offer.offeredAt;
  const c = l.customer;

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
    <Card className="!p-4">
      <div className="flex flex-wrap items-center gap-2">
        <PriorityBadge p={l.priority} />
        <ModeBadge m={l.mode} />
        <LeadStatusBadge s={l.status} />
        {l.overriddenBy && <Badge tone="warn"><span aria-hidden>⇄</span> Assigned by {l.overriddenBy}</Badge>}
        <span className="ml-auto text-xs text-muted">{l.id} · {new Date(l.createdAt).toLocaleString("en-IN")}</span>
      </div>

      <div className="mt-3 grid md:grid-cols-2 gap-4">
        <div className="space-y-2 text-sm">
          <div>
            <div className="text-xs text-muted">Why the AI handed over</div>
            <div className="font-medium">{REASON_LABEL[l.reason] ?? l.reason}</div>
            {l.note && <div className="text-muted">{l.note}</div>}
          </div>
          <div>
            <div className="text-xs text-muted">AI propensity score</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{l.score}%</span>
              <span className="text-xs text-muted">chance to activate</span>
            </div>
            <ul className="mt-1 space-y-0.5">
              {l.scoreFactors.slice(0, 3).map((f) => (
                <li key={f.label} className="flex items-center gap-2">
                  <span className={f.impact >= 0 ? "text-good" : "text-bad"} aria-hidden>{f.impact >= 0 ? "▲" : "▼"}</span>
                  <span>{f.label}</span>
                  <span className={`ml-auto font-mono text-xs ${f.impact >= 0 ? "text-good" : "text-bad"}`}>{f.impact >= 0 ? "+" : ""}{f.impact.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
          {offer?.why && (
            <div>
              <div className="text-xs text-muted">Why you were picked</div>
              <div>{offer.why}</div>
            </div>
          )}
        </div>

        <div className="bg-background rounded-xl p-3 text-sm space-y-1">
          {c ? (
            <>
              <div className="font-medium">{c.business ?? "Business"}</div>
              <div>{c.name} · <span className="font-mono">{c.phone || "—"}</span></div>
              {!l.consentAt && <div className="text-xs text-warn"><span aria-hidden>! </span>Contact masked — no hand-off consent</div>}
              <div className="text-muted">
                {[c.city, c.language, c.segment ? SEGMENT_NAME[c.segment] ?? c.segment : undefined, c.employees != null ? `${c.employees} staff` : undefined, c.sites != null ? `${c.sites} site${c.sites === 1 ? "" : "s"}` : undefined]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              {c.conversation && (
                <div className="pt-1">
                  <div className="text-xs text-muted">Conversation (last owner messages)</div>
                  <div className="italic">“{c.conversation}”</div>
                </div>
              )}
              <div className="pt-1">
                <div className="text-xs text-muted">Draft bundle</div>
                {c.bundle.length ? (
                  <ul className="list-disc ml-4">
                    {c.bundle.map((b) => (
                      <li key={b.productId}>{b.productId} × {b.qty}{b.reason ? <span className="text-muted"> — {b.reason}</span> : null}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-muted">No bundle drafted yet</div>
                )}
                <div className="font-medium mt-1">{inr(c.monthly)}/month</div>
              </div>
            </>
          ) : (
            <div className="text-muted">Customer session no longer available (deleted on request).</div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 items-center">
        {pendingOffer && (
          <>
            <Button size="sm" disabled={busy} onClick={() => post({ action: "accept", expertId })}>✓ Accept</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => post({ action: "decline", expertId })}>✕ Decline</Button>
            <span className="text-xs text-muted">Declining passes it to the next expert in line.</span>
          </>
        )}
        {assignedToMe && (
          <>
            <span className="text-xs text-muted">Update status:</span>
            {(["contacted", "won", "lost"] as const).map((s) => (
              <Button key={s} size="sm" variant={l.status === s ? "primary" : "outline"} disabled={busy || l.status === s} onClick={() => post({ action: "status", status: s })}>
                {s === "contacted" ? "☎ Contacted" : s === "won" ? "✓ Won" : "✕ Lost"}
              </Button>
            ))}
          </>
        )}
        <a
          href={`/quote?session=${encodeURIComponent(l.sessionId)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto rounded-xl text-sm px-3 py-1.5 border border-border bg-surface hover:bg-background font-medium"
        >
          ↗ Assisted journey
        </a>
        {assignedToMe && (
          <Button size="sm" variant="ghost" onClick={() => setShowDiscount((v) => !v)} aria-expanded={showDiscount}>
            {showDiscount ? "Hide special price" : "₹ Request special price"}
          </Button>
        )}
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
        <div className="mt-3 border-t border-border pt-3">
          <DiscountForm sessionId={l.sessionId} expertId={expertId} onDone={onChange} />
        </div>
      )}
    </Card>
  );
}

function Calendar({ leads }: { leads: LeadView[] }) {
  const items = leads.filter((l) => l.mode !== "nurture" && l.status !== "won" && l.status !== "lost");
  if (!items.length) return <Empty>No accepted calls or visits yet.</Empty>;
  return (
    <Card className="!p-3">
      <ul className="divide-y divide-border text-sm">
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
    </Card>
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
    <Card className="!p-3 space-y-3">
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
    </Card>
  );
}

function Performance({ me, all }: { me: Expert; all: Expert[] }) {
  const avgAct = all.reduce((s, e) => s + e.activationRate, 0) / (all.length || 1);
  const avgChurn = all.reduce((s, e) => s + e.churn6m, 0) / (all.length || 1);
  const rank = [...all].sort((a, b) => b.activationRate - a.activationRate).findIndex((e) => e.id === me.id) + 1;
  return (
    <Card className="!p-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Activation rate" value={pct(me.activationRate)} hint={`${me.activationRate >= avgAct ? "▲ above" : "▼ below"} avg ${pct(avgAct)}`} tone={me.activationRate >= avgAct ? "good" : "warn"} />
        <Stat label="6-month churn" value={pct(me.churn6m)} hint={`${me.churn6m <= avgChurn ? "▲ better than" : "▼ worse than"} avg ${pct(avgChurn)}`} tone={me.churn6m <= avgChurn ? "good" : "warn"} />
        <Stat label="Rating" value={`★ ${me.rating.toFixed(1)}`} hint="out of 5" />
        <Stat label="Open load" value={me.load} hint={`Rank #${rank} of ${all.length} on activation`} />
      </div>
      <p className="text-xs text-muted mt-2">{me.kind === "field" ? "Field sales" : "Partner (Local Accel Expert)"} · {me.city}, {me.state} · {me.languages.join(", ")}</p>
    </Card>
  );
}
