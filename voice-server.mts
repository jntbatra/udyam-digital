/**
 * Voice mode relay: browser <-> this WebSocket server <-> Amazon Nova Sonic or Sarvam
 * (Bedrock InvokeModelWithBidirectionalStream). Bedrock credentials stay here.
 *
 * Run from the app root:  npx tsx voice-server.mts
 *
 * Env:
 *   VOICE_PORT       (default 3001)
 *   SONIC_MODEL_ID   (default amazon.nova-2-5-sonic; fallback amazon.nova-2-sonic-v1:0)
 *   SONIC_REGION     (default us-east-1)
 *   SONIC_VOICE      (default kiara: en-IN + hi-IN feminine voice)
 *   SONIC_MAX_SECONDS(default 120, hard cap per connection)
 *   SONIC_SCRIPT     mixed | devanagari | latin | off  (Hindi transcript script speech prompt, default mixed)
 *   SONIC_HISTORY    1 | 0  (seed recent chat history into the voice session, default 1)
 *   VOICE_PROVIDER   nova | sarvam (default nova)
 *   SARVAM_API_KEY   Sarvam subscription key when VOICE_PROVIDER=sarvam
 *   SARVAM_STT_MODEL Sarvam realtime STT model (default saaras:v3-realtime)
 *   SARVAM_TTS_MODEL Sarvam TTS model (default bulbul:v3)
 *   SARVAM_SPEAKER   Sarvam TTS speaker (default shubh)
 *
 * WebSocket protocol (path /voice?session=<sessionId>):
 *   browser -> server : binary = PCM16 LE mono 16 kHz mic audio
 *                       text   = {"type":"start"} (opens the Sonic stream; nothing is billed before this)
 *                                {"type":"stop"}  (clean close)
 *   server -> browser : binary = PCM16 LE mono audio at OUTPUT_RATE (24 kHz)
 *                       text   = {"type":"hello"} | {"type":"ready",sampleRate,maxSeconds}
 *                                {"type":"transcript",role,text,final} | {"type":"interrupted"}
 *                                {"type":"tool",name,ok} | {"type":"bundle_updated"}
 *                                {"type":"error",message} | {"type":"ended",reason,seconds}
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
  type InvokeModelWithBidirectionalStreamInput,
} from "@aws-sdk/client-bedrock-runtime";
import { SarvamAIClient } from "sarvamai";
import type { SarvamAI } from "sarvamai";
import { NodeHttp2Handler } from "@smithy/node-http-handler";
import type { Session } from "./src/lib/store";

// src/lib reads data/ relative to process.cwd(); make that the app root regardless of where we're launched.
const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));
process.chdir(APP_ROOT);
const { TOOLS, runTool, extractFacts, applyProfile, doRecommend, autoLanguage, advisorTurn, voiceTurn } = await import("./src/lib/advisor");
const { db, nowIso } = await import("./src/lib/store");

const PORT = Number(process.env.VOICE_PORT || 3001);
const MODEL_ID = process.env.SONIC_MODEL_ID || "amazon.nova-2-5-sonic";
const REGION = process.env.SONIC_REGION || "us-east-1";
const VOICE = process.env.SONIC_VOICE || "kiara";
const MAX_SECONDS = Number(process.env.SONIC_MAX_SECONDS || 600);
const VOICE_PROVIDER = (process.env.VOICE_PROVIDER || "nova").toLowerCase();
const SARVAM_API_KEY = process.env.SARVAM_API_KEY || "";
const SARVAM_STT_MODEL = process.env.SARVAM_STT_MODEL || "saaras:v3-realtime";
const SARVAM_TTS_MODELS = new Set<SarvamAI.TextToSpeechModel>(["bulbul:v2", "bulbul:v3", "bulbul:v4-flash"]);
const SARVAM_TTS_SPEAKERS = new Set<SarvamAI.TextToSpeechSpeaker>([
  "aditya", "ritu", "ashutosh", "priya", "neha", "rahul", "pooja", "rohan", "simran", "kavya",
  "amit", "dev", "ishita", "shreya", "ratan", "varun", "manan", "sumit", "roopa", "kabir",
  "aayan", "shubh", "advait", "anand", "tanya", "tarun", "sunny", "mani", "gokul", "vijay",
  "shruti", "suhani", "mohit", "kavitha", "rehan", "soham", "rupali",
]);
const SARVAM_TTS_MODEL: SarvamAI.TextToSpeechModel = SARVAM_TTS_MODELS.has(process.env.SARVAM_TTS_MODEL as SarvamAI.TextToSpeechModel)
  ? process.env.SARVAM_TTS_MODEL as SarvamAI.TextToSpeechModel
  : "bulbul:v3";
const SARVAM_SPEAKER: SarvamAI.TextToSpeechSpeaker = SARVAM_TTS_SPEAKERS.has(process.env.SARVAM_SPEAKER as SarvamAI.TextToSpeechSpeaker)
  ? process.env.SARVAM_SPEAKER as SarvamAI.TextToSpeechSpeaker
  : "shubh";
const SCRIPT = (process.env.SONIC_SCRIPT || "mixed").toLowerCase();
const USE_HISTORY = process.env.SONIC_HISTORY !== "0";
const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;
const STORE_FILE = path.join(APP_ROOT, "data", "store.json");
const BUNDLE_TOOLS = new Set(["recommend_bundle", "change_bundle", "price_objection", "update_profile", "lookup_gstin"]);
const SARVAM_LANGUAGES: Record<string, string> = {
  English: "en-IN", Hindi: "hi-IN", Tamil: "ta-IN", Telugu: "te-IN", Bengali: "bn-IN",
  Marathi: "mr-IN", Gujarati: "gu-IN", Kannada: "kn-IN", Malayalam: "ml-IN",
  Punjabi: "pa-IN", Odia: "od-IN", Assamese: "as-IN",
};
const sarvamClient = SARVAM_API_KEY ? new SarvamAIClient({ apiSubscriptionKey: SARVAM_API_KEY }) : null;

// Speech prompts must be used verbatim (AWS Nova 2 Sonic "Voice conversation prompts" doc).
const SPEECH_PROMPTS: Record<string, string> = {
  latin: "If the input audio/speech contains hindi, then the transcription and response should be in All Latin script (romanized Hindi).",
  devanagari: "If the input audio/speech contains hindi, then the transcription and response should be in All Devanagari script (Hindi).",
  mixed: "If the input audio/speech contains hindi, then the transcription and response can mix Latin and Devanagari scripts naturally for code-switching.",
};

const bedrock = new BedrockRuntimeClient({
  region: REGION,
  requestHandler: new NodeHttp2Handler({
    requestTimeout: 300_000,
    sessionTimeout: 300_000,
    disableConcurrentStreams: false,
    maxConcurrentStreams: 20,
  }),
});

let totalStreamedSeconds = 0;

/* ---------------- shared store (cross-process) ---------------- */
// The Next server and this process each keep an in-memory copy of data/store.json.
// Re-read from disk before each read-modify-write and flush synchronously after, so we
// work on the latest state and don't lose our own writes to the 100 ms debounce.
function freshSession(id: string): Session | undefined {
  (globalThis as unknown as { __udyamDb?: unknown }).__udyamDb = undefined;
  return db.session(id);
}
function saveNow(s: Session) {
  db.saveSession(s);
  fs.writeFileSync(STORE_FILE, JSON.stringify(db.raw, null, 1));
}

