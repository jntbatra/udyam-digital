// Re-run extraction from the local OCR cache (no AWS calls).
import fs from "node:fs"; import crypto from "node:crypto";
import { classify, extractFields } from "../src/lib/kyc";
const cache = JSON.parse(fs.readFileSync("data/ocr-cache.json","utf8"));
const out: Record<string, unknown> = {};
for (const f of fs.readdirSync("public/samples").filter(x=>x.endsWith(".png")).sort()) {
  const w = cache[crypto.createHash("sha256").update(fs.readFileSync("public/samples/"+f)).digest("hex")];
  const t = classify(w); out[f] = { type: t, fields: t ? extractFields(t, w) : null };
}
fs.writeFileSync("data/sample-extraction.json", JSON.stringify(out, null, 1));
for (const [k,v] of Object.entries(out)) if (k.includes("gst")) console.log(k, JSON.stringify((v as any).fields));
