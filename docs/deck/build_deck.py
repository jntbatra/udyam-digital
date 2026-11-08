"""Builds the Track A submission deck on the Airtel SYNC template (THEPIVOT-style layout).
Every number comes from analysis.json / bundles.json (computed from the case data) or is
labelled as a proposal on the slide."""
import json, copy
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LABEL_POSITION, XL_LEGEND_POSITION

TEMPLATE = "/home/jntbatra/Documents/Hackathon/airtel_digital/6ad9d4887d445_airtel_sync/Submission Template_Sync.pptx"
OUT = "/home/jntbatra/Documents/Hackathon/airtel_digital/deck/Accel_UdyamDigital_TrackA.pptx"
A = json.load(open("analysis.json"))
B = json.load(open("bundles.json"))
K = A["kpi"]

RED, DEEP, CHAR, GREY, PINK, LINE, WHITE, SOFT = (RGBColor(0xE4, 0, 0), RGBColor(0xB8, 0, 0), RGBColor(0x1D, 0x1D, 0x1F),
    RGBColor(0x6E, 0x6E, 0x73), RGBColor(0xFD, 0xEC, 0xEC), RGBColor(0xE3, 0xE3, 0xE6), RGBColor(0xFF, 0xFF, 0xFF), RGBColor(0xF6, 0xF6, 0xF7))
FONT = "Arial"
TABS = ["Diagnosis", "Who first", "Solution", "Trust & KYC", "Channel", "Business case"]

prs = Presentation(TEMPLATE)
content_layout = prs.slides[1].slide_layout
BG = [r.target_part.blob for r in prs.slides[1].part.rels.values() if "image" in r.reltype][0]
import io

def inr(n):  # Indian grouping
    n = int(round(n)); s = str(n)
    if len(s) <= 3: return "₹" + s
    head, tail = s[:-3], s[-3:]
    parts = []
    while len(head) > 2: parts.insert(0, head[-2:]); head = head[:-2]
    if head: parts.insert(0, head)
    return "₹" + ",".join(parts + [tail])
pct = lambda x, d=1: f"{x * 100:.{d}f}%"

def tb(slide, x, y, w, h, paras, size=11, color=CHAR, bold=False, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, name=None):
    """paras: str | list of str | list of list-of-runs; run = (text, {bold,color,size,italic})"""
    s = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    if name: s.name = name
    tf = s.text_frame; tf.word_wrap = True
    tf.margin_left = tf.margin_right = Inches(0.04); tf.margin_top = tf.margin_bottom = Inches(0.02)
    tf.vertical_anchor = anchor
    if isinstance(paras, str): paras = paras.split("\n")
    for i, p in enumerate(paras):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.alignment = align
        runs = p if isinstance(p, list) else [(p, {})]
        for text, o in runs:
            r = para.add_run(); r.text = text
            f = r.font; f.name = FONT; f.size = Pt(o.get("size", size)); f.bold = o.get("bold", bold)
            f.italic = o.get("italic", False); f.color.rgb = o.get("color", color)
        if isinstance(p, list) and p and p[0][1].get("space"): para.space_before = Pt(p[0][1]["space"])
    return s

def box(slide, x, y, w, h, fill=PINK, line=None, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.08, name=None):
    s = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if name: s.name = name
    s.fill.solid(); s.fill.fore_color.rgb = fill
    if line is None: s.line.fill.background()
    else: s.line.color.rgb = line; s.line.width = Pt(0.75)
    s.shadow.inherit = False
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE: s.adjustments[0] = radius
    s.text_frame.text = ""
    return s

def circle_num(slide, x, y, n, d=0.28, fill=RED, color=WHITE, size=11):
    c = box(slide, x, y, d, d, fill=fill, shape=MSO_SHAPE.OVAL)
    tf = c.text_frame; tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    r = p.add_run(); r.text = str(n); r.font.size = Pt(size); r.font.bold = True; r.font.color.rgb = color; r.font.name = FONT
    return c

def arrow(slide, x1, y1, x2, y2, color=GREY):
    c = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    c.line.color.rgb = color; c.line.width = Pt(1.25)
    ln = c.line._get_or_add_ln()
    from pptx.oxml.ns import qn
    from lxml import etree
    tail = etree.SubElement(ln, qn("a:tailEnd")); tail.set("type", "triangle"); tail.set("w", "med"); tail.set("len", "med")
    return c

