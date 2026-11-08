"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, clearSessionId } from "@/lib/client";
import { hasConsent, useSession } from "@/lib/useSession";
import { Badge, Button, Card, Section, inr } from "@/components/ui";

type Order = { id: string; stage: string; tickets: { id: string; text: string; status: string; at: string }[]; quote: { monthlyWithSetup: number } };
const PURPOSES = [
  ["kyc", "KYC verification", "Needed to activate your connection"],
  ["voice", "Voice processing", "Lets the voice advisor hear you"],
  ["expert_handoff", "Share with a Local Udyam Digital Expert", "Name, business, area and draft plan only"],
  ["marketing", "Offers on WhatsApp", "Optional"],
] as const;

export default function AccountPage() {
  const { id, data, refresh, patch } = useSession();
  const [order, setOrder] = useState<Order | null>(null);
  const [ticket, setTicket] = useState("");
  const [deleted, setDeleted] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const oid = data?.session.orderId;

  useEffect(() => {
    if (oid) api<{ order: Order }>(`/api/order/${oid}`).then((r) => setOrder(r.order)).catch(() => {});
  }, [oid]);

  if (deleted) return <div className="max-w-3xl mx-auto p-6"><Card>✓ Your data has been deleted. <Link className="underline" href="/">Start again</Link></Card></div>;
  if (!data || !id) return <div className="max-w-3xl mx-auto p-6 text-muted">Loading…</div>;
  const s = data.session;
  const q = data.quote;
  const live = order && (order.stage === "live" || order.stage === "first_bill");

  async function setConsent(purpose: string, granted: boolean) {
    await api("/api/consent", { method: "POST", json: { sessionId: id, purpose, granted } });
    await refresh();
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold mb-4">My account</h1>
      <Section title="My plan" right={order ? <Link href={`/track?order=${order.id}`} className="text-sm underline">Track order</Link> : <Link href="/quote" className="text-sm underline">Open quote</Link>}>
        <Card>
          {q.lines.length === 0 ? <p className="text-muted text-sm">No plan yet.</p> : (
            <>
              <ul className="text-sm divide-y divide-border">
                {q.lines.map((l) => (
                  <li key={l.productId} className="py-2 flex justify-between gap-2">
                    <span>{l.name}{l.qty > 1 ? ` × ${l.qty}` : ""} {live && <Badge tone="good">✓ active</Badge>}</span>
                    <span className="flex items-center gap-2">{inr(l.monthly)}
                      {live && <button className="text-xs underline text-muted" onClick={() => patch({ bundle: s.bundle.filter((b) => b.productId !== l.productId) }).catch((e) => setErr(e.message))}>remove</button>}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between border-t border-border pt-2 mt-1 font-semibold"><span>One bill</span><span>{inr(q.monthlyWithSetup)}/month</span></div>
            </>
          )}
          {err && <p className="text-sm text-bad mt-2">✕ {err}</p>}
        </Card>
      </Section>

      {live && data.upsell.length > 0 && (
        <Section title="Suggested for you">
          <Card>
            {data.upsell.map((u) => (
              <div key={u.productId} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1"><b>{u.name}</b><br /><span className="text-muted">{u.reason}</span></span>
                <span>+{inr(u.monthly)}</span>
                <Button size="sm" variant="outline" onClick={() => patch({ bundle: [...s.bundle, { productId: u.productId, qty: u.qty, reason: u.reason }] }).catch((e) => setErr(e.message))}>Add</Button>
              </div>
            ))}
          </Card>
        </Section>
      )}

      {order && (
        <Section title="Support">
          <Card>
            <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!ticket.trim()) return; const r = await api<{ order: Order }>(`/api/order/${order.id}`, { method: "POST", json: { action: "ticket", text: ticket } }); setOrder(r.order); setTicket(""); }}>
              <input value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="Describe the issue" className="flex-1 border border-border rounded-xl px-3 py-2 bg-surface" />
              <Button>Raise ticket</Button>
            </form>
            <ul className="mt-3 text-sm space-y-1">
              {order.tickets.map((t) => <li key={t.id}><Badge tone={t.status === "open" ? "warn" : "good"}>{t.status === "open" ? "! open" : "✓ closed"}</Badge> {t.text}</li>)}
            </ul>
          </Card>
        </Section>
      )}

      <Section title="Privacy center">
        <Card>
          <ul className="divide-y divide-border">
            {PURPOSES.map(([p, label, desc]) => {
              const on = hasConsent(s, p);
              return (
                <li key={p} className="py-2 flex items-center gap-3 text-sm">
                  <span className="flex-1"><b>{label}</b><br /><span className="text-muted">{desc}</span></span>
                  <Badge tone={on ? "good" : "neutral"}>{on ? "✓ allowed" : "— not allowed"}</Badge>
                  <Button size="sm" variant="outline" onClick={() => setConsent(p, !on)}>{on ? "Withdraw" : "Allow"}</Button>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 text-sm">
            <div className="font-medium mb-1">What we hold</div>
            <ul className="text-muted list-disc pl-5">
              <li>Profile: business type, city, size, needs</li>
              <li>GSTIN {s.kyc.gstin || "—"} (masked) · Udyam {s.kyc.udyam || "—"}</li>
              <li>KYC: extracted fields only from {Object.keys(s.kyc.extracted).length} document(s); images are not stored</li>
              <li>Conversation transcript: {s.messages.length} messages (kept 30 days)</li>
              <li>Consent log: {s.consents.length} entries (kept as proof)</li>
            </ul>
          </div>
          <div className="flex gap-2 mt-4 flex-wrap">
            <a href={`/api/privacy/${id}`}><Button variant="outline">Download my data</Button></a>
            <Button variant="danger" onClick={async () => {
              if (!confirm("Delete all your data? This cannot be undone.")) return;
              await api(`/api/privacy/${id}`, { method: "DELETE" });
              clearSessionId();
              setDeleted(true);
            }}>Delete my data</Button>
          </div>
        </Card>
      </Section>
    </div>
  );
}
