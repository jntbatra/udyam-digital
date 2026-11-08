"use client";
import { useCallback, useEffect, useState } from "react";
import { api, getSessionId } from "@/lib/client";
import { Badge, Button, Card, inr } from "@/components/ui";

type Order = {
  id: string; stage: string; dayOffset: number; etaDay: number; escalated?: boolean;
  history: { stage: string; at: string; note?: string }[];
  technician?: { name: string; slot: string };
  productStatus: Record<string, "pending" | "installed">;
  notifications: { at: string; text: string }[];
  tickets: { id: string; text: string; status: string; at: string }[];
  quote: { monthlyWithSetup: number; lines: { productId: string; name: string; qty: number; installDays: number }[] };
};
const STAGES = [
  ["placed", "Order placed"], ["paid", "Payment received"], ["kyc_verified", "KYC verified"], ["feasibility", "Site feasibility confirmed"],
  ["assigned", "Technician assigned"], ["installing", "Installation"], ["live", "Live"], ["first_bill", "First bill"],
] as const;

export default function TrackPage() {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [o, setO] = useState<Order | null>(null);
  const [eta, setEta] = useState<{ remaining: number; late: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("order");
    if (q) return setOrderId(q);
    const sid = getSessionId();
    if (sid) api<{ session: { orderId?: string } }>(`/api/session/${sid}`).then((r) => setOrderId(r.session.orderId ?? null)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      const r = await api<{ order: Order; eta: { remaining: number; late: boolean } }>(`/api/order/${orderId}`);
      setO(r.order);
      setEta(r.eta);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [orderId]);
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    const r = await api<{ order: Order; eta: { remaining: number; late: boolean } }>(`/api/order/${orderId}`, { method: "POST", json: { action, ...extra } });
    setO(r.order);
    setEta(r.eta);
  }

  if (!orderId) return <div className="max-w-3xl mx-auto p-6 text-muted">No order yet. Finish your quote and KYC first.</div>;
  if (!o) return <div className="max-w-3xl mx-auto p-6 text-muted">{err ?? "Loading order…"}</div>;
  const done = new Set(o.history.map((h) => h.stage));

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 grid lg:grid-cols-[1fr_340px] gap-6">
      <div>
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h1 className="text-2xl font-semibold">Order {o.id}</h1>
          {o.stage === "live" || o.stage === "first_bill" ? <Badge tone="good">✓ Live</Badge> : eta?.late ? <Badge tone="bad">! Delayed — escalated</Badge> : <Badge tone="brand">On track · {eta?.remaining} day(s) left</Badge>}
        </div>
        <p className="text-muted mb-4">No need to call — every step updates here and on WhatsApp.</p>
        <Card>
          <ol className="relative">
            {STAGES.map(([k, label], i) => {
              const h = o.history.find((x) => x.stage === k);
              const current = o.stage === k;
              return (
                <li key={k} className="flex gap-3 pb-5 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span className={`w-7 h-7 rounded-full grid place-items-center text-sm ${done.has(k) ? "bg-foreground text-white" : current ? "bg-brand text-white" : "bg-background border border-border text-muted"}`}>{done.has(k) ? "✓" : i + 1}</span>
                    {i < STAGES.length - 1 && <span className={`w-0.5 flex-1 mt-1 ${done.has(k) ? "bg-foreground" : "bg-border"}`} />}
                  </div>
                  <div className="pt-0.5">
                    <div className={`font-medium ${done.has(k) ? "" : "text-muted"}`}>{label}</div>
                    {h?.note && <div className="text-sm text-muted">{h.note}</div>}
                    {k === "installing" && done.has("assigned") && (
                      <ul className="mt-1 text-sm">
                        {o.quote.lines.map((l) => (
                          <li key={l.productId}>{o.productStatus[l.productId] === "installed" ? "✓" : "…"} {l.name}{l.qty > 1 ? ` × ${l.qty}` : ""} <span className="text-muted">(~{l.installDays}d)</span></li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
        {o.technician && (
          <Card className="mt-4 flex flex-wrap items-center gap-3">
            <div><b>{o.technician.name}</b> · {o.technician.slot}</div>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => act("reschedule", { slot: "Tomorrow, 16:00–18:00" })}>Reschedule</Button>
          </Card>
        )}
        <Card className="mt-4">
          <div className="text-sm text-muted mb-2">Demo clock (day {o.dayOffset}, expected live by day {o.etaDay})</div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={() => act("next_day")}>Simulate next day →</Button>
            <Button size="sm" variant="outline" onClick={() => act("delay_day")}>Simulate a delayed day</Button>
          </div>
        </Card>
      </div>
      <aside className="space-y-4">
        <Card>
          <h2 className="font-semibold mb-2">WhatsApp updates</h2>
          <ul className="space-y-2 max-h-96 overflow-y-auto">
            {[...o.notifications].reverse().map((n, i) => (
              <li key={i} className="text-sm bg-white/70 border border-black/5 rounded-xl px-3 py-2">{n.text}<div className="text-[10px] text-muted">{new Date(n.at).toLocaleTimeString("en-IN")}</div></li>
            ))}
          </ul>
        </Card>
        <Card>
          <div className="text-sm text-muted">One combined bill</div>
          <div className="text-2xl font-bold">{inr(o.quote.monthlyWithSetup)}/month</div>
        </Card>
      </aside>
    </div>
  );
}
