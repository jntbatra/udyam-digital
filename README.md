# Accel Business — SMB onboarding prototype (YTL case "Project Udyam Digital")

YTL Hackathon 2026 · Enterprise Track A. All data is synthetic; Accel Telecom is fictional.

A small-business owner goes from "tell me about your business" to an activated, tracked order in one sitting:

1. **Advisor** (`/advisor`) — chat in 11 Indian languages + English (Gemma 4 31B on Bedrock), or in-browser **voice mode** in Hindi/English (Amazon Nova 2.5 Sonic). The LLM only talks; a deterministic **rule + price engine** (`src/lib/engine.ts`) decides every product, eligibility rule and price from `product_catalogue.csv`.
2. **Quote** (`/quote`) — one monthly price, add-on toggles, 12/24-month choice, setup-fee spreading, need-based add-ons (max 2, off by default), "cheaper options" for price objections. Every edit is re-validated by the engine.
3. **Smart KYC** (`/kyc`) — consent screen first → GSTIN format/checksum + mock registry lookup → mock DigiLocker/Entity Locker → upload only what's missing (AWS Textract OCR in memory) → cross-checks (status, names, state, address PIN, 90-day bill, signatory) → simulated e-sign.
4. **Tracker** (`/track`) — 8 stages, ETA = longest install time, WhatsApp-style updates, auto-escalation when late, reschedule.
5. **Owner account** (`/account`) — plan, post-activation add-ons, support tickets, **privacy center** (consents, download, delete).
6. **Local Accel Expert** (`/expert`) and **Manager** (`/manager`) — AI-routed leads with propensity score + reasons, offer-to-top-3 assignment, manager override, manager-only discount approval, payouts (70% on connection / 30% at 6 months).

## Run

```bash
npm install
cp .env.example .env.local      # optional; defaults work
npm run dev                     # Next.js on http://localhost:3100
npm run voice                   # voice relay on ws://localhost:3001 (separate terminal)
```

AWS credentials are read from the default chain. Paid services used: Bedrock Mantle (Gemma 4), Textract, Nova Sonic. Set `ADVISOR_MODE=guided` for a zero-cost offline advisor.

### Multilingual voice with Sarvam AI

Voice mode defaults to Amazon Nova Sonic (English/Hindi). To enable Sarvam voice mode for the 12 advisor languages (English plus Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Odia and Assamese):

```bash
# In .env.local
VOICE_PROVIDER=sarvam
SARVAM_API_KEY=your_server_side_key
SARVAM_STT_MODEL=saaras:v3-realtime
SARVAM_TTS_MODEL=bulbul:v3
SARVAM_SPEAKER=shubh
```

Keep `SARVAM_API_KEY` server-side; do not prefix it with `NEXT_PUBLIC_`. Restart `npm run voice` after changing environment variables. The browser streams 16 kHz PCM audio to the voice relay, which sends it to Sarvam realtime STT, passes final transcripts through the existing advisor and deterministic rule engine, and sends Sarvam TTS audio back to the browser. `VOICE_PROVIDER=nova` preserves the original Nova Sonic path. Sarvam TTS currently supports the documented 11 Indian language codes; Assamese input is transcribed by STT, while spoken replies fall back to English because Bulbul does not currently expose `as-IN`.

## Checks (no AWS calls)

```bash
npm run typecheck
npm run check:engine   # replays 368 real activations through the rule engine + edge scenarios
npm run check:kyc      # runs Smart KYC on all 12 specimen applicants (cached OCR)
```

`check:engine` reproduces the data finding: **53 rule-breaking line items** and **22 activations on Cancelled/Suspended GSTINs** that the engine would have blocked.

`check:kyc` blocks 5 of 12 specimen applicants: K01 (GSTIN cancelled + blank Udyam number), K05 (no Udyam certificate), K06 (GSTIN fails checksum — altered digits), K07 (legal name on certificate edited), K11 (bill older than 90 days). This is our own answer key, not the judges'.

## Layout

| Path | What |
|---|---|
| `src/lib/engine.ts` | eligibility, dependencies, recommendation, pricing, cheaper options, upsell |
| `src/lib/advisor.ts` | LLM tools + deterministic fact extraction + guided fallback |
| `src/lib/kyc.ts` | Textract parsing (watermark removal, deskew, OCR repair), checks, DigiLocker mock |
| `src/lib/routing.ts` | propensity score, call/visit/nurture, expert ranking & assignment |
| `src/lib/orders.ts` | order state machine + tracker |
| `src/lib/store.ts` | JSON-file store shared by Next.js and the voice server |
| `voice-server.mts` | Nova Sonic bidirectional-stream relay (WebSocket) |
| `scripts/` | engine replay, KYC self-check, OCR re-extract, propensity training |
| `data/` | provided CSVs, `propensity.json`, `ocr-cache.json` (specimen OCR cache) |
