/**
 * Smart KYC: OCR (AWS Textract DetectDocumentText) -> field extraction -> cross-checks
 * against mock GSTIN/Udyam registries. Images are processed in memory and discarded;
 * only extracted fields are kept on the session.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { TextractClient, DetectDocumentTextCommand, type Block } from "@aws-sdk/client-textract";
import { data } from "./data";
import { validateGstinFormat, validateUdyamFormat, STATE_CODES } from "./ids";
import type { KycCheck, Session } from "./store";

export const KYC_TODAY = new Date("2026-07-15T00:00:00Z"); // per dataset README
export type DocType = "gst_certificate" | "udyam_certificate" | "signatory_id" | "address_proof";
export const DOC_LABEL: Record<DocType, string> = {
  gst_certificate: "GST registration certificate",
  udyam_certificate: "Udyam registration certificate",
  signatory_id: "Authorised signatory ID",
  address_proof: "Address proof (utility bill)",
};

// ---------- OCR ----------
// Watermark is upper-case ("SYNTHETIC SPECIMEN - NOT A VALID DOCUMENT"); match case-sensitively
const WATERMARK = /^(SYNTHETIC|SPECIMEN|NOT|A|VALID|VAL|VALI|DOCUMENT|DOCUM\w*|DOC|\w*HETIC|\w*ECIMEN|\w*PECIMEN|SYNTH\w*|S|SÍ|Sí|■|-|—)$/;

const MID_WATERMARK = /^(SYNTHETIC|SPECIMEN|NOT|VALID|VAL|DOCUMENT|DOCUM\w*|\w*HETIC|\w*ECIMEN|■)$/;

type Word = { text: string; left: number; top: number; width: number; height: number };

const CACHE_FILE = path.join(process.cwd(), "data", "ocr-cache.json");
function readCache(): Record<string, Word[]> {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

/** OCR words via Textract. Dev cache (synthetic specimens only) avoids repeat cost; disable with OCR_CACHE=off. */
export async function ocrWords(bytes: Buffer): Promise<Word[]> {
  const key = crypto.createHash("sha256").update(bytes).digest("hex");
  const useCache = process.env.OCR_CACHE !== "off";
  const cache = useCache ? readCache() : {};
  if (cache[key]) return cache[key];
  const client = new TextractClient({ region: process.env.TEXTRACT_REGION || "ap-south-1" });
  const res = await client.send(new DetectDocumentTextCommand({ Document: { Bytes: bytes } }));
  const words = (res.Blocks ?? [])
    .filter((b: Block) => b.BlockType === "WORD" && b.Text && b.Geometry?.BoundingBox)
    .map((b: Block) => ({
      text: b.Text!,
      left: b.Geometry!.BoundingBox!.Left!,
      top: b.Geometry!.BoundingBox!.Top!,
      width: b.Geometry!.BoundingBox!.Width!,
      height: b.Geometry!.BoundingBox!.Height!,
    }));
  if (useCache) {
    cache[key] = words;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  }
  return words;
}

type Row = { top: number; label: string; value: string; all: string };

/** Estimate page tilt from the title line ("Specimen: GST Registration Certificate" etc.), which is one straight line. */
const TITLE = /^(Specimen:|GST|Registration|Certificate|Udyam|Electricity|Bill|Authorised|Signatory|ID)$/;
function deskew(words: Word[]): Word[] {
  const t = words.filter((w) => w.top < 0.13 && TITLE.test(w.text));
  if (t.length < 3) return words;
  const mx = t.reduce((s, w) => s + w.left, 0) / t.length;
  const my = t.reduce((s, w) => s + w.top, 0) / t.length;
  const num = t.reduce((s, w) => s + (w.left - mx) * (w.top - my), 0);
  const den = t.reduce((s, w) => s + (w.left - mx) ** 2, 0);
  const slope = den ? num / den : 0;
  if (Math.abs(slope) < 0.02) return words;
  return words.map((w) => ({ ...w, top: w.top - slope * (w.left - mx) }));
}

