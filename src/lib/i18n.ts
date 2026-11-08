// UI strings. English + Hindi fully verified by the team; other languages are AI-translated (beta) in production.
export type Lang = "English" | "Hindi";
const T = {
  English: {
    heroTitle: "Get your business connected in one sitting",
    heroSub: "Internet, business SIMs, WhatsApp, CCTV, email — one plan, one bill, one number to call. Talk or chat in your language.",
    startChat: "Chat with advisor",
    startVoice: "Talk to advisor",
    simOnly: "I only need SIM cards",
    phone: "Mobile number (to save your plan)",
    language: "Language",
    viewQuote: "View quote",
    continueKyc: "Continue to KYC",
    perMonth: "/month",
    consentTitle: "Before we verify your business",
    consentBody: "We use your GSTIN, Udyam number and documents only to verify your business for this connection (KYC). Documents are read and then deleted; we keep only the extracted details for your contract period. You can withdraw consent or delete your data anytime from My account.",
    consentAgree: "I agree — use my details for KYC",
    marketing: "Also send me offers on WhatsApp (optional)",
    talkHuman: "Talk to a human",
    handoffAsk: "Can a local Udyam Digital expert call or visit you? They will see only your name, business, area and draft plan.",
    yes: "Yes", no: "No",
  },
  Hindi: {
    heroTitle: "एक ही बार में अपना बिज़नेस डिजिटल बनाइए",
    heroSub: "इंटरनेट, बिज़नेस सिम, WhatsApp, CCTV, ईमेल — एक प्लान, एक बिल, एक नंबर। अपनी भाषा में बात करें या चैट करें।",
    startChat: "सलाहकार से चैट करें",
    startVoice: "सलाहकार से बात करें",
    simOnly: "मुझे सिर्फ़ सिम चाहिए",
    phone: "मोबाइल नंबर (प्लान सेव करने के लिए)",
    language: "भाषा",
    viewQuote: "कोट देखें",
    continueKyc: "KYC पर आगे बढ़ें",
    perMonth: "/महीना",
    consentTitle: "आपके बिज़नेस की जाँच से पहले",
    consentBody: "हम आपका GSTIN, उद्यम नंबर और दस्तावेज़ सिर्फ़ इस कनेक्शन के लिए आपके बिज़नेस की जाँच (KYC) में इस्तेमाल करते हैं। दस्तावेज़ पढ़ने के बाद हटा दिए जाते हैं; सिर्फ़ ज़रूरी जानकारी कॉन्ट्रैक्ट अवधि तक रखी जाती है। आप 'मेरा अकाउंट' से कभी भी सहमति वापस ले सकते हैं या डेटा हटा सकते हैं।",
    consentAgree: "मैं सहमत हूँ — KYC के लिए मेरी जानकारी इस्तेमाल करें",
    marketing: "मुझे WhatsApp पर ऑफ़र भी भेजें (वैकल्पिक)",
    talkHuman: "किसी व्यक्ति से बात करें",
    handoffAsk: "क्या कोई लोकल Udyam Digital एक्सपर्ट आपको कॉल या विज़िट कर सकता है? उन्हें सिर्फ़ आपका नाम, बिज़नेस, इलाका और प्लान दिखेगा।",
    yes: "हाँ", no: "नहीं",
  },
} satisfies Record<Lang, Record<string, string>>;

export function t(lang: string | undefined, key: keyof (typeof T)["English"]) {
  return (T[(lang === "Hindi" ? "Hindi" : "English") as Lang] as Record<string, string>)[key] ?? T.English[key];
}
