import { db, nowIso, type ConsentRecord } from "@/lib/store";
import { handle, json, publicSession, requireSession, HttpError } from "@/lib/api";

const PURPOSES = ["kyc", "voice", "expert_handoff", "marketing", "callback"] as const;
const NOTICE_VERSION = "2026-11-v1";

/** Record a per-purpose consent (or withdrawal). Consent log is kept as proof. */
export const POST = handle(async (req) => {
  const b = (await req.json()) as { sessionId: string; purpose: ConsentRecord["purpose"]; granted: boolean };
  if (!PURPOSES.includes(b.purpose)) throw new HttpError("bad purpose");
  const s = requireSession(b.sessionId);
  s.consents.push({ purpose: b.purpose, granted: !!b.granted, at: nowIso(), noticeVersion: NOTICE_VERSION, language: s.language });
  if (b.purpose === "marketing") s.marketingOptIn = !!b.granted;
  db.saveSession(s);
  return json(publicSession(s));
});