def new_slide(tab, title, notes, sub=None):
    s = prs.slides.add_slide(content_layout)
    for ph in list(s.placeholders): ph._element.getparent().remove(ph._element)
    pic = s.shapes.add_picture(io.BytesIO(BG), 0, 0, prs.slide_width, prs.slide_height); pic.name = "Template background"
    # section tabs in the header row (between Airtel and SYNC logos)
    x = 1.45; w = 1.17
    for t in TABS:
        on = t == tab
        b = box(s, x, 0.30, w - 0.05, 0.26, fill=RED if on else SOFT, radius=0.5, name=f"Tab {t}")
        tf = b.text_frame; tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
        r = p.add_run(); r.text = t; r.font.size = Pt(8.5); r.font.bold = on; r.font.name = FONT; r.font.color.rgb = WHITE if on else GREY
        x += w
    tb(s, 0.35, 0.68, 9.3, 0.42, title, size=16, bold=True, name="Title")
    if sub: tb(s, 0.35, 1.06, 9.3, 0.26, sub, size=10, color=GREY, name="Subtitle")
    s.notes_slide.notes_text_frame.text = notes
    return s

def insight(slide, x, y, w, h, text, label="INSIGHT"):
    b = box(slide, x, y, w, h, fill=WHITE, line=RED, radius=0.12)
    tb(slide, x + 0.1, y + 0.05, w - 0.2, h - 0.1, [[(label + ": ", {"bold": True, "color": RED}), (text, {"bold": True, "color": RED})]], size=10.5, anchor=MSO_ANCHOR.MIDDLE)

def footnote(slide, text):
    tb(slide, 0.35, 5.12, 7.7, 0.24, text, size=7.5, color=GREY)

def style_chart(ch, size=9):
    ch.font.size = Pt(size); ch.font.name = FONT; ch.font.color.rgb = CHAR

# ---------------------------------------------------------------- 1. COVER (template slide 1)
cover = prs.slides[0]
tb(cover, 0.55, 2.9, 4.9, 0.7, "Accel Business · Project Udyam Digital", size=18, bold=True, color=WHITE)
tb(cover, 0.55, 3.55, 4.6, 0.6, "One sitting from “hello” to live: voice-first advisor, one price, minutes-long KYC, live tracker", size=11, color=WHITE)
tb(cover, 0.55, 4.3, 4.6, 0.5, [[("YTL Hackathon 2026 · Enterprise Track A", {"bold": True})], "Team: Jayant Batra · Harshita"], size=10, color=WHITE)
cover.notes_slide.notes_text_frame.text = "Cover. Accel Business (fictional operator) – Project Udyam Digital: digital-first SMB acquisition and onboarding."

# remove the template's empty content slide (we add our own copies of its background)
sldIdLst = prs.slides._sldIdLst
first_content = sldIdLst[1]
rid = first_content.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
prs.part.drop_rel(rid); sldIdLst.remove(first_content)

# ---------------------------------------------------------------- 2. EXECUTIVE SUMMARY
s = new_slide("Diagnosis", "Only 7.4% of SMB leads go live — we rebuild the journey for one sitting",
    "Executive summary. Left: the problem in four numbers from smb_leads.csv. Right: our answer to each of the five key questions in the case, each detailed on later slides.")
stats = [(pct(K["act_rate"]), "lead → activation"), (f"{K['days']} days", "lead → live"), (inr(K["cac"]), "acquisition cost / activation"), (f"{K['chase']:.0f}×", "status chases / customer")]
for i, (v, l) in enumerate(stats):
    y = 1.35 + i * 0.93
    box(s, 0.35, y, 2.45, 0.82, fill=PINK)
    tb(s, 0.45, y + 0.04, 2.3, 0.45, v, size=22, bold=True, color=RED)
    tb(s, 0.45, y + 0.5, 2.3, 0.28, l, size=9.5, color=GREY)
Q = [("Who first?", "Professional offices + multi-site first (≈11% activation, 11–14% churn, best payback). Micro via a low-cost digital starter; manufacturers via experts."),
     ("Needs without a salesperson?", "Voice/chat advisor in 11 Indian languages + English. AI talks, the rule engine decides products, eligibility and one monthly price."),
     ("Near-instant, DPDP-safe KYC?", "Consent first → GSTIN checksum + registry → DigiLocker → upload only what's missing (OCR) → automatic cross-checks → e-sign."),
     ("Role of field force & partners?", "AI routes only what it can't close to Local Accel Experts (score, language, distance). Paid 70% on connection + 30% at 6 months."),
     ("How we measure success?", f"Activation {pct(K['act_rate'])}→15% · days {K['days']}→≤7 · CAC {inr(K['cac'])}→≤₹5,000 · churn {pct(K['churn'],1)}→≤10% · chases 3→<1.")]
