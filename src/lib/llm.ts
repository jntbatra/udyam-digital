/**
 * Chat LLM: Google Gemma 4 31B on Amazon Bedrock Mantle (OpenAI-compatible
 * /openai/v1/chat/completions), SigV4-signed with the default AWS credential chain.
 */
import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { HttpRequest } from "@smithy/protocol-http";
import { defaultProvider } from "@aws-sdk/credential-provider-node";

export const LLM_REGION = process.env.MANTLE_REGION || "ap-south-1";
export const LLM_MODEL = process.env.MANTLE_MODEL || "openai.gpt-oss-20b";
const PATH = process.env.MANTLE_PATH || "/v1/chat/completions";

/** Per-use endpoint (voice uses a low-latency model in Mumbai; chat keeps Gemma 4 for tool calling). */
export type LlmTarget = { region: string; model: string; path: string };
export const CHAT_TARGET: LlmTarget = { region: LLM_REGION, model: LLM_MODEL, path: PATH };
export const VOICE_TARGET: LlmTarget = {
  region: process.env.VOICE_LLM_REGION || "ap-south-1",
  model: process.env.VOICE_LLM_MODEL || "openai.gpt-oss-20b",
  path: process.env.VOICE_LLM_PATH || "/v1/chat/completions",
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

const credentials = defaultProvider();
const signers = new Map<string, SignatureV4>();
function signerFor(region: string) {
  let sg = signers.get(region);
  if (!sg) {
    sg = new SignatureV4({ credentials, region, service: "bedrock-mantle", sha256: Sha256 });
    signers.set(region, sg);
  }
  return sg;
}

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
}, target: LlmTarget = CHAT_TARGET): Promise<{ message: Extract<ChatMessage, { role: "assistant" }>; finish: string; usage?: unknown }> {
  // gpt-oss is a reasoning model: keep reasoning short for latency
  const extra = /gpt-oss/.test(target.model) ? { reasoning_effort: "low" } : {};
  const payload = JSON.stringify({ model: target.model, max_tokens: 700, temperature: 0.2, ...extra, ...body });
  const HOST = `bedrock-mantle.${target.region}.api.aws`;
  const PATH = target.path;
  const req = new HttpRequest({
    method: "POST",
    protocol: "https:",
    hostname: HOST,
    path: PATH,
    headers: { host: HOST, "content-type": "application/json" },
    body: payload,
  });
  const signed = await signerFor(target.region).sign(req);
  const t0 = Date.now();
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
    if (process.env.LLM_TIMING) console.log(`[llm] ${target.model}@${target.region} ${Date.now() - t0}ms tools=${body.tools?.length ?? 0} msgs=${body.messages.length}`);
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
