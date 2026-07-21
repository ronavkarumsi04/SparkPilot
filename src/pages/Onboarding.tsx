import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Cpu, KeyRound, Sparkles } from "lucide-react";
import { CLOUD_PROVIDERS, getProvider } from "../lib/engine/providers";
import { saveProviderConfig } from "../lib/engine/keys";
import { getEnginePrefs } from "../lib/prefs";
import { localSetupStatus } from "../lib/localSetup";
import LocalSetupModal from "../components/LocalSetupModal";
import { useApp } from "../lib/app";
import { createEngine } from "../lib/engine";
import type { EnginePrefs, ProviderId } from "../lib/types";

export default function Onboarding() {
  const navigate = useNavigate();
  const { savePrefs } = useApp();
  /* No default — the user must make an explicit choice. selectedProvider is
     null = local, or one of the cloud provider ids. */
  const [providerId, setProviderId] = useState<ProviderId | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  const meta = providerId ? getProvider(providerId) : null;
  /* The user picks
     the end of the list just like before, but we treat it as providerId
     "local" so the rest of the flow is uniform. */
  const selected = providerId;

  function pick(p: ProviderId) {
    setProviderId(p);
    setErr(null);
    if (p === "local") return;
    const m = getProvider(p);
    setBaseUrl(m.baseUrl);
    setModel(m.defaultModel || "");
  }

  async function finish() {
    if (!selected || busy) return;
    setBusy(true);
    setErr(null);
    if (selected === "local") {
      const status = await localSetupStatus();
      const alreadyReady = status?.serving && status.hasChatModel && status.hasEmbedModel;
      if (status && !alreadyReady) {
        setSetupOpen(true);
        return;
      }
      enter("local");
      return;
    }
    /* Cloud: validate the key, save provider config, enter. */
    const m = getProvider(selected);
    if (!apiKey.trim()) {
      setErr("Enter your API key.");
      setBusy(false);
      return;
    }
    try {
      const engine = createEngine({
        mode: "cloud",
        provider: selected,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || m.baseUrl,
        model: model.trim() || undefined,
      });
      await engine.validate();
      await saveProviderConfig({
        provider: selected,
        apiKey: apiKey.trim(),
        baseUrl: m.editableBaseUrl ? baseUrl.trim() || undefined : undefined,
        model: model.trim() || undefined,
      });
      enter("cloud", selected);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Validation failed.");
      setBusy(false);
    }
  }

  function enter(nextMode: "local" | "cloud", cloudProvider?: ProviderId) {
    const prefs: EnginePrefs = {
      ...getEnginePrefs(),
      mode: nextMode,
      onboarded: true,
      activeProvider: nextMode === "cloud" ? cloudProvider ?? null : "local",
    };
    savePrefs(prefs);
    navigate("/", { replace: true });
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-bg px-6">
      <div className="flex items-center gap-2">
        <Sparkles className="size-7 text-accent" />
        <span className="font-display text-2xl font-bold tracking-tight">SparkPilot</span>
      </div>
      <h1 className="mt-6 text-center font-display text-4xl font-bold">
        How do you want your AI to run?
      </h1>
      <p className="mt-2 max-w-lg text-center text-ink-dim">
        Pick a provider. There's no wrong answer — you can switch anytime in Settings.
      </p>

      <div className="mt-8 grid w-full max-w-4xl grid-cols-2 gap-3 md:grid-cols-3">
        {CLOUD_PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => pick(p.id)}
            className={`relative rounded-card border-2 p-4 text-left shadow-soft transition ${
              selected === p.id
                ? "border-accent bg-accent-softer"
                : "border-edge bg-card hover:bg-card-hover"
            }`}
          >
            <div className="font-display text-sm font-bold">{p.label}</div>
            <p className="mt-1 text-xs text-ink-dim line-clamp-2">{p.blurb}</p>
          </button>
        ))}
        <button
          onClick={() => pick("local")}
          className={`relative rounded-card border-2 p-4 text-left shadow-soft transition ${
            selected === "local"
              ? "border-accent bg-accent-softer"
              : "border-edge bg-card hover:bg-card-hover"
          }`}
        >
          <div className="flex items-center gap-1.5 font-display text-sm font-bold">
            <Cpu className="size-4 text-accent" /> Local (Ollama)
          </div>
          <p className="mt-1 text-xs text-ink-dim line-clamp-2">
            Fully offline. No key, no cloud — runs on your device.
          </p>
        </button>
      </div>

      {selected && selected !== "local" && meta && (
        <div className="mt-6 w-full max-w-3xl space-y-3">
          <div className="rounded-xl border border-edge bg-card px-4 py-3 shadow-soft">
            <label className="text-xs font-semibold text-ink-dim">
              {meta.label} API key
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <KeyRound className="size-4 shrink-0 text-ink-faint" />
              <input
                autoFocus
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={meta.keyPlaceholder || "Paste your key…"}
                className="w-full bg-transparent text-sm outline-none placeholder:text-ink-faint"
              />
              {meta.keyUrl && (
                <a
                  href={meta.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-xs font-semibold text-accent underline"
                >
                  Get a key
                </a>
              )}
            </div>
          </div>
          {meta.editableBaseUrl && (
            <div className="rounded-xl border border-edge bg-card px-4 py-3 shadow-soft">
              <label className="text-xs font-semibold text-ink-dim">Base URL</label>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={meta.baseUrl}
                className="mt-1.5 w-full bg-transparent text-sm outline-none placeholder:text-ink-faint"
              />
            </div>
          )}
          <div className="rounded-xl border border-edge bg-card px-4 py-3 shadow-soft">
            <label className="text-xs font-semibold text-ink-dim">
              Model <span className="text-ink-faint">(optional)</span>
            </label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={meta.defaultModel || "Provider default"}
              className="mt-1.5 w-full bg-transparent text-sm outline-none placeholder:text-ink-faint"
            />
          </div>
        </div>
      )}

      {err && (
        <div className="mt-4 rounded-xl border border-danger-ink/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger-ink">
          {err}
        </div>
      )}

      <button
        onClick={finish}
        disabled={!selected || busy}
        className={`mt-8 w-full max-w-3xl rounded-xl py-3.5 font-display font-bold transition ${
          selected && !busy
            ? "bg-accent text-white hover:bg-accent-hover"
            : "cursor-not-allowed bg-accent-softer text-ink-faint"
        }`}
      >
        {busy ? "Setting up…" : "Get started"}
      </button>

      {setupOpen && (
        <LocalSetupModal
          onDone={() => enter("local")}
          onCancel={() => {
            setSetupOpen(false);
            setBusy(false);
          }}
        />
      )}
    </div>
  );
}
