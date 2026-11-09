# Architecture slide v3 (infographic style, theme colours). Executed inside build_deck_v2.py.
ICON = "/home/jntbatra/Documents/Hackathon/airtel_digital/deck/icons/"
DARK = RGBColor(0x3A, 0x3A, 0x3C)

def icon(slide, name, x, y, d):
    slide.shapes.add_picture(ICON + name + ".png", Inches(x), Inches(y), Inches(d), Inches(d))

def icon_tile(slide, name, x, y, d=0.34, fill=PINK):
    box(slide, x, y, d, d, fill=fill, radius=0.25)
    icon(slide, name, x + d * 0.18, y + d * 0.18, d * 0.64)

def chip(slide, x, y, text, w=None, fill=WHITE, color=CHAR, size=6, line=LINE, h=0.17):
    w = w or (0.1 + len(text) * size * 0.68 / 72)
    b = box(slide, x, y, w, h, fill=fill, line=line, radius=0.5)
    tb(slide, x, y - 0.01, w, h + 0.02, text, size=size, bold=True, color=color, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    return w

def chips(slide, x, y, items, maxw, **kw):
    cx, cy = x, y
    for t in items:
        w = 0.1 + len(t) * kw.get("size", 6) * 0.68 / 72
        if cx + w > x + maxw: cx, cy = x, cy + 0.2
        chip(slide, cx, cy, t, w=w, **kw); cx += w + 0.05

def header(slide, x, y, w, num, title, sub, fill):
    b = box(slide, x, y, w, 0.27, fill=fill, radius=0.3)
    tb(slide, x + 0.06, y, w - 0.1, 0.27, [[(f"{num}. {title} ", {"bold": True, "color": WHITE, "size": 9}), (sub, {"color": WHITE, "size": 7})]], anchor=MSO_ANCHOR.MIDDLE, align=PP_ALIGN.CENTER)

def card(slide, x, y, w, h, fill=WHITE, line=LINE):
    return box(slide, x, y, w, h, fill=fill, line=line, radius=0.1)

def title_lines(slide, x, y, w, h, title, sub, tsize=8, ssize=6.5):
    tb(slide, x, y, w, h, [[(title, {"bold": True, "size": tsize})], [(sub, {"color": GREY, "size": ssize})]])

s = new_slide("Solution", "Solution architecture: voice-first advisor where AI talks and rules decide",
    "System architecture of the working prototype, in four layers. 1 Clients in the browser. 2 Edge: Cloudflare Tunnel (no open ports) and an access-code gateway. 3 Application: two Node.js/TypeScript services (Next.js 16 app on :3100, voice relay on :3001) around one decision core that owns every product, price and KYC decision. 4 Managed AI services in AWS ap-south-1 (Bedrock Mantle running Kimi K2.5, Textract) plus Sarvam speech, and the data stores. Bottom: one request end to end, deployment facts (prototype vs production plan), and why this design.")
tb(s, 0.35, 1.0, 9.3, 0.2, "AI talks, rules decide  •  Next.js + Node.js voice relay  •  Bedrock & Textract (ap-south-1)  •  Sarvam speech  •  Cloudflare Tunnel", size=7.5, color=GREY, align=PP_ALIGN.CENTER)

TOP, BOT = 1.25, 3.78
cols = [(0.35, 1.78, "1", "Clients", "browser", RED), (2.22, 1.6, "2", "Edge", "network", DEEP), (3.91, 3.08, "3", "Application", "Node.js · TypeScript", CHAR), (7.08, 2.57, "4", "AI & data", "managed / external", DARK)]
for x, w, n, t, sub, col in cols:
    box(s, x, TOP + 0.32, w, BOT - TOP - 0.32, fill=SOFT, radius=0.04)
    header(s, x, TOP, w, n, t, sub, col)

# ---- 1. Clients
cl = [("owner", "Owner app", "business owner", ["Chat", "Quote", "KYC", "Track"]), ("voice", "Voice mode", "talk like a call", ["11 languages", "Barge-in"]),
      ("expert", "Expert app", "Local Accel Expert", ["Leads", "Score", "Assist"]), ("manager", "Manager tab", "operations", ["Approvals", "Override"])]
for j, (ic, t, sub, cs) in enumerate(cl):
    y = TOP + 0.4 + j * 0.535
    card(s, 0.42, y, 1.64, 0.49)
    icon_tile(s, ic, 0.47, y + 0.05, 0.27)
    title_lines(s, 0.79, y + 0.01, 1.25, 0.27, t, sub, 7.5, 5.8)
    chips(s, 0.47, y + 0.32, cs, 1.56, size=5.5, fill=PINK, line=None, h=0.14)

# ---- 2. Edge
card(s, 2.29, TOP + 0.4, 1.46, 1.1)
icon(s, "cloudflare", 2.35, TOP + 0.45, 0.34)
title_lines(s, 2.72, TOP + 0.44, 1.0, 0.32, "Cloudflare Tunnel", "edge network", 7.5, 6)
for k, t in enumerate(["TLS: HTTPS + WSS", "No open ports on host", "One public URL"]):
    tb(s, 2.35, TOP + 0.83 + k * 0.21, 1.38, 0.2, [[("✓ ", {"bold": True, "color": RED}), (t, {})]], size=6.5)
arrow(s, 3.02, TOP + 1.52, 3.02, TOP + 1.66, RED)
card(s, 2.29, TOP + 1.68, 1.46, 0.79)
icon_tile(s, "gateway", 2.34, TOP + 1.74, 0.32)
title_lines(s, 2.7, TOP + 1.72, 1.03, 0.32, "Gateway :8080", "routing (+ optional code)", 7.5, 6)
for k, t in enumerate(["Optional access code", "/voice → :3001, rest → :3100"]):
    tb(s, 2.35, TOP + 2.06 + k * 0.19, 1.38, 0.19, [[("✓ ", {"bold": True, "color": RED}), (t, {})]], size=6.2)

# ---- 3. Application
card(s, 3.98, TOP + 0.4, 1.43, 0.6)
icon(s, "nextjs", 4.04, TOP + 0.47, 0.3)
title_lines(s, 4.38, TOP + 0.43, 1.0, 0.55, "Next.js 16 · :3100", "UI + API routes: /chat /kyc /order /leads", 7.5, 5.8)
card(s, 5.49, TOP + 0.4, 1.43, 0.6)
icon_tile(s, "relay", 5.53, TOP + 0.47, 0.3)
title_lines(s, 5.87, TOP + 0.43, 1.03, 0.55, "Voice relay · :3001", "WebSocket · barge-in · echo guard", 7.5, 5.8)
arrow(s, 4.7, TOP + 1.01, 4.7, TOP + 1.12, RED); arrow(s, 6.2, TOP + 1.01, 6.2, TOP + 1.12, RED)
core = box(s, 3.98, TOP + 1.14, 2.94, 1.02, fill=PINK, line=RED, radius=0.06)
box(s, 4.04, TOP + 1.19, 0.3, 0.3, fill=RED, radius=0.25); icon(s, "core", 4.08, TOP + 1.23, 0.22)
tb(s, 4.38, TOP + 1.17, 2.5, 0.32, [[("Decision core ", {"bold": True, "size": 8.5}), ("the brain: every product, price & KYC decision", {"color": GREY, "size": 6})]], anchor=MSO_ANCHOR.MIDDLE)
tiles = [("facts", "Fact reader"), ("question", "Next question"), ("rules", "Rule engine"), ("price", "Pricing"), ("guard", "Reply guard"), ("kyc", "KYC checks")]
for k, (ic, t) in enumerate(tiles):
    x = 4.04 + k * 0.475
    box(s, x, TOP + 1.53, 0.44, 0.6, fill=WHITE, radius=0.12)
    icon(s, ic, x + 0.12, TOP + 1.57, 0.2)
    tb(s, x - 0.02, TOP + 1.79, 0.48, 0.33, t, size=5.5, bold=True, align=PP_ALIGN.CENTER)
for cx, cw, ct in [(3.98, 1.04, "Routing & propensity"), (5.06, 0.9, "Orders & tracker"), (6.0, 0.92, "Consent & privacy")]:
    chip(s, cx, TOP + 2.24, ct, w=cw, size=6, fill=WHITE, h=0.18)
# ---- 4. AI & data
svc = [("bedrock", "Amazon Bedrock (ap-south-1)", "Mantle API · Kimi K2.5 · facts + replies", RED), ("sarvam", "Sarvam speech", "Saaras v3 STT · Bulbul v3 TTS · auto language", DEEP), ("textract", "AWS Textract (ap-south-1)", "OCR for KYC docs, in memory", CHAR)]
for j, (ic, t, sub, col) in enumerate(svc):
    y = TOP + 0.4 + j * 0.45
    card(s, 7.15, y, 2.43, 0.4)
    box(s, 7.2, y + 0.05, 0.3, 0.3, fill=col, radius=0.25); icon(s, ic, 7.25, y + 0.1, 0.2)
    title_lines(s, 7.57, y + 0.02, 2.0, 0.4, t, sub, 7.2, 5.8)
tb(s, 7.15, TOP + 1.74, 2.43, 0.18, "Data & business stores", size=7, bold=True, align=PP_ALIGN.CENTER)
stores = [("registry", "Registries", "GSTIN 3,534 · Udyam 2,723"), ("catalogue", "Catalogue", "25 products · model"), ("store", "Session store", "profiles · consents · orders"), ("digilocker", "DigiLocker", "+ e-sign (simulated)")]
for j, (ic, t, sub) in enumerate(stores):
    x = 7.15 + (j % 2) * 1.23; y = TOP + 1.93 + (j // 2) * 0.31
    card(s, x, y, 1.19, 0.28)
    icon(s, ic, x + 0.04, y + 0.06, 0.17)
    tb(s, x + 0.23, y, 0.95, 0.3, [[(t, {"bold": True, "size": 6.2})], [(sub, {"color": GREY, "size": 5.2})]], anchor=MSO_ANCHOR.MIDDLE)
for x1, x2 in [(2.14, 2.21), (3.83, 3.9), (7.0, 7.07)]:
    arrow(s, x1, 2.5, x2, 2.5, RED)

# ---- bottom row
Y2 = 3.86
box(s, 0.35, Y2, 4.95, 1.2, fill=WHITE, line=LINE, radius=0.06)
icon(s, "flow", 0.43, Y2 + 0.06, 0.2)
tb(s, 0.67, Y2 + 0.03, 4.5, 0.25, [[("Request flow ", {"bold": True, "color": RED, "size": 8.5}), ("(owner says: “I run a clinic in Kochi, 8 staff”)", {"color": GREY, "size": 6.5})]], anchor=MSO_ANCHOR.MIDDLE)
flow = [("Owner speaks", "browser mic"), ("Tunnel + gateway", "→ voice relay"), ("Sarvam STT", "~0.2 s, auto language"), ("Decision core", "facts → rules → price"), ("Kimi phrases", "guarded, 0.3–1 s"), ("Sarvam TTS", "owner hears, can interrupt")]
for k, (t, sub) in enumerate(flow):
    x = 0.43 + k * 0.81
    box(s, x, Y2 + 0.36, 0.74, 0.74, fill=PINK if k != 3 else RED, radius=0.12)
    circle_num(s, x + 0.25, Y2 + 0.4, k + 1, d=0.22, fill=RED if k != 3 else WHITE, color=WHITE if k != 3 else RED, size=7.5)
    tb(s, x + 0.02, Y2 + 0.64, 0.7, 0.45, [[(t, {"bold": True, "size": 6.5, "color": WHITE if k == 3 else CHAR})], [(sub, {"size": 5.5, "color": WHITE if k == 3 else GREY})]], align=PP_ALIGN.CENTER)
    if k < 5: arrow(s, x + 0.745, Y2 + 0.73, x + 0.805, Y2 + 0.73, GREY)
box(s, 5.4, Y2, 2.18, 1.2, fill=WHITE, line=LINE, radius=0.06)
icon(s, "deploy", 5.48, Y2 + 0.06, 0.2)
tb(s, 5.72, Y2 + 0.03, 1.8, 0.25, "Deployment", size=8.5, bold=True, color=RED, anchor=MSO_ANCHOR.MIDDLE)
dep = ["EC2 t3a.small, Mumbai, via Cloudflare Tunnel", "No inbound ports; keys in AWS SSM + IAM role", "Push to GitHub → live in ~2 min", "Next: managed DB + object storage"]
for k, t in enumerate(dep):
    tb(s, 5.47, Y2 + 0.32 + k * 0.215, 2.08, 0.22, [[("✓ ", {"bold": True, "color": RED}), (t, {})]], size=6.2)
box(s, 7.68, Y2, 1.97, 1.2, fill=PINK, radius=0.06)
icon(s, "why", 7.76, Y2 + 0.06, 0.2)
tb(s, 8.0, Y2 + 0.03, 1.6, 0.25, "Why this design", size=8.5, bold=True, color=RED, anchor=MSO_ANCHOR.MIDDLE)
why = ["Prices & eligibility from rules, never the AI", "Voice or chat, 11 Indian languages", "India-region AI, DPDP-friendly", "Swap any model, rules stay"]
for k, t in enumerate(why):
    tb(s, 7.75, Y2 + 0.32 + k * 0.215, 1.88, 0.22, [[("✓ ", {"bold": True, "color": RED}), (t, {})]], size=6.2)
