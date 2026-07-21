import type { ProviderConfig, ProviderId } from "../types";

/* API key + provider configuration handling. The active provider's config
   (apiKey, baseUrl, model) is persisted together. Storage prefers the OS
   keychain via a Tauri command; in web/dev mode it falls back to
   localStorage (documented as such in the UI).

   The "keychain" is a single opaque blob per provider — the Tauri command
   / localStorage entry stores the whole ProviderConfig as JSON. This way
   switching between providers is instant: each provider remembers its own
   key/model/baseUrl. */

const LS_PREFIX = "sparkpilot.provider.";

/* Detect the Tauri runtime without importing the API at module load. */
function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function saveProviderConfig(cfg: ProviderConfig): Promise<void> {
  const payload = JSON.stringify(cfg);
  if (inTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_provider_config", { id: cfg.provider, payload });
      return;
    } catch {
      /* fall through to localStorage */
    }
  }
  localStorage.setItem(LS_PREFIX + cfg.provider, payload);
}

export async function loadProviderConfig(provider: ProviderId): Promise<ProviderConfig | null> {
  if (inTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<string | null>("load_provider_config", { id: provider });
      if (raw) {
        try { return JSON.parse(raw) as ProviderConfig; } catch { /* fall through */ }
      }
    } catch {
      /* fall through */
    }
  }
  const stored = localStorage.getItem(LS_PREFIX + provider);
  if (!stored) return null;
  try { return JSON.parse(stored) as ProviderConfig; } catch { return null; }
}

export async function clearProviderConfig(provider: ProviderId): Promise<void> {
  if (inTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("clear_provider_config", { id: provider });
    } catch {
      /* ignore */
    }
  }
  localStorage.removeItem(LS_PREFIX + provider);
}

/* ----- Legacy single-key shim (for onboarding of existing users) ----- */

export async function saveApiKey(key: string): Promise<void> {
  /* Store under the "openai" provider for back-compat with the old single-key
     flow; the rebrand route uses saveProviderConfig. */
  const provider = key.trim().startsWith("sk-ant-") ? "anthropic" : "openai";
  await saveProviderConfig({ provider, apiKey: key.trim() });
}

export async function loadApiKey(): Promise<string> {
  /* Try the active provider first (set by buildEngine from prefs), then
     fall back to openai / anthropic in that order so a plain `loadApiKey`
     during onboarding still finds a stored key. */
  for (const p of ["openai", "anthropic"] as ProviderId[]) {
    const cfg = await loadProviderConfig(p);
    if (cfg?.apiKey) return cfg.apiKey;
  }
  return "";
}

/* Back-compat: keep the export used by older code paths. Signature stays
   identical to the previous version. */
export async function clearApiKey(): Promise<void> {
  await clearProviderConfig("openai");
  await clearProviderConfig("anthropic");
}
