# Demo video script: Accel Udyam Digital (3:00)

Site: **https://accel.jayantb.dev** · record at 1920×1080, browser zoom 90%, Chrome, headphones + a good mic.
One person drives the screen and voices the **owner**. One person records the **voice-over (VO)** afterwards, or the same person does it live.

---

## Before you hit record (10 min)

1. **Fresh owner session:** open the site in a new **Incognito** window. That gives a clean advisor and KYC session.
2. **Mic check:** on the Talk screen, the level bar must move when you speak. If it shows "no sound", pick the right mic in the browser's site settings.
3. **Second tab:** have `/expert` (Ravi Menon, Kochi) and `/manager` already open in a normal window. They show leads and discount requests built from the hackathon dataset, tagged "Dataset".
4. **Reset:** if you rehearsed and accepted leads or approved discounts, ask Claude to reset the demo data before the final take.
5. **Rehearse once.** The AI's exact wording changes each run, but prices never do (they come from the rule engine). Cut dead waiting time in editing.
6. **Captions:** add English subtitles for every Hindi or Tamil line.

---

## Scene 1 · Hook · 0:00–0:10 · Home page

| Screen | VO |
|---|---|
| Home page, slow scroll to "Talk to an advisor" | "Only 7 out of 100 small businesses that ask Accel for a connection actually get connected. The rest drop out in the paperwork and the waiting. Udyam Digital fixes that in one sitting." |

## Scene 2 · Voice advisor · 0:10–0:55 · `/advisor` → Talk

Click **Talk to an advisor** → **Start**. Speak naturally; wait for each reply.

| # | Owner says (Hindi) | Subtitle | What to point out |
|---|---|---|---|
| 1 | नमस्ते, मेरा पुणे में एक डेंटल क्लिनिक है, आठ लोग काम करते हैं। | Hi, I have a dental clinic in Pune, eight people work there. | Language detected automatically, profile fills in on the right |
| 2 | हाँ, GST है। | Yes, we have GST. | |
| 3 | बिलिंग और मरीज़ों की रिपोर्ट के लिए तेज़ इंटरनेट चाहिए, और चार सिम। | We need fast internet for billing and patient reports, and four SIMs. | Plan builds live: fibre plus 4 SIMs, one monthly price |
| 4 | *(interrupt while it is speaking)* रुकिए, CCTV भी चाहिए। | Wait, we also need CCTV. | **Barge-in:** it stops talking at once and rebuilds the plan |
| 5 | மாதம் எவ்வளவு ஆகும்? *(Tamil)* | How much per month? | Switches to Tamil on its own; says one final price |

VO (over lines 3–5): "The owner just talks, in any of 11 Indian languages. The AI listens and asks questions, but every product, every rule and every rupee comes from our rule engine, never from the AI. So the price it says is the price on the bill."

## Scene 3 · Quote · 0:55–1:15 · `/quote`

| Action | VO |
|---|---|
| Click **Stop**, open the quote | "One plan, one bill, one price." |
| Click **24 months**; the price drops | "Longer contract, lower price, worked out instantly." |
| Click **Too expensive? See cheaper options** | "If the owner hesitates, it offers cheaper options that still meet the rules, instead of a salesperson guessing a discount." |
| Click **Continue to KYC** | |

## Scene 4 · Smart KYC · 1:15–1:50 · `/kyc`

| Action | VO |
|---|---|
| Consent screen; point at the What / Why / Kept table, tick nothing extra, click **Agree** | "Consent first, in plain language: what we collect, why, and when it is deleted. That is DPDP done right." |
| Open **Demo: load a specimen applicant** → pick **K06** → **Load documents** | |
| The ring turns red: *"GSTIN checksum does not match (possible typo or tampering)"* | "This certificate has an altered GSTIN. A human could miss it; our checks catch it in seconds." |
| Pick **K02** → **Load documents**; all checks pass and it shows **Business verified** | "A genuine business: DigiLocker and the registries do the work, the owner uploads only what is missing." |
| **e-Sign with Aadhaar** → **Pay first month via UPI** | "e-Sign, pay, done." *(Simulated in the prototype.)* |

## Scene 5 · Live tracker · 1:50–2:10 · `/track`

| Action | VO |
|---|---|
| Click **Simulate next day →** 3–4 times; show the **WhatsApp updates** panel filling up | "Today, owners call three times to ask where their connection is. Here every step updates live, on the site and on WhatsApp." |
| Click **Simulate a delayed day** once; it shows **Delayed, escalated** | "If something slips, it is escalated before the owner notices." |
| Keep clicking until **✓ Live** | "Status-chase calls: zero." |

## Scene 6 · Local Accel Expert · 2:10–2:35 · `/expert` (Ravi Menon, Kochi)

| Action | VO |
|---|---|
| Show the header and summary cards | "When the AI can't close a deal, like a price objection, a site survey or a failed KYC, it hands the lead to a Local Accel Expert." |
| Point at the **New offer** card: score ring, *Why the AI handed over*, contact, bundle | "The expert sees why it was handed over, the owner's needs, the draft bundle and a model score for how likely it is to convert. These are real leads from the case dataset." |
| Click **✓ Accept lead**; it moves to In progress | "70% of the incentive is paid on connection and 30% after six months, clawed back if the customer churns. So experts sell plans that stick." |

## Scene 7 · Manager · 2:35–2:52 · `/manager`

| Action | VO |
|---|---|
| **Overview**: pan across the panels | "Managers see the whole funnel on one screen." |
| Point at the **Rule engine: mistakes blocked** panel (53 and 22) | "Replaying the historic sales through our rules: 53 rule-breaking products and 22 sales on cancelled or suspended GSTINs would have been blocked." |
| **Discount approvals** tab → on a competitor-match card, click **✓ Approve** | "Discounts are rare: only three allowed cases, capped at 15%, and only a manager can approve, within two hours." |

## Scene 8 · Close · 2:52–3:00

| Screen | VO |
|---|---|
| Back to the home page (or the deck's last slide) | "Voice-first, any language, rules decide the price, KYC in minutes, and a human expert when it matters. Accel Udyam Digital, by Team Ace." |

---

### Word count and timing
- VO is about 330 words, which fits 3:00 alongside the owner's lines and the AI's replies (natural pace is about 150 words a minute).
- If a scene runs long, cut first from Scene 5 (fewer day clicks), then from Scene 3.

### If something goes wrong on the take
| Problem | Fix |
|---|---|
| Voice doesn't hear you | Check the level bar; use **Type** instead and read the same lines in Hindi |
| The AI asks an extra question | Answer it briefly; cut the wait in editing |
| K06/K02 results look mixed | Start a new Incognito session and load K02 first, then show K06 in a second session |
| Expert lead already accepted from rehearsal | Use another **New offer**, or ask Claude to reset the demo data |
