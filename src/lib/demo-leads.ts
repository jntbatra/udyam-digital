import { data, type Lead as DataLead } from "@/lib/data";
import { db, type DiscountRequest, type EscalationReason, type Lead } from "@/lib/store";
import { priceBundle, segmentFromLabel, type LineItem, type Profile } from "@/lib/engine";
import { scoreProfile } from "@/lib/routing";

/**
 * Temporary demo data for the expert and manager screens, built ONLY from the
 * hackathon dataset (data/smb_leads.csv): real business names, contacts, cities,
 * segments, sizes, current provider/spend, bundles and drop reasons.
 * Scores come from the trained propensity model. Only timestamps are set relative
 * to "now" so SLAs and calendars look live. Disable with DEMO_DATA=off.
 */
const SEED_VERSION = "ds2";

const REASON: Record<string, EscalationReason> = {
  "Price too high": "price_objection",
  "Competitor offered cheaper plan": "price_objection",
  "Locked in with current provider": "price_objection",
  "Owner had no time for a visit": "complex_case",
  "Visit not scheduled by sales": "complex_case",
  "Quote too complex to understand": "asked_human",
  "Found paperwork too long": "asked_human",
  "Quote took too long to arrive": "idle_quote",
  "Decided to wait": "idle_quote",
  "Site not feasible for fibre": "not_feasible",
  "Installation delayed beyond 21 days": "not_feasible",
  "Missing GST or Udyam document": "kyc_failed",
  "Document details did not match": "kyc_failed",
  "Authorised signatory not available": "kyc_failed",
  "Unreachable after 3 attempts": "low_confidence",
  "Wrong or invalid number": "low_confidence",
  "Not interested on first call": "low_confidence",
  "Only wanted a mobile plan": "not_feasible",
  "Customer cancelled before install": "idle_quote",
  "First payment failed": "kyc_failed",
};

function profileOf(r: DataLead): Profile {
  return {
    segment: segmentFromLabel(r.segment), cityTier: Number(r.city_tier) as 1 | 2, employees: +r.employee_count, sites: +r.num_sites,
    hasGstin: r.has_gstin === "Y", gstinStatus: r.gstin ? data.gstin(r.gstin)?.status ?? "Active" : undefined,
    city: r.city, state: r.state, businessType: r.business_type, businessName: r.business_name,
  } as Profile;
}

function bundleOf(r: DataLead): LineItem[] {
  const src = r.bundle_products || r.products_of_interest.split(";").filter(Boolean).map((p) => `${p}x1`).join(";");
  return src.split(";").filter(Boolean).map((x) => { const [id, q] = x.split("x"); return { productId: id, qty: Number(q) || 1, reason: "From dataset" }; })
    .filter((i) => data.product(i.productId));
}

function monthlyOf(r: DataLead, items: LineItem[], p: Profile) {
  if (r.monthly_bundle_value_inr) return Number(r.monthly_bundle_value_inr);
  try { return items.length ? priceBundle(items, p).monthly : Number(r.monthly_telecom_spend_inr) || 0; } catch { return Number(r.monthly_telecom_spend_inr) || 0; }
}

/** Status in our journey, from where the real lead got to. */
function statusOf(r: DataLead): Lead["status"] {
  if (r.outcome === "Activated") return "won";
  if (["Not interested on first call", "Only wanted a mobile plan", "Customer cancelled before install", "First payment failed"].includes(r.drop_reason)) return "lost";
  if (r.stage_reached === "Lead") return "new";
  if (r.stage_reached === "Contacted") return "contacted";
  return "assigned";
}

