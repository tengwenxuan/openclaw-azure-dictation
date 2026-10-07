import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { buildAzureDictationProvider } from "./provider.js";

export default definePluginEntry({
  id: "azure-dictation",
  name: "Azure Dictation",
  description: "Azure Speech streaming dictation for dashboard drafts",
  register(api) {
    api.registerRealtimeTranscriptionProvider(buildAzureDictationProvider());
  },
});
