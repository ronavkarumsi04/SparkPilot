/* Google Gemini implementation of the Engine interface.
 *
 * Uses the Generative Language API (v1beta), the same endpoint the Google
 * AI Studio web app uses. No SDK dependency — pure fetch.
 *
 *   Stream:    POST /v1beta/models/{model}:streamGenerateContent?alt=sse&key=…
 *   Non-stream:POST /v1beta/models/{model}:generateContent?key=…
 *
 * Gemini speaks its own message shape (content parts arrays, `parts.text`),
 * so we translate to/from our flat ChatMessage[]. System instructions live
 * in `systemInstruction` rather than the messages array, matching the API.
 *
   Capabilities: chat only. Google's Gemini API doesn't expose Whisper-style
   transcription, OpenAI-style TTS, or embeddings via this endpoint, so
   those throw "unsupported". (Google Cloud has separate APIs for those.)
 */

import type {
  ChatMessage,
  CompletionOptions,
  Engine,
  EngineCapabilities,
  StructuredOptions,
  TokenHandler,
  TranscriptResult,
  TtsOptions,
} from "./types";
import { EngineError } from "./types";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
const DEFAULT_MODEL = "gemini-2.0-flash";
const UNSUPPORTED_MESSAGE =
  "Google Gemini does not support this operation via this endpoint; use an OpenAI key or local models.";

export class GoogleEngine implements Engine {
  readonly mode = "cloud" as const;
  readonly provider = "google" as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly modelOverride?: string;

  constructor(apiKey: string, modelOverride?: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.modelOverride = modelOverride;
  }

  capabilities(): EngineCapabilities {
    return { chat: true, transcription: false, tts: false, embeddings: false };
  }

  async complete(opts: CompletionOptions, onToken?: TokenHandler): Promise<string> {
    const model = this.resolveModel(opts.tier);
    const url = `${this.baseUrl}/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey)}`;

    const res = await this.post(url, this.buildBody(opts), opts.signal);
    if (!res.body) throw new EngineError("Gemini returned an empty stream.", "unknown");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          const delta: string | undefined =
            json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (delta) {
            full += delta;
            onToken?.(delta);
          }
        } catch {
          /* malformed SSE chunk; skip it */
        }
      }
    }
    return full;
  }

  async structured<T>(opts: StructuredOptions<T>): Promise<T> {
    const model = this.resolveModel(opts.tier);
    const url = `${this.baseUrl}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const body = this.buildBody(opts);
    body.generationConfig = {
      ...(body.generationConfig ?? {}),
      responseMimeType: "application/json",
      responseSchema: opts.schema,
    };

    const res = await this.post(url, body, opts.signal);
    const json = await res.json();
    const content: string | undefined =
      json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      throw new EngineError("Gemini returned no structured content.", "unknown");
    }
    return JSON.parse(content) as T;
  }

  async transcribe(_audio: Blob, _signal?: AbortSignal): Promise<TranscriptResult> {
    throw new EngineError(UNSUPPORTED_MESSAGE, "unsupported");
  }

  async tts(_text: string, _opts: TtsOptions): Promise<Blob> {
    throw new EngineError(UNSUPPORTED_MESSAGE, "unsupported");
  }

  async embed(_texts: string[], _signal?: AbortSignal): Promise<number[][]> {
    throw new EngineError(UNSUPPORTED_MESSAGE, "unsupported");
  }

  async validate(): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1beta/models?key=${encodeURIComponent(this.apiKey)}`);
    } catch (err) {
      throw toNetworkError(err);
    }
    if (res.status === 403 || res.status === 401) {
      throw new EngineError("Invalid Gemini API key.", "auth");
    }
    if (!res.ok) throw await mapError(res);
  }

  private resolveModel(_tier?: "fast" | "strong"): string {
    if (this.modelOverride) return this.modelOverride;
    return DEFAULT_MODEL;
  }

  private buildBody(opts: CompletionOptions): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (opts.system) {
      out.systemInstruction = { parts: [{ text: opts.system }] };
    }
    /* Gemini has no "system" role within contents — fold such messages into
       the systemInstruction rather than letting the API reject them. */
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    for (const m of opts.messages as ChatMessage[]) {
      if (m.role === "system") {
        if (out.systemInstruction) {
          (out.systemInstruction as { parts: Array<{ text: string }> }).parts.push({ text: m.content });
        } else {
          out.systemInstruction = { parts: [{ text: m.content }] };
        }
        continue;
      }
      const role = m.role === "assistant" ? "model" : "user";
      contents.push({ role, parts: [{ text: m.content }] });
    }
    out.contents = contents;
    const genConfig: Record<string, unknown> = {};
    if (opts.temperature !== undefined) genConfig.temperature = opts.temperature;
    if (opts.maxTokens !== undefined) genConfig.maxOutputTokens = opts.maxTokens;
    if (Object.keys(genConfig).length) out.generationConfig = genConfig;
    return out;
  }

  private async post(url: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      throw toNetworkError(err);
    }
    if (!res.ok) throw await mapError(res);
    return res;
  }
}

function toNetworkError(err: unknown): EngineError {
  if (err instanceof Error && err.name === "AbortError") throw err;
  return new EngineError(err instanceof Error ? err.message : "Network request failed.", "network");
}

async function mapError(res: Response): Promise<EngineError> {
  let message = res.statusText || "Gemini request failed.";
  let type: string | undefined;
  try {
    const body = await res.json();
    if (body?.error?.message) message = body.error.message;
    type = body?.error?.status;
  } catch {
    /* body wasn't JSON */
  }
  if (res.status === 401 || res.status === 403) return new EngineError(message, "auth");
  if (res.status === 429) return new EngineError(message, "rate_limit");
  if (type === "RESOURCE_EXHAUSTED") return new EngineError(message, "quota");
  return new EngineError(message, "unknown");
}
