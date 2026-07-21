# SparkPilot

**Turn any lecture, PDF, or video into study notes, flashcards, quizzes, and a study chat — free, open source, and private by default.**

## Why SparkPilot

SparkPilot is an open-source, local-first study app. Point it at a document, a website, a YouTube link, or an audio file and it generates clean notes (with math), spaced-repetition flashcards, quizzes, and a chat that knows your material. You can run it **fully locally** (no account, no cloud, nothing leaves your machine) or **bring your own key** from any of the providers below. There is no SparkPilot subscription, ever.

## Supported providers

SparkPilot supports bring-your-own-key for every major LLM provider, plus a fully-local mode:

| Provider | Family | Notes |
| --- | --- | --- |
| **OpenAI** | Native | GPT-4o, Whisper, TTS, embeddings — the full first-party stack. |
| **Anthropic** | Native | Claude 3.5 Sonnet & Haiku — great notes and chat. No audio. |
| **Google Gemini** | Native | Gemini 2.0 Flash & Pro — fast multimodal models from Google AI. |
| **NVIDIA NIM** | OpenAI-compatible | Hosted open models (Llama, Qwen, Mistral…) on NVIDIA's infra. |
| **OpenRouter** | OpenAI-compatible | One key, 200+ models from every major lab — easy swapping. |
| **Fireworks AI** | OpenAI-compatible | Fast serverless inference for Llama, Mixtral, DeepSeek & more. |
| **Novita AI** | OpenAI-compatible | Cheap, pay-as-you-go access to dozens of popular models. |
| **Hugging Face** | OpenAI-compatible | Inference Endpoints + the serverless Inference API (TGI). |
| **z.ai** | OpenAI-compatible | GLM-4 and GLM-5 family models (Zhipu AI). |
| **Local (Ollama)** | Local | Fully offline. No key, no cloud — runs on your device. |

Adding a new OpenAI-compatible host is a one-liner in `src/lib/engine/providers.ts` — no new engine class required.

## For developers

Requires **Node ≥ 20.19** (Node 21.x is not supported — use 20.19+ or 22 LTS).

```bash
git clone https://github.com/ronavk/SparkPilot.git
cd SparkPilot
npm install

npm run dev      # Vite dev server (hot reload) — includes the YouTube helper
npm run serve    # build once, then serve the app + helpers at http://localhost:4180
npm run app      # build, then launch the full desktop shell (Electron)
```

Build installers locally:

```bash
npm run dist:mac   # → release/SparkPilot-<version>-<arch>.dmg
npm run dist:win   # → release/SparkPilot-Setup-<version>.exe
```

Or let CI do it: push a tag (`git tag v0.1.0 && git push --tags`) and the
[release workflow](.github/workflows/release.yml) builds macOS + Windows
installers and attaches them to a GitHub Release.

Other scripts: `npm test` (Vitest), `npm run typecheck`.

### Project layout

```
src/            React app (UI + all generation/engine/ingest logic, TypeScript)
  lib/engine/   provider abstraction: OpenAI, Anthropic, Google Gemini, and any
                OpenAI-compatible host (NIM, OpenRouter, Fireworks, Novita,
                Hugging Face, z.ai) + local Ollama
  lib/ingest/   text / url / youtube / pdf / docx / audio → normalized text
  lib/generation/  notes, flashcards, quiz, podcast, chat
server/         the local server the desktop shell runs
  httpServer.mjs  serves the built app + /api/youtube-extract + /api/local/*
  ytdlp.mjs       yt-dlp download + caption/audio extraction
  ollama.mjs      Ollama install / serve / model-pull lifecycle
electron/       the desktop shell (starts the server, opens the window)
```

### Adding a new provider

1. Add an entry to `PROVIDERS` in `src/lib/engine/providers.ts` with the
   provider's `id`, `label`, `family`, `baseUrl`, `keyPlaceholder`, `keyUrl`,
   `blurb`, and `defaultModel`.
2. If the provider speaks the OpenAI REST API dialect (most do), set
   `family: "openai-compat"` and you're done — the `OpenAICompatEngine`
   handles the rest. Update `capabilitiesFor` in `src/lib/engine/index.ts`
   if the provider also supports transcription/TTS/embeddings.
3. If the provider speaks its own protocol (like Anthropic Messages or
   Google Generative Language), add a new engine class in
   `src/lib/engine/` and a `case` branch in the factory (`index.ts`).

## Tech

React 19 · Vite · Tailwind v4 · Electron shell · Ollama (local) · OpenAI / Anthropic / Google / NVIDIA NIM / OpenRouter / Fireworks / Novita / Hugging Face / z.ai (cloud) · KaTeX · FSRS spaced repetition. No backend, no telemetry, no account.

## License

[AGPL-3.0-or-later](LICENSE). Fork it, ship it, improve it — just keep it open.
