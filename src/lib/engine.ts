/**
 * Rule + price engine. Single source of truth for eligibility, dependencies and price.
 * LLMs never decide these — they call this module through tools.
 */
import { data, type Product } from "./data";

export type Segment = "micro" | "prof" | "multi" | "mfg";

export type Need =
  | "internet" | "mobile" | "upi_pos" | "whatsapp" | "sms" | "cctv" | "email"
  | "backup" | "security" | "firewall" | "failover" | "multisite_mgmt" | "wifi_guest"
  | "telephony" | "tollfree" | "static_ip" | "iot" | "fleet" | "website";

export const NEED_LABELS: Record<Need, string> = {
  internet: "Reliable internet", mobile: "Business mobile lines", upi_pos: "UPI / POS billing",
  whatsapp: "WhatsApp Business catalogue", sms: "SMS alerts / promotions", cctv: "CCTV cameras",
  email: "Business email & office suite", backup: "Cloud backup", security: "Antivirus / ransomware protection",
  firewall: "Managed firewall", failover: "Backup internet when main line is down",
  multisite_mgmt: "Central management of all sites", wifi_guest: "Customer Wi-Fi",
  telephony: "Business phone lines / IVR", tollfree: "Toll-free number", static_ip: "Static IP",
  iot: "Machine monitoring", fleet: "Vehicle tracking", website: "Website + domain",
};

export type Profile = {
  businessName?: string;
  businessType?: string;
  segment?: Segment;
  city?: string;
  state?: string;
  cityTier?: 1 | 2;
  employees?: number;
  sites?: number;
  hasGstin?: boolean;
  gstin?: string;
  gstinStatus?: "Active" | "Cancelled" | "Suspended" | "Unknown";
  currentInternet?: string;
  monthlySpend?: number;
  needs?: Need[];
  mobileLines?: number;
  cameras?: number;
  emailUsers?: number;
  counters?: number;
  vehicles?: number;
  machines?: number;
  fibreFeasible?: boolean;
  simOnly?: boolean;
  language?: string;
};

export type LineItem = { productId: string; qty: number; reason: string };

export type Violation = { productId: string; rule: string; message: string };

export type Exclusion = { need: Need; productId?: string; message: string; alternative?: string };

export type Recommendation = {
  items: LineItem[];
  exclusions: Exclusion[];
  notes: string[];
  missing: (keyof Profile)[];
};

const CONNECTIVITY = ["P01", "P02", "P03", "P04", "P05", "P06"];
const FIXED_LINE = ["P01", "P02", "P03", "P05", "P06"];

export function requiredProfileFields(p: Profile): (keyof Profile)[] {
  const req: (keyof Profile)[] = ["segment", "cityTier", "employees", "sites", "hasGstin"];
  return req.filter((k) => p[k] === undefined || p[k] === null);
}

/** Check a single product against the profile + bundle (rules from product_catalogue.csv). */
export function checkProduct(
  p: Product,
  profile: Profile,
  bundleIds: Set<string>,
): Violation[] {
  const v: Violation[] = [];
  const tier = profile.cityTier ?? 1;
  if (!p.city_tiers.includes(tier))
    v.push({ productId: p.product_id, rule: "city_tier", message: `${p.product_name} is not sold in tier-${tier} cities` });
  if ((profile.employees ?? 1) < p.min_employees)
    v.push({ productId: p.product_id, rule: "min_employees", message: `${p.product_name} needs at least ${p.min_employees} employees` });
  if ((profile.sites ?? 1) < p.min_sites)
    v.push({ productId: p.product_id, rule: "min_sites", message: `${p.product_name} needs at least ${p.min_sites} sites` });
  if (p.requires_gstin && !(profile.hasGstin && (profile.gstinStatus ?? "Active") === "Active"))
    v.push({ productId: p.product_id, rule: "requires_gstin", message: `${p.product_name} needs a valid, active GSTIN` });
  if (p.requires_one_of.length && !p.requires_one_of.some((id) => bundleIds.has(id)))
    v.push({ productId: p.product_id, rule: "requires_one_of", message: `${p.product_name} needs one of ${p.requires_one_of.join("/")} in the same bundle` });
  return v;
}

