/**
 * Language auto-detection from what the owner types/says (Unicode script + keyword cues).
 * Covers the 11 supported Indian languages + English. Pure function (client + server).
 */
export type Language =
  | "English" | "Hindi" | "Marathi" | "Bengali" | "Assamese" | "Punjabi" | "Gujarati"
  | "Odia" | "Tamil" | "Telugu" | "Kannada" | "Malayalam";

const RANGES: [RegExp, Language][] = [
  [/[਀-੿]/g, "Punjabi"], // Gurmukhi
  [/[઀-૿]/g, "Gujarati"],
  [/[଀-୿]/g, "Odia"],
  [/[஀-௿]/g, "Tamil"],
  [/[ఀ-౿]/g, "Telugu"],
  [/[ಀ-೿]/g, "Kannada"],
  [/[ഀ-ൿ]/g, "Malayalam"],
  [/[ঀ-৿]/g, "Bengali"], // Bengali/Assamese script
  [/[ऀ-ॿ]/g, "Hindi"], // Devanagari (Hindi/Marathi)
];

// Romanised Hindi cues ("mera clinic hai, mujhe wifi chahiye")
const HINGLISH = /\b(mera|meri|mere|mujhe|hamara|hamari|hai|hain|chahiye|nahi|nahin|kya|kitna|kitne|aur|lekin|dukaan|dukan|bhai|ji|haan|accha|achha|batao|kaise|wala|wali|log)\b/gi;
const MARATHI = /(आहे|आहेत|माझे|माझा|माझी|आणि|पाहिजे|नाही|आम्ही|कसे|किती)/;
const ASSAMESE = /[ৰৱ]|(আছে|মোৰ|আমাৰ)/;

export function detectLanguage(text: string): Language | null {
  const t = text.trim();
  if (!t) return null;
  let best: { lang: Language; n: number } | null = null;
  for (const [re, lang] of RANGES) {
    const n = t.match(re)?.length ?? 0;
    if (n && (!best || n > best.n)) best = { lang, n };
  }
  if (best) {
    if (best.lang === "Hindi" && MARATHI.test(t)) return "Marathi";
    if (best.lang === "Bengali" && ASSAMESE.test(t)) return "Assamese";
    return best.lang;
  }
  if (/[a-z]/i.test(t)) {
    const hits = t.match(HINGLISH)?.length ?? 0;
    const words = t.split(/\s+/).length;
    if (hits >= 2 || (words <= 4 && hits >= 1)) return "Hindi";
    return "English";
  }
  return null; // numbers / emoji only — keep current language
}
