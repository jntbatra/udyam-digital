/**
 * Advisor agent: Gemma 4 (Bedrock Mantle) talks; the rule engine decides.
 * Shared by chat and voice (voice calls the same tool executors).
 */
import { z } from "zod";
import { chatCompletion, normaliseArgs, type ChatMessage, type ToolDef } from "./llm";
import {
  recommend, priceBundle, cheaperOptions, upsellSuggestions, validateBundle, NEED_LABELS,
  type Need, type Profile, type Segment,
} from "./engine";
import { data } from "./data";
import { validateGstinFormat, maskGstin } from "./ids";
import { db, nowIso, type Session } from "./store";
import { detectEscalation, escalate } from "./routing";
import { detectLanguage } from "./lang";

export const LANGUAGES = [
  "English", "Hindi", "Tamil", "Telugu", "Bengali", "Marathi", "Gujarati", "Kannada",
  "Malayalam", "Punjabi", "Odia", "Assamese",
] as const;

const NEEDS = Object.keys(NEED_LABELS) as Need[];

const ProfileArgs = z.object({
  businessName: z.string().optional(),
  businessType: z.string().optional(),
  segment: z.enum(["micro", "prof", "multi", "mfg"]).optional(),
  city: z.string().optional(),
  employees: z.coerce.number().int().min(1).max(5000).optional(),
  sites: z.coerce.number().int().min(1).max(200).optional(),
  hasGstin: z.coerce.boolean().optional(),
  currentInternet: z.string().optional(),
  monthlySpend: z.coerce.number().optional(),
  needs: z.array(z.enum(NEEDS as [Need, ...Need[]])).optional(),
  mobileLines: z.coerce.number().int().min(0).max(500).optional(),
  cameras: z.coerce.number().int().min(0).max(500).optional(),
  emailUsers: z.coerce.number().int().min(0).max(5000).optional(),
  counters: z.coerce.number().int().min(0).max(100).optional(),
  fibreFeasible: z.coerce.boolean().optional(),
  simOnly: z.coerce.boolean().optional(),
});

export const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "update_profile",
      description:
        "Save facts the owner told you about their business. Call whenever you learn something. segment: micro=kirana/salon/pharmacy/shop/bakery, prof=clinic/CA/coaching/office, multi=chain with several stores/restaurants, mfg=manufacturing unit. needs: list of what they want.",
      parameters: {
        type: "object",
        properties: {
          businessName: { type: "string" },
          businessType: { type: "string", description: "e.g. dental clinic, kirana, CA firm" },
          segment: { type: "string", enum: ["micro", "prof", "multi", "mfg"] },
          city: { type: "string" },
          employees: { type: "integer" },
          sites: { type: "integer", description: "number of locations/branches" },
          hasGstin: { type: "boolean" },
          currentInternet: { type: "string", description: "hotspot / home broadband / business broadband / leased line / none" },
          monthlySpend: { type: "number", description: "current telecom spend per month in INR" },
          needs: { type: "array", items: { type: "string", enum: NEEDS } },
          mobileLines: { type: "integer" },
          cameras: { type: "integer" },
          emailUsers: { type: "integer" },
          counters: { type: "integer", description: "billing counters" },
          simOnly: { type: "boolean", description: "true if they only want mobile SIMs" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_gstin",
      description: "Verify a GSTIN the owner gives (format, checksum, registry status). Call when they share a GSTIN.",
      parameters: { type: "object", properties: { gstin: { type: "string" } }, required: ["gstin"] },
    },
  },
  {
    type: "function",
    function: {
      name: "recommend_bundle",
      description: "Build the recommended bundle and monthly price from the rule engine using the saved profile. Call once type, city, employees, sites and GSTIN yes/no are known.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "change_bundle",
      description: "Add, remove or change quantity of products in the bundle (ids P01-P25). Put ALL changes the owner asked for into ONE call using `changes`, then state the single final monthly price from the result.",
      parameters: {
        type: "object",
        properties: {
          changes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                action: { type: "string", enum: ["add", "remove", "set_qty"] },
                productId: { type: "string" },
                qty: { type: "integer" },
              },
              required: ["action", "productId"],
            },
          },
          action: { type: "string", enum: ["add", "remove", "set_qty"] },
          productId: { type: "string" },
          qty: { type: "integer" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "price_objection",
      description: "Call when the owner says it is too expensive or a competitor is cheaper. Returns cheaper structural options (never discounts).",
      parameters: { type: "object", properties: { competitorMentioned: { type: "boolean" } }, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "request_expert",
      description: "Hand over to a local Udyam Digital expert when the case is complex, the owner is confused/frustrated, or asks for a human.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", enum: ["complex_case", "low_confidence", "asked_human", "price_objection", "not_feasible"] },
          note: { type: "string" },
        },
        required: ["reason"],
      },
    },
  },
];

