# ⚡ SparkPilot

> **Your study notes, generated from anything — and you own every byte.**

Take a lecture recording, a PDF, a YouTube video, or even a webpage, and SparkPilot turns it into structured notes (with real math), flashcards, quizzes, and a chatbot that actually knows the material. It lives on your laptop, not in someone's cloud. No account, no subscription, no data leaving your machine unless you say so.

---

## 📥 Getting the app

**Pick your platform, download, open. That's the whole install.**

| Platform | Link |
| --- | --- |
| 🍎 **macOS** — Apple Silicon (M1/M2/M3/M4, most Macs from ~2020 on) | [Download for Mac (Apple Silicon)](https://github.com/ronavkarumsi04/SparkPilot/releases/latest/download/SparkPilot-mac-arm64.dmg) |
| 🍎 **macOS** — Intel | [Download for Mac (Intel)](https://github.com/ronavkarumsi04/SparkPilot/releases/latest/download/SparkPilot-mac-x64.dmg) |
| 🪟 **Windows** 10/11 | [Download for Windows (.exe)](https://github.com/ronavkarumsi04/SparkPilot/releases/latest/download/SparkPilot-Setup-Windows.exe) |

> **Not sure which Mac?** Apple menu (顶部左角) → **About This Mac**. If it lists an **M-series** chip → Apple Silicon. If it says **Intel** → use the Intel build.

> 📦 **Prefer the source?** Developers should [run it from source](#-running-from-source) instead of the installer — that way you can tweak it. All past versions are on the full [Releases page](https://github.com/ronavkarumsi04/SparkPilot/releases).

### What happens on first launch

**macOS** — Just double-click. No warnings (the build is signed + notarized). ✅

**Windows** — You'll see a blue *"Windows protected your PC"* popup the first time. That's normal for any unsigned app — it's not a virus, it's SmartScreen being cautious. Here's what to do:

1. Click **More info** in that popup.
2. Click **Run anyway** at the bottom.
3. Windows remembers — you won't see it again.

If **Run anyway** doesn't appear: right-click the downloaded `.exe` → **Properties** → tick **Unblock** → **OK** → run it.

> 🔐 For maintainers: that SmartScreen warning goes away entirely once you sign Windows builds with an Authenticode cert (`WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` secrets). See [Signing your own builds](#-signing-your-own-builds).

---

## 🔧 How it works under the hood

When you launch SparkPilot, it spins up a **tiny local server** on your machine, opens a window into it, and keeps it alive while you study. When you quit, it shuts down cleanly. That server does the things a plain web page can't — pulling YouTube transcripts via `yt-dlp` and managing local AI models via Ollama — so **you never install those tools manually.**

All your notes live in a local database on your disk. Export everything anytime from Settings.

---

## 🧠 Pick your AI engine

One of the first things you'll choose is *where* the AI runs. You can flip between these anytime in Settings.

### 🏠 Run locally (free, offline)
SparkPilot auto-installs [Ollama](https://ollama.com) and pulls a small capable model (~2 GB, one time). After that everything runs on your device — no key, no cloud, no bill. Cloud-mode users never download a model, so if you skip local, you skip the download too.

### 🔑 Bring your own key (10 providers)

Paste a key from whichever provider you already use. Your key lives in your OS keychain (macOS Keychain / Windows Credential Manager) — never in a config file, never sent anywhere except your chosen provider.

SparkPilot talks to **every major LLM host** directly:

| Provider | Best at | Get a key |
| --- | --- | --- |
| **OpenAI** | Full stack — GPT-4o, Whisper transcription, TTS voices, embeddings | [platform.openai.com](https://platform.openai.com/api-keys) |
| **Anthropic** | Claude 3.5 Sonnet/Haiku — great notes and chat | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| **Google Gemini** | Gemini 2.0 Flash & Pro — fast multimodal from Google AI Studio | [aistudio.google.com](https://aistudio.google.com/apikey) |
| **NVIDIA NIM** | Hosted open models (Llama, Qwen, Mistral…) on NVIDIA infra | [build.nvidia.com](https://build.nvidia.com) |
| **OpenRouter** | One key → 200+ models from every lab — easy A/B swapping | [openrouter.ai](https://openrouter.ai/keys) |
| **Fireworks AI** | Fast serverless inference for Llama, Mixtral, DeepSeek | [fireworks.ai](https://fireworks.ai/api-keys) |
| **Novita AI** | Cheap pay-as-you-go for dozens of popular models | [novita.ai](https://novita.ai/dashboard/key) |
| **Hugging Face** | Inference Endpoints + the serverless TGI API | [huggingface.co](https://huggingface.co/settings/tokens) |
| **z.ai** | GLM-4 / GLM-5 family (Zhipu AI) | [z.ai](https://z.ai) |
| **Local (Ollama)** | Offline-only. No key needed. | — |

**Adding a new OpenAI-compatible host is a one-liner** in `src/lib/engine/providers.ts` — no new engine class needed. See [Adding a new provider](#-adding-a-new-provider) below.

---

## 💻 Running from source

You'll need **Node ≥ 20.19** (not 21.x — use 20.19+ or 22 LTS).

```bash
git clone https://github.com/ronavkarumsi04/SparkPilot.git
cd SparkPilot
npm install

npm run dev       # Vite dev server with hot reload + YouTube helper
npm run serve     # production build + local helpers at http://localhost:4180
npm run app       # build + launch the full Electron desktop shell
```

**Build installers:**

```bash
npm run dist:mac   # → release/SparkPilot-<version>-<arch>.dmg
npm run dist:win   # → release/SparkPilot-Setup-<version>.exe
```

Or let CI handle it — push a tag (`git tag v0.2.0 && git push --tags`) and the
[release workflow](.github/workflows/release.yml) builds macOS + Windows
installers and attaches them to a GitHub Release. Other scripts: `npm test` (Vitest), `npm run typecheck`.

### 📂 Project layout

```
src/            React app — UI + engine + ingest + generation (TypeScript)
  lib/engine/   provider abstraction
                  ├ OpenAICompatEngine  → OpenAI + every compat host (NIM, OpenRouter, Fireworks, Novita, HF, z.ai)
                  ├ AnthropicEngine     → Claude Messages API
                  ├ GoogleEngine        → Gemini Generative Language API
                  └ LocalEngine        → Ollama (offline)
  lib/ingest/     text / url / youtube / pdf / docx / audio → normalized text
  lib/generation/ notes, flashcards, quiz, podcast, chat
server/         local server the desktop shell runs
  httpServer.mjs  serves the built app + /api/youtube-extract + /api/local/*
  ytdlp.mjs       yt-dlp download + caption/audio extraction
  ollama.mjs      Ollama install / serve / model-pull
electron/       desktop shell (starts server, opens window)
```

### ➕ Adding a new provider

1. **Add an entry** to `PROVIDERS` in `src/lib/engine/providers.ts` — `id`, `label`, `family`, `baseUrl`, `keyPlaceholder`, `keyUrl`, `blurb`, `defaultModel`.
2. **If the provider speaks the OpenAI REST dialect** (most do), set `family: "openai-compat"` and done. `OpenAICompatEngine` handles the rest. Update `capabilitiesFor` in `index.ts` if it also exposes transcription/TTS/embeddings.
3. **If the provider has its own protocol** (like Anthropic or Gemini), add a new engine class in `src/lib/engine/` and a `case` branch in the factory (`index.ts`).

---

## 🔏 Signing your own builds

Out of the box the release workflow produces **ad-hoc-signed** builds — valid but not notarized, so users get a one-time OS warning. If you have certificates, add them as **GitHub repo secrets** (Settings → Secrets → Actions) and every tagged build is auto-signed — installers open with **no warning**.

**macOS** (needs a paid [Apple Developer](https://developer.apple.com) account + *Developer ID Application* cert):

| Secret | What it is |
| --- | --- |
| `CSC_LINK` | Your Developer ID cert, exported as `.p12`, base64-encoded: `base64 -i cert.p12 \| pbcopy` |
| `CSC_KEY_PASSWORD` | The `.p12` export password |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | An [app-specific password](https://support.apple.com/en-us/102654) for that ID |
| `APPLE_TEAM_ID` | Your 10-char Team ID (Apple Developer → Membership) |

**Windows** (optional — needs an Authenticode code-signing cert):

| Secret | What it is |
| --- | --- |
| `WIN_CSC_LINK` | Your code-signing cert as a base64-encoded `.pfx` |
| `WIN_CSC_KEY_PASSWORD` | The `.pfx` password |

Cut a release: `git tag v0.2.0 && git push --tags`. Nothing else to configure.

---

## 🧱 Tech stack

React 19 · Vite · Tailwind v4 · Electron · Ollama (local) · OpenAI / Anthropic / Google / NVIDIA NIM / OpenRouter / Fireworks / Novita / Hugging Face / z.ai (cloud) · KaTeX math · FSRS spaced repetition. **No backend, no telemetry, no account.**

## 📜 License

[AGPL-3.0-or-later](LICENSE). Fork it, ship it, improve it — just keep it open.

---

> [!IMPORTANT]
> **This is a starting point, not a finished product.** It's an open-source foundation meant to be forked, extended, and improved. It works and it's genuinely useful, but expect rough edges — treat it as a solid base to build on rather than a polished commercial app.

> [!NOTE]
> **Windows + macOS both tested and working.** Windows caveat: auto-setup of the local AI runtime (Ollama) isn't wired up there yet — install [Ollama](https://ollama.com/download) once and SparkPilot will use it, or just use a cloud key. macOS handles it automatically.
