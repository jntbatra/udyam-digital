"use client";
// Shared staff-side (expert + manager) types and small presentational pieces.
import type { ReactNode } from "react";
import type { DiscountRequest, EscalationReason, Expert, Lead } from "@/lib/store";
import type { LineItem } from "@/lib/engine";
import { Badge } from "@/components/ui";

export type { Expert, Lead, DiscountRequest };

/** Shape returned by GET /api/leads (customer fields are already masked server-side unless consented). */
export type LeadCustomer = {
  name: string;
  phone?: string;
  business?: string;
  city?: string;
  language: string;
  segment?: string;
  employees?: number;
  sites?: number;
  bundle: LineItem[];
  monthly: number;
  conversation?: string;
};
export type LeadView = Lead & { customer: LeadCustomer | null };
export type LeadsResponse = { leads: LeadView[]; experts: Expert[] };

export type DiscountView = DiscountRequest & { business?: string; city?: string; monthly: number; monthlyAfter: number };
export type DiscountsResponse = { requests: DiscountView[]; spend: { approvedCount: number; monthlyDiscountInr: number } };

export type InsightsResponse = {
  baseline: { leads: number; activated: number; activationRate: number; avgDays: number; cac: number; churn6m: number; chaseCalls: number };
  replay: { activations: number; violations: number; byRule: Record<string, number>; activatedOnBadGstin: number };
  prototype: {
    sessions: number;
    withBundle: number;
    kycVerified: number;
    orders: number;
    live: number;
    avgDaysToLive: number | null;
    leadsToExperts: number;
    closedByAiOnly: number;
    productsPerCustomer: number | null;
    statusChaseCalls: number;
  };
};

export const REASON_LABEL: Record<EscalationReason, string> = {
  price_objection: "Price objection",
  complex_case: "Complex case (site survey)",
  not_feasible: "Fibre not feasible",
  kyc_failed: "KYC check failed",
  idle_quote: "Quote left idle",
  low_confidence: "AI low confidence",
  asked_human: "Owner asked for a human",
};

export const SEGMENT_NAME: Record<string, string> = {
  micro: "Micro retail & services",
  prof: "Professional office",
  multi: "Small multi-site",
  mfg: "Manufacturer",
};

export const CASE_LABEL: Record<DiscountRequest["caseType"], string> = {
  competitor_match: "Competitor match (with proof)",
  multisite_mfg: "Multi-site / manufacturer",
  high_value: "High value (≥ ₹5,000/month)",
};

export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;

export function PriorityBadge({ p }: { p: Lead["priority"] }) {
  const m = { high: ["▲", "High priority", "bad"], medium: ["●", "Medium priority", "warn"], low: ["▼", "Low priority", "neutral"] } as const;
  const [icon, label, tone] = m[p];
  return <Badge tone={tone}><span aria-hidden>{icon}</span> {label}</Badge>;
}

export function ModeBadge({ m }: { m: Lead["mode"] }) {
  const map = { call: ["☎", "Call"], visit: ["⌂", "Site visit"], nurture: ["✉", "Nurture"] } as const;
  const [icon, label] = map[m];
  return <Badge tone="brand"><span aria-hidden>{icon}</span> {label}</Badge>;
}

export function LeadStatusBadge({ s }: { s: Lead["status"] }) {
  const m = {
    new: ["…", "New", "neutral"],
    assigned: ["→", "Assigned", "brand"],
    contacted: ["☎", "Contacted", "warn"],
    won: ["✓", "Won", "good"],
    lost: ["✕", "Lost", "bad"],
  } as const;
  const [icon, label, tone] = m[s];
  return <Badge tone={tone}><span aria-hidden>{icon}</span> {label}</Badge>;
}

export function OfferStatusBadge({ s, live }: { s: Lead["offers"][number]["status"]; live: boolean }) {
  if (s === "offered" && !live) return <Badge tone="neutral"><span aria-hidden>⏳</span> Queued</Badge>;
  const m = {
    offered: ["…", "Offered", "warn"],
    accepted: ["✓", "Accepted", "good"],
    declined: ["✕", "Declined", "bad"],
    expired: ["⌛", "Expired", "neutral"],
  } as const;
  const [icon, label, tone] = m[s];
  return <Badge tone={tone}><span aria-hidden>{icon}</span> {label}</Badge>;
}

export function DiscountStatusBadge({ s }: { s: DiscountRequest["status"] }) {
  const m = { pending: ["…", "Pending", "warn"], approved: ["✓", "Approved", "good"], rejected: ["✕", "Rejected", "bad"] } as const;
  const [icon, label, tone] = m[s];
  return <Badge tone={tone}><span aria-hidden>{icon}</span> {label}</Badge>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "good" | "bad" | "warn" }) {
  const c = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "";
  return (
    <div className="bg-surface border border-border rounded-xl p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-xl font-semibold mt-0.5 ${c}`}>{value}</div>
      {hint && <div className="text-xs text-muted mt-0.5">{hint}</div>}
    </div>
  );
}

export type ChartDatum = { label: string; value: number; display?: string };

export function BarChart({ data, empty = "No data yet." }: { data: ChartDatum[]; empty?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  if (!data.length) return <Empty>{empty}</Empty>;
  return (
    <div className="space-y-3" role="img" aria-label="Bar chart">
      {data.map((d) => (
        <div key={d.label} className="grid grid-cols-[minmax(90px,0.8fr)_2fr_auto] items-center gap-2 text-sm">
          <span className="truncate" title={d.label}>{d.label}</span>
          <div className="h-2.5 rounded-full bg-black/[0.06] overflow-hidden" aria-hidden="true">
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${Math.max((d.value / max) * 100, d.value > 0 ? 4 : 0)}%` }} />
          </div>
          <span className="font-mono text-xs text-muted text-right min-w-10">{d.display ?? d.value.toLocaleString("en-IN")}</span>
        </div>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="border border-dashed border-border rounded-2xl p-6 text-center text-sm text-muted bg-surface">{children}</div>;
}

export function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="text-sm text-bad mt-2">
      <span aria-hidden>✕ </span>
      {text}
    </p>
  );
}

/** "Updated hh:mm:ss · auto-refresh 5 s" */
export function RefreshNote({ at, loading }: { at: Date | null; loading?: boolean }) {
  return (
    <span className="text-xs text-muted" aria-live="polite">
      {loading ? "Refreshing…" : at ? `Updated ${at.toLocaleTimeString("en-IN")} · auto-refresh 5 s` : "Loading…"}
    </span>
  );
}

export function timeLeft(iso: string, now: number) {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m left`;
}
