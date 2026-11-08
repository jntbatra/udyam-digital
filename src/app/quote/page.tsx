"use client";
import Link from "next/link";
import { useState } from "react";
import { useSession } from "@/lib/useSession";
import { t } from "@/lib/i18n";
import { Badge, Button, Card, inr } from "@/components/ui";

export default function QuotePage() {
  const { data, patch } = useSession();
  const [err, setErr] = useState<string | null>(null);
  const [showCheaper, setShowCheaper] = useState(false);
  const [adding, setAdding] = useState("");
  if (!data) return <div className="max-w-3xl mx-auto p-6 text-muted">Loading your plan…</div>;
  const { session: s, quote: q, upsell, cheaper, pendingDiscount, catalogue } = data;
  const lang = s.language;

  async function setBundle(bundle: typeof s.bundle) {
    setErr(null);
    try {
      await patch({ bundle });
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  const setQty = (pid: string, qty: number) => setBundle(s.bundle.map((b) => (b.productId === pid ? { ...b, qty: Math.max(1, qty) } : b)));
  const remove = (pid: string) => setBundle(s.bundle.filter((b) => b.productId !== pid));
  const add = (pid: string, qty = 1, reason = "Added by you") => setBundle([...s.bundle, { productId: pid, qty, reason }]);

  if (!q.lines.length)
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Card>
          <p className="mb-3">No plan yet. Tell the advisor about your business first.</p>
          <Link href="/advisor"><Button>Go to advisor</Button></Link>
        </Card>
      </div>
    );

  const inBundle = new Set(s.bundle.map((b) => b.productId));
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 grid lg:grid-cols-[1fr_340px] gap-6">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Your quote</h1>
        <p className="text-muted mb-4">{s.profile.businessName ?? s.profile.businessType} · {s.profile.city} · every line checked against eligibility rules</p>

        <Card className="p-0 overflow-hidden mb-4">
          <ul className="divide-y divide-border">
            {q.lines.map((l) => (
              <li key={l.productId} className="p-4 flex gap-3 items-start">
                <div className="flex-1">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-sm text-muted">{l.description}</div>
                  <div className="text-sm mt-1">{l.reason}</div>
                  <div className="text-xs text-muted mt-1">{inr(l.unitPrice)} {l.unit} · installs in ~{l.installDays} day(s){l.setup ? ` · setup ${inr(l.setup)}` : ""}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button aria-label="decrease" className="w-7 h-7 rounded-lg border border-border" onClick={() => setQty(l.productId, l.qty - 1)}>−</button>
                  <span className="w-8 text-center">{l.qty}</span>
                  <button aria-label="increase" className="w-7 h-7 rounded-lg border border-border" onClick={() => setQty(l.productId, l.qty + 1)}>+</button>
                </div>
                <div className="w-24 text-right">
                  <div className="font-semibold">{inr(l.monthly)}</div>
                  <button className="text-xs text-muted underline" onClick={() => remove(l.productId)}>remove</button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        {err && <p className="text-sm text-bad mb-4">✕ Not allowed: {err}</p>}

        {upsell.length > 0 && (
          <Card className="mb-4">
            <h2 className="font-semibold mb-2">Recommended add-ons <span className="text-xs font-normal text-muted">(optional, off by default)</span></h2>
            {upsell.map((u) => (
              <label key={u.productId} className="flex items-start gap-3 py-2">
                <input type="checkbox" className="mt-1" checked={inBundle.has(u.productId)} onChange={(e) => (e.target.checked ? add(u.productId, u.qty, u.reason) : remove(u.productId))} />
                <span className="flex-1"><span className="font-medium">{u.name}</span><br /><span className="text-sm text-muted">{u.reason}</span></span>
                <span className="text-sm">+{inr(u.monthly)}</span>
              </label>
            ))}
          </Card>
        )}

        <Card className="mb-4">
          <h2 className="font-semibold mb-2">Add another product</h2>
          <div className="flex gap-2">
            <select value={adding} onChange={(e) => setAdding(e.target.value)} className="flex-1 border border-border rounded-xl px-3 py-2 bg-surface">
              <option value="">Choose…</option>
              {catalogue.filter((c) => !inBundle.has(c.id)).map((c) => (
                <option key={c.id} value={c.id}>{c.category} · {c.name}</option>
              ))}
            </select>
            <Button variant="outline" disabled={!adding} onClick={() => { add(adding); setAdding(""); }}>Add</Button>
          </div>
          <p className="text-xs text-muted mt-2">If a product isn&apos;t allowed for your business (city, size, GSTIN, or a missing base connection), we&apos;ll tell you why.</p>
        </Card>
      </div>

      <aside className="space-y-4">
        <Card className="lg:sticky lg:top-20">
          <div className="flex gap-2 mb-3">
            {[12, 24].map((m) => (
              <button
                key={m}
                type="button"
                disabled={m < q.minContractMonths}
                title={m < q.minContractMonths ? `This bundle requires at least a ${q.minContractMonths}-month contract` : undefined}
                onClick={() => patch({ contractMonths: m })}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm ${q.contractMonths === m ? "border-brand bg-brand-soft text-brand font-medium" : "border-border"} ${m < q.minContractMonths ? "cursor-not-allowed opacity-45" : "hover:border-brand"}`}
              >
                {m} months{m === 24 ? " (5% less)" : ""}
              </button>
            ))}
          </div>
          {q.minContractMonths > 12 && <p className="text-xs text-muted mb-3">12 months isn&apos;t available for this bundle; one or more products require a {q.minContractMonths}-month minimum.</p>}
          <dl className="text-sm space-y-1">
            <div className="flex justify-between"><dt className="text-muted">Products</dt><dd>{inr(q.subtotal)}</dd></div>
            {q.discounts.map((d) => (
              <div key={d.label} className="flex justify-between text-good"><dt>{d.label}</dt><dd>−{inr(d.amount)}</dd></div>
            ))}
            {q.setupSpread && <div className="flex justify-between"><dt className="text-muted">Setup spread over 12 months</dt><dd>+{inr(Math.ceil(q.setupTotal / 12))}</dd></div>}
          </dl>
          <div className="border-t border-border mt-3 pt-3">
            <div className="text-muted text-sm">One monthly price</div>
            <div className="text-4xl font-bold">{inr(q.monthlyWithSetup)}<span className="text-base font-normal text-muted">{t(lang, "perMonth")}</span></div>
            <div className="text-sm text-muted">incl. all products · one bill · one support number</div>
            {q.setupTotal > 0 && (
              <label className="flex items-center gap-2 text-sm mt-2">
                <input type="checkbox" checked={!!s.setupSpread} onChange={(e) => patch({ setupSpread: e.target.checked })} />
                {q.setupSpread ? "Setup fee spread monthly" : `Pay ${inr(q.setupTotal)} setup once, or spread it`}
              </label>
            )}
            <div className="text-sm mt-2">Live in about <b>{q.etaDays}</b> day(s)</div>
            {q.floorApplied && <div className="text-xs text-muted">Price floor applied (catalogue minimum)</div>}
          </div>
          {pendingDiscount && <div className="mt-3 text-sm bg-brand-soft text-brand rounded-xl p-2">! Special price pending manager approval — this quote is held until {new Date(pendingDiscount.holdUntil).toLocaleString("en-IN")}</div>}
          {q.approvedDiscountPct > 0 && <Badge tone="good">✓ Special price approved</Badge>}
          <Link href="/kyc"><Button size="lg" className="w-full mt-4">{t(lang, "continueKyc")} →</Button></Link>
          <button className="w-full text-sm text-muted underline mt-3" onClick={async () => { setShowCheaper(true); await patch({ priceObjection: true }); }}>Too expensive? See cheaper options</button>
        </Card>

        {showCheaper && (
          <Card>
            <h3 className="font-semibold mb-2">Ways to pay less</h3>
            <ul className="space-y-2">
              {cheaper.map((c) => (
                <li key={c.label} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{c.label}</span>
                  <span className="font-medium">{inr(c.monthly)}</span>
                  <Button size="sm" variant="outline" onClick={async () => { await patch({ bundle: c.items, ...(c.contractMonths ? { contractMonths: c.contractMonths } : {}) }); setShowCheaper(false); }}>Use</Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </aside>
    </div>
  );
}
