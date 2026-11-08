/**
 * Tiny JSON-file store (prototype). One shared profile per mobile number across
 * chat, voice and expert channels. Personal identifiers are stored masked where
 * the use case allows; KYC images are never stored (only extracted fields).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { LineItem, Profile, Quote } from "./engine";

export type ChatMsg = { role: "user" | "assistant" | "system"; text: string; at: string; channel: "chat" | "voice" | "expert" };

export type ConsentRecord = {
  purpose: "kyc" | "voice" | "expert_handoff" | "marketing" | "callback";
  granted: boolean;
  at: string;
  noticeVersion: string;
  language: string;
};

export type KycCheck = { id: string; label: string; status: "pass" | "fail" | "warn"; detail: string; fix?: string };

export type KycState = {
  gstin?: string; // full value kept server-side for verification; UI shows masked
  udyam?: string;
  source: Record<string, "registry" | "digilocker" | "upload">;
  extracted: Record<string, Record<string, string>>; // docType -> fields (images discarded)
  checks: KycCheck[];
  verified: boolean;
  esigned: boolean;
  updatedAt?: string;
};

export type EscalationReason =
  | "price_objection" | "complex_case" | "not_feasible" | "kyc_failed" | "idle_quote"
  | "low_confidence" | "asked_human";

export type Session = {
  id: string;
  phone?: string;
  name?: string;
  language: string;
  profile: Profile;
  bundle: LineItem[];
  contractMonths?: number;
  setupSpread?: boolean;
  priceObjections: number;
  messages: ChatMsg[];
  consents: ConsentRecord[];
  kyc: KycState;
  quoteId?: string;
  orderId?: string;
  escalation?: { reason: EscalationReason; note: string; at: string; leadId: string };
  /** Which question the advisor asked last, so a short reply ("Yes", "8", "Patiala") is read as its answer. */
  awaiting?: "businessType" | "city" | "employees" | "sites" | "hasGstin" | "needs";
  createdAt: string;
  updatedAt: string;
  marketingOptIn?: boolean;
};

export type OrderStage =
  | "placed" | "paid" | "kyc_verified" | "feasibility" | "assigned" | "installing" | "live" | "first_bill";

export const ORDER_STAGES: { key: OrderStage; label: string }[] = [
  { key: "placed", label: "Order placed" },
  { key: "paid", label: "Payment received" },
  { key: "kyc_verified", label: "KYC verified" },
  { key: "feasibility", label: "Site feasibility confirmed" },
  { key: "assigned", label: "Technician assigned" },
  { key: "installing", label: "Installation" },
  { key: "live", label: "Live" },
  { key: "first_bill", label: "First bill" },
];

export type Order = {
  id: string;
  sessionId: string;
  quote: Quote;
  stage: OrderStage;
  history: { stage: OrderStage; at: string; note?: string }[];
  createdAt: string;
  dayOffset: number; // demo clock: "simulate next day"
  etaDay: number; // dayOffset by which it should be live
  technician?: { name: string; slot: string };
  productStatus: Record<string, "pending" | "installed">;
  notifications: { at: string; text: string }[];
  escalated?: boolean;
  tickets: { id: string; text: string; status: "open" | "closed"; at: string }[];
};

export type Expert = {
  id: string;
  name: string;
  city: string;
  state: string;
  languages: string[];
  specialties: string[]; // segments
  activationRate: number;
  churn6m: number;
  load: number;
  rating: number;
  kind: "partner" | "field";
};

export type Lead = {
  id: string;
  sessionId: string;
  createdAt: string;
  reason: EscalationReason;
  note: string;
  mode: "call" | "visit" | "nurture";
  priority: "high" | "medium" | "low";
  score: number;
  scoreFactors: { label: string; impact: number }[];
  offers: { expertId: string; offeredAt: string; status: "offered" | "accepted" | "expired" | "declined"; why: string }[];
  assignedExpertId?: string;
  overriddenBy?: string;
  status: "new" | "assigned" | "contacted" | "won" | "lost";
  slot?: string;
  consentAt?: string;
};

export type DiscountRequest = {
  id: string;
  sessionId: string;
  leadId?: string;
  expertId?: string;
  caseType: "competitor_match" | "multisite_mfg" | "high_value";
  proof: string;
  pct: number;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  decidedAt?: string;
  holdUntil: string;
  managerNote?: string;
  /** Temporary demo request (no real session behind it). Shown with a "Demo" tag on the manager page. */
  demo?: { business: string; city: string; monthly: number; bundle: string };
};

type DB = {
  sessions: Record<string, Session>;
  orders: Record<string, Order>;
  leads: Record<string, Lead>;
  discounts: Record<string, DiscountRequest>;
  experts: Expert[];
};

const FILE = path.join(process.cwd(), "data", "store.json");
const g = globalThis as unknown as { __udyamDb?: DB; __udyamMtime?: number };

function fileMtime() {
  try {
    return fs.statSync(FILE).mtimeMs;
  } catch {
    return 0;
  }
}

