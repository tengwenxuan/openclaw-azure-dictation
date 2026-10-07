import type {
  OpenClawConfig,
  RealtimeTranscriptionProviderPlugin,
} from "openclaw/plugin-sdk/plugin-entry";
import { normalizeResolvedSecretInputString } from "openclaw/plugin-sdk/secret-input";
import {
  asOptionalRecord,
  normalizeOptionalString,
} from "openclaw/plugin-sdk/string-coerce-runtime";
import { createAzureSpeechTranscriptionSession } from "./session.js";

function resolveConfig(raw: Record<string, unknown>, cfg?: OpenClawConfig) {
  const local = asOptionalRecord(cfg?.plugins?.entries?.["azure-dictation"]?.config);
  const tts = cfg?.tts?.providers;
  const inherited = asOptionalRecord(tts?.["azure-speech"]) ?? asOptionalRecord(tts?.azure);
  const model = normalizeOptionalString(raw.model);
  const apiKey = normalizeResolvedSecretInputString({
    value: raw.apiKey ?? local?.apiKey ?? inherited?.apiKey,
    path:
      raw.apiKey !== undefined
        ? "plugins.entries.voice-call.config.streaming.providers.azure-dictation.apiKey"
        : local?.apiKey !== undefined
          ? "plugins.entries.azure-dictation.config.apiKey"
          : "tts.providers.azure-speech.apiKey",
  });
  return {
    ...(model ? { model } : {}),
    apiKey:
      apiKey ??
      normalizeOptionalString(process.env.AZURE_SPEECH_KEY) ??
      normalizeOptionalString(process.env.AZURE_SPEECH_API_KEY) ??
      normalizeOptionalString(process.env.SPEECH_KEY),
    region:
      normalizeOptionalString(raw.region) ??
      normalizeOptionalString(local?.region) ??
      normalizeOptionalString(inherited?.region) ??
      normalizeOptionalString(process.env.AZURE_SPEECH_REGION) ??
      normalizeOptionalString(process.env.SPEECH_REGION),
    language:
      normalizeOptionalString(raw.language) ??
      normalizeOptionalString(local?.language) ??
      normalizeOptionalString(inherited?.lang) ??
      "en-US",
  };
}

export function buildAzureDictationProvider(): RealtimeTranscriptionProviderPlugin {
  return {
    id: "azure-dictation",
    label: "Azure Dictation",
    autoSelectOrder: Number.MAX_SAFE_INTEGER,
    resolveConfig: ({ cfg, rawConfig }) => resolveConfig(rawConfig, cfg),
    isConfigured: ({ cfg, providerConfig }) => {
      const config = resolveConfig(providerConfig, cfg);
      return Boolean(config.apiKey && config.region && /^[a-z0-9]+$/.test(config.region));
    },
    createSession: (request) => {
      const config = resolveConfig(request.providerConfig, request.cfg);
      if (!config.apiKey) {
        throw new Error("Azure Speech API key missing. Configure AZURE_SPEECH_KEY.");
      }
      if (!config.region || !/^[a-z0-9]+$/.test(config.region)) {
        throw new Error(
          "Azure dictation requires a resource region, such as eastus. Configure AZURE_SPEECH_REGION.",
        );
      }
      if (config.model) {
        throw new Error(
          "Azure dictation uses the standard recognition model; remove the transcription model override.",
        );
      }
      return createAzureSpeechTranscriptionSession({
        ...request,
        apiKey: config.apiKey,
        region: config.region,
        language: config.language,
      });
    },
  };
}
