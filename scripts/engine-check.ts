import { data } from "../src/lib/data";
import { validateBundle, recommend, priceBundle, segmentFromLabel, type Profile } from "../src/lib/engine";

// 1) Replay real activations through the rule engine
let lines = 0, bad = 0; const byRule: Record<string, number> = {}; let badGst = 0;
for (const l of data.leads.filter((x) => x.outcome === "Activated")) {
  const reg = l.gstin ? data.gstin(l.gstin) : undefined;
  const p: Profile = { segment: segmentFromLabel(l.segment), cityTier: Number(l.city_tier) as 1 | 2, employees: +l.employee_count, sites: +l.num_sites, hasGstin: l.has_gstin === "Y", gstinStatus: reg?.status ?? "Active" };
  if (reg && reg.status !== "Active") badGst++;
  const items = l.bundle_products.split(";").map((x) => { const [id, q] = x.split("x"); return { productId: id, qty: +q, reason: "" }; });
  lines += items.length;
  const v = validateBundle(items, { ...p, gstinStatus: "Active" });
  bad += v.length; for (const x of v) byRule[x.rule] = (byRule[x.rule] ?? 0) + 1;
}
console.log("REPLAY lines", lines, "violations", bad, byRule, "activated on Cancelled/Suspended GSTIN", badGst);

// 2) Edge-case scenarios
const S: [string, Profile][] = [
  ["Tier-2 clinic 8 staff GST, wants email+backup+cctv", { segment: "prof", cityTier: 2, employees: 8, sites: 1, hasGstin: true, needs: ["email", "backup", "cctv"] }],
  ["Kirana no GST wants WhatsApp+UPI", { segment: "micro", cityTier: 2, employees: 2, sites: 1, hasGstin: false, needs: ["whatsapp", "upi_pos"] }],
  ["Tier-2 asks 1G (25 staff)", { segment: "prof", cityTier: 2, employees: 25, sites: 1, hasGstin: true, needs: [] }],
  ["Cancelled GSTIN wants SMS", { segment: "micro", cityTier: 1, employees: 4, sites: 1, hasGstin: true, gstinStatus: "Cancelled", needs: ["sms"] }],
  ["5-store restaurant, SD-WAN, CCTV, failover", { segment: "multi", cityTier: 1, employees: 40, sites: 5, hasGstin: true, needs: ["multisite_mgmt", "cctv", "failover", "upi_pos"] }],
  ["2-site 6 staff wants SD-WAN (below min)", { segment: "multi", cityTier: 1, employees: 6, sites: 2, hasGstin: true, needs: ["multisite_mgmt"] }],
  ["Fibre not feasible, wants failover+CCTV", { segment: "micro", cityTier: 2, employees: 3, sites: 1, hasGstin: true, fibreFeasible: false, needs: ["failover", "cctv"] }],
  ["Manufacturer 30 staff, IoT", { segment: "mfg", cityTier: 2, employees: 30, sites: 1, hasGstin: true, needs: ["iot", "firewall"] }],
  ["SIM only 3 lines", { segment: "micro", cityTier: 1, employees: 3, sites: 1, hasGstin: false, simOnly: true, mobileLines: 3 }],
];
for (const [name, p] of S) {
  const r = recommend(p); const q = priceBundle(r.items, p);
  console.log("\n#", name, "→ ₹" + q.monthly + "/mo, setup ₹" + q.setupTotal + ", ETA " + q.etaDays + "d, violations " + q.violations.length);
  console.log("  ", r.items.map((i) => `${i.productId}x${i.qty}`).join(" "), "| excluded:", r.exclusions.map((e) => `${e.productId}: ${e.message}`).join(" ; "));
}
