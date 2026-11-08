import { handle, json, requireSession, HttpError } from "@/lib/api";
import { digilockerFetch } from "@/lib/kyc";
import { requireKycConsent, finish } from "../_shared";

/** MOCK DigiLocker / Entity Locker pull. Real integration needs Udyam Digital to onboard as a DigiLocker requester. */
export const POST = handle(async (req) => {
  const { sessionId, doc } = (await req.json()) as { sessionId: string; doc: "gst_certificate" | "udyam_certificate" | "signatory_id" };
  const s = requireSession(sessionId);
  requireKycConsent(s);
  if (!s.kyc.gstin) throw new HttpError("Enter GSTIN first so Entity Locker can find your business");
  const fields = digilockerFetch(s, doc);
  if (!fields) return json({ ok: false, reason: doc === "udyam_certificate" ? "No Udyam certificate linked in DigiLocker for this business" : "Document not found in DigiLocker" }, 404);
  s.kyc.extracted[doc] = fields;
  s.kyc.source[doc] = "digilocker";
  if (doc === "udyam_certificate") s.kyc.udyam = fields.udyam_number ?? s.kyc.udyam;
  return json({ ok: true, ...finish(s) });
});
