"""Funnel + RCA numbers for the deck, computed from smb_leads.csv (synthetic case data)."""
import csv, json, statistics as st, collections as C, datetime as D
L = list(csv.DictReader(open("../YTL_TrackA_Udyam_Digital_Data/smb_leads.csv")))
STAGES = ["Lead", "Contacted", "Needs assessed", "Quote accepted", "KYC complete", "Activated"]
ORDER = {s: i for i, s in enumerate(STAGES)}
reached = lambda r, s: ORDER[r["stage_reached"]] >= ORDER[s]
out = {}
fun = [sum(reached(r, s) for r in L) for s in STAGES]
out["funnel"] = [{"stage": s, "n": n, "conv_prev": (n / fun[i-1] if i else None), "lost": (fun[i-1] - n if i else 0)} for i, (s, n) in enumerate(zip(STAGES, fun))]
# drop reasons by stage (stage_reached = last stage reached, dropped after it)
drops = C.defaultdict(C.Counter)
for r in L:
    if r["outcome"] == "Dropped": drops[r["stage_reached"]][r["drop_reason"]] += 1
out["drops"] = {k: v.most_common() for k, v in drops.items()}
# time between stages (days), activated & all reaching
dcols = ["created_date", "contacted_date", "needs_assessed_date", "quote_accepted_date", "kyc_complete_date", "activated_date"]
def d(x): return D.date.fromisoformat(x) if x else None
gaps = {}
for a, b, name in zip(dcols, dcols[1:], ["lead→contact", "contact→needs", "needs→quote", "quote→KYC", "KYC→live"]):
    v = [(d(r[b]) - d(r[a])).days for r in L if r[a] and r[b]]
    gaps[name] = {"median": st.median(v), "mean": round(st.mean(v), 1), "n": len(v)}
out["gaps"] = gaps
A = [r for r in L if r["outcome"] == "Activated"]
out["kpi"] = {"leads": len(L), "activated": len(A), "act_rate": len(A) / len(L),
              "days": round(st.mean(int(r["days_lead_to_activation"]) for r in A), 1),
              "cac": round(sum(float(r["acquisition_cost_inr"] or 0) for r in L) / len(A)),
              "churn": sum(r["churned_within_6_months"] == "Y" for r in A) / len(A),
              "nps": round(st.mean(int(r["nps_score"]) for r in A), 1),
              "chase": round(st.mean(int(r["customer_follow_up_calls"]) for r in A), 2),
              "arpu": round(st.mean(float(r["monthly_bundle_value_inr"]) for r in A)),
              "arpu_median": st.median(float(r["monthly_bundle_value_inr"]) for r in A),
              "spend": sum(float(r["acquisition_cost_inr"] or 0) for r in L)}
def cut(key):
    g = C.defaultdict(list)
    for r in L: g[key(r)].append(r)
    res = {}
    for k, rs in g.items():
        a = [r for r in rs if r["outcome"] == "Activated"]
        res[k] = {"n": len(rs), "act": len(a) / len(rs),
                  "churn": (sum(r["churned_within_6_months"] == "Y" for r in a) / len(a)) if a else None,
                  "cac": round(sum(float(r["acquisition_cost_inr"] or 0) for r in rs) / len(a)) if a else None,
                  "arpu": round(st.mean(float(r["monthly_bundle_value_inr"]) for r in a)) if a else None,
                  "nq_conv": (sum(reached(r, "Quote accepted") for r in rs) / max(1, sum(reached(r, "Needs assessed") for r in rs)))}
    return res
for name, key in {"segment": lambda r: r["segment"], "source": lambda r: r["lead_source"], "gstin": lambda r: r["has_gstin"],
                  "tier": lambda r: r["city_tier"], "language": lambda r: r["preferred_language"], "internet": lambda r: r["current_internet"],
                  "turnover": lambda r: r["annual_turnover_band"]}.items():
    out[name] = cut(key)
# churn vs chase calls / days
out["churn_by_chase"] = {k: {"n": len(v), "churn": sum(r["churned_within_6_months"] == "Y" for r in v) / len(v), "nps": round(st.mean(int(r["nps_score"]) for r in v), 1)}
                         for k, v in sorted(C.defaultdict(list, {c: [r for r in A if r["customer_follow_up_calls"] == c] for c in {r["customer_follow_up_calls"] for r in A}}).items())}
# bundle vs interest mismatch
mis = sum(1 for r in A if not set(r["products_of_interest"].split(";")) <= {p.split("x")[0] for p in r["bundle_products"].split(";")})
out["mismatch"] = {"n": mis, "share": mis / len(A)}
json.dump(out, open("analysis.json", "w"), indent=1, default=str)
print(json.dumps({k: out[k] for k in ["funnel", "gaps", "kpi"]}, indent=1, default=str)[:3000])
for st_ in STAGES[:-1]: print(st_, out["drops"].get(st_))
print("segment", {k: (v["n"], round(v["act"]*100,1), v["churn"] and round(v["churn"]*100), v["cac"], v["arpu"], round(v["nq_conv"]*100)) for k, v in out["segment"].items()})
print("source", {k: (v["n"], round(v["act"]*100,1), v["churn"] and round(v["churn"]*100), v["cac"]) for k, v in out["source"].items()})
print("chase", out["churn_by_chase"]); print("mismatch", out["mismatch"])
