/** Order state machine + tracker (demo clock via "simulate next day"). */
import { priceBundle } from "./engine";
import { db, newId, nowIso, ORDER_STAGES, type Order, type OrderStage, type Session } from "./store";
import { data } from "./data";

const TECHS = ["Imran K.", "Deepa S.", "Vikram P.", "Meera J.", "Arjun T."];

export function createOrder(s: Session): Order {
  const quote = priceBundle(s.bundle, s.profile, { contractMonths: s.contractMonths, setupSpread: s.setupSpread, approvedDiscountPct: approvedPct(s) });
  const o: Order = {
    id: newId("O"),
    sessionId: s.id,
    quote,
    stage: "paid",
    history: [
      { stage: "placed", at: nowIso() },
      { stage: "paid", at: nowIso(), note: "UPI payment (mock) received" },
    ],
    createdAt: nowIso(),
    dayOffset: 0,
    etaDay: quote.etaDays,
    productStatus: Object.fromEntries(quote.lines.map((l) => [l.productId, "pending" as const])),
    notifications: [
      { at: nowIso(), text: `Order ${"#"}placed. Expected live in ${quote.etaDays} day(s). We'll message you at every step — no need to call.` },
    ],
    tickets: [],
  };
  if (s.kyc.verified) advanceTo(o, "kyc_verified", "KYC verified digitally");
  s.orderId = o.id;
  db.saveSession(s);
  return db.saveOrder(o);
}

function approvedPct(s: Session) {
  const d = Object.values(db.raw.discounts).find((x) => x.sessionId === s.id && x.status === "approved" && new Date(x.holdUntil) > new Date());
  return d?.pct ?? 0;
}

function advanceTo(o: Order, stage: OrderStage, note?: string) {
  if (o.history.some((h) => h.stage === stage)) return;
  o.stage = stage;
  o.history.push({ stage, at: nowIso(), note });
  const label = ORDER_STAGES.find((x) => x.key === stage)!.label;
  o.notifications.push({ at: nowIso(), text: `WhatsApp: ${label}${note ? ` — ${note}` : ""}` });
}

/** Simulate one day passing. `delay` makes installation slip (to demo auto-escalation). */
export function simulateDay(o: Order, delay = false): Order {
  o.dayOffset += 1;
  const d = o.dayOffset;
  const s = db.session(o.sessionId);
  if (o.stage === "paid" && s?.kyc.verified) advanceTo(o, "kyc_verified", "KYC verified digitally");
  if (d >= 1 && o.history.some((h) => h.stage === "kyc_verified")) advanceTo(o, "feasibility", s?.profile.fibreFeasible === false ? "Fibre not feasible — 5G AirFiber confirmed" : "Fibre available at your address");
  if (d >= 1 && o.history.some((h) => h.stage === "feasibility") && !o.technician) {
    o.technician = { name: TECHS[o.id.charCodeAt(2) % TECHS.length], slot: `Day ${d + 1}, 10:00–12:00` };
    advanceTo(o, "assigned", `${o.technician.name} · ${o.technician.slot}`);
  }
  if (o.history.some((h) => h.stage === "assigned")) {
    advanceTo(o, "installing");
    if (!delay) {
      for (const l of o.quote.lines) {
        const p = data.product(l.productId);
        if (p && d >= Math.max(1, p.install_days) && o.productStatus[l.productId] === "pending") {
          o.productStatus[l.productId] = "installed";
          o.notifications.push({ at: nowIso(), text: `WhatsApp: ${p.product_name} installed ✓` });
        }
      }
    }
  }
  if (Object.values(o.productStatus).every((x) => x === "installed")) {
    advanceTo(o, "live", "All products active");
  }
  if (o.stage === "live" && d >= o.etaDay + 1) advanceTo(o, "first_bill", `One combined bill: ₹${o.quote.monthlyWithSetup}/month`);
  if (!o.escalated && o.stage !== "live" && o.stage !== "first_bill" && d > o.etaDay + 1) {
    o.escalated = true;
    o.notifications.push({ at: nowIso(), text: "We're running late. Your case is escalated to the area manager — you'll get a new date within 4 hours. Sorry for the delay." });
  }
  return db.saveOrder(o);
}

export function reschedule(o: Order, slot: string) {
  if (o.technician) o.technician.slot = slot;
  o.notifications.push({ at: nowIso(), text: `Visit rescheduled to ${slot}` });
  return db.saveOrder(o);
}

export function openTicket(o: Order, text: string) {
  o.tickets.push({ id: newId("T"), text, status: "open", at: nowIso() });
  return db.saveOrder(o);
}

export function etaInfo(o: Order) {
  const remaining = Math.max(0, o.etaDay - o.dayOffset);
  const late = o.stage !== "live" && o.stage !== "first_bill" && o.dayOffset > o.etaDay;
  return { remaining, late, day: o.dayOffset, etaDay: o.etaDay };
}
