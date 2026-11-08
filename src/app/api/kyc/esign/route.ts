import { db } from "@/lib/store";
import { handle, json, requireSession, publicSession, HttpError } from "@/lib/api";

/** MOCK e-sign (Aadhaar eSign / DSC in production). */
export const POST = handle(async (req) => {
  const { sessionId } = (await req.json()) as { sessionId: string };
  const s = requireSession(sessionId);
  if (!s.kyc.verified) throw new HttpError("KYC must pass before e-sign");
  s.kyc.esigned = true;
  db.saveSession(s);
  return json(publicSession(s));
});
