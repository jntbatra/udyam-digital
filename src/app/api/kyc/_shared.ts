import { db, nowIso, type Session } from "@/lib/store";
import { runChecks, kycVerified } from "@/lib/kyc";
import { publicSession, HttpError } from "@/lib/api";
import { detectEscalation } from "@/lib/routing";

export function requireKycConsent(s: Session) {
  const c = [...s.consents].reverse().find((x) => x.purpose === "kyc");
  if (!c?.granted) throw new HttpError("KYC consent required before any document is processed", 403);
}

export function finish(s: Session) {
  s.kyc.checks = runChecks(s);
  s.kyc.verified = kycVerified(s.kyc.checks);
  s.kyc.updatedAt = nowIso();
  if (s.profile.gstin) {
    const st = s.kyc.checks.find((c) => c.id === "gstin_status");
    if (st) s.profile.gstinStatus = st.status === "pass" ? "Active" : (st.detail.includes("Cancelled") ? "Cancelled" : "Suspended");
  }
  db.saveSession(s);
  return { session: publicSession(s), checks: s.kyc.checks, verified: s.kyc.verified, suggestExpert: detectEscalation(s)?.reason === "kyc_failed" };
}