/* ---------------- prompt + tools ---------------- */
function voiceSystemPrompt(s: Session) {
  const startLang = s.language === "Hindi" ? "Hindi" : "English";
  const female = ["kiara", "tiffany", "amy", "olivia", "ambre", "beatrice", "tina", "lupe", "carolina"].includes(VOICE);
  return `You are a warm, professional, and helpful ${female ? "female" : "male"} AI assistant named "Udyam Saathi", Udyam Digital's voice advisor for small businesses in India.
Speak naturally, like a helpful person on a phone call. Your output is spoken aloud: no lists, no markdown, no symbols.

CRITICAL LANGUAGE MIRRORING RULES:
- Always reply in the language spoken. If the user speaks Hindi or Hinglish, reply in simple everyday Hindi (product names may stay in English). If the user talks in English, reply in English.
- Start in ${startLang}.
- If the user speaks a language other than Hindi or English, say briefly that voice works in Hindi and English, and that they can continue in chat in their language.

Goal: understand the business with a few short questions, then recommend a bundle with ONE clear monthly price.

Rules:
- Keep every reply to one to three short sentences. Ask only ONE question at a time.
- Collect: business type, city, number of employees, number of sites, GSTIN yes or no, current internet, and needs such as UPI or billing, WhatsApp, CCTV, email, backup, security, customer Wi-Fi.
- Call update_profile whenever the owner tells you a fact. Call recommend_bundle as soon as type, city, employees, sites and GSTIN are known.
- When the owner asks for several changes, wait until they finish, make them all in ONE change_bundle call (use the changes list), then say the final monthly price once. Never say an in-between total.
- Business SIMs are optional; ask whether they need mobile lines before adding them.
- NEVER say any price, total or number of products until the tool result has arrived. While a tool is working, stay silent or say only "One moment."
- Before recommending, ask what they need (billing/UPI, business SIMs, WhatsApp, CCTV, email, backup, customer Wi-Fi). Do not recommend with an empty needs list.
- NEVER invent products, prices, eligibility or install times. Only say what the tools return. Say prices in rupees per month, rounded as the tool gives them.
- NEVER mention, offer or promise any discount. If price is a concern, call price_objection and describe the options it returns.
- If a product is excluded, explain why and give the alternative from the tool.
- If the owner only wants SIM cards, set simOnly to true and recommend.
- If the case is complex (three or more sites, manufacturing, leased line) or the owner asks for a person, call request_expert.
- After recommending, mention that the plan is now on their screen and they can tap View quote.
Current saved profile: ${JSON.stringify(s.profile)}
Current bundle: ${JSON.stringify(s.bundle.map((b) => `${b.productId}x${b.qty}`))}`;
}

