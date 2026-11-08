import { db } from "@/lib/store";
import { handle, json, publicSession, quoteFor, requireSession, HttpError } from "@/lib/api";
import { applyProfile, doRecommend } from "@/lib/advisor";
import { validateBundle, type LineItem } from "@/lib/engine";

export const GET = handle(async (_req, ctx) => {
  const { id } = await ctx.params;
  const s = requireSession(id);
  return json({ session: publicSession(s), ...quoteFor(s) });
});

/** Patch profile / bundle / quote options. Bundle edits always pass the rule engine. */
export const PATCH = handle(async (req, ctx) => {
  const { id } = await ctx.params;
  const s = requireSession(id);
  const b = (await req.json()) as {
    profile?: Record<string, unknown>;
    language?: string;
    name?: string;
    recommend?: boolean;
    bundle?: LineItem[];
    contractMonths?: number;
    setupSpread?: boolean;
    priceObjection?: boolean;
  };
  if (b.language) s.language = b.language;
  if (b.name) s.name = b.name;
  if (b.profile) {
    const r = applyProfile(s, b.profile);
    if (!r.ok) throw new HttpError(String(r.error));
  }
  if (b.bundle) {
    const v = validateBundle(b.bundle, s.profile);
    if (v.length) throw new HttpError(v.map((x) => x.message).join("; "), 422);
    s.bundle = b.bundle;
  }
  if (b.contractMonths !== undefined) s.contractMonths = b.contractMonths;
  if (b.setupSpread !== undefined) s.setupSpread = b.setupSpread;
  if (b.priceObjection) s.priceObjections += 1;
  let rec: unknown;
  if (b.recommend) rec = doRecommend(s);
  db.saveSession(s);
  return json({ session: publicSession(s), recommendation: rec, ...quoteFor(s) });
});