export function seedDemoData() {
  if (process.env.DEMO_DATA === "off") return;
  const raw = db.raw;
  if (Object.values(raw.leads).some((l) => l.demo?.seed === SEED_VERSION)) return;
  // drop older demo rows (made-up ones from an earlier build)
  for (const [k, l] of Object.entries(raw.leads)) if (l.demo) delete raw.leads[k];
  for (const [k, d] of Object.entries(raw.discounts)) if (d.demo) delete raw.discounts[k];

  const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
  const slot = (days: number, time: string) => `${new Date(Date.now() + days * 86400000).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
  const perExpert: Record<string, number> = { E01: 7, E02: 3, E03: 3 };
  let n = 0;

  for (const e of db.experts) {
    const want = perExpert[e.id] ?? 1;
    const rows = data.leads.filter((r) => r.city === e.city && (REASON[r.drop_reason] || r.outcome === "Activated"));
    // one of each status first, then fill
    const picked: DataLead[] = [];
    const reasonOf = (x: DataLead) => (x.outcome === "Activated" ? "won" : REASON[x.drop_reason]);
    const usedReasons = new Set<string>();
    const take = (f: (x: DataLead) => boolean) => {
      const r = rows.find((x) => f(x) && !picked.includes(x) && !usedReasons.has(reasonOf(x))) ?? rows.find((x) => f(x) && !picked.includes(x));
      if (r && picked.length < want) { picked.push(r); usedReasons.add(reasonOf(r)); }
    };
    for (const st of ["new", "assigned", "contacted", "won", "lost"] as const) take((x) => statusOf(x) === st);
    while (picked.length < want) { const before = picked.length; take(() => true); if (picked.length === before) break; }

    picked.forEach((r, i) => {
      const p = profileOf(r);
      const items = bundleOf(r);
      const monthly = monthlyOf(r, items, p);
      const sc = scoreProfile(p, r.lead_source);
      const status = statusOf(r);
      const reason: EscalationReason = r.outcome === "Activated" ? "asked_human" : REASON[r.drop_reason];
      const visit = reason === "complex_case" || reason === "not_feasible" || +r.num_sites > 1 || monthly >= 5000;
      const created = ago(status === "new" ? 5 + i * 9 : status === "won" || status === "lost" ? 60 * (20 + i * 11) : 40 + i * 70);
      const offerStatus = status === "new" ? "offered" : "accepted";
      const lead: Lead = {
        id: `LDS${String(++n).padStart(2, "0")}`, sessionId: "DEMO", createdAt: created, reason,
        note: [r.drop_reason || "Activated with expert help", `${r.current_internet} · ${r.current_provider}`, `spends ₹${Number(r.monthly_telecom_spend_inr).toLocaleString("en-IN")}/mo`].join(" · "),
        mode: visit ? "visit" : "call", priority: sc.priority, score: Math.round(sc.prob * 100), scoreFactors: sc.factors,
        offers: [{ expertId: e.id, offeredAt: created, status: offerStatus, why: `${e.city} expert · speaks ${e.languages.includes(r.preferred_language) ? r.preferred_language : e.languages[0]} · ${(e.activationRate * 100).toFixed(0)}% activation` }],
        assignedExpertId: offerStatus === "accepted" ? e.id : undefined,
        status, slot: status === "assigned" || status === "contacted" ? slot(i % 3, ["10:30 am", "2:00 pm", "5:30 pm"][i % 3]) : undefined,
        consentAt: created,
        demo: {
          seed: SEED_VERSION, datasetId: r.lead_id, name: r.contact_name, role: r.contact_role, phone: "", business: r.business_name, city: r.city, language: r.preferred_language,
          segment: p.segment ?? "", employees: +r.employee_count, sites: +r.num_sites, monthly,
          conversation: `Interested in: ${r.products_of_interest.split(";").map((id) => data.product(id)?.product_name ?? id).join(", ")} · source: ${r.lead_source}`,
          bundle: items.map((it) => ({ ...it, name: data.product(it.productId)?.product_name ?? it.productId })),
        },
      };
      raw.leads[lead.id] = lead;
    });
  }

  // Discount requests: dataset leads that fit one of the 3 allowed cases.
  const expertFor = (city: string) => db.experts.find((x) => x.city === city)?.id ?? "E01";
  const pickRow = (f: (r: DataLead) => boolean, skip: Set<string>) => data.leads.find((r) => f(r) && !skip.has(r.lead_id));
  const used = new Set<string>();
  const cases: { caseType: DiscountRequest["caseType"]; f: (r: DataLead) => boolean; status: DiscountRequest["status"]; mins: number; note?: string }[] = [
    { caseType: "competitor_match", f: (r) => r.drop_reason === "Competitor offered cheaper plan" && r.city === "Kochi", status: "pending", mins: 71 },
    { caseType: "multisite_mfg", f: (r) => r.segment === "Small manufacturers" && +r.num_sites > 1 && r.city === "Pune", status: "pending", mins: 22 },
    { caseType: "high_value", f: (r) => Number(r.monthly_bundle_value_inr) >= 5000 && r.city === "Ludhiana", status: "pending", mins: 9 },
    { caseType: "competitor_match", f: (r) => r.drop_reason === "Competitor offered cheaper plan" && r.city === "Lucknow", status: "pending", mins: 146 },
    { caseType: "multisite_mfg", f: (r) => r.segment === "Small multi-site businesses" && r.outcome === "Activated", status: "approved", mins: 320, note: "Approved, 24-month lock-in" },
    { caseType: "high_value", f: (r) => Number(r.monthly_bundle_value_inr) >= 5000 && r.outcome === "Activated", status: "approved", mins: 600, note: "OK, within cap" },
    { caseType: "competitor_match", f: (r) => r.drop_reason === "Locked in with current provider", status: "rejected", mins: 900, note: "No proof of competitor price" },
  ];
  cases.forEach((c, i) => {
    const r = pickRow(c.f, used);
    if (!r) return;
    used.add(r.lead_id);
    const p = profileOf(r), items = bundleOf(r), monthly = monthlyOf(r, items, p), spend = Number(r.monthly_telecom_spend_inr) || 0;
    const pct = c.caseType === "competitor_match"
      ? Math.min(15, Math.max(3, spend && spend < monthly ? Math.round(((monthly - spend) / monthly) * 100) : 5))
      : c.caseType === "multisite_mfg" ? 10 : 6;
    const proof = c.caseType === "competitor_match"
      ? (c.status === "rejected" ? `Owner says ${r.current_provider} is cheaper (no bill attached)` : `Pays ${r.current_provider} ₹${spend.toLocaleString("en-IN")}/mo (${r.current_internet})`)
      : c.caseType === "multisite_mfg" ? `${r.num_sites} sites, ${r.employee_count} staff · ${r.business_type}` : `₹${monthly.toLocaleString("en-IN")}/mo bundle, ${r.contract_months || 24}-month contract`;
    const createdAt = ago(c.mins);
    raw.discounts[`DDS${i + 1}`] = {
      id: `DDS${i + 1}`, sessionId: "DEMO", expertId: expertFor(r.city), caseType: c.caseType, proof, pct, status: c.status, createdAt,
      decidedAt: c.status === "pending" ? undefined : ago(c.mins - 30), managerNote: c.note,
      holdUntil: new Date(Date.parse(createdAt) + 48 * 3600000).toISOString(),
      demo: { business: r.business_name, city: r.city, monthly, bundle: items.map((it) => `${it.qty > 1 ? it.qty + " × " : ""}${data.product(it.productId)?.product_name ?? it.productId}`).join(" · ") },
    };
  });
  db.saveDiscount(Object.values(raw.discounts)[0]); // persist
}
