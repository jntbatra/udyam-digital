"use client";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui";
import { CASE_LABEL, ErrorNote, type DiscountRequest } from "./shared";

type CaseType = DiscountRequest["caseType"];

/** Expert-side "Request special price". Server enforces the three allowed cases + 1–15 %. */
export function DiscountForm({ sessionId, expertId, onDone }: { sessionId: string; expertId: string; onDone?: () => void }) {
  const [caseType, setCaseType] = useState<CaseType>("competitor_match");
  const [proof, setProof] = useState("");
  const [pctVal, setPct] = useState(5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const r = await api<DiscountRequest>("/api/discounts", { method: "POST", json: { sessionId, expertId, caseType, proof, pct: pctVal } });
      setOk(`Sent to manager (request ${r.id}). Quote held until ${new Date(r.holdUntil).toLocaleString("en-IN")}.`);
      setProof("");
      onDone?.();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 text-sm">
      <div className="grid sm:grid-cols-[1fr_auto] gap-2">
        <label className="block">
          <span className="text-xs text-muted">Case type</span>
          <select value={caseType} onChange={(e) => setCaseType(e.target.value as CaseType)} className="mt-1 w-full border border-border rounded-lg px-2 py-1.5 bg-surface">
            {(Object.keys(CASE_LABEL) as CaseType[]).map((k) => (
              <option key={k} value={k}>{CASE_LABEL[k]}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-muted">Discount % (1–15)</span>
          <input type="number" min={1} max={15} step={1} value={pctVal} onChange={(e) => setPct(Number(e.target.value))} className="mt-1 w-full sm:w-24 border border-border rounded-lg px-2 py-1.5 bg-surface" />
        </label>
      </div>
      <label className="block">
        <span className="text-xs text-muted">Proof / justification {caseType === "competitor_match" ? "(required: competitor name, plan, price)" : "(optional)"}</span>
        <textarea value={proof} onChange={(e) => setProof(e.target.value)} rows={2} className="mt-1 w-full border border-border rounded-lg px-2 py-1.5 bg-surface" placeholder="e.g. Competitor X quoted ₹2,400/month for 100 Mbps, bill photo shared" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={busy}>{busy ? "Sending…" : "Request special price"}</Button>
        <span className="text-xs text-muted">Discounts need manager approval (SLA 2 h, quote held 48 h).</span>
      </div>
      <ErrorNote text={err} />
      {ok && <p className="text-sm text-good" role="status"><span aria-hidden>✓ </span>{ok}</p>}
    </form>
  );
}