export function validateBundle(items: LineItem[], profile: Profile): Violation[] {
  const ids = new Set(items.map((i) => i.productId));
  return items.flatMap((i) => {
    const p = data.product(i.productId);
    if (!p) return [{ productId: i.productId, rule: "unknown", message: `Unknown product ${i.productId}` }];
    return checkProduct(p, profile, ids);
  });
}

function eligible(id: string, profile: Profile, ids: Set<string>): Violation[] {
  const p = data.product(id)!;
  return checkProduct(p, profile, ids);
}

function pickConnectivity(profile: Profile): { id: string; reason: string } {
  const emp = profile.employees ?? 1;
  const tier = profile.cityTier ?? 1;
  const gst = profile.hasGstin && (profile.gstinStatus ?? "Active") === "Active";
  if (profile.fibreFeasible === false)
    return { id: "P04", reason: "Fibre is not available at your site, so 5G AirFiber gives plug-and-play internet in about 2 days" };
  if (profile.segment === "mfg" && emp >= 25 && gst)
    return { id: "P06", reason: "Dedicated 100 Mbps line with 99.9% uptime for machines and ERP" };
  if (profile.segment === "mfg" && emp >= 10 && gst)
    return { id: "P05", reason: "Dedicated 1:1 internet with 99.5% uptime guarantee" };
  const perSite = emp / Math.max(1, profile.sites ?? 1);
  if (perSite >= 20 && tier === 1 && gst)
    return { id: "P03", reason: `1 Gbps fibre with priority support for a ${Math.round(perSite)}-person team per site` };
  // Bandwidth by actual load, not by business type
  const needs = new Set(profile.needs ?? []);
  const camsPerSite = (profile.cameras ?? (needs.has("cctv") ? 2 : 0)) / Math.max(1, profile.sites ?? 1);
  const heavy = camsPerSite >= 4 || needs.has("telephony") || (needs.has("multisite_mgmt") && (profile.sites ?? 1) >= 3);
  if (perSite >= 10 || heavy)
    return { id: "P02", reason: perSite >= 10 ? `300 Mbps fibre for ${Math.round(perSite)} people online at once per site` : "300 Mbps fibre for many cameras / phone lines streaming at once" };
  return { id: "P01", reason: `100 Mbps fibre is enough for ${Math.round(perSite)} ${Math.round(perSite) === 1 ? "person" : "people"}: UPI, billing, email and video calls` };
}