export function toRows(input: Word[]): Row[] {
  const words = deskew(input);
  const rows: { top: number; w: Word[] }[] = [];
  for (const w of [...words].sort((a, b) => a.top - b.top)) {
    let r = rows.find((x) => Math.abs(x.top - w.top) < 0.012);
    if (!r) rows.push((r = { top: w.top, w: [] }));
    r.w.push(w);
  }
  return rows.map((r) => {
    const ws = r.w.sort((a, b) => a.left - b.left);
    const clean = (arr: Word[]) => {
      const t = arr.map((x) => x.text);
      // strip watermark tokens at the edges of a run
      // keep a trailing "A" that starts a wrapped word, e.g. "Visakhapatnam, A" + "ndhra"
      while (t.length && WATERMARK.test(t[t.length - 1]) && !(t[t.length - 1] === "A" && /,$/.test(t[t.length - 2] ?? ""))) t.pop();
      while (t.length && WATERMARK.test(t[0])) t.shift();
      return t.filter((x) => !MID_WATERMARK.test(x)).join(" ").trim();
    };
    return {
      top: r.top,
      label: clean(ws.filter((x) => x.left < 0.4)),
      value: clean(ws.filter((x) => x.left >= 0.4)),
      all: clean(ws),
    };
  });
}

export function classify(words: Word[]): DocType | null {
  const t = words.map((w) => w.text).join(" ").toLowerCase();
  if (t.includes("udyam") && t.includes("registration")) return "udyam_certificate";
  if (t.includes("gst") && t.includes("registration")) return "gst_certificate";
  if (t.includes("signatory")) return "signatory_id";
  if (t.includes("bill") || t.includes("consumer") || t.includes("utility") || t.includes("rent")) return "address_proof";
  return null;
}

const LABELS: Record<DocType, Record<string, RegExp>> = {
  gst_certificate: {
    gstin: /^gstin/i, legal_name: /^legal( name)?$/i, trade_name: /^trade( name)?$/i, constitution: /^constitution/i,
    address: /^address of principal/i, date_of_liability: /^date of liability/i, registration_type: /^type of registration/i,
  },
  udyam_certificate: {
    udyam_number: /^udyam reg/i, enterprise_name: /^enterprise( name)?$/i, enterprise_type: /^enterprise type/i,
    major_activity: /^major activity/i, city: /^city/i, state: /^state/i, date_of_registration: /^date of registration/i,
  },
  signatory_id: {
    name: /^name/i, designation: /^designation/i, business: /^for business/i, id_no: /^id no/i, valid_till: /^valid till/i,
  },
  address_proof: {
    consumer_no: /^consumer no/i, billed_to: /^billed to/i, address: /^(\w+ )?supply( address)?/i,
    bill_date: /^bill date/i, units: /^units consumed/i, amount_due: /^amount due/i,
  },
};

