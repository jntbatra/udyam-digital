import { db, newId, nowIso, type DiscountRequest } from "@/lib/store";
import { handle, json, requireSession, HttpError } from "@/lib/api";
import { priceBundle } from "@/lib/engine";
import { seedDemoData } from "@/lib/demo-leads";

/**
 * Discounts are rare and manager-approved only, in three cases:
 * competitor match (with proof), multi-site / manufacturer, bundle >= ₹5,000/month.
 */
export const POST = handle(async (req) => {
  const b = (await req.json()) as { sessionId: string; expertId?: string; caseType: DiscountRequest["caseType"]; proof?: string; pct: number };
  const s = requireSession(b.sessionId);
  const monthly = priceBundle(s.bundle, s.profile, { contractMonths: s.contractMonths }).monthly;
  const eligible =
    (b.caseType === "competitor_match" && (b.proof ?? "").trim().length > 5) ||
    (b.caseType === "multisite_mfg" && ((s.profile.sites ?? 1) > 1 || s.profile.segment === "mfg")) ||
    (b.caseType === "high_value" && monthly >= 5000);
  if (!eligible) throw new HttpError("Not an allowed discount case (competitor proof, multi-site/manufacturer, or ≥ ₹5,000/month)", 422);
  if (!(b.pct > 0 && b.pct <= 15)) throw new HttpError("Discount must be between 1% and 15%");
  const x: DiscountRequest = {
    id: newId("D"), sessionId: s.id, leadId: s.escalation?.leadId, expertId: b.expertId, caseType: b.caseType,
    proof: b.proof ?? "", pct: b.pct, status: "pending", createdAt: nowIso(),
    holdUntil: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
  };
  return json(db.saveDiscount(x));
});

export const GET = handle(async () => {
  seedDemoData();
  const list = Object.values(db.raw.discounts).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((d) => {
    if (d.demo) return { ...d, business: d.demo.business, city: d.demo.city, bundle: d.demo.bundle, monthly: d.demo.monthly, monthlyAfter: Math.round(d.demo.monthly * (1 - d.pct / 100)) };
    const s = db.session(d.sessionId);
    const q = s ? priceBundle(s.bundle, s.profile, { contractMonths: s.contractMonths }) : null;
    return { ...d, business: s?.profile.businessName ?? s?.profile.businessType, city: s?.profile.city, bundle: q?.lines.map((l) => l.name ?? l.productId).join(" · "), monthly: q?.monthly ?? 0, monthlyAfter: q ? Math.max(Math.round(q.monthly * (1 - d.pct / 100)), 0) : 0 };
  });
  const approved = list.filter((d) => d.status === "approved");
  return json({
    requests: list,
    spend: { approvedCount: approved.length, monthlyDiscountInr: approved.reduce((s, d) => s + (d.monthly - d.monthlyAfter), 0) },
  });
});
