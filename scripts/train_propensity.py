"""Train a simple logistic-regression propensity score on smb_leads.csv (stdlib only).
Target: lead activated. Output: data/propensity.json (weights read by the app)."""
import csv, json, math, os, random

HERE = os.path.dirname(os.path.abspath(__file__))
rows = list(csv.DictReader(open(os.path.join(HERE, "..", "data", "smb_leads.csv"))))

CATS = {
    "segment": ["Micro retail & services", "Professional offices", "Small multi-site businesses", "Small manufacturers"],
    "current_internet": ["Mobile hotspot", "Home broadband", "Business broadband", "Leased line", "Mixed per site", "None"],
    "lead_source": ["Field sales", "Website form", "Channel partner", "Inbound call", "Referral", "WhatsApp campaign"],
    "annual_turnover_band": ["< 40 lakh", "40 lakh - 1.5 cr", "1.5 - 5 cr", "5 - 25 cr", "25 - 100 cr"],
}
BASE = {k: v[0] for k, v in CATS.items()}  # reference level

def feats(r):
    f = {"has_gstin": 1.0 if r["has_gstin"] == "Y" else 0.0,
         "has_udyam": 1.0 if r["has_udyam"] == "Y" else 0.0,
         "multi_site": 1.0 if int(r["num_sites"]) > 1 else 0.0,
         "tier1": 1.0 if r["city_tier"] == "1" else 0.0}
    for k, levels in CATS.items():
        for lv in levels[1:]:
            f[f"{k}={lv}"] = 1.0 if r[k] == lv else 0.0
    return f

X = [feats(r) for r in rows]
y = [1.0 if r["outcome"] == "Activated" else 0.0 for r in rows]
names = sorted(X[0])
w = {n: 0.0 for n in names}; _br = sum(y) / len(y); b = math.log(_br / (1 - _br))
lr, l2 = 2.0, 0.0005
random.seed(7)
for epoch in range(800):
    gb = 0.0; gw = {n: 0.0 for n in names}
    for xi, yi in zip(X, y):
        z = b + sum(w[n] * xi[n] for n in names)
        p = 1 / (1 + math.exp(-z)); e = p - yi
        gb += e
        for n in names:
            if xi[n]: gw[n] += e * xi[n]
    N = len(X)
    b -= lr * gb / N
    for n in names: w[n] -= lr * (gw[n] / N + l2 * w[n])

def pred(xi): return 1 / (1 + math.exp(-(b + sum(w[n] * xi[n] for n in names))))
P = [pred(x) for x in X]
# AUC
pos = [p for p, t in zip(P, y) if t]; neg = [p for p, t in zip(P, y) if not t]
auc = sum((pp > nn) + 0.5 * (pp == nn) for pp in pos for nn in neg) / (len(pos) * len(neg))
srt = sorted(P)
out = {"intercept": b, "weights": w, "reference": BASE, "auc": round(auc, 3),
       "thresholds": {"high": srt[int(0.8 * len(srt))], "medium": srt[int(0.5 * len(srt))]},
       "base_rate": sum(y) / len(y), "trained_on": len(rows)}
json.dump(out, open(os.path.join(HERE, "..", "data", "propensity.json"), "w"), indent=1)
print("AUC", out["auc"], "thresholds", out["thresholds"])
for n, v in sorted(w.items(), key=lambda t: -abs(t[1]))[:8]: print(f"{v:+.2f} {n}")
