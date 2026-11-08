import { recommend, priceBundle, type Profile } from "/home/jntbatra/Documents/Hackathon/airtel_digital/udyam-app/src/lib/engine";
const P: [string, Profile][] = [
  ["Micro · Starter (kirana, tier-2, 3 staff, no GST)", { segment: "micro", cityTier: 2, employees: 3, sites: 1, hasGstin: false, needs: ["upi_pos", "mobile", "wifi_guest"], mobileLines: 1 }],
  ["Professional · Clinic Pro (tier-2, 8 staff, GST)", { segment: "prof", cityTier: 2, employees: 8, sites: 1, hasGstin: true, needs: ["email", "backup", "security", "cctv"] }],
  ["Multi-site · Chain Connect (4 stores, tier-1, 24 staff, GST)", { segment: "multi", cityTier: 1, employees: 24, sites: 4, hasGstin: true, needs: ["upi_pos", "cctv", "failover", "mobile", "wifi_guest"], mobileLines: 4 }],
  ["Manufacturer · Factory Secure (tier-2, 30 staff, GST)", { segment: "mfg", cityTier: 2, employees: 30, sites: 1, hasGstin: true, needs: ["firewall", "iot", "mobile", "email"], mobileLines: 3, emailUsers: 10, machines: 5 }],
];
const out = P.map(([name, p]) => { const r = recommend(p); const q = priceBundle(r.items, p); return { name, items: q.lines.map((l) => `${l.name}${l.qty > 1 ? ` ×${l.qty}` : ""}`), monthly: q.monthly, setup: q.setupTotal, contract: q.contractMonths, eta: q.etaDays }; });
console.log(JSON.stringify(out, null, 1));
require("fs").writeFileSync("/home/jntbatra/Documents/Hackathon/airtel_digital/deck/bundles.json", JSON.stringify(out, null, 1));