for i, (q, a) in enumerate(Q):
    y = 1.35 + i * 0.75
    circle_num(s, 3.0, y + 0.06, i + 1)
    tb(s, 3.38, y, 6.25, 0.25, q, size=11, bold=True)
    tb(s, 3.38, y + 0.24, 6.25, 0.48, a, size=9.5, color=CHAR)
footnote(s, "Source: smb_leads.csv (5,000 synthetic leads, Apr–Jun 2026). Targets are our proposals.")

# ---------------------------------------------------------------- 3. FUNNEL DIAGNOSIS
s = new_slide("Diagnosis", "Funnel: 4,632 of 5,000 leads leak — needs → quote converts only 44%",
    "Funnel analysis from stage_reached in smb_leads.csv. Bars show leads reaching each stage; the table shows conversion from the previous stage, leads lost, the top drop reasons at that step, and median days spent before the next stage. Every stage takes 2–4 days of hand-offs, which adds up to 17.6 days.")
cd = CategoryChartData(); cd.categories = [f["stage"] for f in A["funnel"]]; cd.add_series("Leads", [f["n"] for f in A["funnel"]])
gf = s.shapes.add_chart(XL_CHART_TYPE.BAR_CLUSTERED, Inches(0.3), Inches(1.3), Inches(3.6), Inches(3.75), cd); gf.name = "Funnel chart"
ch = gf.chart; style_chart(ch); ch.has_legend = False; ch.has_title = False
plot = ch.plots[0]; plot.gap_width = 45; plot.has_data_labels = True; plot.data_labels.font.size = Pt(9); plot.data_labels.font.bold = True
plot.data_labels.number_format = "#,##0"; plot.data_labels.number_format_is_linked = False; plot.data_labels.position = XL_LABEL_POSITION.OUTSIDE_END
ser = plot.series[0]; ser.format.fill.solid(); ser.format.fill.fore_color.rgb = RED
pt = ser.points[3]; pt.format.fill.solid(); pt.format.fill.fore_color.rgb = DEEP
ch.category_axis.reverse_order = True; ch.category_axis.tick_labels.font.size = Pt(9); ch.category_axis.format.line.color.rgb = LINE
ch.value_axis.visible = False; ch.value_axis.has_major_gridlines = False; ch.value_axis.maximum_scale = 6200
rows = [("Step", "Conv.", "Lost", "Top reasons (leads)", "Days")]
gaps = list(A["gaps"].values())
D = A["drops"]
reasons = {"Contacted": D["Lead"], "Needs assessed": D["Contacted"], "Quote accepted": D["Needs assessed"], "KYC complete": D["Quote accepted"], "Activated": D["KYC complete"]}
for i, f in enumerate(A["funnel"][1:]):
    top = reasons[f["stage"]][:2]
    rows.append((f"→ {f['stage']}", pct(f["conv_prev"], 0), f"{f['lost']:,}", "; ".join(f"{r} {n}" for r, n in top), f"{gaps[i]['median']:.0f}"))
tbl = s.shapes.add_table(len(rows), 5, Inches(4.05), Inches(1.32), Inches(5.6), Inches(2.6)).table
for j, wdt in enumerate([1.25, 0.5, 0.5, 2.95, 0.4]): tbl.columns[j].width = Inches(wdt)
for i, r in enumerate(rows):
    for j, v in enumerate(r):
        c = tbl.cell(i, j); c.text = v
        c.margin_left = c.margin_right = Inches(0.04); c.margin_top = c.margin_bottom = Inches(0.02)
        p = c.text_frame.paragraphs[0]; p.font.size = Pt(8.5 if j == 3 else 9); p.font.name = FONT
        p.font.bold = i == 0 or (i == 3 and j in (1, 2)); p.font.color.rgb = WHITE if i == 0 else (DEEP if i == 3 and j in (1, 2) else CHAR)
        c.fill.solid(); c.fill.fore_color.rgb = RED if i == 0 else (PINK if i == 3 else WHITE)
insight(s, 4.05, 4.15, 5.6, 0.85, f"{1113 + 1432:,} of the leads lost need a visit or a quote — both are slow, human hand-offs. Removing the visit and making the quote instant attacks the two biggest leaks.")
footnote(s, "Conv. = conversion from previous stage. Days = median days from the previous stage. Source: smb_leads.csv.")

