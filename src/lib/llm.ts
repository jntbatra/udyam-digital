/**
 * Chat LLM: Google Gemma 4 31B on Amazon Bedrock Mantle (OpenAI-compatible
 * /openai/v1/chat/completions), SigV4-signed with the default AWS credential chain.
 */
import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { HttpRequest } from "@smithy/protocol-http";
import { defaultProvider } from "@aws-sdk/credential-provider-node";

export const LLM_REGION = process.env.MANTLE_REGION || "us-east-1";
export const LLM_MODEL = process.env.MANTLE_MODEL || "google.gemma-4-31b";
const HOST = `bedrock-mantle.${LLM_REGION}.api.aws`;
const PATH = "/openai/v1/chat/completions";

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

const signer = new SignatureV4({
  credentials: defaultProvider(),
  region: LLM_REGION,
  service: "bedrock-mantle",
  sha256: Sha256,
});

export class LlmError extends Error {
  constructor(msg: string, public status?: number) {
    super(msg);
  }
}

export async function chatCompletion(body: {
  messages: ChatMessage[];
  tools?: ToolDef[];
  max_tokens?: number;
  temperature?: number;
}): Promise<{ message: Extract<ChatMessage, { role: "assistant" }>; finish: string; usage?: unknown }> {
  const payload = JSON.stringify({ model: LLM_MODEL, max_tokens: 700, temperature: 0.2, ...body });
  const req = new HttpRequest({
    method: "POST",
    protocol: "https:",
    hostname: HOST,
    path: PATH,
    headers: { host: HOST, "content-type": "application/json" },
    body: payload,
  });
  const signed = await signer.sign(req);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 75000);
  try {
    const res = await fetch(`https://${HOST}${PATH}`, {
      method: "POST",
      headers: signed.headers as Record<string, string>,
      body: payload,
      signal: ctrl.signal,
    });
    const txt = await res.text();
    if (!res.ok) throw new LlmError(`Mantle ${res.status}: ${txt.slice(0, 300)}`, res.status);
    const j = JSON.parse(txt);
    const ch = j.choices?.[0];
    return { message: ch.message, finish: ch.finish_reason, usage: j.usage };
  } finally {
    clearTimeout(t);
  }
}

/** Gemma sometimes emits keys like ">businessType" or "employees:" — normalise to schema keys. */
export function normaliseArgs(raw: string, allowed: string[]): Record<string, unknown> {
  let obj: Record<string, unknown> = {};
  try {
    obj = JSON.parse(raw || "{}");
  } catch {
    // salvage simple "key": value pairs
    const m = raw.matchAll(/"([^"]+)"\s*:\s*("([^"]*)"|true|false|-?\d+(\.\d+)?|\[[^\]]*\])/g);
    for (const x of m) {
      try {
        obj[x[1]] = JSON.parse(x[2]);
      } catch {
        obj[x[1]] = x[3];
      }
    }
  }
  const byNorm = new Map(allowed.map((k) => [k.toLowerCase().replace(/[^a-z0-9]/g, ""), k]));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = byNorm.get(k.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (key) out[key] = v;
  }
  return out;
}