function sarvamLanguage(s: Session) {
  return SARVAM_LANGUAGES[s.language] ?? "en-IN";
}

function sarvamTtsLanguage(s: Session): SarvamAI.TextToSpeechLanguage {
  const language = sarvamLanguage(s);
  return language === "as-IN" ? "en-IN" : language as SarvamAI.TextToSpeechLanguage;
}

function pcmFromWav(input: Buffer) {
  if (input.subarray(0, 4).toString("ascii") !== "RIFF") return input;
  const channels = input.readUInt16LE(22);
  const bits = input.readUInt16LE(34);
  let offset = 12;
  while (offset + 8 <= input.length) {
    const id = input.subarray(offset, offset + 4).toString("ascii");
    const size = input.readUInt32LE(offset + 4);
    if (id === "data") {
      if (channels !== 1 || bits !== 16) throw new Error("Sarvam TTS returned unsupported WAV format");
      return input.subarray(offset + 8, offset + 8 + size);
    }
    offset += 8 + size;
  }
  throw new Error("Sarvam TTS returned WAV without an audio data chunk");
}

async function sarvamSpeak(text: string, languageCode: SarvamAI.TextToSpeechLanguage) {
  if (!sarvamClient) throw new Error("Sarvam voice is not configured. Set SARVAM_API_KEY.");
  const response = await sarvamClient.textToSpeech.convert({
    text: text.slice(0, 2000),
    language_code: languageCode,
    speaker: SARVAM_SPEAKER,
    model: SARVAM_TTS_MODEL,
    speech_sample_rate: 24000,
    output_audio_codec: "wav",
    pace: Number(process.env.SARVAM_PACE || 1.2), // a little faster than default for a natural phone pace
  });
  if (!response.audios[0]) throw new Error("Sarvam TTS returned no audio");
  return pcmFromWav(Buffer.from(response.audios[0], "base64"));
}