/** Need-based recommendation. Every item carries a plain-language reason. */
export function recommend(profileIn: Profile): Recommendation {
  const profile: Profile = { sites: 1, employees: 1, cityTier: 1, ...profileIn };
  const missing = requiredProfileFields(profileIn);
  const sites = Math.max(1, profile.sites ?? 1);
  const emp = Math.max(1, profile.employees ?? 1);
  const needs = new Set<Need>(profile.needs ?? []);
  const items: LineItem[] = [];
  const exclusions: Exclusion[] = [];
  const notes: string[] = [];
  const ids = new Set<string>();
  const add = (productId: string, qty: number, reason: string) => {
    items.push({ productId, qty, reason });
    ids.add(productId);
  };

  if (profile.simOnly) {
    const line = profile.segment === "multi" || profile.segment === "mfg" ? "P08" : "P07";
    add(line, Math.max(1, profile.mobileLines ?? 1), "You asked only for business mobile lines");
    return { items, exclusions, notes: ["SIM-only fast path"], missing: [] };
  }

  // Connectivity: every bundle except SIM-only gets a main link per site.
  const conn = pickConnectivity(profile);
  add(conn.id, sites, sites > 1 ? `${conn.reason} — one per site (${sites} sites)` : conn.reason);

  // Mobile lines: only when the owner asked for SIMs (otherwise offered as an optional add-on)
  const wantsMobile = needs.has("mobile") || (profile.mobileLines ?? 0) > 0;
  const lines = profile.mobileLines ?? (profile.segment === "multi" ? sites * 2 : profile.segment === "mfg" ? 3 : 2);
  if (wantsMobile && lines > 0) {
    const line = profile.segment === "prof" || profile.segment === "multi" || profile.segment === "mfg" ? "P08" : "P07";
    add(line, lines, line === "P08" ? "Business mobile with roaming and priority care" : "Business mobile with 50 GB data and unlimited calls");
  }

  const tryAdd = (need: Need, productId: string, qty: number, reason: string, alternative?: string) => {
    if (ids.has(productId)) return;
    const v = eligible(productId, profile, new Set([...ids, productId]));
    if (v.length) {
      exclusions.push({ need, productId, message: v.map((x) => x.message).join("; "), alternative });
      return;
    }
    add(productId, qty, reason);
  };

  if (needs.has("upi_pos")) tryAdd("upi_pos", "P19", profile.counters ?? sites, "GST-ready billing with UPI/card on a tablet");
  if (needs.has("whatsapp"))
    tryAdd("whatsapp", "P15", 1, "Verified WhatsApp channel with your product catalogue",
      "Register for GST (free) to unlock WhatsApp Business API; meanwhile a website + domain lets customers find you");
  if (needs.has("whatsapp") && exclusions.some((e) => e.need === "whatsapp") && !needs.has("website"))
    tryAdd("website", "P18", 1, "Website + domain so customers find you online (no GSTIN needed)");
  if (needs.has("sms")) tryAdd("sms", "P14", 1, "10,000 SMS a month for reminders and offers", "Needs active GSTIN — WhatsApp/website as alternative");
  if (needs.has("cctv")) tryAdd("cctv", "P23", profile.cameras ?? 2 * sites, "HD cameras with 30-day cloud recording, view on your phone");
  if (needs.has("email")) tryAdd("email", "P16", profile.emailUsers ?? Math.min(emp, 25), "Business email on your own domain + documents + meetings");
  if (needs.has("backup")) tryAdd("backup", "P17", 1, "Automatic backup of PCs and phones (1 TB)");
  if (needs.has("security")) tryAdd("security", "P20", Math.min(emp, 50), "Antivirus + ransomware protection for each device");
  if (needs.has("firewall")) tryAdd("firewall", "P21", sites, "Next-gen firewall managed by Accel security team");
  if (needs.has("failover"))
    tryAdd("failover", "P09", sites, "Automatic backup internet when the main line is down — UPI and billing keep working",
      "Failover needs a fixed line (fibre/leased); AirFiber already works without cables");
  if (needs.has("multisite_mgmt")) tryAdd("multisite_mgmt", "P10", sites, "One dashboard to manage the internet at all sites");
  if (needs.has("wifi_guest")) tryAdd("wifi_guest", "P22", sites, "Separate customer Wi-Fi keeps your billing network safe");
  if (needs.has("telephony")) tryAdd("telephony", "P12", Math.max(2, Math.ceil(emp / 5)), "Business phone lines with IVR and call recording");
  if (needs.has("tollfree")) tryAdd("tollfree", "P13", 1, "1800 number routed to your mobiles");
  if (needs.has("static_ip")) tryAdd("static_ip", "P11", 1, "Fixed IP for remote CCTV view / servers");
  if (needs.has("iot")) tryAdd("iot", "P24", profile.machines ?? 5, "Machine uptime and energy monitoring");
  if (needs.has("fleet")) tryAdd("fleet", "P25", profile.vehicles ?? 2, "Live GPS tracking for your vehicles");
  if (needs.has("website")) tryAdd("website", "P18", 1, "Website + domain so customers find you online");

  if (profile.hasGstin === false)
    notes.push("Without a GSTIN some products (WhatsApp API, SMS, telephony) are locked. GST registration is free.");
  if (profile.fibreFeasible === false) notes.push("Fibre not feasible at site — switched to 5G AirFiber.");
  // Safety: the engine output must always pass its own rules.
  const v = validateBundle(items, profile);
  if (v.length) notes.push(...v.map((x) => `Removed: ${x.message}`));
  const bad = new Set(v.map((x) => x.productId));
  return { items: items.filter((i) => !bad.has(i.productId)), exclusions, notes, missing };
}

