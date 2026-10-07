import type { PluginCapabilityCatalog } from "openclaw/plugin-sdk/plugin-entry";
import { buildAzureDictationProvider } from "./provider.js";

export default {
  realtimeTranscriptionProviders: [buildAzureDictationProvider()],
} satisfies PluginCapabilityCatalog;
