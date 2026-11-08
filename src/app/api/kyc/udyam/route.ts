import { handle, json, requireSession } from "@/lib/api";
import { data } from "@/lib/data";
import { validateUdyamFormat, maskUdyam } from "@/lib/ids";
import { requireKycConsent, finish } from "../_shared";

/** Mock Udyam lookup API (backed by mock_udyam_registry.csv). */
export const POST = handle(async (req) => {
  const { sessionId, udyam } = (await req.json()) as { sessionId: string; udyam: string };
  const s = requireSession(sessionId);
  requireKycConsent(s);
  const u = (udyam ?? "").toUpperCase().trim();
  const f = validateUdyamFormat(u);
  if (!f.ok) return json({ ok: false, reason: f.reason }, 422);
  const r = data.udyam(u);
  s.kyc.udyam = u;
  s.kyc.source.udyam_certificate = "registry";
  if (r) s.kyc.extracted.udyam_certificate = { udyam_number: u, enterprise_name: r.enterprise_name, enterprise_type: r.enterprise_type, major_activity: r.major_activity, city: r.city, state: r.state, date_of_registration: r.date_of_registration };
  return json({ ok: true, registry: r ? { ...r, udyam_number: maskUdyam(u) } : null, ...finish(s) });
});
