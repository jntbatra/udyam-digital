"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { hasConsent, useSession, type SessionPayload } from "@/lib/useSession";
import { t } from "@/lib/i18n";
import { Badge, Button, Card, StatusPill } from "@/components/ui";

type DocType = "gst_certificate" | "udyam_certificate" | "signatory_id" | "address_proof";
const DOCS: { type: DocType; label: string; digilocker: boolean }[] = [
  { type: "gst_certificate", label: "GST registration certificate", digilocker: true },
  { type: "udyam_certificate", label: "Udyam registration certificate", digilocker: true },
  { type: "signatory_id", label: "Authorised signatory ID", digilocker: true },
  { type: "address_proof", label: "Address proof (utility bill ≤ 90 days)", digilocker: false },
];
const SAMPLES = Array.from({ length: 12 }, (_, i) => `K${String(i + 1).padStart(2, "0")}`);

export default function KycPage() {
  const router = useRouter();
  const { id, data, refresh } = useSession();
  const [gstin, setGstin] = useState("");
  const [udyam, setUdyam] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [marketing, setMarketing] = useState(false);
  const [registry, setRegistry] = useState<Record<string, string> | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!data || !id) return <div className="max-w-3xl mx-auto p-6 text-muted">Loading…</div>;
  const s = data.session;
  const lang = s.language;
  const consented = hasConsent(s, "kyc");

  async function call(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setMsg(null);
    try {
      const r = (await fn()) as Partial<SessionPayload> & { registry?: Record<string, string> | null };
      if (r?.registry !== undefined) setRegistry(r.registry);
      await refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function giveConsent() {
    await api("/api/consent", { method: "POST", json: { sessionId: id, purpose: "kyc", granted: true } });
    if (marketing) await api("/api/consent", { method: "POST", json: { sessionId: id, purpose: "marketing", granted: true } });
    await refresh();
  }

  async function upload(type: DocType, file: File) {
    const fd = new FormData();
    fd.append("sessionId", id!);
    fd.append("docType", type);
    fd.append("file", file);
    await call(`up-${type}`, () => fetch("/api/kyc/upload", { method: "POST", body: fd }).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.reason || j.error);
      return j;
    }));
  }

  async function loadSample(k: string) {
    setBusy("sample");
    setMsg(null);
    try {
      for (const d of DOCS) {
        const res = await fetch(`/samples/${k}_${d.type}.png`);
        if (!res.ok) continue; // e.g. K05 has no Udyam certificate
        const fd = new FormData();
        fd.append("sessionId", id!);
        fd.append("docType", d.type);
        fd.append("file", new File([await res.blob()], `${k}_${d.type}.png`, { type: "image/png" }));
        const r = await fetch("/api/kyc/upload", { method: "POST", body: fd });
        if (!r.ok) setMsg(`${d.label}: ${(await r.json()).reason ?? "failed"}`);
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  if (!consented)
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Card>
          <h1 className="text-xl font-semibold mb-3">{t(lang, "consentTitle")}</h1>
          <p className="text-sm mb-4">{t(lang, "consentBody")}</p>
          <table className="text-sm w-full mb-4">
            <tbody className="[&_td]:py-1 [&_td]:align-top">
              <tr><td className="text-muted pr-3">What</td><td>GSTIN, Udyam number, address proof, authorised signatory ID</td></tr>
              <tr><td className="text-muted pr-3">Why</td><td>Verify your business for this connection (KYC) — nothing else</td></tr>
              <tr><td className="text-muted pr-3">How</td><td>Registry + DigiLocker lookup first; you upload only what is missing</td></tr>
              <tr><td className="text-muted pr-3">Kept</td><td>Images deleted right after reading; extracted details kept for the contract period</td></tr>
              <tr><td className="text-muted pr-3">Your rights</td><td>View, withdraw consent, download or delete your data in My account</td></tr>
            </tbody>
          </table>
          <label className="flex items-center gap-2 text-sm mb-4"><input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} /> {t(lang, "marketing")}</label>
          <Button size="lg" className="w-full" onClick={giveConsent}>{t(lang, "consentAgree")}</Button>
          <p className="text-xs text-muted mt-3">Notice version 2026-11-v1 · Grievance officer: privacy@accel.example</p>
        </Card>
      </div>
    );

  const checks = s.kyc.checks;
  const fails = checks.filter((c) => c.status === "fail");
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 grid lg:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Smart KYC</h1>
        <Card>
          <h2 className="font-semibold mb-2">1 · GSTIN lookup</h2>
          <div className="flex gap-2">
            <input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder={s.kyc.gstin || "15-character GSTIN"} className="flex-1 border border-border rounded-xl px-3 py-2 font-mono bg-surface" maxLength={15} />
            <Button disabled={gstin.length !== 15 || !!busy} onClick={() => call("gst", () => api("/api/kyc/gstin", { method: "POST", json: { sessionId: id, gstin } }))}>Verify</Button>
          </div>
          {registry && (
            <div className="mt-3 text-sm grid grid-cols-[120px_1fr] gap-y-1">
              <span className="text-muted">Status</span><span>{registry.status === "Active" ? <Badge tone="good">✓ Active</Badge> : <Badge tone="bad">✕ {registry.status}</Badge>}</span>
              <span className="text-muted">Legal name</span><span>{registry.legal_name}</span>
              <span className="text-muted">Trade name</span><span>{registry.trade_name}</span>
              <span className="text-muted">Address</span><span>{registry.address}</span>
            </div>
          )}
          <p className="text-xs text-muted mt-2">No GSTIN? You can still connect with a non-GST plan; GST registration is free.</p>
        </Card>

        <Card>
          <h2 className="font-semibold mb-2">2 · Documents</h2>
          <ul className="divide-y divide-border">
            {DOCS.map((d) => {
              const src = s.kyc.source[d.type];
              return (
                <li key={d.type} className="py-3 flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-48">
                    <div className="font-medium text-sm">{d.label}</div>
                    {src ? <Badge tone="good">✓ {src === "digilocker" ? "From DigiLocker" : src === "registry" ? "From registry" : "Uploaded & read"}</Badge> : <span className="text-xs text-muted">Not added</span>}
                  </div>
                  {d.digilocker && (
                    <Button size="sm" variant="outline" disabled={!s.kyc.gstin || !!busy} onClick={() => call(`dl-${d.type}`, () => api("/api/kyc/digilocker", { method: "POST", json: { sessionId: id, doc: d.type } }))}>DigiLocker</Button>
                  )}
                  <label className={`text-sm px-3 py-1.5 rounded-xl border border-border cursor-pointer ${busy ? "opacity-40" : ""}`}>
                    {busy === `up-${d.type}` ? "Reading…" : "Upload"}
                    <input type="file" accept="image/png,image/jpeg" className="hidden" disabled={!!busy} onChange={(e) => e.target.files?.[0] && upload(d.type, e.target.files[0])} />
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex gap-2 items-center">
            <input value={udyam} onChange={(e) => setUdyam(e.target.value.toUpperCase())} placeholder="Or type Udyam number UDYAM-XX-00-0000000" className="flex-1 border border-border rounded-xl px-3 py-1.5 text-sm font-mono bg-surface" />
            <Button size="sm" variant="outline" disabled={!udyam || !!busy} onClick={() => call("ud", () => api("/api/kyc/udyam", { method: "POST", json: { sessionId: id, udyam } }))}>Look up</Button>
          </div>
          <p className="text-xs text-muted mt-3">DigiLocker / Entity Locker is simulated in this prototype. Uploads are read by AWS Textract in memory; the image is not stored.</p>
        </Card>

        <Card>
          <h2 className="font-semibold mb-2">Demo: load a specimen applicant</h2>
          <div className="flex flex-wrap gap-1">
            {SAMPLES.map((k) => (
              <Button key={k} size="sm" variant="outline" disabled={!!busy} onClick={() => loadSample(k)}>{k}</Button>
            ))}
          </div>
          <p className="text-xs text-muted mt-2">Uploads the hackathon specimen documents for that applicant (OCR results cached locally).</p>
        </Card>
        {msg && <p className="text-sm text-bad">✕ {msg}</p>}
        {busy && <p className="text-sm text-muted">Working…</p>}
      </div>

      <aside className="space-y-4">
        <Card className="lg:sticky lg:top-20">
          <div className="flex items-center mb-2">
            <h2 className="font-semibold">Verification</h2>
            <span className="ml-auto">{s.kyc.verified ? <Badge tone="good">✓ Verified</Badge> : checks.length ? <Badge tone="bad">✕ {fails.length} issue(s)</Badge> : <Badge>Pending</Badge>}</span>
          </div>
          {checks.length === 0 && <p className="text-sm text-muted">Start with your GSTIN.</p>}
          <ul className="space-y-2">
            {checks.map((c) => (
              <li key={c.id} className="text-sm">
                <div className="flex gap-2 items-start"><StatusPill status={c.status} /><span className="font-medium">{c.label}</span></div>
                <div className="text-xs text-muted ml-1 mt-0.5">{c.detail}</div>
                {c.fix && c.status !== "pass" && <div className="text-xs ml-1">→ {c.fix}</div>}
              </li>
            ))}
          </ul>
          {s.kyc.verified && !s.kyc.esigned && (
            <Button className="w-full mt-4" disabled={!!busy} onClick={() => call("esign", () => api("/api/kyc/esign", { method: "POST", json: { sessionId: id } }))}>e-Sign agreement (Aadhaar eSign — simulated)</Button>
          )}
          {s.kyc.esigned && (
            <Button size="lg" className="w-full mt-4" disabled={!!busy || !data.quote.lines.length} onClick={async () => {
              setBusy("pay");
              try {
                const o = await api<{ id: string }>("/api/order", { method: "POST", json: { sessionId: id } });
                router.push(`/track?order=${o.id}`);
              } catch (e) {
                setMsg((e as Error).message);
                setBusy(null);
              }
            }}>Pay first month via UPI (simulated) →</Button>
          )}
          {fails.length > 0 && (
            <Button variant="outline" className="w-full mt-3" onClick={async () => {
              await api("/api/consent", { method: "POST", json: { sessionId: id, purpose: "expert_handoff", granted: true } });
              await api("/api/expert", { method: "POST", json: { sessionId: id, reason: "kyc_failed", note: fails.map((f) => f.label).join("; ") } });
              setMsg(null);
              await refresh();
              setInfo("A Local Accel Expert will call you within 15 minutes to sort out the documents.");
            }}>Get help from a local expert</Button>
          )}
          {info && <p className="text-sm text-good mt-2">✓ {info}</p>}
        </Card>
      </aside>
    </div>
  );
}
