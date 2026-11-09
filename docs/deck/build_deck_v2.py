"""v2: first 10 slides condensed to 7 + metrics + technical architecture + privacy & security + thank you.
Keeps the team's edits (Team Ace, comma style, dashed callouts, DPDP heading, slide-6 wording)."""
exec(open("_helpers_v2.py").read())
from pptx.enum.dml import MSO_LINE_DASH_STYLE
OUT = "/home/jntbatra/Documents/Hackathon/airtel_digital/deck/Accel_UdyamDigital_TrackA_v2.pptx"

# --- team style: commas instead of em-dashes everywhere we write text
_tb = tb
def tb(slide, x, y, w, h, paras, **kw):
    def fix(t): return t.replace(" — ", ", ").replace("—", ", ")
    if isinstance(paras, str): paras = fix(paras)
    else: paras = [fix(p) if isinstance(p, str) else [(fix(t), o) for t, o in p] for p in paras]
    return _tb(slide, x, y, w, h, paras, **kw)

def insight(slide, x, y, w, h, text, label="INSIGHT"):  # dashed red callout (team style)
    b = box(slide, x, y, w, h, fill=WHITE, line=RED, radius=0.12)
    b.line.dash_style = MSO_LINE_DASH_STYLE.DASH; b.line.width = Pt(1.25)
    tb(slide, x + 0.1, y + 0.05, w - 0.2, h - 0.1, [[(label + ": ", {"bold": True, "color": RED}), (text, {"bold": True, "color": RED})]], size=10, anchor=MSO_ANCHOR.MIDDLE)

def bar_chart(slide, x, y, w, h, cats, vals, title=None, fmt="#,##0", horizontal=True, colors=None, name=None, size=8.5):
    cd = CategoryChartData(); cd.categories = cats; cd.add_series("s", vals)
    gf = slide.shapes.add_chart(XL_CHART_TYPE.BAR_CLUSTERED if horizontal else XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(x), Inches(y), Inches(w), Inches(h), cd)
    if name: gf.name = name
    ch = gf.chart; style_chart(ch, size); ch.has_legend = False
    ch.has_title = bool(title)
    if title:
        ch.chart_title.text_frame.text = title
        p = ch.chart_title.text_frame.paragraphs[0]; p.font.size = Pt(9); p.font.bold = True; p.font.name = FONT
    pl = ch.plots[0]; pl.gap_width = 45; pl.has_data_labels = True
    dl = pl.data_labels; dl.font.size = Pt(size); dl.font.bold = True; dl.number_format = fmt; dl.number_format_is_linked = False
    dl.position = XL_LABEL_POSITION.OUTSIDE_END
    se = pl.series[0]; se.format.fill.solid(); se.format.fill.fore_color.rgb = RED
    for i, c in (colors or {}).items():
        pt = se.points[i]; pt.format.fill.solid(); pt.format.fill.fore_color.rgb = c
    if horizontal: ch.category_axis.reverse_order = True
    ch.category_axis.tick_labels.font.size = Pt(size); ch.category_axis.format.line.color.rgb = LINE
    ch.value_axis.visible = False; ch.value_axis.has_major_gridlines = False
    ch.value_axis.maximum_scale = max(vals) * 1.25
    return ch

