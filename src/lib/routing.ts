/** Propensity score, call-vs-visit decision, AI expert assignment. */
import fs from "node:fs";
import path from "node:path";
import { db, newId, nowIso, type EscalationReason, type Expert, type Lead, type Session } from "./store";
import { priceBundle, SEGMENT_LABEL, type Profile } from "./engine";

type Model = {
  intercept: number;
  weights: Record<string, number>;
  thresholds: { high: number; medium: number };
  auc: number;
  base_rate: number;
};
let model: Model | null = null;
function getModel(): Model {
  if (!model) model = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "propensity.json"), "utf8"));
  return model!;
}

const INTERNET_MAP: Record<string, string> = {
  hotspot: "Mobile hotspot", home: "Home broadband", business: "Business broadband",
  leased: "Leased line", mixed: "Mixed per site", none: "None",
};

const FEATURE_LABEL: Record<string, string> = {
  has_gstin: "Has active GSTIN",
  has_udyam: "Udyam registered",
  multi_site: "Multiple sites",
  tier1: "Tier-1 city",
};

export function profileFeatures(p: Profile, source = "Website form"): Record<string, number> {
  const f: Record<string, number> = {
    has_gstin: p.hasGstin && (p.gstinStatus ?? "Active") === "Active" ? 1 : 0,
    has_udyam: 0,
    multi_site: (p.sites ?? 1) > 1 ? 1 : 0,
    tier1: p.cityTier === 1 ? 1 : 0,
  };
  if (p.segment) f[`segment=${SEGMENT_LABEL[p.segment]}`] = 1;
  const ci = Object.entries(INTERNET_MAP).find(([k]) => (p.currentInternet ?? "").toLowerCase().includes(k));
  if (ci) f[`current_internet=${ci[1]}`] = 1;
  f[`lead_source=${source}`] = 1;
  return f;
}

export function scoreProfile(p: Profile, source = "Website form") {
  const m = getModel();
  const f = profileFeatures(p, source);
  let z = m.intercept;
  const contrib: { label: string; impact: number }[] = [];
  for (const [k, v] of Object.entries(f)) {
    const w = m.weights[k];
    if (w === undefined || !v) continue;
    z += w * v;
    contrib.push({ label: FEATURE_LABEL[k] ?? k.replace("=", ": ").replace("_", " "), impact: Math.round(w * 100) / 100 });
  }
  if (!f.has_gstin) contrib.push({ label: "No active GSTIN", impact: -Math.round((m.weights.has_gstin ?? 0) * 100) / 100 });
  const prob = 1 / (1 + Math.exp(-z));
  const priority: Lead["priority"] = prob >= m.thresholds.high ? "high" : prob >= m.thresholds.medium ? "medium" : "low";
  contrib.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  return { prob, priority, factors: contrib.slice(0, 3), auc: m.auc };
}

/** Visit if a site survey is needed or bundle ≥ ₹5,000/month; else call. Low score → nurture. */
export function decideMode(s: Session, priority: Lead["priority"], reason: EscalationReason): Lead["mode"] {
  const ids = new Set(s.bundle.map((b) => b.productId));
  const surveyNeeded =
    ["P05", "P06", "P10"].some((x) => ids.has(x)) ||
    (s.profile.sites ?? 1) > 1 ||
    ids.has("P23") ||
    s.profile.fibreFeasible === false ||
    reason === "not_feasible";
  const monthly = s.bundle.length ? priceBundle(s.bundle, s.profile).monthly : 0;
  const mustSeeHuman = ["asked_human", "kyc_failed", "complex_case", "not_feasible"].includes(reason) || s.profile.segment === "mfg";
  if (priority === "low" && !mustSeeHuman) return "nurture";
  if (surveyNeeded || monthly >= 5000) return "visit";
  return "call";
}

export function expertScore(e: Expert, s: Session) {
  const reasons: string[] = [];
  let score = 0;
  const city = (s.profile.city ?? "").toLowerCase();
  const state = (s.profile.state ?? "").toLowerCase();
  if (city && e.city.toLowerCase() === city) { score += 40; reasons.push(`same city (${e.city})`); }
  else if (state && e.state.toLowerCase() === state) { score += 25; reasons.push(`same state (${e.state})`); }
  if (e.languages.some((l) => l.toLowerCase() === s.language.toLowerCase())) { score += 25; reasons.push(`speaks ${s.language}`); }
  if (s.profile.segment && e.specialties.includes(s.profile.segment)) { score += 15; reasons.push(`${SEGMENT_LABEL[s.profile.segment]} specialist`); }
  score += e.activationRate * 100; // 12–22 pts
  score -= e.churn6m * 100; // keep low-churn experts first
  score -= e.load * 3;
  reasons.push(`${Math.round(e.activationRate * 100)}% activation, ${Math.round(e.churn6m * 100)}% churn, ${e.load} open leads`);
  return { score: Math.round(score), reasons };
}

