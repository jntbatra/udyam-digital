import { handle, json, requireSession, HttpError } from "@/lib/api";
import { ocrWords, classify, extractFields, DOC_LABEL, type DocType } from "@/lib/kyc";
import { requireKycConsent, finish } from "../_shared";


/** Upload -> Textract OCR in memory -> extracted fields only. The image is never written to disk. */
export const POST = handle(async (req) => {
  const form = await req.formData();
  const s = requireSession(String(form.get("sessionId")));
  requireKycConsent(s);
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError("No file");
  if (file.size > 5 * 1024 * 1024) throw new HttpError("File too large (max 5 MB)");
  if (!/^image\/(png|jpe?g)$/.test(file.type)) throw new HttpError("Only PNG/JPG images are supported in the prototype");
  const bytes = Buffer.from(await file.arrayBuffer());
  const words = await ocrWords(bytes);
  const expected = form.get("docType") as DocType | null;
  const detected = classify(words);
  if (!detected) return json({ ok: false, reason: "Could not recognise this document" }, 422);
  if (expected && expected !== detected)
    return json({ ok: false, reason: `This looks like a ${DOC_LABEL[detected]}, not a ${DOC_LABEL[expected]}`, detected }, 422);
  const fields = extractFields(detected, words);
  s.kyc.extracted[detected] = fields;
  s.kyc.source[detected] = "upload";
  if (detected === "gst_certificate" && fields.gstin && !s.kyc.gstin) s.kyc.gstin = fields.gstin.toUpperCase();
  if (detected === "udyam_certificate" && fields.udyam_number) s.kyc.udyam = fields.udyam_number.toUpperCase();
  return json({ ok: true, docType: detected, fields, ...finish(s) });
});