function sarvamTranscript(message: unknown): { text: string; languageCode?: string } | null {
  // Sarvam realtime sends {"event":"transcript.final","text":"...","language":"hi-IN"} (partials: "transcript.partial")
  const m = message as { event?: string; type?: string; transcript?: string; text?: string; language?: string; language_code?: string; data?: { transcript?: string; text?: string; language_code?: string } };
  const kind = (m.event ?? m.type ?? "").toLowerCase();
  if (!kind.includes("transcript") && !(kind === "data" && m.data?.transcript)) return null;
  if (kind.includes("partial")) return null;
  const text = (m.transcript ?? m.text ?? m.data?.transcript ?? m.data?.text ?? "").trim();
  if (!text) return null;
  return { text, languageCode: m.language ?? m.language_code ?? m.data?.language_code ?? undefined };
}

const LANGUAGE_BY_CODE: Record<string, string> = { ...Object.fromEntries(Object.entries(SARVAM_LANGUAGES).map(([name, code]) => [code, name])), "or-IN": "Odia" };

function handleSarvamConnection(ws: WebSocket, sessionId: string) {
  if (!SARVAM_API_KEY) {
    ws.send(JSON.stringify({ type: "error", message: "Sarvam voice is not configured. Set SARVAM_API_KEY." }));
    ws.close(1011, "Sarvam not configured");
    return;
  }
  const s = freshSession(sessionId);
  if (!s) {
    ws.send(JSON.stringify({ type: "error", message: "unknown session" }));
    ws.close(4004, "unknown session");
    return;
  }
  // "auto" = Sarvam auto-detects the spoken language on every utterance (set SARVAM_STT_LANGUAGE to pin one).
  const languageCode = process.env.SARVAM_STT_LANGUAGE || "auto";
  const sttUrl = `wss://api.sarvam.ai/speech-to-text-realtime/ws?model=${encodeURIComponent(SARVAM_STT_MODEL)}&language_code=${encodeURIComponent(languageCode)}`;
  const stt = new WebSocket(sttUrl, { headers: { "api-subscription-key": SARVAM_API_KEY } });
  let started = false;
  let closed = false;
  let pendingAudio: Buffer[] = [];
  let replyChain: Promise<void> = Promise.resolve();

  const close = () => {
    if (closed) return;
    closed = true;
    stt.close();
    if (ws.readyState === ws.OPEN) ws.close();
  };
  // ---- turn-taking: barge-in + sentence-by-sentence speech ----
  let generation = 0; // bumped whenever the owner interrupts; stale replies are dropped
  let speakingUntil = 0; // when the audio we've sent will finish playing (ms epoch)
  let replying = false;
  let lastSpoken = "";
  const assistantBusy = () => replying || Date.now() < speakingUntil;
  // speaker echo guard: a "partial" that mostly repeats our own words is the mic hearing us, not the owner
  const isEcho = (partial: string) => {
    const words = partial.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    if (!words.length || !lastSpoken) return false;
    const mine = new Set(lastSpoken.toLowerCase().split(/\s+/));
    return words.filter((w) => mine.has(w)).length / words.length >= 0.6;
  };
  const interrupt = () => {
    generation++;
    speakingUntil = 0;
    ws.send(JSON.stringify({ type: "interrupted" }));
    const session = freshSession(sessionId);
    const last = session?.messages.at(-1);
    if (session && last?.role === "assistant" && !last.text.endsWith("[interrupted]")) {
      last.text = `${last.text} [interrupted]`;
      saveNow(session);
    }
  };
  const sentences = (t: string) => t.replace(/\s+/g, " ").match(/[^.!?।]+[.!?।]+|[^.!?।]+$/g)?.map((x) => x.trim()).filter(Boolean) ?? [t];

  const respond = async (text: string, detected?: string) => {
    const gen = generation;
    replying = true;
    try {
      const session = freshSession(sessionId);
      if (!session) throw new Error("session not found");
      // Follow the language the owner is speaking (Sarvam's detection; advisorTurn also checks the script).
      if (detected && LANGUAGE_BY_CODE[detected]) session.language = LANGUAGE_BY_CODE[detected];
      const tLlm = Date.now();
      const out = await voiceTurn(session, text.slice(0, 2000)); // fast path: one short LLM call
      console.log(`[timing] advisor ${Date.now() - tLlm}ms`);
      if (gen !== generation) return; // owner spoke again meanwhile — answer that instead
      ws.send(JSON.stringify({ type: "transcript", role: "assistant", text: out.text, final: true }));
      ws.send(JSON.stringify({ type: "bundle_updated" }));
      lastSpoken = out.text.replace(/[^\p{L}\p{N}\s]/gu, " ");
      const lang = sarvamTtsLanguage(session);
      // speak sentence by sentence so the first one plays while the rest is synthesised
      let next = sentences(out.text).map((x) => sarvamSpeak(x, lang));
      const tTts = Date.now();
      let firstAudio = true;
      for (const pcm of next) {
        const audio = await pcm;
        if (firstAudio) { console.log(`[timing] first tts ${Date.now() - tTts}ms`); firstAudio = false; }
        if (gen !== generation || ws.readyState !== ws.OPEN) return;
        ws.send(audio);
        const ms = (audio.length / 2 / 24000) * 1000;
        speakingUntil = Math.max(Date.now(), speakingUntil) + ms;
      }
      next = [];
    } finally {
      replying = false;
    }
  };

  stt.on("open", () => {
    started = true;
    ws.send(JSON.stringify({ type: "hello", provider: "sarvam", language: languageCode }));
    ws.send(JSON.stringify({ type: "ready", sampleRate: 24000, maxSeconds: MAX_SECONDS }));
    for (const audio of pendingAudio) stt.send(JSON.stringify({ event: "audio_input", audio: audio.toString("base64") }));
    pendingAudio = [];
  });
  stt.on("message", (raw) => {
    try {
      const message = JSON.parse(String(raw)) as { event?: string; text?: string };
      // Barge-in: the owner started talking while we speak/think -> stop playback, drop the stale reply.
      // Triggered on real words (partial transcript), not raw VAD, so speaker echo doesn't cut us off.
      if (message.event === "vad.speech_end") console.log(`[timing] speech_end ${Date.now() % 100000}`);
      if (message.event === "transcript.final") console.log(`[timing] final ${Date.now() % 100000}`);
      if (message.event === "transcript.partial" && (message.text ?? "").trim().length >= 3 && assistantBusy() && !isEcho(message.text ?? "")) interrupt();
      const transcript = sarvamTranscript(message);
      if (!transcript) return;
      if (assistantBusy() && isEcho(transcript.text)) return; // our own voice through the speakers
      ws.send(JSON.stringify({ type: "transcript", role: "user", text: transcript.text, final: true }));
      ws.send(JSON.stringify({ type: "thinking" }));
      // one reply at a time, in order
      replyChain = replyChain
        .then(() => respond(transcript.text, transcript.languageCode))
        .catch((e: unknown) => ws.send(JSON.stringify({ type: "error", message: (e as Error).message })));
    } catch (e) {
      ws.send(JSON.stringify({ type: "error", message: (e as Error).message }));
    }
  });
  stt.on("error", (e) => ws.send(JSON.stringify({ type: "error", message: `Sarvam STT error: ${e.message}` })));
  stt.on("close", () => { if (!closed && started) ws.send(JSON.stringify({ type: "ended", reason: "stt_closed", seconds: 0 })); });

  ws.on("message", (raw, isBinary) => {
    if (!isBinary) {
      const message = JSON.parse(String(raw)) as { type?: string };
      if (message.type === "stop") close();
      return;
    }
    const audio = Buffer.from(raw as Buffer);
    if (started && stt.readyState === stt.OPEN) stt.send(JSON.stringify({ event: "audio_input", audio: audio.toString("base64") }));
    else pendingAudio.push(audio);
  });
  ws.on("close", close);
  ws.on("error", close);
}

