/* OpenAI-compatible engine adapter.
 *
 * Talks the OpenAI REST API dialect that many third-party hosts expose:
 *   - NVIDIA NIM        (integrate.api.nvidia.com)
 *   - OpenRouter        (openrouter.ai)
 *   - Fireworks AI      (api.fireworks.ai)
 *   - Novita AI         (api.novita.ai)
 *   - Hugging Face       (endpoints.huggingface.co)
 *   - z.ai              (api.z.ai)
 *   - any self-hosted vLLM / LM Studio / TGI exposing /v1
 *
 * Also backs native OpenAI (api.openai.com). The differences between hosts
 * are entirely in base URL, auth header, model id, and which optional
 * features (structured output, TTS, transcription, embeddings) are
 * available — all handled via constructor flags.
 *
 * No SDK dependency. Uses fetch directly. */

import type {
  ChatMessage,
  CompletionOptions,
  Engine,
  EngineCapabilities,
  StructuredOptions,
  TokenHandler,
  TranscriptResult,
  TranscriptSegment,
  TtsOptions,
} from "./types";
import { EngineError } from "./types";
import type { ProviderId } from "../types";

interface OpenAICompatOptions {
  provider: ProviderId;
  apiKey: string;
  baseUrl: string;
  modelOverride?: string;
  /* Which capabilities this host actually exposes. OpenAI's first-party API
     has everything; most compat hosts expose only chat (+ sometimes
     embeddings / structured output). */
  capabilities?: Partial<EngineCapabilities>;
  /* Default model when no override is supplied (used as a "fast" tier,
     with the strong tier falling back to the same model). */
  defaultModel: string;
  /* Optional stronger-tier model. If set, `tier: "strong"` uses this
     instead of defaultModel. Native OpenAI uses this to split
     gpt-4o-mini (fast) / gpt-4o (strong); compat hosts leave it unset. */
  strongModel?: string;
  /* Some hosts (OpenRouter) accept extra headers for ranking/attribution. */
  extraHeaders?: Record<string, string>;
  /* OpenAI exposes structured output natively (json_schema strict). Most
     compat hosts don't — they have to be prompted for JSON. */
  structuredMode?: "json_schema" | "json_prompt";
}

export class OpenAICompatEngine implements Engine {
  readonly mode = "cloud" as const;
  readonly provider: ProviderId;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly modelOverride?: string;
  private readonly defaultModel: string;
  private readonly strongModel?: string;
  private readonly caps: EngineCapabilities;
  private readonly structuredMode: "json_schema" | "json_prompt";
  private readonly extraHeaders: Record<string, string>;

  constructor(opts: OpenAICompatOptions) {
    this.provider = opts.provider;
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.modelOverride = opts.modelOverride;
    this.defaultModel = opts.defaultModel;
    this.strongModel = opts.strongModel;
    this.caps = {
      chat: true,
      transcription: opts.capabilities?.transcription ?? false,
      tts: opts.capabilities?.tts ?? false,
      embeddings: opts.capabilities?.embeddings ?? false,
    };
    this.structuredMode = opts.structuredMode ?? "json_prompt";
    this.extraHeaders = opts.extraHeaders ?? {};
  }

  capabilities(): EngineCapabilities {
    return this.caps;
  }

  async complete(opts: CompletionOptions, onToken?: TokenHandler): Promise<string> {
    const res = await this.post("/chat/completions", {
      model: this.resolveModel(opts.tier),
      messages: buildMessages(opts),
      stream: true,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
    }, opts.signal);

    if (!res.body) throw new EngineError(`${this.provider} returned an empty stream.`, "unknown");
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
          const delta: string | undefined = json.choices?.[0]?.delta?.content;
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
    if (this.structuredMode === "json_schema") {
      const res = await this.post("/chat/completions", {
        model: this.resolveModel(opts.tier),
        messages: buildMessages(opts),
        stream: false,
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
        response_format: {
          type: "json_schema",
          json_schema: { name: opts.schemaName, schema: opts.schema, strict: true },
        },
      }, opts.signal);

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new EngineError(`${this.provider} returned no structured content.`, "unknown");
      }
      return JSON.parse(content) as T;
    }

