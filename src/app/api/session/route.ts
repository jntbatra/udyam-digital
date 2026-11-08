import { db } from "@/lib/store";
import { handle, json, publicSession } from "@/lib/api";

/** Create or resume a session. Same mobile number = same shared profile across channels. */
export const POST = handle(async (req) => {
  const body = (await req.json().catch(() => ({}))) as { phone?: string; language?: string; name?: string };
  const phone = body.phone?.replace(/\D/g, "").slice(-10);
  let s = phone ? db.sessionByPhone(phone) : undefined;
  if (!s) s = db.createSession({ phone, language: body.language ?? "English", name: body.name });
  else if (body.language) {
    s.language = body.language;
    db.saveSession(s);
  }
  return json(publicSession(s));
});
