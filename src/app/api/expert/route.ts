import { handle, json, requireSession, HttpError } from "@/lib/api";
import { escalate, detectEscalation } from "@/lib/routing";
import type { EscalationReason } from "@/lib/store";

/** AI-driven hand-off to a Local Accel Expert. Requires one-tap hand-off consent. */
export const POST = handle(async (req) => {
  const b = (await req.json()) as { sessionId: string; reason?: EscalationReason; note?: string };
  const s = requireSession(b.sessionId);
  const consent = [...s.consents].reverse().find((c) => c.purpose === "expert_handoff");
  if (!consent?.granted) throw new HttpError("Hand-off consent required", 403);
  const auto = detectEscalation(s);
  const lead = escalate(s, b.reason ?? auto?.reason ?? "asked_human", b.note ?? auto?.note ?? "Owner asked for a human");
  return json(lead);
});

/** What the AI would decide for this session right now (no side effects). */
export const GET = handle(async (req) => {
  const s = requireSession(new URL(req.url).searchParams.get("sessionId"));
  return json({ suggestion: detectEscalation(s) });
});
