import { data } from "@/lib/data";
import { db } from "@/lib/store";
import { connection } from "next/server";
import { handle, json } from "@/lib/api";
import { validateBundle, segmentFromLabel, type Profile } from "@/lib/engine";

/** Replays historical activations through the rule engine + live prototype metrics. */
export const GET = handle(async () => {
  await connection(); // live data: render per request
  const acts = data.leads.filter((l) => l.outcome === "Activated");
  const byRule: Record<string, number> = {};
  let violations = 0, badGst = 0;
  for (const l of acts) {
    const reg = l.gstin ? data.gstin(l.gstin) : undefined;
    if (reg && reg.status !== "Active") badGst++;
    const p: Profile = { segment: segmentFromLabel(l.segment), cityTier: Number(l.city_tier) as 1 | 2, employees: +l.employee_count, sites: +l.num_sites, hasGstin: l.has_gstin === "Y", gstinStatus: "Active" };
    const items = l.bundle_products.split(";").map((x) => { const [id, q] = x.split("x"); return { productId: id, qty: +q, reason: "" }; });
    for (const v of validateBundle(items, p)) { violations++; byRule[v.rule] = (byRule[v.rule] ?? 0) + 1; }
  }
  const sessions = Object.values(db.raw.sessions);
  const orders = Object.values(db.raw.orders);
  const leads = Object.values(db.raw.leads);
  const live = orders.filter((o) => o.stage === "live" || o.stage === "first_bill");
  return json({
    baseline: { leads: data.leads.length, activated: acts.length, activationRate: acts.length / data.leads.length, avgDays: 17.6, cac: 15053, churn6m: 0.152, chaseCalls: 3 },
    replay: { activations: acts.length, violations, byRule, activatedOnBadGstin: badGst },
    prototype: {
      sessions: sessions.length,
      withBundle: sessions.filter((s) => s.bundle.length).length,
      kycVerified: sessions.filter((s) => s.kyc.verified).length,
      orders: orders.length,
      live: live.length,
      avgDaysToLive: live.length ? live.reduce((s, o) => s + o.dayOffset, 0) / live.length : null,
      leadsToExperts: leads.length,
      closedByAiOnly: orders.filter((o) => !db.session(o.sessionId)?.escalation).length,
      productsPerCustomer: orders.length ? orders.reduce((s, o) => s + o.quote.lines.length, 0) / orders.length : null,
      statusChaseCalls: 0,
    },
  });
});
