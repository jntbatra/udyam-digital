import { handle, json, HttpError } from "@/lib/api";
import { respondToOffer, managerOverride } from "@/lib/routing";
import { db } from "@/lib/store";

export const POST = handle(async (req, ctx) => {
  const { id } = await ctx.params;
  const b = (await req.json()) as { action: "accept" | "decline" | "override" | "status"; expertId?: string; status?: "contacted" | "won" | "lost" };
  if (b.action === "override") return json(managerOverride(id, b.expertId!));
  if (b.action === "status") {
    const l = db.lead(id);
    if (!l) throw new HttpError("not found", 404);
    l.status = b.status!;
    return json(db.saveLead(l));
  }
  if (!b.expertId) throw new HttpError("expertId required");
  return json(respondToOffer(id, b.expertId, b.action === "accept"));
});
