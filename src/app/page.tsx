"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, setSessionId } from "@/lib/client";
import { Button } from "@/components/ui";
import { Arrow, Chat, Mic, Sim } from "@/components/icons";

const LANGS = ["Auto-detect", "English", "Hindi", "Tamil", "Telugu", "Bengali", "Marathi", "Gujarati", "Kannada", "Malayalam", "Punjabi", "Odia", "Assamese"];

const STEPS = [
  ["Talk", "Tell us about your business in your language. Two minutes, no visit."],
  ["See one price", "One monthly price. Add or remove anything, instantly."],
  ["Verify in minutes", "GSTIN and DigiLocker do the paperwork for you."],
  ["Track, don't chase", "Every step updates live and on WhatsApp."],
];

export default function Home() {
  const router = useRouter();
  const [lang, setLang] = useState("Auto-detect");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function start(mode: "chat" | "voice" | "sim") {
    setErr(null);
    if (phone && phone.replace(/\D/g, "").length !== 10) return setErr("Enter a 10-digit mobile number, or leave it empty.");
    setBusy(true);
    try {
      const s = await api<{ id: string }>("/api/session", { method: "POST", json: { phone: phone || undefined, language: lang === "Auto-detect" ? "English" : lang } });
      setSessionId(s.id);
      if (mode === "sim") await api(`/api/session/${s.id}`, { method: "PATCH", json: { profile: { simOnly: true } } });
      router.push(mode === "voice" ? "/advisor?voice=1" : "/advisor");
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 pt-14 pb-10 md:pt-24">
      <div className="grid md:grid-cols-[1.15fr_1fr] gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-medium text-brand bg-brand-soft rounded-full px-3 py-1 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-brand" /> For shops, clinics, offices and small units
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
            Your business,<br />connected <span className="text-brand">today.</span>
          </h1>
          <p className="mt-5 text-lg text-muted max-w-md">Internet, business SIMs, WhatsApp, CCTV and email. One plan, one bill, one number to call.</p>
          <div className="mt-10 grid sm:grid-cols-2 gap-x-8 gap-y-6 max-w-lg">
            {STEPS.map(([h, d], i) => (
              <div key={h}>
                <div className="text-xs text-muted tabular-nums mb-1">0{i + 1}</div>
                <div className="font-medium">{h}</div>
                <div className="text-sm text-muted">{d}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-[2rem] p-7">
          <div className="font-semibold tracking-tight text-lg">Start now</div>
          <p className="text-sm text-muted mb-6">Speak or type. We understand your language automatically.</p>

          <button disabled={busy} onClick={() => start("voice")} className="group w-full flex items-center gap-4 rounded-2xl bg-brand text-white p-4 text-left hover:bg-brand-dark transition-colors disabled:opacity-50">
            <span className="w-12 h-12 rounded-full bg-white/15 grid place-items-center"><Mic width={22} height={22} /></span>
            <span className="flex-1">
              <span className="block font-medium">Talk to an advisor</span>
              <span className="block text-sm text-white/75">Like a phone call · Hindi or English</span>
            </span>
            <Arrow className="opacity-70 group-hover:translate-x-0.5 transition-transform" />
          </button>

          <button disabled={busy} onClick={() => start("chat")} className="group mt-3 w-full flex items-center gap-4 rounded-2xl bg-white/70 border border-black/5 p-4 text-left hover:bg-white transition-colors disabled:opacity-50">
            <span className="w-12 h-12 rounded-full bg-black/[0.04] grid place-items-center"><Chat width={22} height={22} /></span>
            <span className="flex-1">
              <span className="block font-medium">Chat instead</span>
              <span className="block text-sm text-muted">11 Indian languages and English</span>
            </span>
            <Arrow className="text-muted group-hover:translate-x-0.5 transition-transform" />
          </button>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <label className="text-xs text-muted">
              Mobile (optional)
              <input inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98XXXXXXXX" className="mt-1 w-full h-10 rounded-xl bg-white/70 border border-black/10 px-3 text-sm text-foreground" />
            </label>
            <label className="text-xs text-muted">
              Language
              <select value={lang} onChange={(e) => setLang(e.target.value)} className="mt-1 w-full h-10 rounded-xl bg-white/70 border border-black/10 px-2 text-sm text-foreground">
                {LANGS.map((l) => <option key={l}>{l}</option>)}
              </select>
            </label>
          </div>
          <p className="text-xs text-muted mt-2">Your number keeps your plan saved across voice, chat and your local expert.</p>

          <Button variant="ghost" size="sm" className="mt-4 -ml-2" disabled={busy} onClick={() => start("sim")}>
            <Sim /> Only need SIM cards?
          </Button>
          {err && <p className="text-sm text-brand mt-2">{err}</p>}
        </div>
      </div>
    </div>
  );
}
