/* Provider catalog — the single registry of every AI backend SparkPilot
   supports. Adding a new OpenAI-compatible host is a one-liner here; no
   new engine class is required.

   The UI (Onboarding, Settings) reads this catalog to render the provider
   picker cards, key inputs, and base-URL fields. The engine factory
   (index.ts) reads it to map a ProviderId → concrete Engine instance.

   NOTE: each provider's *capabilities* (chat, transcription, TTS,
   embeddings) are declared by the engine it instantiates, not here — some
   providers expose more endpoints than others (e.g. OpenAI has TTS +
   Whisper; Anthropic has neither). A provider entry here only fixes
   identity, auth shape, and the default base URL/model. */

import type { ProviderId, ProviderMeta } from "../types";

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    family: "openai",
    baseUrl: "https://api.openai.com/v1",
    needsKey: true,
    keyPlaceholder: "sk-…",
    keyUrl: "https://platform.openai.com/api-keys",
    blurb: "GPT-4o, Whisper, TTS, embeddings — the full first-party stack.",
    defaultModel: "",
    editableBaseUrl: false,
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    family: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    needsKey: true,
    keyPlaceholder: "sk-ant-…",
    keyUrl: "https://console.anthropic.com/settings/keys",
    blurb: "Claude 3.5 Sonnet & Haiku — great notes and chat. No audio.",
    defaultModel: "",
    editableBaseUrl: false,
  },
  google: {
    id: "google",
    label: "Google Gemini",
    family: "google",
    baseUrl: "https://generativelanguage.googleapis.com",
    needsKey: true,
    keyPlaceholder: "AIza…",
    keyUrl: "https://aistudio.google.com/apikey",
    blurb: "Gemini 2.0 Flash & Pro — fast multimodal models from Google AI.",
    defaultModel: "gemini-2.0-flash",
    editableBaseUrl: false,
  },
  nvidia: {
    id: "nvidia",
    label: "NVIDIA NIM",
    family: "openai-compat",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    needsKey: true,
    keyPlaceholder: "nvapi-…",
    keyUrl: "https://build.nvidia.com",
    blurb: "Hosted open models (Llama, Qwen, Mistral…) on NVIDIA's infra.",
    defaultModel: "meta/llama-3.3-70b-instruct",
    editableBaseUrl: true,
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    family: "openai-compat",
    baseUrl: "https://openrouter.ai/api/v1",
    needsKey: true,
    keyPlaceholder: "sk-or-…",
    keyUrl: "https://openrouter.ai/keys",
    blurb: "One key, 200+ models from every major lab — easy swapping.",
    defaultModel: "openai/gpt-4o-mini",
    editableBaseUrl: true,
  },
  fireworks: {
    id: "fireworks",
    label: "Fireworks AI",
    family: "openai-compat",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    needsKey: true,
    keyPlaceholder: "fw_…",
    keyUrl: "https://fireworks.ai/api-keys",
    blurb: "Fast serverless inference for Llama, Mixtral, DeepSeek & more.",
    defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    editableBaseUrl: true,
  },
  novita: {
    id: "novita",
    label: "Novita AI",
    family: "openai-compat",
    baseUrl: "https://api.novita.ai/v3/openai",
    needsKey: true,
    keyPlaceholder: "nv_… или sk_…",
    keyUrl: "https://novita.ai/dashboard/key",
    blurb: "Cheap, pay-as-you-go access to dozens of popular models.",
    defaultModel: "deepseek/deepseek-v3-0324",
    editableBaseUrl: true,
  },
  huggingface: {
    id: "huggingface",
    label: "Hugging Face",
    family: "openai-compat",
    baseUrl: "https://api.endpoints.huggingface.co/v2",
    needsKey: true,
    keyPlaceholder: "hf_…",
    keyUrl: "https://huggingface.co/settings/tokens",
    blurb: "Inference Endpoints + the serverless Inference API (TGI).",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct",
    editableBaseUrl: true,
  },
  zai: {
    id: "zai",
    label: "z.ai",
    family: "openai-compat",
    baseUrl: "https://api.z.ai/api/paas/v4",
    needsKey: true,
    keyPlaceholder: "…",
    keyUrl: "https://z.ai",
    blurb: "GLM-4 and GLM-5 family models (Zhipu AI) via OpenAI-compat API.",
    defaultModel: "glm-4-plus",
    editableBaseUrl: true,
  },
  local: {
    id: "local",
    label: "Local (Ollama)",
    family: "local",
    baseUrl: "http://localhost:11434",
    needsKey: false,
    blurb: "Fully offline. No key, no cloud — runs on your device.",
    defaultModel: "qwen2.5:3b",
    editableBaseUrl: true,
  },
};

/* Cloud providers only — used by Onboarding/Settings to render the picker. */
export const CLOUD_PROVIDERS: ProviderMeta[] = Object.values(PROVIDERS).filter(
  (p) => p.family !== "local",
);

export const LOCAL_PROVIDER = PROVIDERS.local;

export function getProvider(id: ProviderId): ProviderMeta {
  const p = PROVIDERS[id];
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}
