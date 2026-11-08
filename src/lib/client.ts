"use client";
// Browser helpers: API calls + current session id (localStorage; no PII stored client-side).

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "content-type": "application/json", ...(init?.headers ?? {}) } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || j.reason || `Request failed (${res.status})`);
  return j as T;
}

const KEY = "udyam.sessionId";
export const getSessionId = () => (typeof window === "undefined" ? null : localStorage.getItem(KEY));
export const setSessionId = (id: string) => localStorage.setItem(KEY, id);
export const clearSessionId = () => localStorage.removeItem(KEY);

export async function ensureSession(language?: string): Promise<string> {
  const existing = getSessionId();
  if (existing) {
    const ok = await fetch(`/api/session/${existing}`).then((r) => r.ok).catch(() => false);
    if (ok) return existing;
  }
  const s = await api<{ id: string }>("/api/session", { method: "POST", json: { language } });
  setSessionId(s.id);
  return s.id;
}
