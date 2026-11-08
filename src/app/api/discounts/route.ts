import { db, newId, nowIso, type DiscountRequest } from "@/lib/store";
import { handle, json, requireSession, HttpError } from "@/lib/api";
import { priceBundle } from "@/lib/engine";

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

/**
 * Temporary demo requests so the manager queue is never empty in a demo.
 * Seeded once (when there are no demo requests yet); timestamps are relative to "now".
 * Remove with DEMO_DISCOUNTS=off.
 */
function seedDemoDiscounts() {
  if (process.env.DEMO_DISCOUNTS === "off") return;
  if (Object.values(db.raw.discounts).some((d) => d.demo)) return;
  const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
  const rows: Omit<DiscountRequest, "id" | "holdUntil">[] = [
    { sessionId: "DEMO", expertId: "E02", caseType: "multisite_mfg", pct: 10, status: "pending", createdAt: ago(22), proof: "3 plants in Pune, Chakan, Nashik; 140 staff",
      demo: { business: "Shree Ganesh Auto Components", city: "Pune", monthly: 30791, bundle: "3 × Fibre 300 · SD-WAN · 40 SIMs · Cloud PBX" } },
    { sessionId: "DEMO", expertId: "E01", caseType: "competitor_match", pct: 8, status: "pending", createdAt: ago(71), proof: "Competitor quote ₹3,390/mo for same fibre + 4 SIMs (PDF from owner)",
      demo: { business: "Balaji Dental Care LLP", city: "Kochi", monthly: 3688, bundle: "Fibre 100 · 4 SIMs · POS" } },
    { sessionId: "DEMO", expertId: "E05", caseType: "high_value", pct: 6, status: "pending", createdAt: ago(9), proof: "24-month contract, 2 stores + warehouse",
      demo: { business: "Annapurna Supermart", city: "Indore", monthly: 15553, bundle: "2 × Fibre 300 · 18 SIMs · CCTV cloud" } },
    { sessionId: "DEMO", expertId: "E03", caseType: "competitor_match", pct: 12, status: "pending", createdAt: ago(146), proof: "Screenshot of competitor offer, no price visible",
      demo: { business: "Gupta Medicos", city: "Lucknow", monthly: 2296, bundle: "Fibre 100 · 2 SIMs" } },
    { sessionId: "DEMO", expertId: "E02", caseType: "multisite_mfg", pct: 9, status: "approved", createdAt: ago(320), decidedAt: ago(290), managerNote: "Approved, 24-month lock-in", proof: "2 factories, 85 staff",
      demo: { business: "Deccan Polymers Pvt Ltd", city: "Aurangabad", monthly: 24410, bundle: "2 × Fibre 300 · SD-WAN · 30 SIMs" } },
    { sessionId: "DEMO", expertId: "E01", caseType: "high_value", pct: 5, status: "approved", createdAt: ago(600), decidedAt: ago(560), managerNote: "OK at 5%", proof: "₹7,900/mo bundle, 3 sites",
      demo: { business: "Malabar Spice Traders", city: "Kozhikode", monthly: 7900, bundle: "3 × Fibre 100 · 9 SIMs" } },
    { sessionId: "DEMO", expertId: "E03", caseType: "competitor_match", pct: 15, status: "rejected", createdAt: ago(900), decidedAt: ago(870), managerNote: "No proof of competitor price", proof: "Owner says competitor is cheaper",
      demo: { business: "Sai Mobile Point", city: "Kanpur", monthly: 1890, bundle: "Fibre 100 · 1 SIM" } },
  ];
  rows.forEach((r, i) => {
    const id = `DDEMO${i + 1}`;
    db.saveDiscount({ ...r, id, holdUntil: new Date(Date.parse(r.createdAt) + 48 * 3600000).toISOString() });
  });
}

export const GET = handle(async () => {
  seedDemoDiscounts();
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
