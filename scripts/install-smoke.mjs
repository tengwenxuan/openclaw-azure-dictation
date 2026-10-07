import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const archive = path.resolve(process.argv[2] ?? "");
assert.ok(process.argv[2], "Pass the npm-pack tarball to test.");
const artifacts = path.join(root, "artifacts");
mkdirSync(artifacts, { recursive: true });
const home = mkdtempSync(path.join(artifacts, "install-smoke-"));
const state = path.join(home, ".openclaw");
const env = {
  PATH: process.env.PATH,
  HOME: home,
  OPENCLAW_HOME: home,
  OPENCLAW_STATE_DIR: state,
  OPENCLAW_CONFIG_PATH: path.join(state, "openclaw.json"),
  OPENCLAW_AUTH_PROFILE_SECRET_DIR: path.join(home, "auth-secrets"),
  AZURE_SPEECH_KEY: "synthetic-install-proof-not-a-real-key",
  AZURE_SPEECH_REGION: "eastus",
  CI: "1",
  OPENCLAW_GATEWAY_TOKEN: "synthetic-install-smoke-gateway-token",
};
for (const key of ["HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY"]) {
  if (process.env[key]) {
    env[key] = process.env[key];
  }
}
const cli = (...args) => execFileSync(
  process.execPath,
  [path.join(root, "node_modules/openclaw/openclaw.mjs"), ...args],
  { cwd: root, env, encoding: "utf8", timeout: 180_000, maxBuffer: 4 * 1024 * 1024 },
);
let gateway;
let gatewayExit;
try {
  cli("config", "set", "plugins.allow", '["azure-speech"]', "--strict-json");
  cli("plugins", "install", `npm-pack:${archive}`, "--force", "--accept-capabilities");
  const report = JSON.parse(cli("plugins", "inspect", "azure-dictation", "--runtime", "--json"));
  const serialized = JSON.stringify(report);
  assert.ok(serialized.includes("azure-dictation"), "Installed plugin is missing from runtime inspection.");
  const status = JSON.parse(cli("plugins", "list", "--json"));
  const installed = status.plugins.find((plugin) => plugin.id === "azure-dictation");
  assert.equal(installed?.status, "loaded", "The installed package did not load.");
  assert.equal(installed?.version, "0.1.0");

  const entry = await import(pathToFileURL(installed.source).href);
  const registered = [];
  entry.default.register({
    registerRealtimeTranscriptionProvider: (provider) => registered.push(provider),
  });
  assert.equal(registered.length, 1);
  assert.equal(registered[0].id, "azure-dictation");
  assert.equal(registered[0].isConfigured({
    cfg: { tts: { providers: { "azure-speech": {
      apiKey: "synthetic-install-proof-not-a-real-key", region: "eastus",
    } } } },
    providerConfig: {},
  }), true);

  const listener = net.createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  cli("config", "set", "gateway.mode", "local");
  gateway = spawn(process.execPath, [
    path.join(root, "node_modules/openclaw/openclaw.mjs"),
    "gateway", "--bind", "loopback", "--port", String(port),
  ], { cwd: root, env, stdio: "ignore" });
  gatewayExit = once(gateway, "exit");
  let healthy = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (gateway.exitCode !== null) {
      throw new Error(`Isolated smoke Gateway exited with ${gateway.exitCode}`);
    }
    try {
      healthy = (await fetch(`http://127.0.0.1:${port}/healthz`)).ok;
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
    if (healthy) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.ok(healthy, "Isolated smoke Gateway did not become ready.");
  const catalog = JSON.parse(cli("gateway", "call", "talk.catalog", "--json",
    "--url", `ws://127.0.0.1:${port}`, "--token", env.OPENCLAW_GATEWAY_TOKEN));
  const dictation = catalog.transcription.providers.find((provider) => provider.id === "azure-dictation");
  assert.equal(dictation?.configured, true,
    `Installed Azure dictation is not ready in the live catalog: ${JSON.stringify(catalog.transcription)}`);
  assert.equal(catalog.transcription.ready, true);
  assert.ok(catalog.speech.providers.some((provider) => provider.id === "azure-speech"),
    `Bundled Azure TTS is not independently discoverable: ${JSON.stringify(catalog.speech)}`);
  console.log("PASS: npm-pack installation, dependency resolution, live Gateway dictation readiness, and Azure TTS coexistence.");
} finally {
  if (gateway && gateway.exitCode === null) {
    gateway.kill("SIGTERM");
    const deadline = setTimeout(() => gateway.kill("SIGKILL"), 360_000);
    try {
      await gatewayExit;
    } finally {
      clearTimeout(deadline);
    }
  }
  rmSync(home, { recursive: true, force: true });
}
