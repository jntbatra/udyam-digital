import { db, nowIso } from "@/lib/store";
import { handle, json, publicSession, requireSession, quoteFor } from "@/lib/api";
import { fastTurn, guidedNext, parseGuidedAnswer, autoLanguage } from "@/lib/advisor";

/** Advisor turn. Falls back to the deterministic guided flow if the LLM is unavailable. */
export const POST = handle(async (req) => {
  const { sessionId, text, channel, guided } = (await req.json()) as { sessionId: string; text: string; channel?: "chat" | "voice"; guided?: boolean };
  const s = requireSession(sessionId);
  if (!text?.trim()) return json({ error: "empty" }, 400);
  try {
    if (guided || process.env.ADVISOR_MODE === "guided") throw new Error("guided mode requested");
    // Fast path: rules handle facts/plan/objections; one LLM call writes the reply (model-agnostic, ~1 s)
    const out = await fastTurn(s, text.trim().slice(0, 2000), channel ?? "chat");
    const events = out.wantsHuman ? [{ name: "request_expert", result: { needsConsent: true } }] : [];
    return json({ reply: out.text, events, mode: "llm", session: publicSession(s), ...quoteFor(s) });
  } catch (e) {
    console.error("[chat] LLM unavailable:", (e as Error).message.slice(0, 200));
    if (s.messages.at(-1)?.role !== "user") s.messages.push({ role: "user", text, at: nowIso(), channel: "chat" });
    autoLanguage(s, text);
    parseGuidedAnswer(s, text);
    const g = guidedNext(s);
    s.messages.push({ role: "assistant", text: g.text, at: nowIso(), channel: "chat" });
    db.saveSession(s);
    return json({ reply: g.text, options: g.options, mode: "guided", session: publicSession(s), ...quoteFor(s) });
  }
});
