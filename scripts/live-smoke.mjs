import assert from "node:assert/strict";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { buildAzureDictationProvider } from "../dist/provider.js";

const apiKey = process.env.AZURE_SPEECH_KEY?.trim();
const region = process.env.AZURE_SPEECH_REGION?.trim();
if (!apiKey || !region) {
  throw new Error("Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION privately before the live smoke test.");
}

const config = sdk.SpeechConfig.fromSubscription(apiKey, region);
config.speechSynthesisVoiceName = "en-US-JennyNeural";
config.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Raw8Khz8BitMonoMULaw;
const synthesizer = new sdk.SpeechSynthesizer(config, null);
const synthesis = Promise.withResolvers();
const timeout = setTimeout(() => synthesis.reject(new Error("Synthetic speech timed out.")), 30_000);
let audio;
try {
  synthesizer.speakTextAsync(
    "The quick brown fox jumps over the lazy dog.",
    (result) => {
      if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
        synthesis.reject(new Error("Azure could not synthesize the smoke-test sentence."));
      } else {
        synthesis.resolve(Buffer.from(result.audioData));
      }
    },
    () => synthesis.reject(new Error("Azure synthesis failed; check credentials and connectivity.")),
  );
  audio = await synthesis.promise;
} finally {
  clearTimeout(timeout);
  synthesizer.close();
}

const final = Promise.withResolvers();
const timer = setTimeout(() => final.reject(new Error("Dictation did not return final words.")), 30_000);
const provider = buildAzureDictationProvider();
const session = provider.createSession({
  providerConfig: { apiKey, region },
  onTranscript: (text) => {
    if (text.toLowerCase().includes("lazy dog")) {
      final.resolve(text);
    }
  },
  onError: (error) => final.reject(error),
});
try {
  const [, text] = await Promise.all([
    (async () => {
      await session.connect();
      session.sendAudio(audio);
      session.close();
    })(),
    final.promise,
  ]);
  assert.match(text.toLowerCase(), /quick brown fox/);
  console.log("PASS: Azure dictation recognized the synthetic sentence, including final words after Stop.");
} finally {
  clearTimeout(timer);
  session.close();
}
