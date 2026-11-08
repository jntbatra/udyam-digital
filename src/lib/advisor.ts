/**
 * Advisor agent: Gemma 4 (Bedrock Mantle) talks; the rule engine decides.
 * Shared by chat and voice (voice calls the same tool executors).
 */
import { z } from "zod";
import { chatCompletion, normaliseArgs, VOICE_TARGET, CHAT_TARGET, type ChatMessage, type ToolDef } from "./llm";
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

function systemPrompt(s: Session, channel: "chat" | "voice" = "chat") {
  const voiceRules = channel === "voice"
    ? "\nVOICE CALL: you are speaking on a live call. Reply in at most 2 short spoken sentences (under 30 words), no lists or symbols, end with one question. If the owner interrupted you, drop what you were saying and answer what they just said."
    : "";
  return `You are "Udyam Saathi", Udyam Digital's advisor for small businesses in India.
Reply in the language the owner is using right now — currently ${s.language}${s.language === "English" ? "" : " (simple everyday words, native script; product names may stay in English)"}. If they switch language, switch with them.
Goal: understand the business in a few short questions, then recommend a bundle with ONE clear monthly price.

Rules:
- Write plain conversational text: no markdown, no tables, no headings, no bold. For a plan, use one short line per product starting with "- ".
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
Current bundle: ${JSON.stringify(s.bundle.map((b) => `${b.productId}x${b.qty}`))}${voiceRules}`;
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
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt(s, channel) }, ...history];
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
    messages[0] = { role: "system", content: systemPrompt(s, channel) };
  }
  // Deterministic safety net: once the profile is complete, the engine builds the plan
  // even if the model forgot to call recommend_bundle; the model only phrases it.
  if (!s.bundle.length && missingFor(s.profile).length === 0 && (s.profile.needs?.length || s.profile.simOnly)) {
    const rec = doRecommend(s);
    events.push({ name: "recommend_bundle", result: rec });
    try {
      const { message } = await chatCompletion({
        messages: [
          { role: "system", content: systemPrompt(s, channel) },
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
const numBefore = (x: string, words: string, gap = 0) => {
  // gap = how many words may sit between the number and the noun ("दो किराना दुकानें", "2 grocery shops")
  const between = gap ? `(?:[^\\s]+\\s+){0,${gap}}?` : "";
  const re = new RegExp(`(\\d+|${Object.keys(HI_NUM).join("|")})\\s*(?:ही\\s*|only\\s*)?${between}(?:${words})`, "i");
  const m = x.match(re);
  if (!m) return undefined;
  return /^\d+$/.test(m[1]) ? +m[1] : HI_NUM[m[1].toLowerCase()];
};

/** Dataset cities as written in Devanagari (Hindi / Marathi speakers and Sarvam transcripts). */
const CITY_DEVANAGARI: Record<string, string[]> = {
  Ahmedabad: ["अहमदाबाद"], Bengaluru: ["बेंगलुरु", "बैंगलोर", "बेंगलुरू", "बंगलौर"], Bhopal: ["भोपाल"], Chennai: ["चेन्नई"],
  Coimbatore: ["कोयंबटूर", "कोयम्बटूर"], Delhi: ["दिल्ली"], Hyderabad: ["हैदराबाद"], Indore: ["इंदौर"], Jaipur: ["जयपुर"],
  Kochi: ["कोच्चि", "कोचीन", "कोची"], Kolkata: ["कोलकाता", "कलकत्ता"], Lucknow: ["लखनऊ"], Ludhiana: ["लुधियाना"],
  Mumbai: ["मुंबई", "मुम्बई", "बंबई"], Mysuru: ["मैसूर", "मैसूरु"], Nagpur: ["नागपुर"], Nashik: ["नासिक", "नाशिक"],
  Patna: ["पटना"], Pune: ["पुणे", "पूना"], Surat: ["सूरत"], Vadodara: ["वडोदरा", "बड़ौदा"], Visakhapatnam: ["विशाखापत्तनम", "विज़ाग", "वाइज़ैग"],
};

/** Speech-to-text often mishears city names by a letter ("Kachi" for Kochi): accept edit distance 1 on 5+ letter words. */
function fuzzyCity(x: string): string | undefined {
  const words = x.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  const dist = (a: string, b: string) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  for (const c of data.cities) {
    const cl = c.toLowerCase();
    if (cl.length >= 5 && words.some((w) => Math.abs(w.length - cl.length) <= 1 && dist(w, cl) <= 1)) return c;
  }
  return undefined;
}

/** Deterministic fact extraction (English + Hindi keywords). Runs on every message, LLM or not. */
export function extractFacts(text: string): Record<string, unknown> {
  const x = text.toLowerCase();
  const patch: Record<string, unknown> = {};
  const city = data.cities.find((c) => x.includes(c.toLowerCase())) ?? fuzzyCity(x) ?? Object.entries(CITY_DEVANAGARI).find(([, hi]) => hi.some((h) => x.includes(h)))?.[0];
  if (city) patch.city = city;
  const emp = numBefore(x, "लोग|staff|employees?|people|workers?|कर्मचारी|log");
  if (emp) patch.employees = emp;
  const sites = numBefore(x, "ब्रांच|branch(?:es)?|sites?|locations?|stores?|outlets?|restaurants?|दुकानें|दुकान|शाखाएं|shops|clinics|offices", 2);
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
  let needs = needMap.filter(([re]) => re.test(x)).map(([, n]) => n);
  if (/\b(everything|all (the )?services|all of (it|them)|add all|sab kuch|sabhi)\b|सब कुछ|सभी सेवाएं|सब चाहिए/.test(x))
    needs = [...new Set([...needs, ...EVERYTHING])];
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


// ---------------------------------------------------------------------------
// Fast voice turn: ONE short LLM call, no tool round-trips.
// Facts, plan building, plan changes and price objections are handled here
// deterministically; the model only phrases the reply from computed facts.
// ---------------------------------------------------------------------------
const PRICE_OBJECTION = /expensive|costly|too much|cheaper|less price|discount|competitor|महंग|सस्त|ज़्यादा है|ज्यादा है|कम कर|kam kar|mehenga|mahanga|sasta/i;
const ASK_HUMAN = /human|real person|agent|executive|expert|someone|call me|visit|इंसान|आदमी|किसी से बात|एक्सपर्ट|विज़िट/i;

function planFacts(s: Session) {
  if (!s.bundle.length) return null;
  const q = priceBundle(s.bundle, s.profile, { contractMonths: s.contractMonths, setupSpread: s.setupSpread });
  return {
    items: q.lines.map((l) => `${l.name}${l.qty > 1 ? ` x${l.qty}` : ""} (${l.reason})`),
    monthlyPrice: `₹${q.monthlyWithSetup.toLocaleString("en-IN")} per month`,
    oneTimeSetup: q.setupSpread || !q.setupTotal ? "none" : `₹${q.setupTotal.toLocaleString("en-IN")} one-time`,
    liveInDays: q.etaDays,
  };
}

const NEED_KEYS = Object.keys(NEED_LABELS) as Need[];
/** What "everything" means for a small business (enterprise add-ons only when asked by name). */
const EVERYTHING: Need[] = ["internet", "upi_pos", "mobile", "whatsapp", "cctv", "email", "backup", "wifi_guest", "website"];
const CATALOGUE_OVERVIEW = (() => {
  const by = new Map<string, string[]>();
  for (const p of data.products) by.set(p.category, [...(by.get(p.category) ?? []), p.product_name]);
  return [...by].map(([c, names]) => `${c}: ${names.join(", ")}`).join(" | ");
})();

/** Products that a need brings into the plan (used when the owner asks to remove something). */
const REMOVE_PRODUCTS: Partial<Record<Need, string[]>> = {
  mobile: ["P07", "P08"], cctv: ["P23"], upi_pos: ["P19"], whatsapp: ["P15"], website: ["P18"], email: ["P16"],
  backup: ["P17"], wifi_guest: ["P22"], security: ["P20"], failover: ["P09"], sms: ["P14"], static_ip: ["P11"],
};

/**
 * AI fact reader: understands answers in any of our languages/scripts, short replies to the
 * last question, and corrections ("not matlab, my city is Patiala"). Returns only validated,
 * English-normalised values; anything doubtful is dropped. Falls back silently on error.
 */
async function llmFacts(s: Session, text: string): Promise<Record<string, unknown>> {
  const lastQ = [...s.messages].reverse().find((m) => m.role === "assistant")?.text ?? "";
  const prompt = `Extract business facts from the owner's latest message. The conversation may be in any Indian language or script.
Last question we asked: ${JSON.stringify(lastQ.slice(-200))}
We were waiting for: ${s.awaiting ?? "nothing specific"}
Known so far: ${JSON.stringify({ businessType: s.profile.businessType, city: s.profile.city, employees: s.profile.employees, sites: s.profile.sites, hasGstin: s.profile.hasGstin })}
Owner said: ${JSON.stringify(text)}
Return ONLY JSON with any of these keys that the message clearly states (omit unknowns):
{"businessType": short English description e.g. "kirana store","dental clinic",
 "city": city name in English spelling e.g. "Patiala" (never a non-city word),
 "employees": integer total people working,
 "sites": integer number of shops/branches/locations,
 "hasGstin": true/false,
 "needs": array from ${JSON.stringify(NEED_KEYS)},
 "simOnly": true only if they want ONLY SIM cards,
 "remove": array from the same needs list for things they want removed / do not want (e.g. "delete the SIMs" -> ["mobile"]),
 "cameras": integer number of CCTV cameras if stated, "mobileLines": integer number of SIMs/mobile lines if stated,
 "confused": true if they did not understand our question}
A bare answer like "16" or "yes" answers the question we were waiting for. Corrections override earlier values.`;
  try {
    const { message } = await chatCompletion({ messages: [{ role: "user", content: prompt }], max_tokens: 300, temperature: 0 }, VOICE_TARGET);
    const raw = (message.content ?? "").match(/\{[\s\S]*\}/)?.[0];
    if (!raw) return {};
    const j = JSON.parse(raw) as Record<string, unknown>;
    if (j.confused === true) return {};
    const out: Record<string, unknown> = {};
    if (typeof j.businessType === "string" && /^[A-Za-z &'.-]{2,40}$/.test(j.businessType)) out.businessType = j.businessType;
    if (typeof j.city === "string" && /^[A-Za-z .'-]{2,30}$/.test(j.city)) out.city = j.city;
    if (Number.isInteger(j.employees) && (j.employees as number) > 0 && (j.employees as number) < 5000) out.employees = j.employees;
    if (Number.isInteger(j.sites) && (j.sites as number) > 0 && (j.sites as number) < 500) out.sites = j.sites;
    if (typeof j.hasGstin === "boolean") out.hasGstin = j.hasGstin;
    if (Array.isArray(j.needs)) {
      let n = j.needs.filter((x): x is Need => typeof x === "string" && NEED_KEYS.includes(x as Need));
      // "everything" -> the sensible small-business set, not every enterprise add-on in the catalogue
      if (n.length >= 9) n = EVERYTHING;
      if (n.length) out.needs = n;
    }
    if (j.simOnly === true) out.simOnly = true;
    if (Array.isArray(j.remove)) {
      const r = j.remove.filter((x): x is Need => typeof x === "string" && NEED_KEYS.includes(x as Need));
      if (r.length) out.remove = r;
    }
    if (Number.isInteger(j.cameras) && (j.cameras as number) >= 0 && (j.cameras as number) < 200) out.cameras = j.cameras;
    if (Number.isInteger(j.mobileLines) && (j.mobileLines as number) >= 0 && (j.mobileLines as number) < 500) out.mobileLines = j.mobileLines;
    return out;
  } catch {
    return {};
  }
}

type AskField = NonNullable<Session["awaiting"]>;
const QUESTIONS: Record<AskField, { en: string; hi: string }> = {
  businessType: { en: "What kind of business do you run?", hi: "आपका किस तरह का बिज़नेस है?" },
  city: { en: "Which city is your business in?", hi: "आपका बिज़नेस किस शहर में है?" },
  employees: { en: "How many people work there in total?", hi: "कुल कितने लोग काम करते हैं?" },
  sites: { en: "How many shops or locations do you have?", hi: "आपकी कितनी दुकानें या ब्रांच हैं?" },
  hasGstin: { en: "Do you have a GST number?", hi: "क्या आपके पास GST नंबर है?" },
  needs: { en: "What do you need most: internet, UPI billing, business SIMs, WhatsApp, CCTV, email or backup?", hi: "आपको सबसे ज़्यादा क्या चाहिए: इंटरनेट, UPI बिलिंग, बिज़नेस सिम, WhatsApp, CCTV, ईमेल या बैकअप?" },
};

const QUESTION_CACHE = new Map<string, string>();
/** The fixed question in the owner's language (Hindi/English built in; others translated once and cached). */
async function localizedQuestion(field: AskField, language: string): Promise<string> {
  if (language === "English") return QUESTIONS[field].en;
  if (language === "Hindi") return QUESTIONS[field].hi;
  const key = `${field}:${language}`;
  const hit = QUESTION_CACHE.get(key);
  if (hit) return hit;
  try {
    const { message } = await chatCompletion(
      { messages: [{ role: "system", content: `Translate into natural, simple spoken ${language} (native script). Keep product names like WhatsApp, CCTV, UPI, GST in English. Output only the translation.` }, { role: "user", content: QUESTIONS[field].en }], max_tokens: 120 },
      VOICE_TARGET,
    );
    const q = (message.content ?? "").trim();
    if (q) {
      QUESTION_CACHE.set(key, q);
      return q;
    }
  } catch { /* fall back to English */ }
  return QUESTIONS[field].en;
}

/** Next missing fact, in a fixed order. */
function nextQuestion(s: Session): { field: AskField; question: string; fallback: (lang: string) => string } | null {
  const p = s.profile;
  const order: [AskField, boolean][] = [
    ["businessType", !p.businessType && !p.segment],
    ["city", !p.city],
    ["employees", p.employees === undefined],
    ["sites", p.sites === undefined],
    ["hasGstin", p.hasGstin === undefined],
    ["needs", !p.needs?.length && !p.simOnly],
  ];
  const f = order.find(([, missing]) => missing)?.[0];
  if (!f) return null;
  return { field: f, question: QUESTIONS[f].en, fallback: (lang) => (lang === "Hindi" ? QUESTIONS[f].hi : QUESTIONS[f].en) };
}

const YES = /^(yes|yeah|yep|haan|han|ha|ji|ji haan|hai|of course|sure|हाँ|हां|जी|है)\b/i;
const NO = /^(no|nope|nahi|nahin|na|not yet|नहीं|ना|नही)\b/i;
const EN_UNITS: Record<string, number> = { zero: 0, one: 1, a: 1, an: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const EN_TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const HI_NUMS: Record<string, number> = {
  एक: 1, दो: 2, तीन: 3, चार: 4, पांच: 5, पाँच: 5, छह: 6, छः: 6, सात: 7, आठ: 8, नौ: 9, दस: 10, ग्यारह: 11, बारह: 12, तेरह: 13, चौदह: 14, पंद्रह: 15, सोलह: 16,
  सत्रह: 17, अठारह: 18, उन्नीस: 19, बीस: 20, पच्चीस: 25, तीस: 30, पैंतीस: 35, चालीस: 40, पैंतालीस: 45, पचास: 50, साठ: 60, सत्तर: 70, अस्सी: 80, नब्बे: 90, सौ: 100,
  ek: 1, do: 2, teen: 3, char: 4, paanch: 5, panch: 5, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10, bees: 20, pachees: 25, tees: 30, chalees: 40, pachaas: 50, sau: 100,
};
/** "thirty", "twenty five", "a hundred and ten", "तीस", "30" -> number */
export function parseCount(text: string): number | undefined {
  const t = text.toLowerCase().replace(/[-,]/g, " ");
  const digits = t.match(/\d+/);
  if (digits) return Number(digits[0]);
  let total = 0, cur = 0, seen = false;
  for (const w of t.split(/\s+/)) {
    if (w in EN_UNITS) { cur += EN_UNITS[w]; seen = true; }
    else if (w in EN_TENS) { cur += EN_TENS[w]; seen = true; }
    else if (w === "hundred") { cur = (cur || 1) * 100; seen = true; }
    else if (w === "thousand") { total += (cur || 1) * 1000; cur = 0; seen = true; }
    else if (w in HI_NUMS) { cur += HI_NUMS[w]; seen = true; }
  }
  return seen && total + cur > 0 ? total + cur : undefined;
}

/** Read a short reply as the answer to the question we asked last. */
/** "What do you mean?", "didn't understand", "repeat" — in any of our languages: not an answer. */
const CONFUSED = /\b(what|meaning|pardon|sorry|repeat|again|didn'?t (get|understand)|don'?t understand|matlab|samajh nahi)\b|मतलब|समझ नहीं|फिर से|क्या\?|ਮਤਲਬ|ਸਮਝ ਨਹੀਂ|ਡਿੰਟ ਅੰਡਰਸਟੈਂਡ|ਕੀ\?|अर्थ|புரியவில்லை|అర్థం కాలేదు|ಅರ್ಥವಾಗಲಿಲ್ಲ|മനസ്സിലായില്ല|বুঝতে পারিনি|સમજાયું નહીં/i;

function answerFor(field: Session["awaiting"], text: string): Record<string, unknown> {
  const t = text.trim().replace(/[.!?।]+$/, "");
  if (!field || !t || CONFUSED.test(text)) return {};
  const num = parseCount(t) ?? NaN;
  switch (field) {
    case "hasGstin":
      return YES.test(t) ? { hasGstin: true } : NO.test(t) ? { hasGstin: false } : {};
    case "employees":
      return Number.isFinite(num) && num > 0 ? { employees: num } : {};
    case "sites":
      return Number.isFinite(num) && num > 0 ? { sites: num } : /^(one|just one|single|ek|एक)\b/i.test(t) ? { sites: 1 } : {};
    case "city": {
      const name = t.replace(/^(in|at|from|we are in|it'?s|मैं|हम)\s+/i, "").replace(/\s+(में|mein|se)$/i, "").trim();
      return /^[\p{L} .'-]{2,30}$/u.test(name) && name.split(/\s+/).length <= 3 ? { city: name.replace(/\b\w/g, (c) => c.toUpperCase()) } : {};
    }
    case "businessType":
      return t.length <= 60 && !YES.test(t) && !NO.test(t) ? { businessType: t } : {};
    default:
      return {};
  }
}

export async function voiceTurn(s: Session, userText: string) {
  return fastTurn(s, userText, "voice");
}

/** GSTIN typed or spoken in the message -> verify against the registry (deterministic). */
function gstinFromText(s: Session, text: string) {
  const m = text.toUpperCase().replace(/\s/g, "").match(/\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]/);
  if (!m) return null;
  const f = validateGstinFormat(m[0]);
  if (!f.ok) return `GSTIN ${maskGstin(m[0])} is not valid: ${f.reason}`;
  const reg = data.gstin(m[0]);
  s.kyc.gstin = m[0];
  s.profile.hasGstin = true;
  s.profile.gstin = m[0];
  s.profile.gstinStatus = reg ? reg.status : "Unknown";
  if (reg) s.profile.businessName = s.profile.businessName ?? reg.trade_name;
  return reg ? `GSTIN verified in registry: ${reg.trade_name}, ${reg.state}, status ${reg.status}` : "GSTIN format OK but not found in registry";
}

export async function fastTurn(s: Session, userText: string, channel: "chat" | "voice") {
  autoLanguage(s, userText);
  s.messages.push({ role: "user", text: userText, at: nowIso(), channel });
  const gstinNote = gstinFromText(s, userText);
  const before = JSON.stringify(s.bundle);
  const prevNeeds = new Set(s.profile.needs ?? []);
  // Keyword reader first (instant), then the AI fact reader (any language/script, corrections) wins.
  const facts: Record<string, unknown> = { ...answerFor(s.awaiting, userText), ...extractFacts(userText), ...(await llmFacts(s, userText)) };
  const remove = (facts.remove as Need[] | undefined) ?? [];
  delete facts.remove;
  const countsBefore = JSON.stringify([s.profile.cameras, s.profile.mobileLines]);
  const keyBefore = JSON.stringify([s.profile.hasGstin, s.profile.gstinStatus, s.profile.employees, s.profile.sites, s.profile.cityTier, s.profile.segment, s.profile.simOnly]);
  const askedNeeds = (facts.needs as Need[] | undefined) ?? [];
  if (remove.length) facts.needs = ((facts.needs as Need[] | undefined) ?? []).filter((n) => !remove.includes(n));
  if (Object.keys(facts).length) applyProfile(s, facts);
  const removedNow = remove.filter((n) => s.profile.needs?.includes(n) || REMOVE_PRODUCTS[n]?.some((pid) => s.bundle.some((b) => b.productId === pid)));
  if (remove.length) {
    s.profile.needs = (s.profile.needs ?? []).filter((n) => !remove.includes(n));
    if (remove.includes("mobile")) s.profile.mobileLines = 0;
  }
  const countsChanged = JSON.stringify([s.profile.cameras, s.profile.mobileLines]) !== countsBefore;
  // GST / size / location changes alter eligibility and price -> the plan must be rebuilt
  const keyChanged = JSON.stringify([s.profile.hasGstin, s.profile.gstinStatus, s.profile.employees, s.profile.sites, s.profile.cityTier, s.profile.segment, s.profile.simOnly]) !== keyBefore;
  // "add WhatsApp" when it's already a need but not in the plan -> try again (and say why if still not allowed)
  const askedMissing = askedNeeds.filter((n) => REMOVE_PRODUCTS[n]?.length && !REMOVE_PRODUCTS[n]!.some((pid) => s.bundle.some((b) => b.productId === pid)));
  const newNeeds = (s.profile.needs ?? []).filter((n) => !prevNeeds.has(n));

  const notes: string[] = gstinNote ? [gstinNote] : [];
  let cheaper: { option: string; monthlyPrice: string; oneTimeSetup: string }[] = [];
  const complete = missingFor(s.profile).length === 0 && (s.profile.needs?.length || s.profile.simOnly);
  if (complete && (!s.bundle.length || newNeeds.length || removedNow.length || countsChanged || keyChanged || askedMissing.length)) {
    const r = doRecommend(s); // (re)build the plan from the rules
    if (r.ok && r.excluded?.length) notes.push(...r.excluded.map((e) => `${e.message}${e.alternative ? ` — alternative: ${e.alternative}` : ""}`));
  }
  if (s.bundle.length && PRICE_OBJECTION.test(userText)) {
    s.priceObjections += 1;
    cheaper = cheaperOptions(s.bundle, s.profile).slice(0, 2).map((o) => {
      const q = priceBundle(o.items, s.profile, { contractMonths: o.contractMonths ?? s.contractMonths });
      return {
        option: o.label,
        monthlyPrice: `₹${q.monthlyWithSetup.toLocaleString("en-IN")} per month`,
        oneTimeSetup: q.setupTotal ? `₹${q.setupTotal.toLocaleString("en-IN")} one-time` : "none",
      };
    });
  }
  const wantsHuman = ASK_HUMAN.test(userText);
  const changed = JSON.stringify(s.bundle) !== before;
  for (const n of askedNeeds) {
    const inPlan = REMOVE_PRODUCTS[n]?.some((pid) => s.bundle.some((b) => b.productId === pid));
    if (REMOVE_PRODUCTS[n] && !inPlan && !notes.some((x) => x.toLowerCase().includes(n))) notes.push(`${NEED_LABELS[n]} could not be added with the current details`);
    if (inPlan && changed) notes.push(`${NEED_LABELS[n]} is now in the plan`);
  }
  const missing = missingFor(s.profile);
  const needsAsked = !!s.profile.needs?.length || !!s.profile.simOnly;
  // Our code decides the question; the model only words it.
  const ask = nextQuestion(s);
  s.awaiting = ask?.field;
  const next =
    cheaper.length ? "Offer the cheaper options below (never a discount), then ask which they prefer"
    : wantsHuman ? "Say a local Accel expert can call or visit; they can tap 'Talk to a human' on screen to agree"
    : ask ? "ACK_ONLY"
    : changed ? "Tell them the updated plan (products with short reasons) and the monthly price and setup, then ask if they want to go ahead by tapping Review plan"
    : s.bundle.length ? "Answer their question using only the plan facts, then ask if they want to go ahead (tap Review plan)"
    : "Ask how you can help with internet, SIMs, WhatsApp, CCTV or billing for their business";

  const plan = planFacts(s);
  const style = channel === "voice"
    ? "You are on a LIVE VOICE CALL. Speak like a helpful person on the phone. At most 2 short sentences, under 30 words. No lists, no symbols, no markdown. End with one question."
    : "You are chatting in an app. Be warm and brief: under 70 words. Plain text, no markdown or tables. When presenting a plan, put each product on its own line starting with \"- \" with its short reason, then the monthly price and setup on one line. End with one question.";
  const system = `You are "Udyam Saathi", a warm advisor for small businesses in India.
Reply in ${s.language} (native script). ${style}
Use ONLY the facts below. Never invent products, prices, numbers, timelines, calls or offers. Never ask about budget or anything not in "Your next step". Never add or combine amounts: say the monthly price and the one-time setup separately, exactly as written. Never mention discounts.
If the owner interrupted you, drop what you were saying and answer what they just said.
Services we offer (names only; prices come only from the plan): ${CATALOGUE_OVERVIEW}
If asked what we offer, describe these in plain words and offer to add any to the plan.
What we know: ${JSON.stringify({ business: s.profile.businessType, city: s.profile.city, employees: s.profile.employees, sites: s.profile.sites, gstin: s.profile.hasGstin, needs: s.profile.needs })}
${plan ? `Current plan: ${JSON.stringify(plan)}${changed ? " (just updated)" : ""}` : "No plan yet."}
${notes.length ? `Not possible: ${notes.join("; ")}` : ""}
${cheaper.length ? `Cheaper options: ${JSON.stringify(cheaper)}` : ""}
Your next step: ${next}`;

  const history: ChatMessage[] = s.messages
    .filter((m) => m.role !== "system")
    .slice(-8)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.text }));
  // Numbers the reply may contain: only those we computed or the owner told us.
  const allowed = new Set((system + " " + userText).match(/\d[\d,]*/g)?.map((n) => n.replace(/,/g, "")) ?? []);
  const invented = (t: string) => (t.match(/\d[\d,]*/g) ?? []).map((n) => n.replace(/,/g, "")).filter((n) => n.length >= 2 && !allowed.has(n));
  let text = "";
  const target = channel === "voice" ? VOICE_TARGET : CHAT_TARGET;
  // Question turns: the model may only acknowledge; the exact question is appended by code,
  // so the conversation can never drift to "what do you need help with?".
  const ackOnly = !!ask && next === "ACK_ONLY";
  const sys = ackOnly
    ? system.replace("Your next step: ACK_ONLY", "Your next step: write ONLY a short, warm acknowledgement of what they just said (max 8 words). Do NOT ask any question. If you did not understand their answer, say so briefly (e.g. 'Sorry, I didn't catch that.').")
    : system;
  for (let attempt = 0; attempt < 2 && !text; attempt++) {
    try {
      const extra: ChatMessage[] = attempt ? [{ role: "system", content: "Your previous draft contained numbers that are not in the facts. Rewrite using only numbers that appear in the facts." }] : [];
      const { message } = await chatCompletion({ messages: [{ role: "system", content: sys }, ...history, ...extra], max_tokens: ackOnly ? 150 : channel === "voice" ? 400 : 700 }, target);
      const draft = (message.content ?? "").replace(/\*\*/g, "").trim();
      if (draft && invented(draft).length === 0) text = draft;
      else console.warn("[advisor] rejected draft with invented numbers:", invented(draft).join(","));
    } catch {
      break;
    }
  }
  if (ackOnly) {
    // keep at most the first sentence of the acknowledgement and drop any question the model slipped in
    const ack = (text.split(/(?<=[.!।])\s+/)[0] ?? "").replace(/[^.!।]*\?$/, "").trim();
    text = `${ack ? `${ack} ` : ""}${await localizedQuestion(ask!.field, s.language)}`;
  } else if (!text) text = ask ? ask.fallback(s.language) : guidedNext(s).text;
  s.messages.push({ role: "assistant", text, at: nowIso(), channel });
  db.saveSession(s);
  return { text, changed, wantsHuman };
}
