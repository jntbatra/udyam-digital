import { db, nowIso } from "@/lib/store";
import { handle, json, HttpError } from "@/lib/api";

/** Manager decision. SLA 2 h; quote held 48 h. */
export const POST = handle(async (req, ctx) => {
  const { id } = await ctx.params;
  const d = db.discount(id);
  if (!d) throw new HttpError("not found", 404);
  const b = (await req.json()) as { approve: boolean; note?: string };
  d.status = b.approve ? "approved" : "rejected";
  d.decidedAt = nowIso();
  d.managerNote = b.note;
  return json(db.saveDiscount(d));
});