// ---------------- Pricing ----------------

export type PricedLine = LineItem & {
  name: string;
  description: string;
  unit: string;
  unitPrice: number;
  monthly: number;
  setup: number;
  installDays: number;
  category: string;
};

export type Quote = {
  lines: PricedLine[];
  minContractMonths: number;
  contractMonths: number;
  subtotal: number;
  discounts: { label: string; amount: number }[];
  approvedDiscountPct: number;
  monthly: number;
  setupTotal: number;
  setupSpread: boolean;
  monthlyWithSetup: number;
  etaDays: number;
  floorApplied: boolean;
  violations: Violation[];
};

export type PriceOptions = {
  contractMonths?: number;
  setupSpread?: boolean;
  approvedDiscountPct?: number; // only via manager approval
};

const round = (n: number) => Math.round(n);

export function unitPrice(p: Product, tier: 1 | 2): number {
  return tier === 2 ? p.price_min : round((p.price_min + p.price_max) / 2);
}

export function priceBundle(items: LineItem[], profile: Profile, opts: PriceOptions = {}): Quote {
  const tier = (profile.cityTier ?? 1) as 1 | 2;
  const lines: PricedLine[] = items.map((i) => {
    const p = data.product(i.productId)!;
    const u = unitPrice(p, tier);
    return {
      ...i,
      name: p.product_name,
      description: p.description,
      unit: p.unit,
      unitPrice: u,
      monthly: u * i.qty,
      setup: p.setup_fee * i.qty,
      installDays: p.install_days,
      category: p.category,
    };
  });
  const minContract = Math.max(12, ...lines.map((l) => data.product(l.productId)!.min_contract_months));
  const contractMonths = Math.max(minContract, opts.contractMonths ?? minContract);
  const subtotal = lines.reduce((s, l) => s + l.monthly, 0);
  const floor = lines.reduce((s, l) => s + data.product(l.productId)!.price_min * l.qty, 0);
  const discounts: { label: string; amount: number }[] = [];
  if (contractMonths >= 24) discounts.push({ label: "24-month contract (5%)", amount: round(subtotal * 0.05) });
  if (lines.length >= 3) discounts.push({ label: "Bundle of 3+ products (5%)", amount: round(subtotal * 0.05) });
  const approved = Math.min(15, Math.max(0, opts.approvedDiscountPct ?? 0));
  if (approved > 0) discounts.push({ label: `Manager-approved special price (${approved}%)`, amount: round(subtotal * approved / 100) });
  let monthly = subtotal - discounts.reduce((s, d) => s + d.amount, 0);
  let floorApplied = false;
  if (monthly < floor) {
    monthly = floor;
    floorApplied = true;
  }
  const setupTotal = lines.reduce((s, l) => s + l.setup, 0);
  const setupSpread = !!opts.setupSpread && setupTotal > 0;
  return {
    lines,
    minContractMonths: minContract,
    contractMonths,
    subtotal,
    discounts,
    approvedDiscountPct: approved,
    monthly,
    setupTotal,
    setupSpread,
    monthlyWithSetup: setupSpread ? monthly + Math.ceil(setupTotal / 12) : monthly,
    etaDays: lines.length ? Math.max(...lines.map((l) => l.installDays)) : 0,
    floorApplied,
    violations: validateBundle(items, profile),
  };
}

