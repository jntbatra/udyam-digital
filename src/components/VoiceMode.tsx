"use client";
/**
 * In-browser voice mode via the voice-server relay.
 * Mic -> AudioWorklet -> 16 kHz PCM16 -> WebSocket; PCM16 back -> Web Audio queue.
 * Barge-in: server sends {type:"interrupted"} and we flush the playback queue.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card } from "./ui";

type VState = "idle" | "connecting" | "listening" | "speaking";
type Bubble = { role: "user" | "assistant"; text: string };

const MAX_SECONDS = 600; // hidden safety cap (10 min)
const TARGET_RATE = 16000;
const FRAME = 512; // 32 ms at 16 kHz

// Worklet: downsample to 16 kHz mono and post Int16 frames of 512 samples.
const WORKLET_SRC = `
class PcmCapture extends AudioWorkletProcessor {
  constructor(o) { super(); this.ratio = sampleRate / ${TARGET_RATE}; this.acc = 0; this.cnt = 0; this.pos = 0; this.buf = new Int16Array(${FRAME}); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i]; this.cnt++; this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        const v = Math.max(-1, Math.min(1, this.acc / this.cnt));
        this.acc = 0; this.cnt = 0;
        this.buf[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        if (this.n === ${FRAME}) { this.port.postMessage(this.buf.buffer, [this.buf.buffer]); this.buf = new Int16Array(${FRAME}); this.n = 0; }
      }
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

function downsampleToInt16(input: Float32Array, inRate: number): Int16Array {
  const ratio = inRate / TARGET_RATE;
  const out = new Int16Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

function voiceUrl(sessionId: string) {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const q = `/voice?session=${encodeURIComponent(sessionId)}`;
  // Direct local dev (Next on :3100): voice server on its own port.
  // Through the gateway / tunnel: same origin, gateway routes /voice.
  if (window.location.port === "3100") return `${proto}://${window.location.hostname}:${process.env.NEXT_PUBLIC_VOICE_PORT || "3001"}${q}`;
  return `${proto}://${window.location.host}${q}`;
}

export function VoiceMode({ sessionId, language, onUpdate }: { sessionId: string; language: string; onUpdate?: () => void }) {
  const hi = language === "Hindi";
  const T = {
    title: hi ? "वॉइस मोड" : "Voice mode",
    consent: hi
      ? "आपकी आवाज़ का जवाब देने के लिए उसे सुरक्षित voice service पर प्रोसेस किया जाता है; ट्रांसक्रिप्ट 30 दिन रखा जाता है।"
      : "Voice is processed by a secure voice service to answer you; transcript kept 30 days",
    agree: hi ? "मैं सहमत हूँ" : "I agree",
    tap: hi ? "माइक दबाइए और बात कीजिए — जैसे फ़ोन पर" : "Tap and just talk — like a phone call",
    end: hi ? "बंद करें" : "End",
    states: hi
      ? { idle: "तैयार", connecting: "जुड़ रहा है…", listening: "सुन रहा है", speaking: "बोल रहा है" }
      : { idle: "Ready", connecting: "Connecting…", listening: "Listening", speaking: "Speaking" },
    limit: hi ? "समय सीमा पूरी हुई। चैट में जारी रखें।" : "Time limit reached. You can continue in chat.",
    micErr: hi ? "माइक की अनुमति नहीं मिली।" : "Microphone permission was denied.",
  };

  const [state, setState] = useState<VState>("idle");
  const [consented, setConsented] = useState(false);
  const [checked, setChecked] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [live, setLive] = useState("");
  const [note, setNote] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodesRef = useRef<AudioNode[]>([]);
  const playRef = useRef<{ next: number; sources: Set<AudioBufferSourceNode>; rate: number }>({ next: 0, sources: new Set(), rate: 24000 });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);
  const activeRef = useRef(false);
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const flushPlayback = useCallback(() => {
    const p = playRef.current;
    for (const s of p.sources) {
      try {
        s.stop();
      } catch { /* already stopped */ }
    }
    p.sources.clear();
    p.next = 0;
    if (activeRef.current) setState("listening");
  }, []);

  const cleanup = useCallback(() => {
    activeRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    flushPlayback();
    for (const n of nodesRef.current) {
      try {
        n.disconnect();
      } catch { /* ignore */ }
    }
    nodesRef.current = [];
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "stop" }));
      } catch { /* ignore */ }
      setTimeout(() => ws.close(), 500);
    } else ws?.close();
    setState("idle");
    setLive("");
  }, [flushPlayback]);

  useEffect(() => cleanup, [cleanup]);

  const playPcm = useCallback((buf: ArrayBuffer) => {
    const ctx = ctxRef.current;
    if (!ctx || !activeRef.current) return;
    const p = playRef.current;
    const pcm = new Int16Array(buf);
    if (!pcm.length) return;
    const ab = ctx.createBuffer(1, pcm.length, p.rate);
    const ch = ab.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const src = ctx.createBufferSource();
    src.buffer = ab;
    src.connect(ctx.destination);
    const at = Math.max(ctx.currentTime + 0.02, p.next);
    src.start(at);
    p.next = at + ab.duration;
    p.sources.add(src);
    setState("speaking");
    src.onended = () => {
      p.sources.delete(src);
      if (!p.sources.size && activeRef.current) setState("listening");
    };
  }, []);

  const giveConsent = useCallback(async () => {
    setChecked(true);
    try {
      await fetch("/api/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, purpose: "voice", granted: true }),
      });
    } catch { /* consent stays local if offline */ }
    setConsented(true);
  }, [sessionId]);

  const start = useCallback(async () => {
    if (activeRef.current) return;
    setNote("");
    setState("connecting");
    activeRef.current = true;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      activeRef.current = false;
      setState("idle");
      setNote(T.micErr);
      return;
    }
    streamRef.current = stream;
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    await ctx.resume().catch(() => {});

    const sendPcm = (b: ArrayBuffer) => {
      const w = wsRef.current;
      if (w && w.readyState === WebSocket.OPEN && activeRef.current && startRef.current) w.send(b);
    };

    // Mic capture: AudioWorklet, ScriptProcessor fallback.
    const source = ctx.createMediaStreamSource(stream);
    nodesRef.current.push(source);
    try {
      const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(ctx, "pcm-capture");
      node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => sendPcm(e.data);
      source.connect(node);
      nodesRef.current.push(node);
    } catch {
      const sp = ctx.createScriptProcessor(4096, 1, 1);
      sp.onaudioprocess = (e) => sendPcm(downsampleToInt16(e.inputBuffer.getChannelData(0), ctx.sampleRate).buffer as ArrayBuffer);
      const mute = ctx.createGain();
      mute.gain.value = 0;
      source.connect(sp);
      sp.connect(mute);
      mute.connect(ctx.destination);
      nodesRef.current.push(sp, mute);
    }

    // Open the socket only after audio is ready and attach handlers synchronously,
    // so the server's "hello" can't arrive before we listen for it.
    const ws = new WebSocket(voiceUrl(sessionId));
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") return playPcm(ev.data as ArrayBuffer);
      let m: { type: string; [k: string]: unknown };
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (m.type) {
        case "hello":
          ws.send(JSON.stringify({ type: "start" }));
          break;
        case "ready":
          playRef.current.rate = Number(m.sampleRate) || 24000;
          startRef.current = Date.now();
          setSeconds(0);
          setState("listening");
          timerRef.current = setInterval(() => {
            const s = Math.floor((Date.now() - startRef.current) / 1000);
            setSeconds(s);
            if (s >= MAX_SECONDS) {
              setNote(T.limit);
              cleanup();
            }
          }, 250);
          break;
        case "transcript": {
          const text = String(m.text ?? "").trim();
          if (!text) break;
          if (!m.final) {
            setLive(text);
            break;
          }
          const role: Bubble["role"] = m.role === "user" ? "user" : "assistant";
          if (role === "assistant") setLive("");
          setBubbles((b) => [...b, { role, text }].slice(-30));
          break;
        }
        case "interrupted":
          flushPlayback();
          setLive("");
          break;
        case "thinking":
          setLive(hi ? "एक पल…" : "One moment…");
          break;
        case "bundle_updated":
          onUpdateRef.current?.();
          break;
        case "error":
          setNote(String(m.message ?? "Voice error"));
          break;
        case "ended":
          if (m.reason === "time_limit") setNote(T.limit);
          cleanup();
          break;
      }
    };
    ws.onerror = () => setNote(hi ? "वॉइस सर्वर से कनेक्ट नहीं हो पाया।" : "Could not reach the voice server.");
    ws.onclose = () => {
      if (activeRef.current) cleanup();
    };
  }, [sessionId, playPcm, flushPlayback, cleanup, hi, T.micErr, T.limit]);

  const stop = useCallback(() => {
    startRef.current = 0;
    cleanup();
  }, [cleanup]);

  const active = state !== "idle";
  const lastAssistant = [...bubbles].reverse().find((b) => b.role === "assistant")?.text;
  const lastUser = [...bubbles].reverse().find((b) => b.role === "user")?.text;
  const [showLog, setShowLog] = useState(false);

  async function tap() {
    if (active) return stop();
    if (!consented) await giveConsent(); // tapping = consent (notice shown under the orb)
    void start();
  }

  const orb =
    state === "speaking"
      ? "bg-brand scale-105 mic-live"
      : state === "listening"
        ? "bg-brand mic-live breathe"
        : state === "connecting"
          ? "bg-brand/70 animate-pulse"
          : "bg-foreground hover:bg-black";

  return (
    <Card className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="flex items-center gap-2 text-sm text-muted">
        <span>{T.states[state]}</span>

      </div>

      <button
        aria-label={active ? T.end : T.tap}
        aria-pressed={active}
        onClick={() => void tap()}
        disabled={state === "connecting"}
        className={`w-36 h-36 rounded-full shadow-xl transition-all duration-300 grid place-items-center text-white ${orb}`}
      >
        <svg aria-hidden width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {active ? <rect x="7" y="7" width="10" height="10" rx="2" /> : (<><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5" /></>)}
        </svg>
      </button>

      <div className="min-h-[4.5rem] max-w-xl">
        {live ? (
          <p className="text-lg">{live}</p>
        ) : lastAssistant ? (
          <p className="text-lg">{lastAssistant}</p>
        ) : (
          <p className="text-muted">{active ? (hi ? "बोलिए — मैं सुन रहा हूँ" : "Go ahead — I'm listening") : T.tap}</p>
        )}
        {lastUser && <p className="text-sm text-muted mt-2">“{lastUser}”</p>}
      </div>

      {active && <Button variant="outline" size="sm" onClick={stop}>{T.end}</Button>}
      {note && <p className="text-sm text-warn" role="status">{note}</p>}
      {!consented && <p className="text-xs text-muted max-w-sm">{T.consent}. {hi ? "माइक दबाकर आप सहमति देते हैं।" : "Tapping the mic means you agree."}</p>}
      {bubbles.length > 0 && (
        <button className="text-xs text-muted underline" onClick={() => setShowLog((v) => !v)}>{showLog ? "Hide transcript" : "Show transcript"}</button>
      )}
      {showLog && (
        <div className="w-full flex flex-col gap-2 max-h-60 overflow-y-auto text-left" aria-live="polite">
          {bubbles.map((b, i) => (
            <div key={i} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${b.role === "user" ? "self-end bg-brand text-brand-ink" : "self-start bg-background border border-border"}`}>{b.text}</div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default VoiceMode;