function systemPrompt(s: Session) {
  return `You are "Udyam Saathi", Udyam Digital's advisor for small businesses in India.
Reply in the language the owner is using right now — currently ${s.language}${s.language === "English" ? "" : " (simple everyday words, native script; product names may stay in English)"}. If they switch language, switch with them.
Goal: understand the business in a few short questions, then recommend a bundle with ONE clear monthly price.

Rules:
- Ask at most ONE short question per reply. Keep replies under 60 words (they may be spoken aloud).
- Collect: business type, city, number of employees, number of sites, GSTIN (yes/no), current internet, and needs (UPI/billing, WhatsApp, CCTV, email, backup, security, customer Wi-Fi...).
- Always call update_profile when the owner gives facts. Then call recommend_bundle as soon as type, city, employees, sites and GSTIN are known.
- NEVER invent products, prices, discounts or eligibility. Only state what tools return. Explain each product in plain words with its reason.
- When the owner asks for several changes, make them in ONE change_bundle call and say the final monthly price once. Never announce an in-between total.
- Business SIMs are optional: ask if they need mobile lines for themselves or staff; add "mobile" to needs only if they say yes.
- NEVER mention or promise discounts. If price is a concern, call price_objection and present the options it returns.
- If a product is excluded (e.g. WhatsApp API needs GSTIN), explain why and give the alternative from the tool.
- If the owner only wants SIM cards, set simOnly=true and recommend.
- If the case is complex (3+ sites, manufacturing, leased line), or the owner asks for a person, call request_expert.
- After recommending, tell them to tap "View quote" to see and adjust the price.
- You are the ADVISOR. Never write the customer's lines or pretend to be the customer.
- Do not ask again for anything already in the saved profile below.
Current saved profile: ${JSON.stringify(s.profile)}
Still needed: ${missingFor(s.profile).join(", ") || "nothing — recommend now"}
Current bundle: ${JSON.stringify(s.bundle.map((b) => `${b.productId}x${b.qty}`))}`;
}

export type ToolEvent = { name: string; result: unknown };

export function applyProfile(s: Session, args: Record<string, unknown>) {
  const parsed = ProfileArgs.safeParse(args);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  const p = parsed.data as Partial<Profile>;
  const prev = s.profile;
  const next: Profile = { ...prev, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) };
  if (p.needs) next.needs = [...new Set([...(prev.needs ?? []), ...p.needs])];
  if (p.city !== undefined) {
    // reject malformed model output (e.g. "',employees: 8 <!-- ...") — a city is a short plain name
    const clean = String(p.city).trim();
    if (!/^[\p{L} .'-]{2,30}$/u.test(clean)) {
      delete next.city;
      if (prev.city) next.city = prev.city;
    } else next.city = clean;
  }
  if (p.city && next.city) {
    const ci = data.cityInfo(next.city);
    if (ci) Object.assign(next, { city: ci.city, cityTier: ci.tier, state: ci.state });
    else next.cityTier = next.cityTier ?? 2;
  }
  if (!next.segment && next.businessType) next.segment = guessSegment(next.businessType, next.sites);
  if ((next.sites ?? 1) >= 3 && next.segment === "micro") next.segment = "multi";
  s.profile = next;
  return { ok: true, profile: next, stillNeeded: missingFor(next) };
}

function missingFor(p: Profile) {
  const m: string[] = [];
  if (!p.businessType && !p.segment) m.push("business type");
  if (!p.city) m.push("city");
  if (p.employees === undefined) m.push("employees");
  if (p.sites === undefined) m.push("number of sites");
  if (p.hasGstin === undefined) m.push("GSTIN yes/no");
  return m;
}

