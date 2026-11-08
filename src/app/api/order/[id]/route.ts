import { db } from "@/lib/store";
import { handle, json, HttpError } from "@/lib/api";
import { simulateDay, reschedule, openTicket, etaInfo } from "@/lib/orders";

export const GET = handle(async (_req, ctx) => {
  const { id } = await ctx.params;
  const o = db.order(id);
  if (!o) throw new HttpError("Order not found", 404);
  return json({ order: o, eta: etaInfo(o) });
});

export const POST = handle(async (req, ctx) => {
  const { id } = await ctx.params;
  const o = db.order(id);
  if (!o) throw new HttpError("Order not found", 404);
  const b = (await req.json()) as { action: "next_day" | "delay_day" | "reschedule" | "ticket"; slot?: string; text?: string };
  if (b.action === "next_day") simulateDay(o);
  else if (b.action === "delay_day") simulateDay(o, true);
  else if (b.action === "reschedule") reschedule(o, b.slot ?? "Tomorrow, 16:00–18:00");
  else if (b.action === "ticket") openTicket(o, b.text ?? "Need help");
  return json({ order: o, eta: etaInfo(o) });
});