export function rankExperts(s: Session) {
  return db.experts
    .map((e) => ({ expert: e, ...expertScore(e, s) }))
    .sort((a, b) => b.score - a.score);
}

/** Create a lead (needs hand-off consent first), offer to top-3 in sequence. */
export function escalate(s: Session, reason: EscalationReason, note: string): Lead {
  const sc = scoreProfile(s.profile);
  const mode = decideMode(s, sc.priority, reason);
  const ranked = rankExperts(s).slice(0, 3);
  const lead: Lead = {
    id: newId("L"),
    sessionId: s.id,
    createdAt: nowIso(),
    reason,
    note,
    mode,
    priority: sc.priority,
    score: Math.round(sc.prob * 1000) / 10,
    scoreFactors: sc.factors,
    offers:
      mode === "nurture"
        ? []
        : ranked.map((r, i) => ({
            expertId: r.expert.id,
            // Sequential offer: only the first is live now; others queue (15-min window each).
            offeredAt: i === 0 ? nowIso() : "",
            status: "offered" as const,
            why: r.reasons.join(", "),
          })),
    status: "new",
    consentAt: s.consents.find((c) => c.purpose === "expert_handoff" && c.granted)?.at,
  };
  db.saveLead(lead);
  s.escalation = { reason, note, at: nowIso(), leadId: lead.id };
  db.saveSession(s);
  return lead;
}

function proposeSlot(mode: Lead["mode"]) {
  const d = new Date(Date.now() + (mode === "visit" ? 24 : 0.25) * 3600 * 1000);
  return mode === "visit"
    ? `Visit ${d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}, 11:00–13:00`
    : `Call by ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Expert accepts / declines; decline moves the offer to the next in line. */
export function respondToOffer(leadId: string, expertId: string, accept: boolean) {
  const l = db.lead(leadId);
  if (!l) throw new Error("lead not found");
  const idx = l.offers.findIndex((o) => o.expertId === expertId);
  if (idx < 0) throw new Error("expert not offered");
  if (accept) {
    l.offers[idx].status = "accepted";
    l.assignedExpertId = expertId;
    l.status = "assigned";
    l.slot = l.slot ?? proposeSlot(l.mode);
    const e = db.expert(expertId);
    if (e) e.load += 1;
  } else {
    l.offers[idx].status = "declined";
    const next = l.offers.find((o, i) => i > idx && !o.offeredAt);
    if (next) next.offeredAt = nowIso();
  }
  db.saveLead(l);
  return l;
}

export function managerOverride(leadId: string, expertId: string, by = "Manager") {
  const l = db.lead(leadId);
  if (!l) throw new Error("lead not found");
  const prev = l.assignedExpertId ? db.expert(l.assignedExpertId) : undefined;
  if (prev && prev.id !== expertId) prev.load = Math.max(0, prev.load - 1);
  const e = db.expert(expertId);
  if (e && prev?.id !== expertId) e.load += 1;
  l.offers = l.offers.map((o) => (o.status === "offered" ? { ...o, status: "expired" as const } : o));
  l.assignedExpertId = expertId;
  l.status = "assigned";
  l.overriddenBy = by;
  l.slot = l.slot ?? proposeSlot(l.mode);
  db.saveLead(l);
  return l;
}

/** Triggers for "AI could not close" (Section 4.1 of plan). */
export function detectEscalation(s: Session): { reason: EscalationReason; note: string } | null {
  const p = s.profile;
  if (s.priceObjections >= 2) return { reason: "price_objection", note: "Price objection raised twice" };
  if (p.segment === "mfg" || (p.sites ?? 1) >= 3 || s.bundle.some((b) => ["P05", "P06", "P10"].includes(b.productId)))
    return { reason: "complex_case", note: "Multi-site / manufacturer / leased line — needs site survey" };
  if (p.fibreFeasible === false && (p.sites ?? 1) > 1) return { reason: "not_feasible", note: "Fibre not feasible at site" };
  if (s.kyc.checks.some((c) => c.status === "fail")) return { reason: "kyc_failed", note: "KYC check failed" };
  return null;
}