export function guessSegment(t: string, sites?: number): Segment {
  const x = t.toLowerCase();
  if ((sites ?? 1) >= 2 && /restaurant|store|chain|outlet|shop|retail|cafe/.test(x)) return "multi";
  if (/manufactur|factory|unit|textile|auto.?part|plant|workshop|fabricat/.test(x)) return "mfg";
  if (/clinic|dental|doctor|hospital|ca |chartered|account|coaching|school|tuition|lawyer|office|consult|architect|travel|agency|diagnostic|lab/.test(x)) return "prof";
  return "micro";
}

export function doRecommend(s: Session) {
  const missing = missingFor(s.profile);
  if (!s.profile.simOnly && !s.profile.needs?.length) missing.push("what they need (billing/UPI, business SIMs, WhatsApp, CCTV, email, backup, customer Wi-Fi) — ask before recommending");
  if (missing.length) return { ok: false, needToAsk: missing, sayThis: "Do not state any price yet; ask the missing question." };
  const r = recommend(s.profile);
  s.bundle = r.items;
  const q = priceBundle(s.bundle, s.profile, { contractMonths: s.contractMonths, setupSpread: s.setupSpread });
  return {
    ok: true,
    items: q.lines.map((l) => ({ id: l.productId, name: l.name, qty: l.qty, monthly: l.monthly, why: l.reason })),
    monthlyPrice: q.monthly,
    oneTimeSetup: q.setupTotal,
    contractMonths: q.contractMonths,
    installInDays: q.etaDays,
    excluded: r.exclusions,
    notes: r.notes,
    optionalAddOns: upsellSuggestions(s.bundle, s.profile, { priceObjection: s.priceObjections > 0 }).map((u) => ({ id: u.productId, name: u.name, monthly: u.monthly, why: u.reason })),
  };
}

export async function runTool(s: Session, name: string, rawArgs: string): Promise<unknown> {
  switch (name) {
    case "update_profile":
      return applyProfile(s, normaliseArgs(rawArgs, Object.keys(ProfileArgs.shape)));
    case "lookup_gstin": {
      const { gstin } = normaliseArgs(rawArgs, ["gstin"]) as { gstin?: string };
      if (!gstin) return { ok: false, error: "no gstin" };
      const g = String(gstin).toUpperCase().replace(/\s/g, "");
      const f = validateGstinFormat(g);
      if (!f.ok) return { ok: false, valid: false, reason: f.reason };
      const reg = data.gstin(g);
      s.kyc.gstin = g;
      s.kyc.source.gst_certificate = "registry";
      s.profile.hasGstin = true;
      s.profile.gstin = g;
      s.profile.gstinStatus = reg ? reg.status : "Unknown";
      if (reg) {
        s.profile.businessName = s.profile.businessName ?? reg.trade_name;
        const city = reg.principal_place_of_business.split(",").map((x) => x.trim()).find((x) => data.cityInfo(x));
        if (city && !s.profile.city) applyProfile(s, { city });
      }
      return reg
        ? { ok: true, gstin: maskGstin(g), legalName: reg.legal_name, tradeName: reg.trade_name, state: reg.state, status: reg.status }
        : { ok: true, gstin: maskGstin(g), status: "Not found in registry" };
    }
    case "recommend_bundle":
      return doRecommend(s);
    case "change_bundle": {
      let raw: Record<string, unknown> = {};
      try { raw = JSON.parse(rawArgs || "{}"); } catch { /* fall through to normalised single change */ }
      const list = (Array.isArray(raw.changes) ? raw.changes : [normaliseArgs(rawArgs, ["action", "productId", "qty"])]) as { action?: string; productId?: string; qty?: number }[];
      let next = [...s.bundle];
      for (const a of list.map((c) => normaliseArgs(JSON.stringify(c), ["action", "productId", "qty"]) as { action?: string; productId?: string; qty?: number })) {
        const pid = String(a.productId ?? "").toUpperCase();
        if (!data.product(pid)) return { ok: false, error: `unknown product ${pid}` };
        if (a.action === "remove") next = next.filter((i) => i.productId !== pid);
        else if (a.action === "set_qty") next = next.map((i) => (i.productId === pid ? { ...i, qty: Math.max(1, Number(a.qty) || 1) } : i));
        else if (next.some((i) => i.productId === pid)) next = next.map((i) => (i.productId === pid && a.qty ? { ...i, qty: Math.max(1, Number(a.qty)) } : i));
        else next.push({ productId: pid, qty: Math.max(1, Number(a.qty) || 1), reason: "Added on request" });
      }
      const v = validateBundle(next, s.profile);
      if (v.length) return { ok: false, notAllowed: v.map((x) => x.message), note: "No changes were made." };
      s.bundle = next;
      const q = priceBundle(next, s.profile, { contractMonths: s.contractMonths, setupSpread: s.setupSpread });
      return { ok: true, finalMonthlyPrice: q.monthlyWithSetup, oneTimeSetup: q.setupSpread ? 0 : q.setupTotal, items: q.lines.map((l) => `${l.name} x${l.qty}`), sayThis: "State only this final monthly price, once." };
    }
    case "price_objection": {
      s.priceObjections += 1;
      const esc = detectEscalation(s);
      const opts = cheaperOptions(s.bundle, s.profile).map((o) => ({
        option: o.label,
        monthlyPrice: priceBundle(o.items, s.profile, { contractMonths: o.contractMonths ?? s.contractMonths }).monthly,
      }));
      return { ok: true, cheaperOptions: opts, objectionCount: s.priceObjections, escalate: esc?.reason === "price_objection" ? "Offer to connect a local Udyam Digital expert" : undefined };
    }
    case "request_expert": {
      const a = normaliseArgs(rawArgs, ["reason", "note"]) as { reason?: string; note?: string };
      const consent = s.consents.find((c) => c.purpose === "expert_handoff" && c.granted);
      if (!consent) return { ok: false, needsConsent: true, tellOwner: "Ask: can a local Udyam Digital expert call or visit you? They will see only your name, business, area and draft plan. The app will show a consent button." };
      const lead = escalate(s, (a.reason as never) ?? "asked_human", a.note ?? "");
      return { ok: true, leadId: lead.id, mode: lead.mode, priority: lead.priority };
    }
    default:
      return { ok: false, error: `unknown tool ${name}` };
  }
}