/** Structural price levers for price objections (AI never offers discounts). */
export function cheaperOptions(items: LineItem[], profile: Profile) {
  const opts: { label: string; items: LineItem[]; contractMonths?: number }[] = [];
  const swap = (from: string, to: string, label: string) => {
    if (!items.some((i) => i.productId === from)) return;
    const next = items.map((i) => (i.productId === from ? { ...i, productId: to, reason: label } : i));
    if (validateBundle(next, profile).length === 0) opts.push({ label, items: next });
  };
  swap("P02", "P01", "Switch to 100 Mbps fibre");
  swap("P03", "P02", "Switch to 300 Mbps fibre");
  swap("P01", "P04", "Switch to 5G AirFiber (no cabling)");
  swap("P08", "P07", "Switch to Business Postpaid 299 lines");
  const optional = items.filter((i) => !CONNECTIVITY.includes(i.productId) && !["P07", "P08"].includes(i.productId));
  for (const o of optional) {
    const next = items.filter((i) => i !== o);
    if (validateBundle(next, profile).length === 0)
      opts.push({ label: `Remove ${data.product(o.productId)!.product_name}`, items: next });
  }
  opts.push({ label: "Choose 24-month contract (5% lower)", items, contractMonths: 24 });
  return opts.slice(0, 5);
}

/** Need-based upsell: max 2, never after price objection / during delay. */
export function upsellSuggestions(
  items: LineItem[],
  profile: Profile,
  ctx: { priceObjection?: boolean; delayedOrOpenTicket?: boolean } = {},
) {
  if (ctx.priceObjection || ctx.delayedOrOpenTicket) return [];
  const ids = new Set(items.map((i) => i.productId));
  const sites = profile.sites ?? 1;
  const cands: LineItem[] = [];
  const hasFixed = FIXED_LINE.some((id) => ids.has(id));
  if ((ids.has("P19") || profile.needs?.includes("upi_pos")) && hasFixed && !ids.has("P09"))
    cands.push({ productId: "P09", qty: sites, reason: "You take UPI/card payments — failover keeps billing running if the main line drops" });
  if (ids.has("P23") && !ids.has("P11") && (ids.has("P01") || ids.has("P02") || ids.has("P03")))
    cands.push({ productId: "P11", qty: 1, reason: "Static IP lets you view CCTV remotely without lag" });
  if ((profile.segment === "micro" || profile.segment === "multi") && !ids.has("P22") && (hasFixed || ids.has("P04")))
    cands.push({ productId: "P22", qty: sites, reason: "Free customer Wi-Fi keeps visitors happy and your billing network separate" });
  if (!ids.has("P07") && !ids.has("P08"))
    cands.push({ productId: profile.segment === "micro" || !profile.segment ? "P07" : "P08", qty: profile.segment === "multi" ? sites : 1, reason: "Business SIM on the same bill — calls and data for you or your staff" });
  if ((profile.segment === "prof" || profile.segment === "mfg") && !ids.has("P20"))
    cands.push({ productId: "P20", qty: Math.min(profile.employees ?? 1, 50), reason: "You store customer/patient data — ransomware protection for each device" });
  if (profile.segment === "prof" && !ids.has("P17"))
    cands.push({ productId: "P17", qty: 1, reason: "Daily automatic backup of records and documents" });
  return cands
    .filter((c) => validateBundle([...items, c], profile).length === 0)
    .slice(0, 2)
    .map((c) => {
      const p = data.product(c.productId)!;
      return { ...c, name: p.product_name, monthly: unitPrice(p, (profile.cityTier ?? 1) as 1 | 2) * c.qty };
    });
}

export const SEGMENT_LABEL: Record<Segment, string> = {
  micro: "Micro retail & services",
  prof: "Professional offices",
  multi: "Small multi-site businesses",
  mfg: "Small manufacturers",
};

export function segmentFromLabel(label: string): Segment | undefined {
  const l = label.toLowerCase();
  if (l.startsWith("micro")) return "micro";
  if (l.startsWith("prof")) return "prof";
  if (l.includes("multi")) return "multi";
  if (l.includes("manuf")) return "mfg";
  return undefined;
}
