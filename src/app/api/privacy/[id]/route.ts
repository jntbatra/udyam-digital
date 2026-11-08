import { db } from "@/lib/store";
import { handle, json, requireSession, publicSession } from "@/lib/api";

/** DPDP data-principal rights: access/export (GET) and erasure (DELETE). */
export const GET = handle(async (_req, ctx) => {
  const { id } = await ctx.params;
  const s = requireSession(id);
  const order = s.orderId ? db.order(s.orderId) : null;
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), session: publicSession(s), order }, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="my-accel-data-${s.id}.json"` },
  });
});

export const DELETE = handle(async (_req, ctx) => {
  const { id } = await ctx.params;
  requireSession(id);
  db.deleteSession(id);
  return json({ deleted: true });
});
