import { writeFile } from "node:fs/promises";
import process from "node:process";
import { SarvamAIClient } from "sarvamai";
import type { SarvamAI } from "sarvamai";

const text = process.argv[2] ?? "Hello, welcome to Udyam Saathi.";
const outputPath = process.argv[3] ?? "sarvam-tts-smoke.wav";
const apiKey = process.env.SARVAM_API_KEY;

if (!apiKey) {
  throw new Error("SARVAM_API_KEY is not set.");
}

const client = new SarvamAIClient({ apiSubscriptionKey: apiKey });
const model: SarvamAI.TextToSpeechModel = process.env.SARVAM_TTS_MODEL === "bulbul:v2" || process.env.SARVAM_TTS_MODEL === "bulbul:v4-flash"
  ? process.env.SARVAM_TTS_MODEL
  : "bulbul:v3";
const speaker: SarvamAI.TextToSpeechSpeaker = process.env.SARVAM_SPEAKER === "shubh"
  ? process.env.SARVAM_SPEAKER
  : "shubh";
const response = await client.textToSpeech.convert({
  text,
  language_code: "en-IN",
  speaker,
  model,
  speech_sample_rate: 24000,
  output_audio_codec: "wav",
});

if (!response.audios[0]) {
  throw new Error("Sarvam TTS returned no audio.");
}

await writeFile(outputPath, Buffer.from(response.audios[0], "base64"));
console.log(`Saved Sarvam TTS audio to ${outputPath}`);
