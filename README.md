# Azure Dictation for OpenClaw

An independent community plugin that uses **Azure Speech** to turn dashboard
microphone input into an editable chat draft. It does not replace the bundled
Azure Speech text-to-speech plugin.

- Package: `@tengwenxuan/openclaw-azure-dictation`
- Plugin and transcription-provider ID: `azure-dictation`
- Tested hosts: **OpenClaw 2026.9.8 and 2026.10.1**, on Linux x64 with Node 24
- Node requirement: 24.16+ within Node 24, or 26.1+
- License: MIT; see [NOTICE](NOTICE) for source attribution

OpenClaw's plugin APIs are experimental. Version 0.1.1 requires OpenClaw
**2026.9.8 or newer**, replacing v0.1.0's exact-version restriction. The declared
range permits later hosts; the tested versions above do not guarantee
compatibility with every future release.

## Install

```bash
openclaw plugins install clawhub:@tengwenxuan/openclaw-azure-dictation@0.1.1
```

Review and approve the installer's declared transcription capability. If you
maintain a `plugins.allow` list, add `azure-dictation` without removing the other
plugins you use. Restart through your normal deployment owner only if OpenClaw
requests it. Docker users should use their existing Compose file set and
persistent state, not install an unrelated host Gateway.

Until ClawHub finishes its publication/security checks, a submitted version may
not be publicly installable.

## Configure

The simplest setup is to supply these variables to the **Gateway process**:

```text
AZURE_SPEECH_KEY=<your-speech-resource-key>
AZURE_SPEECH_REGION=eastus
```

Use an Azure **Speech** resource key, not an Azure OpenAI key or a Copilot
subscription. Existing `tts.providers["azure-speech"].apiKey`, `.region`, and
`.lang` settings are reused, including host-resolved credentials. Spoken replies
do not need to be enabled.

You can also configure **Plugins > Azure Dictation** in the dashboard, or set:

```json
{
  "plugins": {
    "entries": {
      "azure-dictation": {
        "enabled": true,
        "config": {
          "region": "eastus",
          "language": "en-US"
        }
      }
    }
  }
}
```

The optional plugin `apiKey` field is marked sensitive. Prefer process
environment or an existing host-managed secret source; never commit real keys.

Precedence is explicit transcription-session configuration, this plugin's
configuration, existing Azure TTS configuration, then environment. Recognition
defaults to `en-US`. Key environment aliases are `AZURE_SPEECH_API_KEY` and
`SPEECH_KEY`; the region alias is `SPEECH_REGION`.

This provider is the **last automatic choice**. An existing explicitly selected
transcription provider stays selected. To choose this provider explicitly on
OpenClaw 2026.9.8, merge the following into the existing config without replacing
other plugin settings:

```json
{
  "plugins": {
    "entries": {
      "voice-call": {
        "config": {
          "streaming": {
            "provider": "azure-dictation"
          }
        }
      }
    }
  }
}
```

This is the host's shared transcription selection path; it does **not** start a
phone call or require enabling a telephone integration. Do not select
`azure-speech` for this plugin; that ID remains owned by the bundled TTS plugin.

Check readiness without recording:

```bash
openclaw plugins inspect azure-dictation --runtime --json
openclaw gateway call talk.catalog --json
```

The transcription catalog should list `azure-dictation` as configured. Readiness
checks verify configuration presence, not the remote key's validity.

## Dictate

Open the dashboard using HTTPS or `http://localhost`, allow microphone access,
and use the existing dictation control. Partial words appear in the draft.
**Stop and keep text** finishes recognition; **Cancel** discards the dictated
text. Nothing is sent as a chat message until you choose Send.

This is **draft dictation only**. It does not provide uploaded-file/voice-note
transcription, voice responses, realtime assistant conversations, Custom Speech
deployments, or custom/private/sovereign endpoints. TTS endpoint URLs are not
reused for recognition; a resource region is required. There is no model picker:
the provider uses Azure's standard recognition model for the chosen language.

## Privacy, permissions, and costs

- Microphone audio is streamed from the browser through your Gateway to Azure
  Speech. Normal Azure Speech usage charges apply.
- The key remains on the Gateway and is sent to Azure for authentication.
- The plugin declares only a realtime transcription provider. It registers no
  agent tools, shell commands, cron jobs, or filesystem-writing services.
- It does not write raw microphone recordings to disk. Recognized text follows
  OpenClaw's normal draft/chat lifecycle and Azure's service policies.
- Microsoft's SDK is loaded only when a transcription session connects.
- Pending audio, transcript sizes, connection startup, and final-result draining
  are bounded. Provider errors are reported without raw SDK credential details.
- No automatic fallback to a different cloud provider happens after an error.

All code plugins execute in the trusted Gateway process; this capability
description is not an operating-system sandbox.

## Update or remove

To move from the exact v0.1.0 pin to this release:

```bash
openclaw plugins install clawhub:@tengwenxuan/openclaw-azure-dictation@0.1.1 --force
```

For subsequent updates:

```bash
openclaw plugins update azure-dictation
```

Exact ClawHub pins may need an explicit versioned install with `--force` instead;
follow the update command's guidance and review capability changes.

```bash
openclaw plugins uninstall azure-dictation
```

The bundled Azure TTS plugin and its configuration are independent and remain
available.

## Develop and verify

```bash
npm ci
npm run build
npm run typecheck
npm test
mkdir -p artifacts
npm pack --pack-destination artifacts
npm run test:install -- artifacts/tengwenxuan-openclaw-azure-dictation-0.1.1.tgz
clawhub package validate .
clawhub package publish . --dry-run
```

Unit tests use the real SDK types with its service boundary mocked. They cover
credential precedence, bounded audio, partial/final delivery, cancellation,
missing service completion, error redaction, and coexistence with Azure TTS.

The install check uses a disposable local state directory and a loopback-only Gateway, verifies
the actual npm-pack install and transcription catalog alongside Azure TTS, and
removes that test state afterward. It never reconfigures your real Gateway.

Version 0.1.0 verification on OpenClaw 2026.9.8 / Linux x64 / Node 24:
15 unit tests, build and test type checks, ClawHub static validation, managed
tarball installation, a live local Gateway catalog with Azure TTS and dictation
coexisting, and a real Azure synthetic-speech recognition round trip.

Optional live test, with Speech credentials provided privately:

```bash
AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=... npm run test:live
```

It synthesizes one short test sentence and transcribes it through the built
plugin, including the final words after Stop. This uses Azure synthesis and
recognition and may incur small normal service charges. It never reads your
OpenClaw state or starts a Gateway.

## Publish to ClawHub

Publishing requires GitHub-backed source provenance and a ClawHub account whose
handle matches the package scope. Do not use `clawhub skill publish`: this is a
**code plugin**, not a skill.

```bash
npm run build
npm run typecheck
npm test
clawhub package validate .
clawhub login
clawhub whoami
clawhub package publish . --family code-plugin --owner tengwenxuan --dry-run
clawhub package publish . --family code-plugin --owner tengwenxuan --wait
```

Commit and push the source before publishing. For byte-identical release
verification, publish the tested `npm pack` tarball and pass the repository and
exact source commit if the CLI cannot infer them from the archive.

Publication is complete only after ClawHub's checks finish and the exact version
is publicly downloadable. Check with `clawhub package inspect` and
`clawhub package download`. Do not republish the same version with different
contents.

Canonical guidance: [ClawHub publishing](https://docs.openclaw.ai/clawhub/publishing)
and [plugin validation fixes](https://docs.openclaw.ai/clawhub/plugin-validation-fixes).
