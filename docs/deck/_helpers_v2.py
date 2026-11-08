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

