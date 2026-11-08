// Runs Smart KYC checks on all 12 specimen applicants using cached OCR (no AWS calls).
import fs from "node:fs";
import { runChecks, kycVerified } from "../src/lib/kyc";
import type { Session } from "../src/lib/store";
const ex = JSON.parse(fs.readFileSync("data/sample-extraction.json", "utf8"));
const report: Record<string, unknown> = {};
for (let i = 1; i <= 12; i++) {
  const id = `K${String(i).padStart(2, "0")}`;
  const extracted: Record<string, Record<string, string>> = {};
  for (const [f, v] of Object.entries<any>(ex)) if (f.startsWith(id) && v.type) extracted[v.type] = v.fields;
  const s = { profile: {}, kyc: { gstin: extracted.gst_certificate?.gstin, udyam: extracted.udyam_certificate?.udyam_number, source: { gst_certificate: "upload" }, extracted, checks: [], verified: false, esigned: false } } as unknown as Session;
  const checks = runChecks(s);
  const bad = checks.filter((c) => c.status !== "pass");
  report[id] = { verified: kycVerified(checks), issues: bad.map((c) => `${c.status.toUpperCase()} ${c.label}: ${c.detail}`) };
  console.log(`${id} ${kycVerified(checks) ? "VERIFIED" : "BLOCKED "}`, bad.map((c) => `\n    ${c.status.toUpperCase()} ${c.label}: ${c.detail}`).join(""));
}
fs.writeFileSync("data/kyc-selfcheck.json", JSON.stringify(report, null, 1));
