import { db } from "@/lib/store";
import { handle, json } from "@/lib/api";
import { maskName, maskPhone } from "@/lib/ids";
import { priceBundle } from "@/lib/engine";
import { data } from "@/lib/data";
import { seedDemoData } from "@/lib/demo-leads";

/** Leads the AI could not close. Expert view shows only hand-off fields; phone revealed only after consent. */
export const GET = handle(async (req) => {
  seedDemoData();
  const expertId = new URL(req.url).searchParams.get("expertId");
  const leads = Object.values(db.raw.leads)
    .filter((l) => !expertId || l.assignedExpertId === expertId || l.offers.some((o) => o.expertId === expertId && o.offeredAt && o.status === "offered"))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((l) => {
      if (l.demo) {
        const { bundle, seed: _seed, ...c } = l.demo;
        void _seed;
        return { ...l, customer: { ...c, name: l.consentAt ? c.name : maskName(c.name), phone: c.phone, bundle } };
      }
      const s = db.session(l.sessionId);
      const consented = !!l.consentAt;
      const summary = s?.messages.filter((m) => m.role === "user").slice(-4).map((m) => m.text).join(" · ");
      return {
        ...l,
        customer: s
          ? {
              name: consented ? s.name ?? "Owner" : maskName(s.name ?? "Owner"),
              phone: consented ? s.phone : maskPhone(s.phone),
              business: s.profile.businessName ?? s.profile.businessType,
              city: s.profile.city,
              language: s.language,
              segment: s.profile.segment,
              employees: s.profile.employees,
              sites: s.profile.sites,
              bundle: s.bundle.map((b) => ({ ...b, name: data.product(b.productId)?.product_name ?? b.productId })),
              monthly: s.bundle.length ? priceBundle(s.bundle, s.profile, { contractMonths: s.contractMonths }).monthly : 0,
              conversation: summary,
            }
          : null,
      };
    });
  return json({ leads, experts: db.experts });
});