# ================================================================ 1. COVER
cover = prs.slides[0]
tb(cover, 0.55, 2.9, 4.9, 0.7, "Accel Business · Project Udyam Digital", size=18, bold=True, color=WHITE)
tb(cover, 0.55, 3.55, 4.6, 0.6, "One sitting from “hello” to live: voice-first advisor, one price, minutes-long KYC, live tracker", size=11, color=WHITE)
tb(cover, 0.55, 4.25, 4.6, 0.7, [[("YTL Hackathon 2026 · Enterprise Track A", {"bold": True})], "Team: Team Ace", "Leader Name: Jayant Batra"], size=10, color=WHITE)
cover.notes_slide.notes_text_frame.text = "Cover. Accel Business (fictional operator), Project Udyam Digital: digital-first SMB acquisition and onboarding."
sldIdLst = prs.slides._sldIdLst
first_content = sldIdLst[1]
prs.part.drop_rel(first_content.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")); sldIdLst.remove(first_content)

# ================================================================ 2. DIAGNOSIS (funnel + RCA + key numbers)
F = A["funnel"]
s = new_slide("Diagnosis", "Funnel & root causes: 4,632 of 5,000 leads leak, from five fixable causes",
    "Funnel from stage_reached in smb_leads.csv, with conversion from the previous stage in brackets. Root causes map recorded drop_reason values to five causes; 'Lost' is the number of leads whose drop reason belongs to that cause. Causes 1-4 are journey design, cause 5 is lead quality. Key numbers at bottom-left are the baseline for our targets.")
cats = [F[0]["stage"]] + [f"{f['stage']} ({pct(f['conv_prev'], 0)})" for f in F[1:]]
bar_chart(s, 0.25, 1.2, 3.55, 2.75, cats, [f["n"] for f in F], colors={3: DEEP}, name="Funnel chart")
stats = [(pct(K["act_rate"]), "lead → live"), (f"{K['days']} d", "lead → live"), (inr(K["cac"]), "CAC / activation"), (f"{K['chase']:.0f}×", "status chases")]
for i, (v, l) in enumerate(stats):
    x = 0.35 + (i % 2) * 1.75; y = 4.0 + (i // 2) * 0.55
    box(s, x, y, 1.65, 0.48, fill=PINK, radius=0.15)
    tb(s, x + 0.08, y + 0.02, 0.95, 0.44, v, size=12.5, bold=True, color=RED, anchor=MSO_ANCHOR.MIDDLE)
    tb(s, x + 0.98, y + 0.02, 0.65, 0.44, l, size=7.5, color=GREY, anchor=MSO_ANCHOR.MIDDLE)
rc = [
    ("Sales needs a physical visit", "No time for visit 531 · visit not scheduled 296 · only wanted a mobile plan 280", "1,107", "Voice/chat advisor, SIM-only fast path"),
    ("Quote is slow, complex, not need-fitted", f"Price 414 · competitor 207 · too complex 206 · too slow 179 · {pct(A['mismatch']['share'], 0)} got a bundle ≠ ask", "1,006", "Instant need-based quote, one price"),
    ("Paper KYC, no pre-checks", "Missing doc 94 · paperwork 79 · signatory away 53 · mismatch 47 · 22 live on bad GSTIN", "273", "Registry + DigiLocker, OCR, e-sign"),
    ("No feasibility check, no visibility", "Install > 21 days 98 · not feasible 41 · 3 chase calls; churn 6% → 28%", "220", "Feasibility first, live tracker"),
    ("Low-intent / bad contact data", "Unreachable 805 · wrong number 319 · not interested 470", "1,594", "Owner-initiated, verified mobile, scored follow-up"),
]
for t, x, w in [("Root cause", 4.32, 1.7), ("Evidence (leads)", 6.05, 1.95), ("Lost", 7.98, 0.5), ("Fix", 8.5, 1.15)]:
    tb(s, x, 1.18, w, 0.22, t, size=8, bold=True, color=GREY)
for i, (cause, ev, lost, fix) in enumerate(rc):
    y = 1.42 + i * 0.73
    box(s, 3.95, y, 5.7, 0.66, fill=PINK if i % 2 == 0 else SOFT, radius=0.12)
    circle_num(s, 4.02, y + 0.19, i + 1, d=0.26, size=9.5)
    tb(s, 4.32, y + 0.03, 1.7, 0.6, cause, size=8.5, bold=True, anchor=MSO_ANCHOR.MIDDLE)
    tb(s, 6.05, y + 0.03, 1.95, 0.6, ev, size=7.5, anchor=MSO_ANCHOR.MIDDLE)
    tb(s, 7.98, y + 0.03, 0.55, 0.6, lost, size=10.5, bold=True, color=RED, anchor=MSO_ANCHOR.MIDDLE)
    tb(s, 8.5, y + 0.03, 1.12, 0.6, fix, size=7.5, anchor=MSO_ANCHOR.MIDDLE)
footnote(s, "Source: smb_leads.csv (5,000 synthetic leads, Apr–Jun 2026). Steepest step: needs → quote (44%). Each step takes 2–4 days of hand-offs.")

# ================================================================ 3. WHO FIRST (Q1)
s = new_slide("Who first", "Who first: professional offices and multi-site pay back fastest",
    "Key question 1. Scorecard per segment from smb_leads.csv: activation rate, 6-month churn, acquisition cost per activation (total spend in segment / activations), average monthly bundle value, and months of revenue to recover acquisition cost. Bundles at the bottom come from our rule engine for a typical customer of each segment.")
SEG = [("Professional offices", "Wave 1 · digital"), ("Small multi-site businesses", "Wave 1 · digital + expert"), ("Micro retail & services", "Wave 2 · digital starter"), ("Small manufacturers", "Expert-led")]
NAMES = {"Professional offices": "Professional offices", "Small multi-site businesses": "Multi-site businesses", "Micro retail & services": "Micro retail & services", "Small manufacturers": "Small manufacturers"}
for i, (k, tag) in enumerate(SEG):
    v = A["segment"][k]; x = 0.35 + i * 2.35
    box(s, x, 1.3, 2.22, 1.95, fill=PINK if i < 2 else SOFT, radius=0.08)
    tb(s, x + 0.1, 1.34, 2.05, 0.3, NAMES[k], size=10.5, bold=True)
    tb(s, x + 0.1, 1.6, 2.05, 0.22, tag, size=8.5, bold=True, color=RED)
    lines = [f"Share of leads  {v['n'] / 5000 * 100:.0f}%", f"Activation  {pct(v['act'])}", f"6-mo churn  {pct(v['churn'], 0)}",
             f"CAC / activation  {inr(v['cac'])}", f"Avg bundle  {inr(v['arpu'])}/mo", f"Payback  {v['cac'] / v['arpu']:.1f} months"]
    tb(s, x + 0.1, 1.86, 2.05, 1.35, lines, size=9)
for i, b in enumerate(B):
    x = 0.35 + i * 2.35
    box(s, x, 3.35, 2.22, 1.7, fill=WHITE, line=LINE, radius=0.08)
    tb(s, x + 0.08, 3.38, 2.1, 0.42, b["name"].split(" (")[0], size=9, bold=True)
    tb(s, x + 0.08, 3.78, 2.1, 0.75, ", ".join(b["items"]), size=7.5, color=GREY)
    tb(s, x + 0.08, 4.55, 2.1, 0.45, [[(inr(b["monthly"]) + "/mo", {"bold": True, "color": RED, "size": 12})], f"setup {inr(b['setup'])} · {b['contract']} mo · live ~{b['eta']} d"], size=8)
footnote(s, "Payback = CAC ÷ avg monthly bundle (revenue months). Bundles priced by our engine on product_catalogue.csv.")

# ================================================================ 4. SOLUTION (Q2)
s = new_slide("Solution", "Needs discovery without a salesperson: talk → one price → verify → track",
    "Key question 2 and the build challenge. The owner talks (Sarvam speech in 11 Indian languages with auto-detect) or chats. Code picks the questions; a deterministic rule engine on the catalogue picks products, checks eligibility and prices one monthly number; the LLM (Kimi K2.5 on Bedrock, Mumbai) only phrases replies and a guard rejects any number the engine didn't compute.")
steps = [("Talk", "Voice or chat, 11 Indian languages + English, auto-detected. 6 short questions."), ("One price", "Need-based bundle with plain reasons; toggle add-ons, 12/24 months, cheaper options."),
         ("Verify", "Consent → GSTIN + registry → DigiLocker → upload only what's missing → e-sign."), ("Track", "8-stage tracker with ETA, WhatsApp updates, auto-escalation when late.")]
for i, (h, d) in enumerate(steps):
    x = 0.35 + i * 2.35
    box(s, x, 1.3, 2.1, 1.25, fill=PINK, radius=0.1)
    circle_num(s, x + 0.1, 1.38, i + 1)
    tb(s, x + 0.45, 1.36, 1.6, 0.3, h, size=11.5, bold=True)
    tb(s, x + 0.1, 1.72, 1.95, 0.8, d, size=8.5)
    if i < 3: arrow(s, x + 2.12, 1.92, x + 2.33, 1.92, RED)
box(s, 0.35, 2.75, 5.6, 2.3, fill=SOFT, radius=0.06)
tb(s, 0.5, 2.8, 5.3, 0.28, "AI talks, rules decide", size=11, bold=True, color=RED)
for t, x in [("Owner\nvoice / chat", 0.5), ("Advisor\n(LLM phrases only)", 1.95), ("Rule engine\neligibility · price", 3.4), ("Catalogue\n25 products", 4.85)]:
    w = 1.0 if x > 4 else 1.22
    box(s, x, 3.15, w, 0.7, fill=WHITE, line=LINE, radius=0.12)
    tb(s, x, 3.17, w, 0.66, t, size=8.5, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
for x1, x2 in [(1.72, 1.93), (3.17, 3.38), (4.62, 4.83)]: arrow(s, x1, 3.5, x2, 3.5, GREY)
tb(s, 0.5, 3.95, 5.35, 1.05, [[("- Understands any language: ", {"bold": True}), ("it gets answers like \"thirty\" or \"लुधियाना\" and picks up corrections. Our app decides the next question, not the AI.", {})],
    [("- No made-up prices: ", {"bold": True}), ("if the AI mentions a price or time we didn't calculate, the reply is thrown away and rewritten.", {})],
    [("- Proof: ", {"bold": True}), ("we checked all 368 past sales with our rules. They would have stopped 53 wrong products and 22 sales to businesses with cancelled GST.", {})]], size=8.5)
insight(s, 6.15, 2.75, 3.5, 1.7, f"{pct(A['mismatch']['share'], 0)} of activated customers bought a bundle different from what they asked for. Our advisor recommends from stated needs only e.g. SIMs only if asked, 100 Mbps for ≤9 people per site, upsell max 2 optional add-ons.", label="WHY IT MATTERS")
footnote(s, "Stack: Next.js · Bedrock Mantle (Kimi K2.5, Mumbai) · Sarvam STT/TTS · AWS Textract. Replay on smb_leads.csv.")

# ================================================================ 5. TRUST & KYC (Q3)
s = new_slide("Trust & KYC", "Smart KYC in minutes: registry first, upload last, consent throughout",
    "Key question 3. Flow and controls. Results: our Smart KYC run on all 12 specimen applicants in kyc_documents/: 7 verified, 5 blocked with plain-language reasons (our own self-check, not the judges' answer key).")
flow = ["Consent\nper purpose", "GSTIN\nchecksum + registry", "Udyam\nregistry", "DigiLocker /\nEntity Locker", "Upload only\nwhat's missing", "Cross-checks\n+ e-sign"]
for i, t in enumerate(flow):
    x = 0.35 + i * 1.55
    box(s, x, 1.3, 1.38, 0.62, fill=RED if i in (0, 5) else PINK, radius=0.15)
    tb(s, x, 1.31, 1.38, 0.6, t, size=8.5, bold=True, color=WHITE if i in (0, 5) else CHAR, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    if i < 5: arrow(s, x + 1.39, 1.61, x + 1.54, 1.61, RED)
checks = [("K01", "GSTIN cancelled in registry (certificate looks fine) + blank Udyam number"), ("K05", "Udyam certificate missing"), ("K06", "GSTIN fails checksum, 2 characters altered vs registry"),
          ("K07", "Legal name on certificate edited (≠ registry)"), ("K11", "Electricity bill 257 days old (> 90-day rule)")]
tb(s, 0.35, 2.05, 5.4, 0.25, "Specimen applicants: 7 of 12 verified, 5 blocked", size=10.5, bold=True)
for i, (k, why) in enumerate(checks):
    y = 2.35 + i * 0.5
    box(s, 0.35, y, 5.4, 0.42, fill=SOFT, radius=0.15)
    tb(s, 0.45, y + 0.02, 0.55, 0.38, k, size=10, bold=True, color=RED, anchor=MSO_ANCHOR.MIDDLE)
    tb(s, 1.0, y + 0.02, 4.7, 0.38, why, size=8.5, anchor=MSO_ANCHOR.MIDDLE)
dp = [("Consent", "Separate, withdrawable consents: KYC, voice, expert hand-off, marketing (off by default)."), ("Purpose limitation", "KYC data used only for KYC/contract, never marketing."),
      ("Minimisation", "Registry + DigiLocker first; images read in memory, never stored."), ("Retention", "Fields for contract period; transcripts 30 days; non-buyers 90 days."), ("Rights", "Privacy center: view, withdraw, download, delete.")]
tb(s, 6.0, 2.05, 3.65, 0.25, "Digital Personal Data Protection Act, 2023", size=10.5, bold=True)
for i, (h, d) in enumerate(dp):
    tb(s, 6.0, 2.35 + i * 0.5, 3.65, 0.48, [[(h + ": ", {"bold": True, "color": RED}), (d, {})]], size=8.5)
footnote(s, "Specimen documents from kyc_documents/ (synthetic). DigiLocker and e-sign are simulated in the prototype; OCR by AWS Textract.")

# ================================================================ 6. CHANNEL + RETENTION (Q4)
src = A["source"]; order = sorted(src, key=lambda k: -src[k]["cac"]); cb = A["churn_by_chase"]
s = new_slide("Channel", "Experts work only what AI can't close, and nobody has to chase status",
    "Key question 4 plus retention. Left top: acquisition cost per activation by lead source (spend on source / activations from it). Left bottom: 6-month churn by number of status-chase calls among activated customers. Right: how the AI routes, scores, assigns and pays Local Accel Experts, and the tracker that removes chasing.")
bar_chart(s, 0.25, 1.2, 3.55, 1.95, [o.replace(" campaign", "") for o in order], [src[k]["cac"] for k in order], title="CAC per activation (₹) by source", name="CAC by source", size=8)
bar_chart(s, 0.25, 3.15, 3.55, 1.95, [f"{k} call{'s' if k != '1' else ''}" for k in cb], [round(v["churn"] * 100, 1) for v in cb.values()],
          title="6-month churn (%) by status-chase calls", fmt='0"%"', horizontal=False, colors={4: DEEP}, name="Churn by chase calls", size=8)
model = [("Route", "AI escalates on 7 triggers:", " price objection ×2, multi-site / manufacturer, not feasible, KYC failure, idle quote, low confidence, asks for a person."),
         ("Prioritise", "Likelihood-to-buy score", " (logistic model, AUC 0.73; GSTIN +1.19 strongest). High → same day, medium → 24 h call, low → WhatsApp nurture."),
         ("Assign", "Top-3 experts", " by distance, language, segment specialty, track record, load, offered in turn; manager override, reason shown."),
         ("Pay", "70% on connection + 30% retention bonus", " at 6 months; clawback if churn < 3 months. Discounts only by manager, in 3 cases.")]
for i, (h, b, d) in enumerate(model):
    y = 1.22 + i * 0.68
    circle_num(s, 4.0, y + 0.04, i + 1, d=0.26, size=9.5)
    tb(s, 4.35, y, 5.3, 0.22, h, size=10, bold=True)
    tb(s, 4.35, y + 0.21, 5.3, 0.45, [[(b, {"bold": True}), (d, {})]], size=8)
box(s, 4.0, 4.0, 5.65, 1.05, fill=PINK, radius=0.08)
tb(s, 4.12, 4.03, 5.4, 0.24, "Tracker: what the owner sees", size=9.5, bold=True, color=RED)
stages = ["Placed", "Paid", "KYC", "Feasibility", "Technician", "Install", "Live", "1st bill"]
for i, t in enumerate(stages):
    x = 4.12 + i * 0.69
    c = box(s, x, 4.32, 0.62, 0.3, fill=CHAR if i < 5 else WHITE, radius=0.5)
    tb(s, x, 4.32, 0.62, 0.3, t, size=7, bold=True, color=WHITE if i < 5 else RED, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
tb(s, 4.12, 4.68, 5.45, 0.35, f"ETA = longest install in the bundle; late > 1 day → auto-escalation + WhatsApp before they ask. Partner leads churn {pct(src['Channel partner']['churn'], 0)} vs field {pct(src['Field sales']['churn'], 0)}.", size=7.5)
footnote(s, "Source: smb_leads.csv. CAC = acquisition_cost_inr per lead source ÷ activations from it. Churn n = " + ", ".join(str(v["n"]) for v in cb.values()) + ".")

# ================================================================ 7. BUSINESS CASE
base = [f["conv_prev"] for f in A["funnel"][1:]]
target = [0.72, 0.68, 0.52, 0.80, 0.75]
acts_t = 5000
for t in target: acts_t *= t
acts_t = round(acts_t)
s = new_slide("Business case", f"Business case: same 5,000 leads, ~{acts_t} activations instead of 368",
    "Impact sizing. Stage conversions today (from data) vs our target per stage, each tied to a root-cause fix. Target conversions are proposals. Revenue uses the median activated bundle value (₹6,900/month) to stay conservative; spend assumes expert visits only for routed leads.")
cd = CategoryChartData(); cd.categories = ["→ Contacted", "→ Needs", "→ Quote", "→ KYC", "→ Live"]
cd.add_series("Today", [round(x * 100) for x in base]); cd.add_series("Target", [round(x * 100) for x in target])
gf = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(0.3), Inches(1.3), Inches(4.4), Inches(3.0), cd); gf.name = "Stage conversion today vs target"
ch = gf.chart; style_chart(ch); ch.has_legend = True; ch.legend.position = XL_LEGEND_POSITION.TOP; ch.legend.include_in_layout = False; ch.legend.font.size = Pt(8.5)
pl = ch.plots[0]; pl.gap_width = 70; pl.overlap = -10; pl.has_data_labels = True; pl.data_labels.font.size = Pt(8); pl.data_labels.number_format = '0"%"'; pl.data_labels.number_format_is_linked = False
for se, col in zip(pl.series, [RGBColor(0xC8, 0xC8, 0xCC), RED]): se.format.fill.solid(); se.format.fill.fore_color.rgb = col
ch.value_axis.visible = False; ch.value_axis.has_major_gridlines = False; ch.category_axis.tick_labels.font.size = Pt(8.5)
tb(s, 0.35, 4.35, 4.35, 0.7, "Fixes per step: owner-initiated + verified number · no visit · instant need-based quote · registry/DigiLocker KYC · feasibility before checkout + tracker.", size=8.5, color=GREY)
flow = [("Activations / quarter", "368", f"~{acts_t}"), ("Activation rate", pct(K["act_rate"]), pct(acts_t / 5000)),
        ("New MRR / quarter", inr(368 * 6900), inr(acts_t * 6900)), ("Annualised new revenue", f"₹{368 * 6900 * 12 / 1e7:.1f} Cr", f"₹{acts_t * 6900 * 12 / 1e7:.1f} Cr"),
        ("CAC / activation", inr(K["cac"]), "≤ ₹5,000"), ("Payback (revenue months)", f"{K['cac'] / 6900:.1f}", f"{5000 / 6900:.1f}")]
tb(s, 4.95, 1.3, 2.0, 0.25, "Per quarter of 5,000 leads", size=9.5, bold=True)
tb(s, 7.1, 1.3, 1.2, 0.25, "Today", size=9.5, bold=True, color=GREY, align=PP_ALIGN.RIGHT)
tb(s, 8.4, 1.3, 1.25, 0.25, "Target", size=9.5, bold=True, color=RED, align=PP_ALIGN.RIGHT)
for i, (l, a, b) in enumerate(flow):
    y = 1.6 + i * 0.47
    box(s, 4.95, y, 4.7, 0.4, fill=PINK if i % 2 == 0 else SOFT, radius=0.2)
    tb(s, 5.05, y + 0.03, 2.2, 0.34, l, size=9, anchor=MSO_ANCHOR.MIDDLE)
    tb(s, 7.1, y + 0.03, 1.2, 0.34, a, size=10, color=GREY, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
    tb(s, 8.4, y + 0.03, 1.2, 0.34, b, size=10, bold=True, color=RED, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
insight(s, 4.95, 4.42, 4.7, 0.68, "One bill, one number, live in days, a tier-2 clinic gets fibre, email ×8, backup, security and 2 CCTV for ₹3,688/mo.", label="FOR THE OWNER")
footnote(s, "Targets are proposals. MRR at median bundle ₹6,900/mo (mean ₹12,351). CAC target: experts only on AI-routed leads.")

# ================================================================ 8. METRICS, ROLLOUT, RISKS (Q5)
s = new_slide("Business case", "How we'll measure it, roll it out and de-risk it",
    "Key question 5. Five success metrics with today's baseline from data and our proposed targets; a phased rollout starting with the best-paying segments in two tier-2 cities; main risks with mitigations already built into the prototype.")
M = [("Lead → activation", pct(K["act_rate"]), "≥ 15%"), ("Days lead → live", f"{K['days']}", "≤ 7"), ("CAC / activation", inr(K["cac"]), "≤ ₹5,000"),
     ("6-month churn", pct(K["churn"]), "≤ 10%"), ("Status chases / customer", f"{K['chase']:.0f}", "< 1")]
tb(s, 0.35, 1.28, 3.6, 0.25, "Success metrics", size=10.5, bold=True)
for i, (m, a, t) in enumerate(M):
    y = 1.58 + i * 0.47
    box(s, 0.35, y, 3.6, 0.4, fill=PINK if i % 2 == 0 else SOFT, radius=0.2)
    tb(s, 0.45, y + 0.03, 1.75, 0.34, m, size=9, anchor=MSO_ANCHOR.MIDDLE)
    tb(s, 2.2, y + 0.03, 0.8, 0.34, a, size=9.5, color=GREY, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
    tb(s, 3.0, y + 0.03, 0.9, 0.34, t, size=9.5, bold=True, color=RED, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
tb(s, 0.35, 4.0, 3.6, 0.6, "Also tracked: share closed by AI alone, products per customer (4.49 today), discount rate, NPS.", size=8.5, color=GREY)
R = [("0–3 mo · Pilot", "2 tier-2 cities, professional offices + multi-site; partners onboarded as Local Accel Experts."),
     ("3–6 mo · Wave 1", "All tier-1/2 cities for wave-1 segments; voice in 11 languages; DigiLocker live."),
     ("6–12 mo · Wave 2", "Micro digital starter (WhatsApp/web-led), manufacturers expert-led; national.")]
tb(s, 4.2, 1.28, 2.6, 0.25, "Rollout", size=10.5, bold=True)
for i, (h, d) in enumerate(R):
    y = 1.58 + i * 0.85
    circle_num(s, 4.2, y, i + 1)
    tb(s, 4.55, y - 0.02, 2.3, 0.25, h, size=9.5, bold=True)
    tb(s, 4.55, y + 0.22, 2.3, 0.6, d, size=8.5)
RK = [("AI says something wrong", "Rules pick products/prices; number & promise guard"), ("Regional voice quality", "Chat fallback; questions fixed in code"),
      ("Partners resist", "Paid on connection; AI sends them warm leads"), ("Data residency / DPDP", "Mumbai region; consent + retention limits"),
      ("Fibre not feasible", "Check before checkout; 5G AirFiber fallback")]
tb(s, 7.05, 1.28, 2.6, 0.25, "Risks → mitigation", size=10.5, bold=True)
for i, (r, m) in enumerate(RK):
    tb(s, 7.05, 1.58 + i * 0.62, 2.6, 0.6, [[(r, {"bold": True, "color": RED})], m], size=8.5)
footnote(s, "Baselines: smb_leads.csv. Targets and rollout are proposals.")

# ================================================================ 9. TECHNICAL ARCHITECTURE (infographic, v3)
exec(open("arch_v3.py").read())

# ================================================================ 10. PRIVACY & SECURITY
s = new_slide("Trust & KYC", "Privacy & security by design: collect less, keep less, show less",
    "One-page privacy and security note. Top: controls at each step of the data lifecycle. Table: every kind of personal data the product touches, why, how long it is kept and who can see it. Right: security controls in the build and the owner's rights under the Digital Personal Data Protection Act, 2023. Legal section numbers should be verified before external use.")
life = [("Collect", "Consent per purpose first; registry / DigiLocker before uploads"), ("Use", "Only for the stated purpose; never KYC data for marketing"),
        ("Store", "Fields, not images; masked IDs; India region"), ("Share", "Expert sees name, business, area, plan, after one-tap consent"), ("Delete", "Auto-expiry + delete-my-data in the Privacy center")]
for i, (h, d) in enumerate(life):
    x = 0.35 + i * 1.87
    sh = s.shapes.add_shape(MSO_SHAPE.CHEVRON if i else MSO_SHAPE.PENTAGON, Inches(x), Inches(1.22), Inches(1.95), Inches(0.75))
    sh.fill.solid(); sh.fill.fore_color.rgb = RED if i % 2 == 0 else DEEP; sh.line.fill.background(); sh.shadow.inherit = False; sh.text_frame.text = ""
    tb(s, x + (0.28 if i else 0.12), 1.24, 1.45, 0.71, [[(h, {"bold": True, "color": WHITE, "size": 9.5})], [(d, {"color": WHITE, "size": 6.5})]], anchor=MSO_ANCHOR.MIDDLE)
rows = [("Data", "Why we need it", "Kept", "Who sees it"),
        ("Mobile number", "Save one plan across voice, chat, expert", "Until deleted", "Owner; expert after consent"),
        ("Business profile", "Recommend and price the bundle", "Contract / 90 d if no sale", "Owner; expert (summary)"),
        ("GSTIN · Udyam no.", "Verify the business (KYC)", "Contract period", "Masked in UI, e.g. 32TT*******1ZW"),
        ("KYC images", "Read the fields (OCR)", "Not stored, memory only", "Nobody"),
        ("Extracted KYC fields", "Contract and compliance", "Contract period", "Operations (masked)"),
        ("Voice audio", "Understand what was said", "Not stored", "Speech processor only"),
        ("Transcript", "Continue the conversation", "30 days", "Owner; expert gets a summary"),
        ("Consent log", "Prove what was agreed, when", "Kept as proof", "Compliance")]
t = s.shapes.add_table(len(rows), 4, Inches(0.35), Inches(2.1), Inches(6.25), Inches(2.95)).table
for j, wdt in enumerate([1.35, 2.05, 1.35, 1.5]): t.columns[j].width = Inches(wdt)
for i, r in enumerate(rows):
    t.rows[i].height = Inches(0.32)
    for j, v in enumerate(r):
        c = t.cell(i, j); c.text = v; c.margin_left = c.margin_right = Inches(0.05); c.margin_top = c.margin_bottom = Inches(0.02)
        c.vertical_anchor = MSO_ANCHOR.MIDDLE
        p = c.text_frame.paragraphs[0]; p.font.size = Pt(7.5); p.font.name = FONT; p.font.bold = i == 0 or j == 0
        p.font.color.rgb = WHITE if i == 0 else (RED if (j == 2 and ("Not stored" in v)) else CHAR)
        c.fill.solid(); c.fill.fore_color.rgb = CHAR if i == 0 else (PINK if i % 2 else WHITE)
box(s, 6.75, 2.1, 2.9, 2.95, fill=SOFT, radius=0.05)
tb(s, 6.85, 2.14, 2.7, 0.22, "SECURITY CONTROLS", size=7.5, bold=True, color=RED)
ctrl = ["No open ports (Cloudflare Tunnel); role views (owner / expert / manager)", "Keys only on the server; AWS calls signed (SigV4)", "OCR in memory; images never written to disk",
        "Identifiers masked in UI and logs; no personal data in app logs", "AI and hosting in AWS Mumbai (ap-south-1)"]
for j, c in enumerate(ctrl):
    tb(s, 6.85, 2.38 + j * 0.37, 2.72, 0.36, [[("✓ ", {"bold": True, "color": RED}), (c, {})]], size=7.5)
tb(s, 6.85, 4.25, 2.7, 0.22, "OWNER RIGHTS (DPDP ACT 2023)", size=7.5, bold=True, color=RED)
for j, r in enumerate(["View", "Withdraw", "Download", "Delete"]):
    x = 6.85 + j * 0.68
    box(s, x, 4.52, 0.62, 0.3, fill=RED, radius=0.5)
    tb(s, x, 4.52, 0.62, 0.3, r, size=7, bold=True, color=WHITE, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
tb(s, 6.85, 4.84, 2.7, 0.2, "Grievance contact in the consent notice", size=6.5, color=GREY)
footnote(s, "Synthetic data only in the prototype. Processors (AWS, Sarvam) disclosed in the notice. Legal citations to be verified.")

# ================================================================ 11. THANK YOU
s = prs.slides.add_slide(content_layout)
for ph in list(s.placeholders): ph._element.getparent().remove(ph._element)
s.shapes.add_picture(io.BytesIO(prs.slides[0].part.related_part([r.rId for r in prs.slides[0].part.rels.values() if "image" in r.reltype][0]).blob), 0, 0, prs.slide_width, prs.slide_height)
tb(s, 0.55, 3.15, 4.6, 0.6, "Thank you", size=30, bold=True, color=WHITE)
tb(s, 0.55, 3.85, 4.6, 0.5, "Accel Business · Project Udyam Digital, demo: voice advisor → one price → Smart KYC → live tracker", size=10.5, color=WHITE)
s.notes_slide.notes_text_frame.text = "Closing slide."
prs.save(OUT)
print("saved", OUT, "slides:", len(prs.slides))
