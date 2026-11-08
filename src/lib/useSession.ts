"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ensureSession, getSessionId, setSessionId } from "./client";

export type PricedLine = {
  productId: string; qty: number; reason: string; name: string; description: string; unit: string;
  unitPrice: number; monthly: number; setup: number; installDays: number; category: string;
};
export type QuoteT = {
  lines: PricedLine[]; contractMonths: number; subtotal: number; discounts: { label: string; amount: number }[];
  approvedDiscountPct: number; monthly: number; setupTotal: number; setupSpread: boolean; monthlyWithSetup: number;
  etaDays: number; floorApplied: boolean; violations: { productId: string; message: string }[];
};
export type KycCheck = { id: string; label: string; status: "pass" | "fail" | "warn"; detail: string; fix?: string };
export type SessionT = {
  id: string; phone: string; name?: string; language: string;
  profile: { businessName?: string; businessType?: string; city?: string; cityTier?: number; employees?: number; sites?: number; hasGstin?: boolean; gstinStatus?: string; segment?: string; needs?: string[]; [k: string]: unknown };
  bundle: { productId: string; qty: number; reason: string }[];
  contractMonths?: number; setupSpread?: boolean; priceObjections: number;
  messages: { role: "user" | "assistant" | "system"; text: string; at: string; channel: string }[];
  consents: { purpose: string; granted: boolean; at: string }[];
  kyc: { gstin?: string; udyam?: string; source: Record<string, string>; extracted: Record<string, Record<string, string>>; checks: KycCheck[]; verified: boolean; esigned: boolean };
  orderId?: string;
  escalation?: { reason: string; note: string; at: string; leadId: string };
  marketingOptIn?: boolean;
};
export type Upsell = { productId: string; qty: number; reason: string; name: string; monthly: number };
export type Cheaper = { label: string; items: { productId: string; qty: number; reason: string }[]; contractMonths?: number; monthly: number };
export type SessionPayload = {
  session: SessionT; quote: QuoteT; upsell: Upsell[]; cheaper: Cheaper[];
  pendingDiscount: { id: string; pct: number; status: string; holdUntil: string } | null;
  catalogue: { id: string; name: string; category: string; unit: string }[];
};

export function hasConsent(s: SessionT | undefined, purpose: string) {
  const c = s ? [...s.consents].reverse().find((x) => x.purpose === purpose) : undefined;
  return !!c?.granted;
}

/** Loads the shared session. `?session=` (expert assisted journey) overrides the stored one. */
export function useSession() {
  const [data, setData] = useState<SessionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("session");
    if (q) setSessionId(q);
    (async () => {
      try {
        const sid = q || getSessionId() || (await ensureSession());
        setId(sid);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      setData(await api<SessionPayload>(`/api/session/${id}`));
    } catch (e) {
      const msg = (e as Error).message;
      if (/not found/i.test(msg)) {
        const sid = await ensureSession();
        setId(sid);
      } else setError(msg);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      if (!id) return null;
      const r = await api<SessionPayload & { recommendation?: unknown }>(`/api/session/${id}`, { method: "PATCH", json: body });
      setData(r);
      return r;
    },
    [id],
  );

  return { id, data, setData, error, refresh, patch };
}
