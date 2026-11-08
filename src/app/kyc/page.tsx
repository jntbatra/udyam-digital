"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { hasConsent, useSession, type SessionPayload } from "@/lib/useSession";
import { t } from "@/lib/i18n";
import { Badge, Button, Card } from "@/components/ui";
import { Arrow, Box, Check, Lock, Pen } from "@/components/icons";

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
  const [sample, setSample] = useState("K01");

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
  const passes = checks.filter((c) => c.status !== "fail");
  const docsDone = DOCS.filter((d) => s.kyc.source[d.type]).length;
  const steps = [
    { label: "Consent", done: true },
    { label: "GSTIN", done: !!s.kyc.gstin },
    { label: "Documents", done: docsDone === DOCS.length },
    { label: "Verified", done: s.kyc.verified },
    { label: "e-Sign", done: !!s.kyc.esigned },
  ];
  const current = steps.findIndex((x) => !x.done);
  const srcLabel = (src: string) => (src === "digilocker" ? "Fetched from DigiLocker" : src === "registry" ? "Matched in registry" : "Uploaded and read");
  const pct = checks.length ? Math.round((passes.length / checks.length) * 100) : 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-brand">Smart KYC</p>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Verify your business</h1>
        <p className="text-muted mt-1 text-sm">About 3 minutes. We fetch what we can, you add only what&apos;s missing.</p>
        <ol className="mt-5 flex items-center gap-2 overflow-x-auto pb-1">
          {steps.map((st, i) => (
            <li key={st.label} className="flex items-center gap-2 shrink-0">
              <span className={`grid place-items-center size-7 rounded-full text-xs font-semibold ${st.done ? "bg-brand text-white" : i === current ? "border-2 border-brand text-brand bg-white" : "bg-black/[0.05] text-muted"}`}>
                {st.done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={`text-sm ${i === current ? "font-semibold" : st.done ? "" : "text-muted"}`}>{st.label}</span>
              {i < steps.length - 1 && <span className={`w-8 h-px ${st.done ? "bg-brand" : "bg-black/10"}`} />}
            </li>
          ))}
        </ol>
      </header>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="space-y-5">
          <Card>
            <div className="flex items-start gap-3 mb-4">
              <span className="grid place-items-center size-9 rounded-2xl bg-brand-soft text-brand font-semibold text-sm">1</span>
              <div>
                <h2 className="font-semibold">Business GSTIN</h2>
                <p className="text-sm text-muted">We check it against the GST registry in seconds.</p>
              </div>
              {s.kyc.gstin && <span className="ml-auto"><Badge tone="good"><Check className="size-3" /> Added</Badge></span>}
            </div>
            <div className="flex gap-2">
              <input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder={s.kyc.gstin || "15-character GSTIN, e.g. 27ABCDE1234F1Z5"} className="flex-1 h-11 rounded-2xl border border-black/10 bg-white/80 px-4 font-mono tracking-wider text-sm focus:outline-none focus:ring-2 focus:ring-brand/30" maxLength={15} />
              <Button className="h-11" disabled={gstin.length !== 15 || !!busy} onClick={() => call("gst", () => api("/api/kyc/gstin", { method: "POST", json: { sessionId: id, gstin } }))}>
                {busy === "gst" ? "Checking…" : "Verify"}
              </Button>
            </div>
            <p className="text-xs text-muted mt-2">{gstin ? `${gstin.length}/15` : s.kyc.gstin ? "Checked against the GST registry. Type a new one to change it." : "No GSTIN? You can still connect on a non-GST plan."}</p>
            {registry && (
              <dl className="mt-4 rounded-2xl bg-black/[0.03] p-4 grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div><dt className="text-xs text-muted">Status</dt><dd className="font-medium mt-0.5">{registry.status === "Active" ? <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-foreground" />Active</span> : <span className="text-brand inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-brand" />{registry.status}</span>}</dd></div>
                <div><dt className="text-xs text-muted">Legal name</dt><dd className="font-medium mt-0.5">{registry.legal_name}</dd></div>
                <div><dt className="text-xs text-muted">Trade name</dt><dd className="mt-0.5">{registry.trade_name}</dd></div>
                <div><dt className="text-xs text-muted">Address</dt><dd className="mt-0.5">{registry.address}</dd></div>
              </dl>
            )}
          </Card>

          <Card>
            <div className="flex items-start gap-3 mb-4">
              <span className="grid place-items-center size-9 rounded-2xl bg-brand-soft text-brand font-semibold text-sm">2</span>
              <div>
                <h2 className="font-semibold">Documents</h2>
                <p className="text-sm text-muted">DigiLocker first. Upload only if it isn&apos;t there.</p>
              </div>
              <span className="ml-auto text-sm text-muted">{docsDone}/{DOCS.length}</span>
            </div>
            <div className="h-1.5 rounded-full bg-black/[0.06] mb-4 overflow-hidden"><div className="h-full bg-brand transition-all" style={{ width: `${(docsDone / DOCS.length) * 100}%` }} /></div>
            <div className="grid sm:grid-cols-2 gap-3">
              {DOCS.map((d) => {
                const src = s.kyc.source[d.type];
                const working = busy === `up-${d.type}` || busy === `dl-${d.type}`;
                return (
                  <div key={d.type} className={`rounded-2xl border p-4 flex flex-col gap-3 transition-colors ${src ? "border-black/10 bg-white/60" : "border-dashed border-black/15 bg-white/30"}`}>
                    <div className="flex items-start gap-3">
                      <span className={`grid place-items-center size-9 rounded-xl shrink-0 ${src ? "bg-foreground text-white" : "bg-black/[0.05] text-muted"}`}>
                        {src ? <Check className="size-4" /> : <Box className="size-4" />}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium leading-snug">{d.label}</div>
                        <div className="text-xs text-muted mt-0.5">{working ? "Reading…" : src ? srcLabel(src) : "Not added yet"}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-auto">
                      {!src && d.digilocker && (
                        <Button size="sm" disabled={!s.kyc.gstin || !!busy} onClick={() => call(`dl-${d.type}`, () => api("/api/kyc/digilocker", { method: "POST", json: { sessionId: id, doc: d.type } }))}>
                          <Lock className="size-3.5" /> DigiLocker
                        </Button>
                      )}
                      <label className={`text-sm cursor-pointer ${!src && !d.digilocker ? "inline-flex items-center h-8 px-3.5 rounded-full bg-brand text-white font-medium" : "text-muted underline underline-offset-4 hover:text-foreground"} ${busy ? "opacity-40 pointer-events-none" : ""}`}>
                        {src ? "Replace" : d.digilocker ? "Upload instead" : "Upload photo"}
                        <input type="file" accept="image/png,image/jpeg" className="hidden" disabled={!!busy} onChange={(e) => e.target.files?.[0] && upload(d.type, e.target.files[0])} />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            {!s.kyc.gstin && <p className="text-xs text-muted mt-3">Add your GSTIN first to unlock DigiLocker.</p>}
            <details className="mt-4 group">
              <summary className="text-sm text-muted cursor-pointer select-none hover:text-foreground">Know your Udyam number? Type it instead</summary>
              <div className="mt-3 flex gap-2">
                <input value={udyam} onChange={(e) => setUdyam(e.target.value.toUpperCase())} placeholder="UDYAM-XX-00-0000000" className="flex-1 h-10 rounded-2xl border border-black/10 bg-white/80 px-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand/30" />
                <Button variant="outline" disabled={!udyam || !!busy} onClick={() => call("ud", () => api("/api/kyc/udyam", { method: "POST", json: { sessionId: id, udyam } }))}>Look up</Button>
              </div>
            </details>
            <p className="text-xs text-muted mt-4 flex items-center gap-1.5"><Lock className="size-3" /> Photos are read in memory and not stored. DigiLocker is simulated in this prototype.</p>
          </Card>

          {msg && <div className="rounded-2xl bg-brand-soft text-brand text-sm px-4 py-3">{msg}</div>}

          <details className="rounded-3xl border border-dashed border-black/10 px-5 py-3">
            <summary className="text-sm text-muted cursor-pointer select-none">Demo: load a specimen applicant</summary>
            <div className="mt-3 flex items-center gap-2">
              <select value={sample} onChange={(e) => setSample(e.target.value)} className="h-9 rounded-full border border-black/10 bg-white/80 px-3 text-sm">
                {SAMPLES.map((k) => <option key={k}>{k}</option>)}
              </select>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => loadSample(sample)}>{busy === "sample" ? "Loading…" : "Load documents"}</Button>
            </div>
          </details>
        </div>

        <aside className="lg:sticky lg:top-20">
          <Card>
            <div className="flex items-center gap-4">
              <div className="relative size-16 shrink-0">
                <svg viewBox="0 0 36 36" className="size-16 -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(0,0,0,.07)" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${pct * 0.974} 100`} />
                </svg>
                <span className="absolute inset-0 grid place-items-center text-sm font-semibold">{checks.length ? `${pct}%` : "–"}</span>
              </div>
              <div>
                <h2 className="font-semibold">{s.kyc.verified ? "Business verified" : checks.length ? `${fails.length} thing${fails.length === 1 ? "" : "s"} to fix` : "Verification"}</h2>
                <p className="text-sm text-muted">{checks.length ? `${passes.length} of ${checks.length} checks passed` : "Starts when you add your GSTIN"}</p>
              </div>
            </div>

            {fails.length > 0 && (
              <ul className="mt-5 space-y-2.5">
                {fails.map((c) => (
                  <li key={c.id} className="rounded-2xl bg-brand-soft/60 p-3">
                    <div className="text-sm font-medium flex gap-2"><span className="text-brand">✕</span>{c.label}</div>
                    <div className="text-xs text-muted mt-1 ml-5">{c.detail}</div>
                    {c.fix && <div className="text-xs mt-1.5 ml-5 font-medium">{c.fix}</div>}
                  </li>
                ))}
              </ul>
            )}
            {passes.length > 0 && (
              <details className="mt-4" open={fails.length === 0}>
                <summary className="text-sm text-muted cursor-pointer select-none">{passes.length} check{passes.length === 1 ? "" : "s"} passed</summary>
                <ul className="mt-2 space-y-1.5">
                  {passes.map((c) => (
                    <li key={c.id} className="text-sm flex gap-2"><Check className="size-4 shrink-0 mt-0.5" /><span>{c.label}<span className="block text-xs text-muted">{c.detail}</span></span></li>
                  ))}
                </ul>
              </details>
            )}

            {s.kyc.verified && !s.kyc.esigned && (
              <Button size="lg" className="w-full mt-5" disabled={!!busy} onClick={() => call("esign", () => api("/api/kyc/esign", { method: "POST", json: { sessionId: id } }))}>
                <Pen className="size-4" /> e-Sign with Aadhaar
              </Button>
            )}
            {s.kyc.esigned && (
              <Button size="lg" className="w-full mt-5" disabled={!!busy || !data.quote.lines.length} onClick={async () => {
                setBusy("pay");
                try {
                  const o = await api<{ id: string }>("/api/order", { method: "POST", json: { sessionId: id } });
                  router.push(`/track?order=${o.id}`);
                } catch (e) {
                  setMsg((e as Error).message);
                  setBusy(null);
                }
              }}>Pay first month via UPI <Arrow className="size-4" /></Button>
            )}
            {(s.kyc.verified || s.kyc.esigned) && <p className="text-xs text-muted text-center mt-2">e-Sign and UPI are simulated in this prototype.</p>}

            {fails.length > 0 && !info && (
              <Button variant="outline" className="w-full mt-4" onClick={async () => {
                await api("/api/consent", { method: "POST", json: { sessionId: id, purpose: "expert_handoff", granted: true } });
                await api("/api/expert", { method: "POST", json: { sessionId: id, reason: "kyc_failed", note: fails.map((f) => f.label).join("; ") } });
                setMsg(null);
                await refresh();
                setInfo("A Local Accel Expert will call you within 15 minutes to sort out the documents.");
              }}>Get help from a local expert</Button>
            )}
            {info && <div className="mt-4 rounded-2xl bg-black/[0.04] p-3 text-sm flex gap-2"><Check className="size-4 shrink-0 mt-0.5" />{info}</div>}
          </Card>
        </aside>
      </div>
    </div>
  );
}
