/* Engine factory. This is the single entry point generation/UI code should
   use to get an Engine — never `new` a provider class directly, so switching
   providers/modes stays a one-line change at the call site.

   The factory reads the provider catalog (providers.ts) to figure out which
   concrete Engine subclass to instantiate. Adding a new OpenAI-compatible
   host means adding its ProviderId entry to providers.ts — no factory change
   required. */

import type { EngineMode, ProviderId } from "../types";
import type { Engine } from "./types";
import { EngineError } from "./types";
import { AnthropicEngine } from "./anthropic";
import { GoogleEngine } from "./google";
import { LocalEngine } from "./local";
import { OpenAICompatEngine } from "./openai-compat";
import { getProvider } from "./providers";

export * from "./types";
export * from "./providers";

export interface CreateEngineOptions {
  mode: EngineMode;
  provider?: ProviderId;
  apiKey?: string;
  model?: string;
  localBaseUrl?: string;
  baseUrl?: string;
}

export function createEngine(opts: CreateEngineOptions): Engine {
  if (opts.mode === "local") {
    return new LocalEngine(opts.localBaseUrl, opts.model);
  }

  if (!opts.apiKey) {
    throw new EngineError("An API key is required for cloud mode.", "auth");
  }

  const providerId = opts.provider;
  if (!providerId) {
    throw new EngineError("A provider is required for cloud mode.", "unknown");
  }

  const meta = getProvider(providerId);
  const baseUrl = (opts.baseUrl ?? meta.baseUrl).replace(/\/$/, "");
  const model = opts.model || meta.defaultModel || undefined;

  switch (meta.family) {
    case "anthropic":
      return new AnthropicEngine(opts.apiKey, model, baseUrl);

    case "google":
      return new GoogleEngine(opts.apiKey, model, baseUrl);

    case "local":
      return new LocalEngine(baseUrl, model);

    case "openai":
    case "openai-compat":
      /* Native OpenAI and every OpenAI-compatible host use the same wire
         shape. The host-specific bits (capabilities, structured mode,
         extra headers) are selected by provider id. */
      return new OpenAICompatEngine({
        provider: providerId,
        apiKey: opts.apiKey,
        baseUrl,
        modelOverride: model,
        defaultModel: meta.defaultModel || "gpt-4o-mini",
        strongModel: providerId === "openai" ? "gpt-4o" : undefined,
        capabilities: capabilitiesFor(providerId),
        structuredMode: providerId === "openai" ? "json_schema" : "json_prompt",
        extraHeaders: extraHeadersFor(providerId),
      });

    default:
      throw new EngineError(`Unsupported provider: ${providerId}`, "unknown");
  }
}

/* Cheap liveness/credentials check without the caller needing to hold onto
   the Engine instance. Throws EngineError on failure. */
export async function validateCredentials(opts: CreateEngineOptions): Promise<void> {
  await createEngine(opts).validate();
}

/* Per-provider capability overrides. OpenAI's first-party API exposes the
   complete stack (chat, Whisper, TTS, embeddings). Most compat hosts
   expose only chat; a few also expose embeddings. Anything not listed here
   defaults to chat-only. */
import type { EngineCapabilities } from "./types";

function capabilitiesFor(provider: ProviderId): Partial<EngineCapabilities> {
  switch (provider) {
    case "openai":
      return { chat: true, transcription: true, tts: true, embeddings: true };
    case "openrouter":
    case "fireworks":
    case "nvidia":
    case "novita":
    case "huggingface":
    case "zai":
      return { chat: true };
    default:
      return { chat: true };
  }
}

/* OpenRouter accepts a couple of optional attribution headers — useful for
   the app to show up in OpenRouter rankings and to hint at a web client. */
function extraHeadersFor(provider: ProviderId): Record<string, string> {
  if (provider === "openrouter") {
    return {
      "HTTP-Referer": "https://github.com/ronavk/SparkPilot",
      "X-Title": "SparkPilot",
    };
  }
  return {};
}
