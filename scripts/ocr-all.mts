// One-time: OCR all specimen KYC images via Textract, cache words, print extracted fields.
import fs from "node:fs";
import path from "node:path";
import { ocrWords, classify, extractFields } from "../src/lib/kyc";
const dir = path.join(process.cwd(), "public", "samples");
const out: Record<string, unknown> = {};
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".png")).sort()) {
  const w = await ocrWords(fs.readFileSync(path.join(dir, f)));
  const t = classify(w);
  out[f] = { type: t, fields: t ? extractFields(t, w) : null };
}
fs.writeFileSync(path.join(process.cwd(), "data", "sample-extraction.json"), JSON.stringify(out, null, 1));
console.log("done", Object.keys(out).length);
