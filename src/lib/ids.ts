// Identifier validation + masking. Pure functions (safe on client and server).

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
  "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
  "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "29": "Karnataka",
  "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
  "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};

export function gstinChecksumChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14[i]);
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export type GstinFormatResult = {
  ok: boolean;
  reason?: string;
  stateCode?: string;
  stateName?: string;
  pan?: string;
};

/**
 * Real GSTIN structure: 2-digit state, 10-char PAN, entity no., 'Z', checksum.
 * Hackathon note: PAN 4th char is 'X' (not a real entity type) — accepted on purpose.
 */
export function validateGstinFormat(raw: string): GstinFormatResult {
  const g = raw.trim().toUpperCase();
  if (g.length !== 15) return { ok: false, reason: "GSTIN must be 15 characters" };
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g))
    return { ok: false, reason: "GSTIN pattern is invalid" };
  const stateCode = g.slice(0, 2);
  if (!STATE_CODES[stateCode]) return { ok: false, reason: `Unknown state code ${stateCode}` };
  if (gstinChecksumChar(g.slice(0, 14)) !== g[14])
    return { ok: false, reason: "GSTIN checksum does not match (possible typo or tampering)" };
  return { ok: true, stateCode, stateName: STATE_CODES[stateCode], pan: g.slice(2, 12) };
}

export function validateUdyamFormat(raw: string): { ok: boolean; reason?: string } {
  const u = raw.trim().toUpperCase();
  if (!/^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/.test(u))
    return { ok: false, reason: "Udyam number must look like UDYAM-XX-00-0000000" };
  return { ok: true };
}

export function maskGstin(g?: string | null): string {
  if (!g) return "";
  return g.length < 8 ? "****" : `${g.slice(0, 4)}*******${g.slice(-3)}`;
}

export function maskUdyam(u?: string | null): string {
  if (!u) return "";
  return u.replace(/\d{7}$/, (m) => `****${m.slice(-3)}`);
}

export function maskPhone(p?: string | null): string {
  if (!p) return "";
  const d = p.replace(/\D/g, "");
  return d.length < 4 ? "****" : `******${d.slice(-4)}`;
}

export function maskName(n?: string | null): string {
  if (!n) return "";
  return n
    .split(" ")
    .map((w) => (w.length <= 1 ? w : w[0] + "*".repeat(Math.min(4, w.length - 1))))
    .join(" ");
}