# ---------------------------------------------------------------- 4. ROOT-CAUSE ANALYSIS
s = new_slide("Diagnosis", "Root causes: five fixable causes explain the leaks, not lack of demand",
    "RCA in product-analyst style: symptom (where the funnel leaks) → root cause (why) → evidence from data → what we change. Lead counts are drops attributed to that cause from drop_reason; some causes also hurt conversion indirectly (e.g. wrong bundles feed price objections).")
rc = [
    ("Sales depends on a physical visit", "Owner had no time 531 · visit not scheduled 296 · only wanted a mobile plan 280", "1,107", "Voice/chat advisor in-app; SIM-only fast path; no visit needed"),
    ("Quote is slow, opaque, not need-fitted", f"Price too high 414 · competitor cheaper 207 · too complex 206 · too slow 179; {pct(A['mismatch']['share'],0)} bought a bundle ≠ what they asked", "1,006", "Instant need-based quote, one monthly price, cheaper levers"),
    ("Paper KYC, no pre-validation", "Missing doc 94 · paperwork too long 79 · signatory away 53 · mismatch 47; 22 activated on cancelled/suspended GSTIN", "273", "GSTIN + registry first, DigiLocker, OCR checks, e-sign"),
    ("No feasibility check, no status visibility", "Install > 21 days 98 · not feasible 41 · 3 chase calls avg; churn 6% → 28% as chases rise", "220", "Feasibility before checkout, live tracker, proactive WhatsApp"),
    ("Low-intent / bad contact data", "Unreachable 805 · wrong number 319 · not interested 470; WhatsApp leads 2.8%, non-GST 2.0%", "1,594", "Owner-initiated journeys, verified mobile, propensity-ranked follow-up"),
]
hdr = [("Root cause", 0.35, 2.35), ("Evidence (leads)", 2.75, 3.6), ("Lost", 6.4, 0.55), ("What we change", 7.0, 2.65)]
for t, x, w in hdr: tb(s, x, 1.25, w, 0.25, t, size=9, bold=True, color=GREY)
for i, (cause, ev, lost, fix) in enumerate(rc):
    y = 1.5 + i * 0.7
    box(s, 0.35, y, 9.3, 0.62, fill=PINK if i % 2 == 0 else SOFT, radius=0.1)
    circle_num(s, 0.42, y + 0.17, i + 1, d=0.26, size=10)
    tb(s, 0.73, y + 0.04, 1.98, 0.55, cause, size=9.5, bold=True, anchor=MSO_ANCHOR.MIDDLE)
    tb(s, 2.75, y + 0.04, 3.6, 0.55, ev, size=8.5, anchor=MSO_ANCHOR.MIDDLE)
    tb(s, 6.4, y + 0.04, 0.55, 0.55, lost, size=11, bold=True, color=RED, anchor=MSO_ANCHOR.MIDDLE)
    tb(s, 7.0, y + 0.04, 2.6, 0.55, fix, size=8.5, anchor=MSO_ANCHOR.MIDDLE)
footnote(s, "Lost = leads whose recorded drop_reason maps to the cause (smb_leads.csv). Causes 1–4 are journey design; cause 5 is lead quality.")

# ---------------------------------------------------------------- 5. WHO FIRST (Q1)
s = new_slide("Who first", "Who first: professional offices and multi-site pay back fastest",
    "Key question 1. Scorecard per segment from smb_leads.csv: activation rate, 6-month churn, acquisition cost per activation (total spend in segment / activations), average monthly bundle value, and months of revenue to recover acquisition cost. Bundles at the bottom come from our rule engine for a typical customer of each segment.")
SEG = [("Professional offices", "Wave 1 · digital"), ("Small multi-site businesses", "Wave 1 · digital + expert"), ("Micro retail & services", "Wave 2 · digital starter"), ("Small manufacturers", "Expert-led")]
for i, (k, tag) in enumerate(SEG):
    v = A["segment"][k]; x = 0.35 + i * 2.35
    box(s, x, 1.3, 2.22, 1.95, fill=PINK if i < 2 else SOFT, radius=0.08)
    tb(s, x + 0.1, 1.34, 2.05, 0.3, {"Professional offices": "Professional offices", "Small multi-site businesses": "Multi-site businesses", "Micro retail & services": "Micro retail & services", "Small manufacturers": "Small manufacturers"}[k], size=10.5, bold=True)
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

# ---------------------------------------------------------------- 6. SOLUTION / ADVISOR (Q2)
s = new_slide("Solution", "Needs discovery without a salesperson: talk → one price → verify → track",
    "Key question 2 and the build challenge. The owner talks (voice, Sarvam speech in 11 Indian languages with auto-detect) or chats. The advisor asks a fixed set of questions; a deterministic rule engine on the product catalogue picks products, checks eligibility and dependencies, and prices one monthly number. The LLM (Kimi K2.5 on Bedrock, Mumbai) only phrases replies; a guard rejects any number not computed by the engine.")