export function extractFields(type: DocType, words: Word[]): Record<string, string> {
  const rows = toRows(words);
  const out: Record<string, string> = {};
  const labels = LABELS[type];
  if (type === "signatory_id") {
    // Vertical layout: label row, value on the next row.
    for (let i = 0; i < rows.length - 1; i++) {
      for (const [k, re] of Object.entries(labels)) {
        if (!out[k] && re.test(rows[i].all)) out[k] = rows[i + 1].all;
      }
    }
    return out;
  }
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // labels may carry a leading watermark fragment (e.g. "HETIC Supply")
    const lab = r.label.replace(/^(\w*HETIC|\w*ECIMEN|SYNTHETIC|SPECIMEN)\s+/i, "");
    for (const [k, re] of Object.entries(labels)) {
      if (out[k] || !re.test(lab)) continue;
      let v = r.value;
      if (k === "address") {
        // address wraps onto continuation rows with empty/partial labels
        for (let j = i + 1; j < Math.min(rows.length, i + 4); j++) {
          const nxt = rows[j];
          if (Object.values(labels).some((re2) => re2.test(nxt.label.replace(/^(\w*HETIC|\w*ECIMEN)\s+/i, "")) && !/^place of business/i.test(nxt.label))) break;
          if (nxt.value && (/\d{6}|[a-z]{3,}/i.test(nxt.value) || /^\d{1,5}$/.test(nxt.value))) v = joinWrapped(v, nxt.value);
        }
      }
      if ((k === "legal_name" || k === "enterprise_name") && (v.match(/\(/g)?.length ?? 0) > (v.match(/\)/g)?.length ?? 0)) {
        const nxt = rows[i + 1];
        if (nxt && !nxt.label.match(/^(trade|constitution|address)/i)) v = `${v} ${nxt.value}`.trim();
        else if (rows[i + 1]) {
          // value continuation can share a row with the next label
          const m = rows[i + 1].value.match(/^[^()]*\)/);
          if (m) v = `${v} ${m[0]}`.trim();
        }
      }
      out[k] = v;
    }
  }
  // GSTIN / Udyam by pattern as a safety net
  const flat = words.map((w) => w.text).join(" ");
  if (type === "gst_certificate") {
    const toks = flat.toUpperCase().split(/\s+/).filter((t) => t.length >= 15);
    const windows = toks.flatMap((t) => Array.from({ length: t.length - 14 }, (_, i) => t.slice(i, i + 15)));
    const cands = [out.gstin ?? "", ...windows];
    const fixed = cands.map(fixGstinOcr).find(Boolean);
    if (fixed) out.gstin = fixed;
  }
  if (type === "udyam_certificate" && !/UDYAM-/.test(out.udyam_number ?? "")) {
    const m = flat.match(/UDYAM-[A-Z]{2}-\d{2}-\d{7}/);
    if (m) out.udyam_number = m[0];
  }
  if (out.legal_name && out.trade_name === undefined) {
    // legal name sometimes wraps (e.g. "... (Prop. Vindhya Tours & Travels)")
  }
  return out;
}

/** Repair common OCR swaps (0/O, 1/I, 5/S, 8/B, 2/Z) by GSTIN position; accept only checksum-valid results. */
const TO_LETTER: Record<string, string> = { "0": "O", "1": "I", "5": "S", "8": "B", "2": "Z", "6": "G" };
const TO_DIGIT: Record<string, string> = { O: "0", I: "1", L: "1", S: "5", B: "8", Z: "2", G: "6", D: "0" };
export function fixGstinOcr(raw: string): string | null {
  const g = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (g.length !== 15) return null;
  if (validateGstinFormat(g).ok) return g;
  const chars = g.split("").map((c, i) => {
    const digitPos = i < 2 || (i >= 7 && i <= 10);
    const letterPos = (i >= 2 && i <= 6) || i === 11;
    if (digitPos) return TO_DIGIT[c] ?? c;
    if (letterPos) return TO_LETTER[c] ?? c;
    if (i === 13) return "Z";
    return c;
  });
  const fixed = chars.join("");
  return validateGstinFormat(fixed).ok ? fixed : null;
}

function joinWrapped(a: string, b: string) {
  // "Visakhapatnam, A" + "ndhra Pradesh - 118383" => "Visakhapatnam, Andhra Pradesh - 118383"
  if (/[A-Za-z]$/.test(a) && /^[a-z]/.test(b)) return a + b;
  // "Kerala - 75" + "2083" => "Kerala - 752083" (PIN split across lines)
  if (/\b\d{1,5}$/.test(a) && /^\d{1,5}$/.test(b) && (a.match(/\d+$/)![0].length + b.length === 6)) return a + b;
  return `${a} ${b}`.trim();
}

