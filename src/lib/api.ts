import { unstable_rethrow } from "next/navigation";
import { db, type Session } from "./store";
import { maskGstin, maskUdyam, maskPhone } from "./ids";
import { priceBundle, upsellSuggestions, cheaperOptions } from "./engine";
import { data } from "./data";

export const json = (d: unknown, status = 200) => Response.json(d, { status });
export const err = (message: string, status = 400) => Response.json({ error: message }, { status });

export function requireSession(id?: string | null): Session {
  const s = id ? db.session(id) : undefined;
  if (!s) throw new HttpError("Session not found", 404);
  return s;
}

export class HttpError extends Error {
  constructor(msg: string, public status = 400) {
    super(msg);
  }
}

export function handle(fn: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      unstable_rethrow(e); // let Next.js internal signals (e.g. dynamic bail-out) through
      if (e instanceof HttpError) return err(e.message, e.status);
      console.error("[api]", (e as Error).message); // no PII in logs: messages only
      return err("Something went wrong", 500);
    }
  };
}

export function approvedDiscountPct(s: Session) {
  const d = Object.values(db.raw.discounts).find((x) => x.sessionId === s.id && x.status === "approved" && new Date(x.holdUntil) > new Date());
  return d?.pct ?? 0;
}

export function pendingDiscount(s: Session) {
  return Object.values(db.raw.discounts).find((x) => x.sessionId === s.id && x.status === "pending");
}

export function quoteFor(s: Session) {
  const quote = priceBundle(s.bundle, s.profile, {
    contractMonths: s.contractMonths,
    setupSpread: s.setupSpread,
    approvedDiscountPct: approvedDiscountPct(s),
  });
  const order = s.orderId ? db.order(s.orderId) : undefined;
  const delayed = !!order && order.dayOffset > order.etaDay;
  const openTicket = !!order?.tickets.some((t) => t.status === "open");
  return {
    quote,
    upsell: upsellSuggestions(s.bundle, s.profile, { priceObjection: s.priceObjections > 0, delayedOrOpenTicket: delayed || openTicket }),
    cheaper: cheaperOptions(s.bundle, s.profile).map((o) => ({
      label: o.label,
      items: o.items,
      contractMonths: o.contractMonths,
      monthly: priceBundle(o.items, s.profile, { contractMonths: o.contractMonths ?? s.contractMonths }).monthly,
    })),
    pendingDiscount: pendingDiscount(s) ?? null,
    catalogue: data.products.map((p) => ({ id: p.product_id, name: p.product_name, category: p.category, unit: p.unit })),
  };
}

/** Client-safe view: identifiers masked, no raw transcripts beyond this session. */
export function publicSession(s: Session) {
  return {
    id: s.id,
    phone: maskPhone(s.phone),
    name: s.name,
    language: s.language,
    profile: { ...s.profile, gstin: maskGstin(s.profile.gstin) },
    bundle: s.bundle,
    contractMonths: s.contractMonths,
    setupSpread: s.setupSpread,
    priceObjections: s.priceObjections,
    messages: s.messages,
    consents: s.consents,
    kyc: {
      ...s.kyc,
      gstin: maskGstin(s.kyc.gstin),
      udyam: maskUdyam(s.kyc.udyam),
      extracted: Object.fromEntries(
        Object.entries(s.kyc.extracted).map(([k, v]) => [
          k,
          Object.fromEntries(Object.entries(v).map(([f, val]) => [f, f === "gstin" ? maskGstin(val) : f === "udyam_number" ? maskUdyam(val) : f === "id_no" ? "****" + String(val).slice(-3) : val])),
        ]),
      ),
    },
    orderId: s.orderId,
    escalation: s.escalation,
    marketingOptIn: s.marketingOptIn,
    createdAt: s.createdAt,
  };
}