/** One advisor turn (chat). Returns assistant text + tool events for the UI. */
/** Switch the conversation language to whatever the owner is using (auto-detect). */
export function autoLanguage(s: Session, text: string) {
  const l = detectLanguage(text);
  // short Latin replies like "yes", "8", "Kochi" should not flip a Hindi conversation to English
  if (!l || (l === "English" && s.language !== "English" && text.trim().split(/\s+/).length < 4)) return;
  s.language = l;
}

export async function advisorTurn(s: Session, userText: string, channel: "chat" | "voice" = "chat") {
  autoLanguage(s, userText);
  s.messages.push({ role: "user", text: userText, at: nowIso(), channel });
  const facts = extractFacts(userText);
  if (Object.keys(facts).length) applyProfile(s, facts);
  const history: ChatMessage[] = s.messages
    .filter((m) => m.role !== "system")
    .slice(-14)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.text }));
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt(s) }, ...history];
  const events: ToolEvent[] = [];
  let text = "";
  for (let step = 0; step < 4; step++) {
    const { message } = await chatCompletion({ messages, tools: TOOLS });
    const calls = message.tool_calls ?? [];
    if (!calls.length) {
      text = (message.content ?? "").trim();
      break;
    }
    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: calls });
    for (const c of calls) {
      const result = await runTool(s, c.function.name, c.function.arguments);
      events.push({ name: c.function.name, result });
      messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(result).slice(0, 4000) });
    }
    // refresh system prompt with new state
    messages[0] = { role: "system", content: systemPrompt(s) };
  }
  // Deterministic safety net: once the profile is complete, the engine builds the plan
  // even if the model forgot to call recommend_bundle; the model only phrases it.
  if (!s.bundle.length && missingFor(s.profile).length === 0 && (s.profile.needs?.length || s.profile.simOnly)) {
    const rec = doRecommend(s);
    events.push({ name: "recommend_bundle", result: rec });
    try {
      const { message } = await chatCompletion({
        messages: [
          { role: "system", content: systemPrompt(s) },
          { role: "user", content: `[Note from the system, not the customer] The rule engine built this plan: ${JSON.stringify(rec)}. Explain it to the owner in ${s.language} in under 80 words: list each product with its short reason, the monthly price, one-time setup, install days, and any excluded product with its alternative. End by asking them to tap "View quote". Speak as the advisor.` },
        ],
        max_tokens: 500,
      });
      if (message.content) text = message.content.trim();
    } catch {
      /* keep whatever text we have */
    }
  }
  if (!text) {
    const g = guidedNext(s);
    text = g.text;
  }
  s.messages.push({ role: "assistant", text, at: nowIso(), channel });
  db.saveSession(s);
  return { text, events };
}