steps = [("Talk", "Voice or chat, 11 Indian languages + English, auto-detected. 6 short questions."), ("One price", "Need-based bundle with plain reasons; toggle add-ons, 12/24 months, cheaper options."),
         ("Verify", "Consent → GSTIN + registry → DigiLocker → upload only what's missing → e-sign."), ("Track", "8-stage tracker with ETA, WhatsApp updates, auto-escalation when late.")]
for i, (h, d) in enumerate(steps):
    x = 0.35 + i * 2.35
    box(s, x, 1.3, 2.1, 1.25, fill=PINK, radius=0.1)
    circle_num(s, x + 0.1, 1.38, i + 1)
    tb(s, x + 0.45, 1.36, 1.6, 0.3, h, size=11.5, bold=True)
    tb(s, x + 0.1, 1.72, 1.95, 0.8, d, size=8.5)
    if i < 3: arrow(s, x + 2.12, 1.92, x + 2.33, 1.92, RED)
# AI talks, rules decide diagram
box(s, 0.35, 2.75, 5.6, 2.25, fill=SOFT, radius=0.06)
tb(s, 0.5, 2.8, 5.3, 0.28, "AI talks, rules decide", size=11, bold=True, color=RED)
nodes = [("Owner\nvoice / chat", 0.5), ("Advisor\n(LLM phrases only)", 1.95), ("Rule engine\neligibility · price", 3.4), ("Catalogue\n25 products", 4.85)]
for t, x in nodes:
    b = box(s, x, 3.2, 1.0 if x > 4 else 1.22, 0.75, fill=WHITE, line=LINE, radius=0.12)
    tb(s, x, 3.22, 1.0 if x > 4 else 1.22, 0.72, t, size=8.5, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
for x1, x2 in [(1.72, 1.93), (3.17, 3.38), (4.62, 4.83)]: arrow(s, x1, 3.57, x2, 3.57, GREY)
tb(s, 0.5, 4.05, 5.35, 0.95, ["Facts read from any language (incl. “thirty”, “लुधियाना”, corrections); the next question is chosen by code.",
    "Guard: replies with any price or time not computed by the engine are rejected and rewritten.", "Proof: replaying all 368 real activations, the engine blocks 53 rule-breaking line items + 22 activations on cancelled/suspended GSTIN."], size=8.5)
insight(s, 6.15, 2.75, 3.5, 1.7, f"{pct(A['mismatch']['share'], 0)} of activated customers bought a bundle different from what they asked for. Our advisor recommends from stated needs only — e.g. SIMs only if asked, 100 Mbps for ≤9 people per site, upsell max 2 optional add-ons.", label="WHY IT MATTERS")
footnote(s, "Stack: Next.js · Bedrock Mantle (Kimi K2.5, Mumbai) · Sarvam STT/TTS · AWS Textract. Replay on smb_leads.csv.")

# ---------------------------------------------------------------- 7. SMART KYC + DPDP (Q3)
s = new_slide("Trust & KYC", "Smart KYC in minutes: registry first, upload last, consent throughout",
    "Key question 3. Flow and controls. Results table: our Smart KYC run on all 12 specimen applicants in kyc_documents/ — 7 verified, 5 blocked with plain-language reasons. This is our own self-check, not the judges' answer key.")
flow = ["Consent\nper purpose", "GSTIN\nchecksum + registry", "Udyam\nregistry", "DigiLocker /\nEntity Locker", "Upload only\nwhat's missing", "Cross-checks\n+ e-sign"]
for i, t in enumerate(flow):
    x = 0.35 + i * 1.55
    box(s, x, 1.3, 1.38, 0.62, fill=RED if i in (0, 5) else PINK, radius=0.15)
    tb(s, x, 1.31, 1.38, 0.6, t, size=8.5, bold=True, color=WHITE if i in (0, 5) else CHAR, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    if i < 5: arrow(s, x + 1.39, 1.61, x + 1.54, 1.61, RED)
checks = [("K01", "GSTIN cancelled in registry (certificate looks fine) + blank Udyam number"), ("K05", "Udyam certificate missing"), ("K06", "GSTIN fails checksum — 2 characters altered vs registry"),
          ("K07", "Legal name on certificate edited (≠ registry)"), ("K11", "Electricity bill 257 days old (> 90-day rule)")]
tb(s, 0.35, 2.05, 5.4, 0.25, "Specimen applicants: 7 of 12 verified, 5 blocked", size=10.5, bold=True)
for i, (k, why) in enumerate(checks):
    y = 2.35 + i * 0.5
    box(s, 0.35, y, 5.4, 0.42, fill=SOFT, radius=0.15)
    tb(s, 0.45, y + 0.02, 0.55, 0.38, k, size=10, bold=True, color=RED, anchor=MSO_ANCHOR.MIDDLE)
    tb(s, 1.0, y + 0.02, 4.7, 0.38, why, size=8.5, anchor=MSO_ANCHOR.MIDDLE)
dp = [("Consent", "Separate, withdrawable consents: KYC, voice, expert hand-off, marketing (off by default)."), ("Purpose limitation", "KYC data used only for KYC/contract, never marketing."),
      ("Minimisation", "Registry + DigiLocker first; images read in memory, never stored."), ("Retention", "Fields for contract period; transcripts 30 days; non-buyers 90 days."), ("Rights", "Privacy center: view, withdraw, download, delete.")]
tb(s, 6.0, 2.05, 3.65, 0.25, "DPDP-by-design", size=10.5, bold=True)
for i, (h, d) in enumerate(dp):
    y = 2.35 + i * 0.5
    tb(s, 6.0, y, 3.65, 0.48, [[(h + ": ", {"bold": True, "color": RED}), (d, {})]], size=8.5)
footnote(s, "Specimen documents from kyc_documents/ (synthetic). DigiLocker and e-sign are simulated in the prototype; OCR by AWS Textract.")

# ---------------------------------------------------------------- 8. CHANNEL (Q4)
s = new_slide("Channel", "Partners and field force become Local Accel Experts for what AI can't close",
    "Key question 4. Acquisition cost per activation by lead source = total spend on that source ÷ activations (smb_leads.csv). Field sales and partners are the most expensive per activation, so expert time should go only where it adds value. Routing, scoring and pay rules are implemented in the prototype (expert and manager dashboards).")
src = A["source"]; order = sorted(src, key=lambda k: -src[k]["cac"])
cd = CategoryChartData(); cd.categories = order; cd.add_series("CAC / activation", [src[k]["cac"] for k in order])
gf = s.shapes.add_chart(XL_CHART_TYPE.BAR_CLUSTERED, Inches(0.3), Inches(1.3), Inches(4.0), Inches(2.6), cd); gf.name = "CAC by source"
ch = gf.chart; style_chart(ch); ch.has_legend = False; ch.has_title = True
ch.chart_title.text_frame.text = "Acquisition cost per activation (₹)"; ch.chart_title.text_frame.paragraphs[0].font.size = Pt(9.5); ch.chart_title.text_frame.paragraphs[0].font.bold = True
pl = ch.plots[0]; pl.gap_width = 45; pl.has_data_labels = True; pl.data_labels.font.size = Pt(8.5); pl.data_labels.number_format = "#,##0"; pl.data_labels.number_format_is_linked = False
se = pl.series[0]; se.format.fill.solid(); se.format.fill.fore_color.rgb = RED
ch.category_axis.reverse_order = True; ch.category_axis.tick_labels.font.size = Pt(8.5); ch.value_axis.visible = False; ch.value_axis.has_major_gridlines = False
tb(s, 0.35, 3.95, 3.95, 1.1, [f"Activation by source: referral {pct(src['Referral']['act'])}, inbound {pct(src['Inbound call']['act'])}, partner {pct(src['Channel partner']['act'])}, field {pct(src['Field sales']['act'])}, web {pct(src['Website form']['act'])}, WhatsApp {pct(src['WhatsApp campaign']['act'])}.",
     f"Partner-sourced customers churn {pct(src['Channel partner']['churn'], 0)} vs field {pct(src['Field sales']['churn'], 0)}."], size=8.5)
model = [("Route", "AI escalates on 7 triggers: repeated price objection, multi-site / manufacturer, not feasible, KYC failure, idle quote, low confidence, asks for a person."),
         ("Prioritise", "Likelihood-to-buy score (logistic model, AUC 0.73; GSTIN +1.19 strongest). High → same day, medium → 24 h call, low → WhatsApp nurture."),
         ("Assign", "Top-3 experts by distance, language, segment specialty, track record, load — offered in turn, manager override, reason shown."),
         ("Pay", "70% on connection + 30% retention bonus at 6 months; clawback if churn < 3 months. Discounts only by manager, only in 3 cases.")]
for i, (h, d) in enumerate(model):
    y = 1.3 + i * 0.93
    circle_num(s, 4.55, y + 0.05, i + 1)
    tb(s, 4.92, y, 4.7, 0.25, h, size=10.5, bold=True)
    tb(s, 4.92, y + 0.25, 4.7, 0.65, d, size=8.5)
footnote(s, "CAC = acquisition_cost_inr summed per lead source ÷ activations from that source. Model weights trained on smb_leads.csv.")

# ---------------------------------------------------------------- 9. RETENTION
cb = A["churn_by_chase"]
s = new_slide("Channel", "Every status chase raises churn — the tracker replaces chasing",
    "Retention view. Activated customers grouped by how many times they called to chase status (customer_follow_up_calls): 6-month churn rises from 6% at one call to 28% at five. The tracker shows every stage with an ETA, sends WhatsApp updates and escalates to the manager when late — designed to take chase calls toward zero.")
cd = CategoryChartData(); cd.categories = [f"{k} call{'s' if k != '1' else ''}" for k in cb]; cd.add_series("6-month churn", [round(v["churn"] * 100, 1) for v in cb.values()])
gf = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(0.3), Inches(1.3), Inches(4.6), Inches(3.3), cd); gf.name = "Churn by chase calls"
ch = gf.chart; style_chart(ch); ch.has_legend = False; ch.has_title = True
ch.chart_title.text_frame.text = "6-month churn (%) by status-chase calls"; ch.chart_title.text_frame.paragraphs[0].font.size = Pt(9.5); ch.chart_title.text_frame.paragraphs[0].font.bold = True
pl = ch.plots[0]; pl.gap_width = 60; pl.has_data_labels = True; pl.data_labels.font.size = Pt(9); pl.data_labels.number_format = '0"%"'; pl.data_labels.number_format_is_linked = False
se = pl.series[0]; se.format.fill.solid(); se.format.fill.fore_color.rgb = RED
ch.value_axis.visible = False; ch.value_axis.has_major_gridlines = False; ch.category_axis.tick_labels.font.size = Pt(9)
tb(s, 0.35, 4.65, 4.5, 0.4, f"n = {', '.join(str(v['n']) for v in cb.values())} customers. NPS falls from {cb['1']['nps']} to {cb['5']['nps']}.", size=8.5, color=GREY)
stages = ["Order placed", "Payment received", "KYC verified", "Feasibility confirmed", "Technician assigned", "Installation (per product)", "Live", "First bill"]
tb(s, 5.15, 1.3, 4.5, 0.25, "Tracker — what the owner sees", size=10.5, bold=True)
for i, t in enumerate(stages):
    y = 1.62 + i * 0.33
    circle_num(s, 5.15, y, "✓" if i < 5 else i + 1, d=0.24, fill=CHAR if i < 5 else PINK, color=WHITE if i < 5 else RED, size=8)
    tb(s, 5.48, y - 0.02, 2.4, 0.28, t, size=9)
insight(s, 7.65, 1.6, 2.0, 2.0, "ETA = longest install time in the bundle. Late by > 1 day → auto-escalation to the manager and a message to the owner before they need to ask.", label="DESIGN")
footnote(s, "Source: activated leads in smb_leads.csv (customer_follow_up_calls, churned_within_6_months, nps_score).")

# ---------------------------------------------------------------- 10. BUSINESS CASE
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
spend_t = 5000 * 0 + acts_t * 5000
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
insight(s, 4.95, 4.42, 4.7, 0.68, "One bill, one number, live in days — a tier-2 clinic gets fibre, email ×8, backup, security and 2 CCTV for ₹3,688/mo.", label="FOR THE OWNER")
footnote(s, "Targets are proposals. MRR at median bundle ₹6,900/mo (mean ₹12,351). CAC target: experts only on AI-routed leads.")

# ---------------------------------------------------------------- 11. METRICS, ROLLOUT, RISKS (Q5)
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
    y = 1.58 + i * 0.62
    tb(s, 7.05, y, 2.6, 0.6, [[(r, {"bold": True, "color": RED})], m], size=8.5)
footnote(s, "Baselines: smb_leads.csv. Targets and rollout are proposals.")

# ---------------------------------------------------------------- 12. ARCHITECTURE (appendix)
s = new_slide("Solution", "Appendix A · Solution architecture",
    "Main components and data flows of the working prototype. Owner, expert and manager use the same Next.js app; voice goes through a WebSocket relay to Sarvam; all decisions go through the rule engine; KYC uses mock GSTIN/Udyam registries backed by the provided CSVs, simulated DigiLocker and AWS Textract OCR.")
cols = [("Channels", ["Owner web app (chat)", "Voice mode (browser)", "Expert dashboard", "Manager dashboard"]),
        ("Interaction", ["Next.js API (TypeScript)", "Voice relay (WebSocket)", "Gateway + access code"]),
        ("Decision core", ["Advisor fast path", "Rule + price engine", "Routing & propensity", "Orders & tracker"]),
        ("Data & services", ["Catalogue · GSTIN · Udyam CSVs", "Session / consent store", "Bedrock Mantle LLM (Mumbai)", "Sarvam STT/TTS · Textract OCR"])]
for i, (h, items) in enumerate(cols):
    x = 0.35 + i * 2.35
    tb(s, x, 1.3, 2.1, 0.25, h, size=10, bold=True, color=RED)
    for j, it in enumerate(items):
        y = 1.62 + j * 0.62
        box(s, x, y, 2.1, 0.5, fill=PINK if i == 2 else SOFT, radius=0.15)
        tb(s, x, y + 0.02, 2.1, 0.46, it, size=8.5, bold=i == 2, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    if i < 3: arrow(s, x + 2.12, 2.6, x + 2.33, 2.6, RED)
tb(s, 0.35, 4.2, 9.3, 0.85, ["Flow: owner speaks/types → facts extracted (any language) → rule engine builds and prices the bundle → LLM phrases the reply (guarded) → KYC checks against registries + OCR → order → tracker updates; AI-unclosed leads → routing → expert / manager.",
     "Privacy: images processed in memory and discarded; identifiers masked in UI and logs; consent log per purpose; production on AWS Mumbai."], size=8.5)
footnote(s, "Prototype code: private repo jntbatra/udyam-digital.")

# ---------------------------------------------------------------- 13. PRIVACY NOTE (appendix)
s = new_slide("Trust & KYC", "Appendix B · Data privacy and security choices",
    "One-page privacy note required by the case. Design choices mapped to DPDP Act 2023 principles. Specific legal section numbers should be verified before external use.")
P = [("Notice & consent", "Plain-language notice in the owner's language before KYC; separate consents for KYC, voice, expert hand-off and marketing (marketing off by default); every consent logged with time and notice version; withdraw anytime."),
     ("Purpose limitation", "KYC data used only to verify the business and fulfil the contract; never reused for marketing or profiling beyond the stated purpose."),
     ("Data minimisation", "GSTIN/Udyam registry and DigiLocker pulls before any upload; only missing documents requested; experts see only name, business, area and draft plan, phone revealed after hand-off consent."),
     ("Storage limitation", "Uploaded images read in memory and discarded; extracted fields kept for the contract period; voice transcripts 30 days; non-converted leads deleted after 90 days unless marketing consent."),
     ("Security", "Identifiers masked in UI and logs (e.g. 32TT*******1ZW); no personal data in app logs; credentials only server-side; role-based views for owner, expert, manager; access-code gateway in the prototype."),
     ("Rights & residency", "Privacy center: view, withdraw, download, delete. Production hosting and LLM inference in AWS Mumbai (ap-south-1); processors (AWS, Sarvam) disclosed in the notice.")]
for i, (h, d) in enumerate(P):
    col, row = i % 2, i // 2
    x = 0.35 + col * 4.7; y = 1.3 + row * 1.25
    box(s, x, y, 4.55, 1.13, fill=PINK if (i % 2 == row % 2) else SOFT, radius=0.08)
    tb(s, x + 0.1, y + 0.05, 4.35, 0.25, h, size=10, bold=True, color=RED)
    tb(s, x + 0.1, y + 0.32, 4.35, 0.8, d, size=8.5)
footnote(s, "Synthetic data only in the prototype. Legal citations to be verified.")

# ---------------------------------------------------------------- 14. THANK YOU
s = prs.slides.add_slide(content_layout)
for ph in list(s.placeholders): ph._element.getparent().remove(ph._element)
s.shapes.add_picture(io.BytesIO(prs.slides[0].part.related_part(
    [r.rId for r in prs.slides[0].part.rels.values() if "image" in r.reltype][0]).blob), 0, 0, prs.slide_width, prs.slide_height)
tb(s, 0.55, 3.15, 4.6, 0.6, "Thank you", size=30, bold=True, color=WHITE)
tb(s, 0.55, 3.85, 4.6, 0.5, "Accel Business · Project Udyam Digital — demo: voice advisor → one price → Smart KYC → live tracker", size=10.5, color=WHITE)
s.notes_slide.notes_text_frame.text = "Closing slide."

prs.save(OUT)
print("saved", OUT, "slides:", len(prs.slides))