/** OpenAI-style function tools -> Sonic toolSpec (inputSchema.json is a stringified JSON schema, as in the AWS samples). */
const SONIC_TOOLS = TOOLS.map((t) => ({
  toolSpec: {
    name: t.function.name,
    description: t.function.description,
    inputSchema: { json: JSON.stringify(t.function.parameters) },
  },
}));

/* ---------------- async input queue for the bidi stream ---------------- */
class EventQueue implements AsyncIterable<InvokeModelWithBidirectionalStreamInput> {
  private items: unknown[] = [];
  private waiter: (() => void) | null = null;
  private closed = false;
  private enc = new TextEncoder();
  push(event: unknown) {
    if (this.closed) return;
    this.items.push(event);
    this.waiter?.();
  }
  close() {
    this.closed = true;
    this.waiter?.();
  }
  get isClosed() {
    return this.closed;
  }
  async *[Symbol.asyncIterator](): AsyncIterator<InvokeModelWithBidirectionalStreamInput> {
    while (true) {
      if (!this.items.length) {
        if (this.closed) return;
        await new Promise<void>((r) => (this.waiter = r));
        this.waiter = null;
        continue;
      }
      const ev = this.items.shift();
      yield { chunk: { bytes: this.enc.encode(JSON.stringify(ev)) } };
    }
  }
}