function seedExperts(): Expert[] {
  const e = (id: string, name: string, city: string, state: string, languages: string[], specialties: string[], activationRate: number, churn6m: number, load: number, rating: number, kind: Expert["kind"]): Expert =>
    ({ id, name, city, state, languages, specialties, activationRate, churn6m, load, rating, kind });
  return [
    e("E01", "Ravi Menon (Kochi Connect)", "Kochi", "Kerala", ["Malayalam", "English", "Hindi"], ["prof", "micro"], 0.18, 0.08, 2, 4.6, "partner"),
    e("E02", "Anita Kulkarni (Field)", "Pune", "Maharashtra", ["Marathi", "Hindi", "English"], ["multi", "mfg"], 0.21, 0.07, 4, 4.7, "field"),
    e("E03", "Suresh Yadav (Lucknow Digital)", "Lucknow", "Uttar Pradesh", ["Hindi", "English"], ["micro", "prof"], 0.14, 0.12, 1, 4.3, "partner"),
    e("E04", "Priya Iyer (Field)", "Chennai", "Tamil Nadu", ["Tamil", "English"], ["prof", "multi"], 0.19, 0.09, 3, 4.5, "field"),
    e("E05", "Harpreet Singh (Ludhiana Net)", "Ludhiana", "Punjab", ["Punjabi", "Hindi"], ["micro", "mfg"], 0.12, 0.15, 0, 4.1, "partner"),
    e("E06", "Kiran Rao (Field)", "Bengaluru", "Karnataka", ["Kannada", "English", "Hindi", "Telugu"], ["multi", "prof", "mfg"], 0.22, 0.06, 5, 4.8, "field"),
    e("E07", "Amit Shah (Ahmedabad Biz)", "Ahmedabad", "Gujarat", ["Gujarati", "Hindi", "English"], ["micro", "multi"], 0.16, 0.10, 2, 4.4, "partner"),
    e("E08", "Sourav Das (Kolkata Link)", "Kolkata", "West Bengal", ["Bengali", "Hindi", "English"], ["micro", "prof"], 0.15, 0.11, 1, 4.2, "partner"),
    e("E09", "Neha Verma (Field)", "Delhi", "Delhi", ["Hindi", "English", "Punjabi"], ["multi", "prof", "mfg"], 0.20, 0.08, 3, 4.6, "field"),
    e("E10", "Lakshmi Reddy (Hyd Connect)", "Hyderabad", "Telangana", ["Telugu", "Hindi", "English"], ["prof", "micro"], 0.17, 0.09, 2, 4.5, "partner"),
    e("E11", "Arun Nair (Field)", "Thiruvananthapuram", "Kerala", ["Malayalam", "English", "Tamil"], ["multi", "mfg"], 0.19, 0.07, 1, 4.5, "field"),
    e("E12", "Rahul Joshi (Jaipur Net)", "Jaipur", "Rajasthan", ["Hindi", "English"], ["micro", "multi"], 0.13, 0.13, 0, 4.0, "partner"),
  ];
}

/** Re-reads the file when another process (voice-server) has written it. */
function load(): DB {
  // Pending local write => our memory is newest. Otherwise reload if another process wrote the file.
  if (g.__udyamDb && (saveTimer || fileMtime() <= (g.__udyamMtime ?? 0))) return g.__udyamDb;
  let db: DB;
  try {
    db = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    db = { sessions: {}, orders: {}, leads: {}, discounts: {}, experts: seedExperts() };
  }
  if (!db.experts?.length) db.experts = seedExperts();
  g.__udyamDb = db;
  g.__udyamMtime = fileMtime();
  return db;
}

let saveTimer: NodeJS.Timeout | null = null;
export function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!g.__udyamDb) return;
    fs.writeFileSync(FILE, JSON.stringify(g.__udyamDb, null, 1));
    g.__udyamMtime = fileMtime();
  }, 50);
}

export const nowIso = () => new Date().toISOString();
export const newId = (p: string) => `${p}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

export const db = {
  get raw() {
    return load();
  },
  session(id: string) {
    return load().sessions[id];
  },
  sessionByPhone(phone: string) {
    const d = phone.replace(/\D/g, "").slice(-10);
    return Object.values(load().sessions).find((s) => s.phone && s.phone.replace(/\D/g, "").slice(-10) === d);
  },
  createSession(init: Partial<Session> = {}): Session {
    const s: Session = {
      id: newId("S"),
      language: "English",
      profile: {},
      bundle: [],
      priceObjections: 0,
      messages: [],
      consents: [],
      kyc: { source: {}, extracted: {}, checks: [], verified: false, esigned: false },
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ...init,
    };
    load().sessions[s.id] = s;
    persist();
    return s;
  },
  saveSession(s: Session) {
    s.updatedAt = nowIso();
    load().sessions[s.id] = s;
    persist();
    return s;
  },
  deleteSession(id: string) {
    const d = load();
    delete d.sessions[id];
    for (const [k, o] of Object.entries(d.orders)) if (o.sessionId === id) delete d.orders[k];
    for (const [k, l] of Object.entries(d.leads)) if (l.sessionId === id) delete d.leads[k];
    for (const [k, x] of Object.entries(d.discounts)) if (x.sessionId === id) delete d.discounts[k];
    persist();
  },
  order(id: string) {
    return load().orders[id];
  },
  saveOrder(o: Order) {
    load().orders[o.id] = o;
    persist();
    return o;
  },
  lead(id: string) {
    return load().leads[id];
  },
  saveLead(l: Lead) {
    load().leads[l.id] = l;
    persist();
    return l;
  },
  discount(id: string) {
    return load().discounts[id];
  },
  saveDiscount(x: DiscountRequest) {
    load().discounts[x.id] = x;
    persist();
    return x;
  },
  get experts() {
    return load().experts;
  },
  expert(id: string) {
    return load().experts.find((e) => e.id === id);
  },
};
