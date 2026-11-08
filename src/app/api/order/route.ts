import { handle, json, requireSession, HttpError } from "@/lib/api";
import { createOrder } from "@/lib/orders";
import { validateBundle } from "@/lib/engine";

/** Checkout (mock UPI). Requires verified KYC + e-sign and a rule-valid bundle. */
export const POST = handle(async (req) => {
  const { sessionId } = (await req.json()) as { sessionId: string };
  const s = requireSession(sessionId);
  if (!s.bundle.length) throw new HttpError("Bundle is empty");
  const v = validateBundle(s.bundle, s.profile);
  if (v.length) throw new HttpError(v.map((x) => x.message).join("; "), 422);
  if (!s.kyc.verified || !s.kyc.esigned) throw new HttpError("Complete KYC and e-sign first", 409);
  const o = createOrder(s);
  return json(o);
});