    /* JSON-prompt fallback for compat hosts without json_schema. */
    const schemaInstruction =
      `Respond ONLY with a single JSON object that satisfies this JSON Schema ` +
      `(no prose, no markdown fences, no explanation):\n${JSON.stringify(opts.schema)}`;
    const system = opts.system ? `${opts.system}\n\n${schemaInstruction}` : schemaInstruction;
    const messages = [
      { role: "system", content: system },
      ...(opts.messages as ChatMessage[])
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content })),
    ];
    const res = await this.post("/chat/completions", {
      model: this.resolveModel(opts.tier),
      messages,
      stream: false,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
      response_format: { type: "json_object" },
    }, opts.signal);

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new EngineError(`${this.provider} returned no structured content.`, "unknown");
    }
    return JSON.parse(content) as T;
  }

  async transcribe(audio: Blob, signal?: AbortSignal): Promise<TranscriptResult> {
    if (!this.caps.transcription) {
      throw new EngineError(`${this.provider} does not support transcription.`, "unsupported");
    }
    const form = new FormData();
    form.append("file", audio, "audio.webm");
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal,
      });
    } catch (err) {
      throw toNetworkError(err);
    }
    if (!res.ok) throw await mapError(res, this.provider);

    const json = await res.json();
    const segments: TranscriptSegment[] = Array.isArray(json.segments)
      ? json.segments.map((s: { start: number; end: number; text: string }) => ({
          start: s.start,
          end: s.end,
          text: s.text,
        }))
      : [];
    return { text: json.text ?? "", segments, language: json.language };
  }

  async tts(text: string, opts: TtsOptions): Promise<Blob> {
    if (!this.caps.tts) {
      throw new EngineError(`${this.provider} does not support text-to-speech.`, "unsupported");
    }
    const models = ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"];
    const tried: string[] = [];
    for (const model of models) {
      try {
        const res = await this.post(
          "/audio/speech",
          {
            model,
            voice: opts.voice,
            input: text,
            ...(opts.format ? { response_format: opts.format } : {}),
          },
          opts.signal,
        );
        return res.blob();
      } catch (e) {
        if (e instanceof EngineError && e.kind === "model_missing") {
          tried.push(model);
          continue;
        }
        throw e;
      }
    }
    throw new EngineError(
      `${this.provider} can't access any TTS model (tried ${tried.join(", ")}).`,
      "model_missing",
    );
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    if (!this.caps.embeddings) {
      throw new EngineError(`${this.provider} does not support embeddings.`, "unsupported");
    }
    const res = await this.post("/embeddings", {
      model: "text-embedding-3-small",
      input: texts,
    }, signal);
    const json = await res.json();
    return (json.data ?? []).map((d: { embedding: number[] }) => d.embedding);
  }

  async validate(): Promise<void> {
    /* Use a minimal chat completion (max_tokens=1) instead of GET /models,
       since many OpenAI-compatible providers don't expose a models list
       endpoint. A single token is effectively free on every provider. */
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: this.resolveModel("fast"),
          messages: [{ role: "user", content: "." }],
          max_tokens: 1,
          stream: false,
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      throw toNetworkError(err);
    }
    if (res.status === 401) throw new EngineError(`Invalid ${this.provider} API key.`, "auth");
    if (!res.ok) throw await mapError(res, this.provider);
  }

  private resolveModel(tier?: "fast" | "strong"): string {
    if (this.modelOverride) return this.modelOverride;
    if (tier === "strong" && this.strongModel) return this.strongModel;
    return this.defaultModel;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      ...this.extraHeaders,
    };
  }

  private async post(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      throw toNetworkError(err);
    }
    if (!res.ok) throw await mapError(res, this.provider);
    return res;
  }
}

function buildMessages(opts: CompletionOptions): Array<{ role: string; content: string }> {
  const out: Array<{ role: string; content: string }> = [];
  if (opts.system) out.push({ role: "system", content: opts.system });
  for (const m of opts.messages as ChatMessage[]) {
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

function toNetworkError(err: unknown): EngineError {
  if (err instanceof Error && err.name === "AbortError") throw err;
  const message = err instanceof Error ? err.message : "Network request failed.";
  return new EngineError(message, "network");
}

async function mapError(res: Response, provider: string): Promise<EngineError> {
  let message = res.statusText || `${provider} request failed.`;
  let code: string | undefined;
  let type: string | undefined;
  try {
    const body = await res.json();
    if (body?.error?.message) message = body.error.message;
    code = body?.error?.code;
    type = body?.error?.type;
  } catch {
    /* body wasn't JSON */
  }
  if (code === "insufficient_quota" || type === "insufficient_quota") {
    return new EngineError(message, "quota");
  }
  if (
    code === "model_not_found" ||
    /does not have access to model|model_not_found|must be verified to use the model/i.test(message)
  ) {
    return new EngineError(`${message} — check that this model is available on ${provider}.`, "model_missing");
  }
  if (res.status === 401) return new EngineError(message, "auth");
  if (res.status === 429) return new EngineError(message, "rate_limit");
  if (res.status === 403) return new EngineError(message, "model_missing");
  return new EngineError(message, "unknown");
}
