import { handle, json, requireSession } from "@/lib/api";
import { data } from "@/lib/data";
import { validateGstinFormat, maskGstin } from "@/lib/ids";
import { requireKycConsent, finish } from "../_shared";

/** Mock GSTIN lookup API (backed by mock_gstin_registry.csv). */
export const POST = handle(async (req) => {
  const { sessionId, gstin } = (await req.json()) as { sessionId: string; gstin: string };
  const s = requireSession(sessionId);
  requireKycConsent(s);
  const g = (gstin ?? "").toUpperCase().replace(/\s/g, "");
  const f = validateGstinFormat(g);
  if (!f.ok) return json({ ok: false, reason: f.reason }, 422);
  const reg = data.gstin(g);
  s.kyc.gstin = g;
  s.kyc.source.gst_certificate = "registry";
  s.profile.hasGstin = true;
  s.profile.gstin = g;
  if (reg) {
    s.profile.businessName = reg.trade_name;
    s.profile.state = reg.state;
    s.kyc.extracted.gst_certificate = {
      gstin: g, legal_name: reg.legal_name, trade_name: reg.trade_name, constitution: reg.constitution,
      address: reg.principal_place_of_business, date_of_liability: reg.registration_date, registration_type: "Regular",
    };
  }
  return json({
    ok: true,
    registry: reg ? { gstin: maskGstin(g), legal_name: reg.legal_name, trade_name: reg.trade_name, constitution: reg.constitution, state: reg.state, status: reg.status, address: reg.principal_place_of_business } : null,
    ...finish(s),
  });
});