const HI_NUM: Record<string, number> = { एक: 1, दो: 2, तीन: 3, चार: 4, पांच: 5, पाँच: 5, छह: 6, सात: 7, आठ: 8, नौ: 9, दस: 10, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const numBefore = (x: string, words: string) => {
  const re = new RegExp(`(\\d+|${Object.keys(HI_NUM).join("|")})\\s*(?:ही\\s*|only\\s*)?(?:${words})`, "i");
  const m = x.match(re);
  if (!m) return undefined;
  return /^\d+$/.test(m[1]) ? +m[1] : HI_NUM[m[1].toLowerCase()];
};

/** Deterministic fact extraction (English + Hindi keywords). Runs on every message, LLM or not. */
export function extractFacts(text: string): Record<string, unknown> {
  const x = text.toLowerCase();
  const patch: Record<string, unknown> = {};
  const city = data.cities.find((c) => x.includes(c.toLowerCase())) ?? (/कोच्चि/.test(x) ? "Kochi" : /दिल्ली/.test(x) ? "Delhi" : /मुंबई/.test(x) ? "Mumbai" : /पुणे/.test(x) ? "Pune" : /लखनऊ/.test(x) ? "Lucknow" : /जयपुर/.test(x) ? "Jaipur" : /कोलकाता/.test(x) ? "Kolkata" : undefined);
  if (city) patch.city = city;
  const emp = numBefore(x, "लोग|staff|employees?|people|workers?|कर्मचारी|log");
  if (emp) patch.employees = emp;
  const sites = numBefore(x, "ब्रांच|branch(?:es)?|sites?|locations?|stores?|outlets?|restaurants?|दुकानें|shops|clinics|offices");
  if (sites) patch.sites = sites;
  const TYPES: [RegExp, string][] = [
    [/dental|डेंटल/, "Dental clinic"], [/clinic|क्लिनिक/, "Clinic"], [/kirana|किराना|grocery/, "Kirana store"],
    [/restaurant|रेस्टोरेंट|रेस्टोरेंट/, "Restaurant"], [/salon|सैलून|पार्लर/, "Salon"], [/pharmacy|chemist|मेडिकल/, "Pharmacy"],
    [/factory|manufactur|फैक्ट्री|कारखाना/, "Manufacturing unit"], [/\bca\b|chartered|accountant/, "CA firm"],
    [/coaching|कोचिंग|tuition/, "Coaching centre"], [/bakery|बेकरी/, "Bakery"], [/shop|दुकान|store/, "Shop"],
  ];
  const ty = TYPES.find(([re]) => re.test(x));
  if (ty) patch.businessType = ty[1];
  if (/(gstin|gst)\s*(है|hai|available|yes)|have (a )?gst|हाँ.{0,12}gst|gst.{0,12}हाँ|gst number is/.test(x)) patch.hasGstin = true;
  if (/(no|नहीं|nahi|don'?t have)\s*(a )?gst|gst\s*(नहीं|nahi|not)/.test(x)) patch.hasGstin = false;
  const needMap: [RegExp, Need][] = [
    [/upi|billing|pos|बिलिंग|पेमेंट/, "upi_pos"], [/whats ?app|व्हाट्सएप|व्हाट्सऐप/, "whatsapp"], [/cctv|camera|कैमरा|सीसीटीवी/, "cctv"],
    [/e-?mail|mail|ईमेल/, "email"], [/backup|बैकअप/, "backup"], [/security|antivirus|virus|सुरक्षा|वायरस/, "security"],
    [/wi-?fi|guest|वाई-?फाई/, "wifi_guest"], [/\bsms\b|एसएमएस/, "sms"], [/website|domain|वेबसाइट/, "website"],
    [/failover|backup internet|बैकअप इंटरनेट/, "failover"], [/sim\b|सिम|mobile lines?/, "mobile"],
  ];
  const needs = needMap.filter(([re]) => re.test(x)).map(([, n]) => n);
  if (needs.length) patch.needs = needs;
  if (/hotspot|हॉटस्पॉट/.test(x)) patch.currentInternet = "Mobile hotspot";
  else if (/home broadband|होम ब्रॉडबैंड/.test(x)) patch.currentInternet = "Home broadband";
  return patch;
}

/** Offline keyword parser for the guided flow (no LLM). Answers the question that was asked. */
export function parseGuidedAnswer(s: Session, text: string) {
  const x = text.toLowerCase();
  const m = missingFor(s.profile);
  const patch: Record<string, unknown> = {};
  const num = (() => {
    const r = x.match(/(\d+)\s*(?:-|to)\s*(\d+)/);
    if (r) return Math.round((+r[1] + +r[2]) / 2);
    const n = x.match(/\d+/);
    return n ? +n[0] : undefined;
  })();
  const city = data.cities.find((c) => x.includes(c.toLowerCase()));
  if (city) patch.city = city;
  if (m[0] === "business type" || /clinic|shop|kirana|restaurant|factory|manufactur|office|ca\b|salon|pharmacy|bakery|store/.test(x)) {
    if (!s.profile.businessType) patch.businessType = text.replace(/\s*\/.*$/, "");
  }
  if (m[0] === "employees" && num !== undefined) patch.employees = num;
  else if (m[0] === "number of sites" && num !== undefined) patch.sites = num;
  if (m[0] === "GSTIN yes/no" || /gst/.test(x)) {
    if (/^(yes|y|haan|ha|हाँ|हां)\b|have gst|gst hai|गस्ट|हाँ/.test(x)) patch.hasGstin = true;
    else if (/^(no|n|nahi|नहीं)\b|no gst/.test(x)) patch.hasGstin = false;
  }
  const needMap: [RegExp, Need][] = [
    [/upi|billing|pos|बिल/, "upi_pos"], [/whats ?app/, "whatsapp"], [/cctv|camera|कैमरा/, "cctv"], [/email|mail/, "email"],
    [/backup/, "backup"], [/security|antivirus|virus/, "security"], [/wi-?fi|guest/, "wifi_guest"], [/sms/, "sms"],
    [/website|domain/, "website"], [/failover|backup internet/, "failover"],
  ];
  const needs = needMap.filter(([re]) => re.test(x)).map(([, n]) => n);
  if (needs.length) patch.needs = needs;
  if (Object.keys(patch).length) applyProfile(s, patch);
  if (!missingFor(s.profile).length && (s.profile.needs?.length || /none|nothing|bas|that'?s all|done/.test(x))) {
    if (!s.profile.needs?.length) s.profile.needs = ["internet"];
    doRecommend(s);
  }
}

/** Deterministic guided flow — used when the LLM is unavailable (offline demo). */
export function guidedNext(s: Session): { text: string; options?: string[] } {
  if (s.bundle.length && !missingFor(s.profile).length)
    return { text: s.language === "Hindi" ? "आपका प्लान तैयार है — 'View quote' दबाएँ।" : "Your plan is ready — tap 'View quote'." };
  const hi = s.language === "Hindi";
  const m = missingFor(s.profile);
  if (m.includes("business type"))
    return { text: hi ? "आपका बिज़नेस किस तरह का है?" : "What kind of business do you run?", options: ["Kirana / shop", "Clinic", "CA / office", "Restaurant chain", "Manufacturing unit"] };
  if (m.includes("city")) return { text: hi ? "आप किस शहर में हैं?" : "Which city are you in?", options: data.cities.slice(0, 8) };
  if (m.includes("employees")) return { text: hi ? "कितने लोग काम करते हैं?" : "How many people work there?", options: ["1-3", "4-9", "10-24", "25+"] };
  if (m.includes("number of sites")) return { text: hi ? "कितनी ब्रांच/लोकेशन हैं?" : "How many locations?", options: ["1", "2", "3-5", "6+"] };
  if (m.includes("GSTIN yes/no")) return { text: hi ? "क्या आपके पास GSTIN है?" : "Do you have a GSTIN?", options: ["Yes", "No"] };
  if (!s.profile.needs?.length)
    return { text: hi ? "आपको क्या चाहिए? (कई चुन सकते हैं)" : "What do you need? (pick any)", options: ["UPI / billing", "Business SIMs", "WhatsApp", "CCTV", "Email", "Backup", "Security", "Customer Wi-Fi"] };
  return { text: hi ? "आपका प्लान तैयार है — 'View quote' दबाएँ।" : "Your plan is ready — tap 'View quote'." };
}
