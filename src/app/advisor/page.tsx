"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { useSession } from "@/lib/useSession";
import { t } from "@/lib/i18n";
import { Button, Card, inr } from "@/components/ui";
import { Arrow, Chat, Mic } from "@/components/icons";
import { VoiceMode } from "@/components/VoiceMode";

type ChatResp = { reply: string; options?: string[]; mode: "llm" | "guided"; events?: { name: string; result: unknown }[] };

const STARTERS = [
  "Dental clinic in Kochi, 8 staff, one branch",
  "मेरा लखनऊ में किराना है, 2 लोग, GST नहीं है",
  "We run 4 restaurants in Pune, 40 staff",
  "I only need 3 SIM cards",
];

export default function AdvisorPage() {
  const { id, data, refresh, setData } = useSession();
  const [tab, setTab] = useState<"talk" | "type">("type");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [showHandoff, setShowHandoff] = useState(false);
  const [handoffDone, setHandoffDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const s = data?.session;
  const lang = s?.language ?? "English";

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("voice")) setTab("talk");
  }, []);
  useEffect(() => {
    // braces: some mobile browsers return a Promise from scrollIntoView, which must not leak out of the effect
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [s?.messages.length, busy]);

  async function send(msg: string) {
    if (!id || !msg.trim()) return;
    setBusy(true);
    setErr(null);
    setText("");
    setOptions([]);
    if (data) setData({ ...data, session: { ...data.session, messages: [...data.session.messages, { role: "user", text: msg, at: new Date().toISOString(), channel: "chat" }] } });
    try {
      const r = await api<ChatResp>("/api/chat", { method: "POST", json: { sessionId: id, text: msg } });
      setOptions(r.options ?? []);
      if (r.events?.some((e) => e.name === "request_expert" && (e.result as { needsConsent?: boolean })?.needsConsent)) setShowHandoff(true);
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handoff(agree: boolean) {
    if (!id) return;
    setShowHandoff(false);
    if (!agree) return;
    await api("/api/consent", { method: "POST", json: { sessionId: id, purpose: "expert_handoff", granted: true } });
    const lead = await api<{ mode: string }>("/api/expert", { method: "POST", json: { sessionId: id } });
    setHandoffDone(lead.mode === "visit" ? "A local Accel expert will visit you. They will confirm a time within 15 minutes." : lead.mode === "call" ? "A local Accel expert will call you within 15 minutes." : "We have sent your plan on WhatsApp. An expert will follow up.");
    await refresh();
  }

  const q = data?.quote;
  const msgs = s?.messages.filter((m) => m.role !== "system") ?? [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 grid lg:grid-cols-[1fr_340px] gap-6">
      <div className="min-w-0">
        <div className="flex items-center gap-3 mb-5">
          <h1 className="text-2xl font-semibold tracking-tight">Find your plan</h1>
          <div className="ml-auto glass rounded-full p-1 flex">
            {([["talk", "Talk", Mic], ["type", "Type", Chat]] as const).map(([k, label, Icon]) => (
              <button key={k} onClick={() => setTab(k)} className={`h-8 px-4 rounded-full text-sm inline-flex items-center gap-1.5 transition-colors ${tab === k ? "bg-foreground text-white" : "text-muted hover:text-foreground"}`}>
                <Icon width={15} height={15} /> {label}
              </button>
            ))}
          </div>
        </div>

        {tab === "talk" && id && <VoiceMode sessionId={id} language={lang} onUpdate={refresh} />}

        {tab === "type" && (
          <Card className="p-0 overflow-hidden flex flex-col">
            <div className="overflow-y-auto p-5 space-y-3 h-[55vh]">
              {msgs.length === 0 && (
                <div>
                  <p className="text-muted mb-4">Tell me about your business. I&apos;ll suggest the right plan with one clear monthly price. Write in any Indian language.</p>
                  <div className="flex flex-wrap gap-2">
                    {STARTERS.map((x) => (
                      <button key={x} onClick={() => send(x)} className="text-sm bg-white/70 border border-black/5 rounded-full px-3.5 py-1.5 hover:bg-white">{x}</button>
                    ))}
                  </div>
                </div>
              )}
              {msgs.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] whitespace-pre-wrap rounded-3xl px-4 py-2.5 leading-relaxed ${m.role === "user" ? "bg-foreground text-white rounded-br-lg" : "bg-white/80 border border-black/5 rounded-bl-lg"}`}>
                    {m.channel === "voice" && <Mic width={12} height={12} className="inline mr-1 opacity-60" />}
                    {m.text.replace(/\*\*/g, "")}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex gap-1 px-2" aria-label="Advisor is typing">
                  {[0, 1, 2].map((i) => <span key={i} className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />)}
                </div>
              )}
              {handoffDone && <div className="text-sm bg-black/[0.04] rounded-2xl p-3">✓ {handoffDone}</div>}
              <div ref={endRef} />
            </div>
            {options.length > 0 && (
              <div className="px-5 pb-3 flex flex-wrap gap-2">
                {options.map((o) => (
                  <button key={o} onClick={() => send(o)} className="text-sm border border-brand/30 text-brand rounded-full px-3.5 py-1.5 hover:bg-brand-soft">{o}</button>
                ))}
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="border-t border-black/5 p-3 flex gap-2 bg-white/40">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" className="flex-1 h-11 rounded-full bg-white/80 border border-black/10 px-4" />
              <Button disabled={busy || !text.trim()} className="!h-11 !w-11 !px-0" aria-label="Send"><Arrow /></Button>
            </form>
          </Card>
        )}
        {err && <p className="text-sm text-brand mt-2">{err}</p>}
        <button className="mt-4 text-sm text-muted hover:text-foreground underline underline-offset-4" onClick={() => setShowHandoff(true)}>{t(lang, "talkHuman")}</button>
      </div>

      <aside className="space-y-4">
        <Card>
          <div className="text-sm text-muted mb-3">Your plan</div>
          {!q || q.lines.length === 0 ? (
            <p className="text-sm text-muted">Products and one monthly price appear here as we talk.</p>
          ) : (
            <>
              <ul className="space-y-3 mb-4">
                {q.lines.map((l) => (
                  <li key={l.productId} className="text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{l.name}{l.qty > 1 ? ` × ${l.qty}` : ""}</span>
                      <span className="tabular-nums">{inr(l.monthly)}</span>
                    </div>
                    <div className="text-xs text-muted mt-0.5">{l.reason}</div>
                  </li>
                ))}
              </ul>
              <div className="border-t border-black/5 pt-3">
                <div className="text-3xl font-semibold tracking-tight tabular-nums">{inr(q.monthly)}<span className="text-sm font-normal text-muted"> /month</span></div>
                <div className="text-xs text-muted mt-1">
                  {q.setupTotal > 0 ? `+ ${inr(q.setupTotal)} one-time setup · ` : ""}live in about {q.etaDays} day{q.etaDays === 1 ? "" : "s"}
                </div>
              </div>
              <Link href="/quote"><Button className="w-full mt-4">Review plan <Arrow /></Button></Link>
            </>
          )}
        </Card>
        {s?.profile && (s.profile.businessType || s.profile.city) && (
          <Card>
            <div className="text-sm text-muted mb-3">What we understood</div>
            <dl className="text-sm grid grid-cols-[90px_1fr] gap-y-1.5">
              {[["Business", s.profile.businessType], ["City", s.profile.city], ["Team", s.profile.employees !== undefined ? `${s.profile.employees} people` : undefined], ["Locations", s.profile.sites], ["GSTIN", s.profile.hasGstin === undefined ? undefined : s.profile.hasGstin ? (s.profile.gstinStatus && s.profile.gstinStatus !== "Active" ? `Yes · ${s.profile.gstinStatus}` : "Yes") : "No"], ["Needs", s.profile.needs?.join(", ").replaceAll("_", " ")], ["Language", lang]]
                .filter(([, v]) => v !== undefined && v !== "")
                .map(([k, v]) => (
                  <div key={String(k)} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd>{String(v)}</dd>
                  </div>
                ))}
            </dl>
          </Card>
        )}
      </aside>

      {showHandoff && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm grid place-items-center p-4 z-40">
          <Card className="max-w-md !bg-white/90">
            <h3 className="font-semibold tracking-tight mb-2">Talk to a local Accel expert?</h3>
            <p className="text-sm text-muted mb-5">{t(lang, "handoffAsk")}</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => handoff(false)}>Not now</Button>
              <Button onClick={() => handoff(true)}>Yes, connect me</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
