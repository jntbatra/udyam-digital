import { readFile } from "node:fs/promises";
import process from "node:process";
import { SarvamAIClient } from "sarvamai";

const audioPath = process.argv[2];
const apiKey = process.env.SARVAM_API_KEY;

if (!apiKey) {
  throw new Error("SARVAM_API_KEY is not set.");
}

if (!audioPath) {
  throw new Error("Usage: node --env-file=.env.local --import tsx scripts/sarvam-stt-smoke.mts <audio-file>");
}

const client = new SarvamAIClient({ apiSubscriptionKey: apiKey });
const response = await client.speechToText.transcribe({
  file: await readFile(audioPath),
  model: "saaras:v4",
  language_code: "en-IN",
});

console.log(`Transcript: ${response.transcript}`);
console.log(`Detected language: ${response.language_code ?? "unknown"}`);