/* ---------------- one voice connection ---------------- */
function handleConnection(ws: WebSocket, sessionId: string) {
  if (VOICE_PROVIDER === "sarvam") return handleSarvamConnection(ws, sessionId);
  const send = (o: Record<string, unknown>) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(o));
  const tag = `[voice ${sessionId}]`;
  let started = false;
  let ended = false;
  let startedAt = 0;
  let inputBytes = 0;
  let capTimer: NodeJS.Timeout | null = null;
  const q = new EventQueue();
  const abort = new AbortController();
  const promptName = randomUUID();
  const audioContentName = randomUUID();
  const pendingTools = new Map<string, { name: string; content: string; toolUseId: string }>();
  const roleByContent = new Map<string, { role: string; stage: string }>();

  send({ type: "hello", model: MODEL_ID, maxSeconds: MAX_SECONDS });

  function textBlock(role: string, content: string) {
    const contentName = randomUUID();
    q.push({ event: { contentStart: { promptName, contentName, type: "TEXT", interactive: false, role, textInputConfiguration: { mediaType: "text/plain" } } } });
    q.push({ event: { textInput: { promptName, contentName, content } } });
    q.push({ event: { contentEnd: { promptName, contentName } } });
  }

  async function start() {
    const s = freshSession(sessionId);
    if (!s) return finish("no_session");
    started = true;
    startedAt = Date.now();

    q.push({ event: { sessionStart: { inferenceConfiguration: { maxTokens: 1024, topP: 0.9, temperature: 0.7 }, turnDetectionConfiguration: { endpointingSensitivity: "MEDIUM" } } } });
    q.push({
      event: {
        promptStart: {
          promptName,
          textOutputConfiguration: { mediaType: "text/plain" },
          audioOutputConfiguration: { mediaType: "audio/lpcm", sampleRateHertz: OUTPUT_RATE, sampleSizeBits: 16, channelCount: 1, voiceId: VOICE, encoding: "base64", audioType: "SPEECH" },
          toolUseOutputConfiguration: { mediaType: "application/json" },
          toolConfiguration: { tools: SONIC_TOOLS, toolChoice: { auto: {} } },
        },
      },
    });
    textBlock("SYSTEM", voiceSystemPrompt(s));
    if (SPEECH_PROMPTS[SCRIPT]) textBlock("SYSTEM_SPEECH", SPEECH_PROMPTS[SCRIPT]);
    if (USE_HISTORY) {
      const hist = s.messages.filter((m) => m.role === "user" || m.role === "assistant").slice(-6);
      while (hist.length && hist[0].role !== "user") hist.shift();
      for (const m of hist) textBlock(m.role === "user" ? "USER" : "ASSISTANT", m.text.slice(0, 600));
    }
    q.push({
      event: {
        contentStart: {
          promptName, contentName: audioContentName, type: "AUDIO", interactive: true, role: "USER",
          audioInputConfiguration: { mediaType: "audio/lpcm", sampleRateHertz: INPUT_RATE, sampleSizeBits: 16, channelCount: 1, audioType: "SPEECH", encoding: "base64" },
        },
      },
    });

    capTimer = setTimeout(() => {
      console.log(`${tag} hit ${MAX_SECONDS}s cap`);
      finish("time_limit");
    }, MAX_SECONDS * 1000);

    console.log(`${tag} opening Sonic stream model=${MODEL_ID} region=${REGION} voice=${VOICE}`);
    try {
      const res = await bedrock.send(new InvokeModelWithBidirectionalStreamCommand({ modelId: MODEL_ID, body: q }), { abortSignal: abort.signal });
      send({ type: "ready", sampleRate: OUTPUT_RATE, maxSeconds: MAX_SECONDS });
      if (!res.body) throw new Error("empty response body");
      for await (const ev of res.body) {
        if (ev.chunk?.bytes) {
          let msg: { event?: Record<string, Record<string, unknown>> };
          try {
            msg = JSON.parse(new TextDecoder().decode(ev.chunk.bytes));
          } catch {
            continue;
          }
          await onSonicEvent(msg.event ?? {});
        } else {
          const err = Object.entries(ev).find(([k, v]) => k !== "chunk" && v)?.[1] as { message?: string } | undefined;
          if (err) {
            console.error(`${tag} stream error`, err);
            send({ type: "error", message: err.message ?? "model stream error" });
          }
        }
      }
    } catch (e) {
      if (!ended) {
        console.error(`${tag} Sonic error:`, e);
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      finish("stream_closed");
    }
  }

  // Tool gate: assistant speech that begins while a tool call is in flight is never played or saved,
  // so the model cannot announce a guessed price before the rule engine has answered.
  let toolsInFlight = 0;
  const muted = new Set<string>();

  async function onSonicEvent(e: Record<string, Record<string, unknown>>) {
    if (e.contentStart) {
      const cs = e.contentStart;
      let stage = "";
      try {
        stage = JSON.parse(String(cs.additionalModelFields ?? "{}")).generationStage ?? "";
      } catch { /* ignore */ }
      roleByContent.set(String(cs.contentId), { role: String(cs.role), stage });
      if (toolsInFlight > 0 && String(cs.role) === "ASSISTANT") muted.add(String(cs.contentId));
    } else if (e.textOutput) {
      const t = e.textOutput;
      const text = String(t.content ?? "");
      const meta = roleByContent.get(String(t.contentId)) ?? { role: String(t.role ?? "ASSISTANT"), stage: "" };
      if (/^\s*\{\s*"interrupted"\s*:\s*true\s*\}\s*$/.test(text)) {
        send({ type: "interrupted" });
        return;
      }
      const role = meta.role === "USER" ? "user" : "assistant";
      if (role === "assistant" && (toolsInFlight > 0 || muted.has(String(t.contentId)))) return;
      const final = meta.stage !== "SPECULATIVE";
      send({ type: "transcript", role, text, final });
      if (final && text.trim()) {
        const s = freshSession(sessionId);
        if (s) {
          s.messages.push({ role, text: text.trim(), at: nowIso(), channel: "voice" });
          // Deterministic fact capture (same as chat): the voice model often skips update_profile.
          if (role === "user") {
            autoLanguage(s, text);
            const facts = extractFacts(text);
            if (Object.keys(facts).length) {
              applyProfile(s, facts);
              const p = s.profile;
              const complete = (p.businessType || p.segment) && p.city && p.employees !== undefined && p.sites !== undefined && p.hasGstin !== undefined;
              if (complete && !s.bundle.length && (p.needs?.length || p.simOnly)) doRecommend(s);
              saveNow(s);
              send({ type: "bundle_updated" });
            } else saveNow(s);
          } else saveNow(s);
        }
      }
    } else if (e.audioOutput) {
      const b64 = String(e.audioOutput.content ?? "");
      if (toolsInFlight > 0 || muted.has(String(e.audioOutput.contentId))) return;
      if (b64 && ws.readyState === ws.OPEN) ws.send(Buffer.from(b64, "base64"));
    } else if (e.toolUse) {
      const t = e.toolUse;
      pendingTools.set(String(t.contentId), { name: String(t.toolName), content: String(t.content ?? "{}"), toolUseId: String(t.toolUseId) });
      if (toolsInFlight++ === 0) send({ type: "thinking" });
    } else if (e.contentEnd) {
      const c = e.contentEnd;
      if (c.stopReason === "INTERRUPTED") send({ type: "interrupted" });
      if (c.type === "TOOL") {
        const tool = pendingTools.get(String(c.contentId));
        pendingTools.delete(String(c.contentId));
        if (tool) await execTool(tool);
      }
    } else if (e.completionEnd) {
      /* turn finished */
    }
  }

  async function execTool(tool: { name: string; content: string; toolUseId: string }) {
    let result: unknown;
    try {
      const s = freshSession(sessionId);
      if (!s) throw new Error("session not found");
      result = await runTool(s, tool.name, tool.content);
      saveNow(s);
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    const ok = !(result && typeof result === "object" && (result as { ok?: boolean }).ok === false);
    console.log(`${tag} tool ${tool.name} ok=${ok}`);
    send({ type: "tool", name: tool.name, ok });
    if (BUNDLE_TOOLS.has(tool.name)) send({ type: "bundle_updated" });
    // Always answer a toolUse, even on error (otherwise Sonic waits).
    const contentName = randomUUID();
    q.push({
      event: {
        contentStart: {
          promptName, contentName, interactive: false, type: "TOOL", role: "TOOL",
          toolResultInputConfiguration: { toolUseId: tool.toolUseId, type: "TEXT", textInputConfiguration: { mediaType: "text/plain" } },
        },
      },
    });
    q.push({ event: { toolResult: { promptName, contentName, content: JSON.stringify(result ?? {}).slice(0, 4000) } } });
    q.push({ event: { contentEnd: { promptName, contentName } } });
    toolsInFlight = Math.max(0, toolsInFlight - 1);
  }

  function finish(reason: string) {
    if (ended) return;
    ended = true;
    if (capTimer) clearTimeout(capTimer);
    if (started && !q.isClosed) {
      // Closing sequence: audio contentEnd -> promptEnd -> sessionEnd, then end the input stream.
      q.push({ event: { contentEnd: { promptName, contentName: audioContentName } } });
      q.push({ event: { promptEnd: { promptName } } });
      q.push({ event: { sessionEnd: {} } });
      q.close();
      // If Sonic doesn't wind the response stream down promptly, cut it.
      setTimeout(() => abort.abort(), 5000).unref();
    }
    const seconds = started ? (Date.now() - startedAt) / 1000 : 0;
    totalStreamedSeconds += seconds;
    console.log(
      `${tag} ended reason=${reason} streamed=${seconds.toFixed(1)}s micAudio=${(inputBytes / (INPUT_RATE * 2)).toFixed(1)}s ` +
        `TOTAL_STREAMED_SECONDS=${totalStreamedSeconds.toFixed(1)}`,
    );
    send({ type: "ended", reason, seconds: Math.round(seconds) });
    setTimeout(() => ws.readyState === ws.OPEN && ws.close(1000, reason), 300);
  }

  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      if (!started || ended) return;
      const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
      inputBytes += buf.length;
      q.push({ event: { audioInput: { promptName, contentName: audioContentName, content: buf.toString("base64") } } });
      return;
    }
    let m: { type?: string };
    try {
      m = JSON.parse(String(data));
    } catch {
      return;
    }
    if (m.type === "start" && !started && !ended) void start();
    else if (m.type === "stop") finish("user_stop");
  });
  ws.on("close", () => finish("client_closed"));
  ws.on("error", () => finish("socket_error"));
}

/* ---------------- server ---------------- */
const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end(`voice-server ok model=${MODEL_ID}\n`);
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 1 << 20 });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const sessionId = url.searchParams.get("session") ?? "";
  if (url.pathname !== "/voice" || !/^[A-Za-z0-9_-]{1,64}$/.test(sessionId)) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    if (!freshSession(sessionId)) {
      ws.send(JSON.stringify({ type: "error", message: "unknown session" }));
      ws.close(4004, "unknown session");
      return;
    }
    handleConnection(ws, sessionId);
  });
});

server.listen(PORT, () => {
  console.log(`voice-server listening on ws://localhost:${PORT}/voice  model=${MODEL_ID} region=${REGION} voice=${VOICE} cap=${MAX_SECONDS}s`);
});

const shutdown = () => {
  console.log(`voice-server shutting down TOTAL_STREAMED_SECONDS=${totalStreamedSeconds.toFixed(1)}`);
  for (const c of wss.clients) c.close(1001, "server shutdown");
  setTimeout(() => process.exit(0), 500);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
