"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-3xl p-6 ${className}`}>{children}</div>;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" | "danger"; size?: "sm" | "md" | "lg" };
export function Button({ variant = "primary", size = "md", className = "", ...p }: BtnProps) {
  const v = {
    primary: "bg-brand text-brand-ink hover:bg-brand-dark shadow-[0_6px_20px_rgba(228,0,0,0.25)]",
    outline: "bg-white/70 backdrop-blur border border-black/10 text-foreground hover:bg-white",
    ghost: "text-foreground hover:bg-black/5",
    danger: "bg-foreground text-white hover:bg-black",
  }[variant];
  const s = { sm: "text-sm h-8 px-3.5", md: "text-sm h-10 px-5", lg: "text-base h-12 px-6" }[size];
  return <button {...p} className={`inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${v} ${s} ${className}`} />;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "brand" }) {
  const t = {
    neutral: "bg-black/[0.04] text-muted",
    good: "bg-black/[0.06] text-foreground",
    warn: "bg-black/[0.04] text-muted",
    bad: "bg-brand-soft text-brand",
    brand: "bg-brand-soft text-brand",
  }[tone];
  return <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full ${t}`}>{children}</span>;
}

/** Status is never colour-only: symbol + label. */
export function StatusPill({ status }: { status: "pass" | "fail" | "warn" | "pending" }) {
  const m = { pass: ["✓", "Passed", "good"], fail: ["✕", "Failed", "bad"], warn: ["!", "Check", "warn"], pending: ["·", "Pending", "neutral"] } as const;
  const [icon, label, tone] = m[status];
  return <Badge tone={tone}>{icon} {label}</Badge>;
}

export const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="flex items-center mb-3">
        <h2 className="font-semibold tracking-tight">{title}</h2>
        <div className="ml-auto">{right}</div>
      </div>
      {children}
    </section>
  );
}