// ---------- Matching helpers ----------
const STOP = new Set(["llp", "pvt", "ltd", "private", "limited", "prop", "the", "and", "&", "co", "m/s"]);
export function nameTokens(s: string) {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t && !STOP.has(t)),
  );
}
export function nameSimilarity(a?: string, b?: string) {
  if (!a || !b) return 0;
  const A = nameTokens(a), B = nameTokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size);
}
function proprietorFromLegal(legal?: string) {
  const m = legal?.match(/^(.+?)\s*\(Prop\./i);
  return m?.[1]?.trim();
}
function pincode(s?: string) {
  return s?.match(/\b\d{6}\b/)?.[0];
}
function daysBetween(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function nearRegistryMatch(gstin: string, name?: string) {
  if (!name) return undefined;
  let best: { rec: ReturnType<typeof data.gstin>; diff: number } | undefined;
  for (const rec of data.gstinByName(name)) {
    let diff = 0;
    for (let i = 0; i < 15; i++) if (rec.gstin[i] !== gstin[i]) diff++;
    if (diff <= 3 && (!best || diff < best.diff)) best = { rec, diff };
  }
  return best as { rec: NonNullable<ReturnType<typeof data.gstin>>; diff: number } | undefined;
}

// ---------- Checks ----------
export function runChecks(s: Session): KycCheck[] {
  const ex = s.kyc.extracted;
  const checks: KycCheck[] = [];
  const add = (c: KycCheck) => checks.push(c);
  const gstDoc = ex.gst_certificate;
  const gstin = (s.kyc.gstin || gstDoc?.gstin || "").toUpperCase();
  const reg = gstin ? data.gstin(gstin) : undefined;
  const businessName = reg?.trade_name || s.profile.businessName || gstDoc?.trade_name || "";

  // 1. GSTIN format + checksum
  if (!gstin) {
    add({ id: "gstin_present", label: "GSTIN", status: "fail", detail: "No GSTIN provided or found on the certificate", fix: "Enter your GSTIN or fetch the certificate from DigiLocker" });
  } else {
    const f = validateGstinFormat(gstin);
    const near = f.ok ? undefined : nearRegistryMatch(gstin, gstDoc?.trade_name || gstDoc?.legal_name);
    add({
      id: "gstin_format", label: "GSTIN format & checksum", status: f.ok ? "pass" : "fail",
      detail: f.ok ? `Valid structure, state ${f.stateName}` : `${f.reason}${near ? ` — registry has a GSTIN differing in ${near.diff} character(s) for "${near.rec.trade_name}", so the number on this certificate looks altered` : ""}`,
      fix: f.ok ? undefined : "Re-check the GSTIN digits or fetch the certificate from DigiLocker",
    });
    // 2. registry
    if (!reg) add({ id: "gstin_registry", label: "GST registry lookup", status: "fail", detail: "GSTIN not found in GST registry", fix: "Check the number or contact your CA" });
    else {
      add({
        id: "gstin_status", label: "GST registration status", status: reg.status === "Active" ? "pass" : "fail",
        detail: reg.status === "Active" ? `Active since ${reg.registration_date}` : `Registry shows GSTIN as ${reg.status} — the certificate alone is not enough`,
        fix: reg.status === "Active" ? undefined : "Products needing GSTIN cannot be activated. Reactivate GST or continue with a non-GST bundle; an expert will call you.",
      });
      if (gstDoc?.gstin && gstDoc.gstin.toUpperCase() !== gstin)
        add({ id: "gstin_doc_match", label: "Certificate GSTIN matches entered GSTIN", status: "fail", detail: `Certificate shows ${gstDoc.gstin}`, fix: "Upload the certificate for the same GSTIN" });
      if (s.kyc.source.gst_certificate === "upload" && (gstDoc?.legal_name || gstDoc?.trade_name)) {
        const simL = gstDoc.legal_name ? nameSimilarity(gstDoc.legal_name, reg.legal_name) : 1;
        const simT = gstDoc.trade_name ? nameSimilarity(gstDoc.trade_name, reg.trade_name) : 1;
        const ok = simL >= 0.99 && simT >= 0.99;
        add({
          id: "gst_name", label: "Names on GST certificate match registry", status: ok ? "pass" : "fail",
          detail: ok ? reg.legal_name : simL < 0.99 ? `Legal name on certificate "${gstDoc.legal_name}" ≠ registry "${reg.legal_name}"` : `Trade name on certificate "${gstDoc.trade_name}" ≠ registry "${reg.trade_name}"`,
          fix: ok ? undefined : "Certificate appears edited — fetch the original from DigiLocker",
        });
      }
      const sc = STATE_CODES[gstin.slice(0, 2)];
      if (sc && reg.state && sc !== reg.state)
        add({ id: "gst_state", label: "GSTIN state code matches registered state", status: "fail", detail: `Code says ${sc}, registry says ${reg.state}` });
    }
  }

  // 3. Udyam
  const ud = ex.udyam_certificate;
  const udNo = (s.kyc.udyam || ud?.udyam_number || "").toUpperCase();
  if (!udNo && ud) {
    add({ id: "udyam_present", label: "Udyam registration number", status: "fail", detail: "Udyam certificate has no readable registration number", fix: "Upload a clear, complete Udyam certificate or fetch it from DigiLocker" });
  } else if (!udNo) {
    add({ id: "udyam_present", label: "Udyam registration", status: "fail", detail: "Udyam certificate missing", fix: "Fetch from DigiLocker / upload it, or register free at udyamregistration.gov.in" });
  } else {
    const f = validateUdyamFormat(udNo);
    const ur = data.udyam(udNo);
    if (!f.ok) add({ id: "udyam_format", label: "Udyam number format", status: "fail", detail: f.reason! });
    else if (!ur) add({ id: "udyam_registry", label: "Udyam registry lookup", status: "fail", detail: "Udyam number not found in registry", fix: "Check the number on your certificate" });
    else {
      const sim = nameSimilarity(ur.enterprise_name, businessName || reg?.legal_name);
      add({ id: "udyam_name", label: "Udyam enterprise matches business", status: sim >= 0.8 ? "pass" : "fail", detail: sim >= 0.8 ? `${ur.enterprise_name} (${ur.enterprise_type})` : `Udyam: "${ur.enterprise_name}" vs business: "${businessName}"`, fix: sim >= 0.8 ? undefined : "Upload the Udyam certificate of this business" });
      if (reg && ur.state !== reg.state)
        add({ id: "udyam_state", label: "Udyam state matches GST state", status: "fail", detail: `Udyam: ${ur.state}, GST: ${reg.state}`, fix: "Udyam and GST must belong to the same unit" });
      if (ud?.enterprise_name && nameSimilarity(ud.enterprise_name, ur.enterprise_name) < 0.8)
        add({ id: "udyam_doc_name", label: "Udyam certificate matches registry", status: "fail", detail: `Certificate: "${ud.enterprise_name}" vs registry: "${ur.enterprise_name}"` });
    }
  }

  // 4. Address proof
  const ap = ex.address_proof;
  if (!ap) add({ id: "addr_present", label: "Address proof", status: "fail", detail: "No address proof yet", fix: "Upload an electricity/utility bill not older than 90 days" });
  else {
    const d = ap.bill_date ? new Date(ap.bill_date + "T00:00:00Z") : null;
    if (!d || isNaN(d.getTime())) add({ id: "addr_date", label: "Bill date", status: "fail", detail: "Bill date not readable", fix: "Upload a clearer copy" });
    else {
      const age = daysBetween(KYC_TODAY, d);
      add({ id: "addr_date", label: "Address proof ≤ 90 days old", status: age >= 0 && age <= 90 ? "pass" : "fail", detail: age < 0 ? `Bill date ${ap.bill_date} is in the future` : `Bill dated ${ap.bill_date} (${age} days old)`, fix: age > 90 ? "Upload a bill from the last 90 days" : undefined });
    }
    const simName = nameSimilarity(ap.billed_to, businessName || reg?.trade_name);
    add({ id: "addr_name", label: "Bill is in the business name", status: simName >= 0.8 ? "pass" : "fail", detail: simName >= 0.8 ? ap.billed_to : `Billed to "${ap.billed_to}" — business is "${businessName}"`, fix: simName >= 0.8 ? undefined : "Upload a bill in the business name, or a rent agreement" });
    if (reg) {
      const p1 = pincode(ap.address), p2 = pincode(reg.principal_place_of_business);
      const same = p1 && p2 && p1 === p2;
      add({ id: "addr_match", label: "Bill address matches GST address", status: same ? "pass" : "fail", detail: same ? `PIN ${p1}` : `Bill: ${ap.address || "?"} | GST: ${reg.principal_place_of_business}`, fix: same ? undefined : "Installation address must match the registered place of business" });
    }
  }

  // 5. Signatory
  const sg = ex.signatory_id;
  if (!sg) add({ id: "sig_present", label: "Authorised signatory ID", status: "fail", detail: "No signatory ID yet", fix: "Fetch ID from DigiLocker or upload it" });
  else {
    if (sg.valid_till) {
      const v = new Date(sg.valid_till + "T00:00:00Z");
      add({ id: "sig_valid", label: "Signatory ID valid", status: v >= KYC_TODAY ? "pass" : "fail", detail: `Valid till ${sg.valid_till}`, fix: v >= KYC_TODAY ? undefined : "ID has expired — upload a valid one" });
    }
    const simB = nameSimilarity(sg.business, businessName || reg?.trade_name);
    add({ id: "sig_business", label: "Signatory authorised for this business", status: simB >= 0.8 ? "pass" : "fail", detail: simB >= 0.8 ? `${sg.name} · ${sg.designation} · ${sg.business}` : `ID is for "${sg.business}"`, fix: simB >= 0.8 ? undefined : "Signatory must be authorised for this business" });
    const prop = proprietorFromLegal(reg?.legal_name);
    if (prop) {
      const ok = nameSimilarity(prop, sg.name) >= 0.99;
      add({ id: "sig_proprietor", label: "Signatory is the proprietor", status: ok ? "pass" : "warn", detail: ok ? `${sg.name} is the registered proprietor` : `Proprietorship of ${prop}; signatory is ${sg.name} (${sg.designation})`, fix: ok ? undefined : "Proprietor must e-sign or give an authorisation letter" });
    }
  }
  return checks;
}

export function kycVerified(checks: KycCheck[]) {
  const need = ["gstin_status", "udyam_name", "addr_date", "addr_name", "sig_business"];
  return checks.every((c) => c.status !== "fail") && need.every((id) => checks.some((c) => c.id === id && c.status === "pass"));
}

/** DigiLocker / Entity Locker MOCK: returns issuer-verified fields from registries. */
export function digilockerFetch(s: Session, what: "gst_certificate" | "udyam_certificate" | "signatory_id"): Record<string, string> | null {
  const reg = s.kyc.gstin ? data.gstin(s.kyc.gstin) : undefined;
  if (what === "gst_certificate") {
    if (!reg) return null;
    return {
      gstin: reg.gstin, legal_name: reg.legal_name, trade_name: reg.trade_name, constitution: reg.constitution,
      address: reg.principal_place_of_business, date_of_liability: reg.registration_date, registration_type: "Regular",
    };
  }
  if (what === "udyam_certificate") {
    const lead = data.leads.find((l) => l.gstin === reg?.gstin && l.udyam_number);
    const ur = lead ? data.udyam(lead.udyam_number) : undefined;
    if (!ur) return null;
    return {
      udyam_number: ur.udyam_number, enterprise_name: ur.enterprise_name, enterprise_type: ur.enterprise_type,
      major_activity: ur.major_activity, city: ur.city, state: ur.state, date_of_registration: ur.date_of_registration,
    };
  }
  // signatory: personal DigiLocker (Aadhaar-masked); prototype uses registry proprietor/contact
  const lead = data.leads.find((l) => l.gstin === reg?.gstin);
  const prop = proprietorFromLegal(reg?.legal_name);
  if (!reg) return null;
  return {
    name: prop || lead?.contact_name || s.name || "",
    designation: prop ? "Proprietor" : lead?.contact_role || "Authorised signatory",
    business: reg.trade_name,
    id_no: "XXXX-XXXX-" + crypto.createHash("md5").update(reg.gstin).digest("hex").slice(0, 4).toUpperCase(),
    valid_till: "2030-12-31",
  };
}
