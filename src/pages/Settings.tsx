import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  KeyRound,
  Pencil,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";
import { useApp } from "../lib/app";
import { saveProviderConfig, loadProviderConfig, clearProviderConfig } from "../lib/engine/keys";
import { createEngine } from "../lib/engine";
import { CLOUD_PROVIDERS, getProvider } from "../lib/engine/providers";
import { localSetupStatus } from "../lib/localSetup";
import LocalSetupModal from "../components/LocalSetupModal";
import { exportMarkdown, downloadText } from "../lib/export";
import type { ProviderId } from "../lib/types";

const DATA_FOLDER =
  typeof navigator !== "undefined" && navigator.platform.startsWith("Win")
    ? "%APPDATA%\\SparkPilot"
    : "~/Library/Application Support/SparkPilot";

export default function Settings() {
  const { prefs, savePrefs, repo } = useApp();
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [exportMsg, setExportMsg] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [localSetup, setLocalSetup] = useState(false);

  /* Load the active provider's stored config whenever the user switches. */
  useEffect(() => {
    if (!prefs.activeProvider) return;
    if (prefs.activeProvider === "local") {
      const local = prefs.providers.local;
      setBaseUrl(local?.baseUrl || "http://localhost:11434");
      setModel(local?.model || "qwen2.5:3b");
      setApiKey("");
      return;
    }
    loadProviderConfig(prefs.activeProvider).then((cfg) => {
      const meta = getProvider(prefs.activeProvider!);
      setApiKey(cfg?.apiKey ?? "");
      setBaseUrl(cfg?.baseUrl || meta.baseUrl);
      setModel(cfg?.model || meta.defaultModel || "");
    });
  }, [prefs.activeProvider, prefs.providers.local]);

  function setMode(mode: "local" | "cloud") {
    if (mode === "local") {
      void localSetupStatus().then((s) => {
        const ready = s?.serving && s.hasChatModel && s.hasEmbedModel;
        if (s && !ready) {
          setLocalSetup(true);
          return;
        }
        savePrefs({ ...prefs, mode, activeProvider: "local" });
      });
      return;
    }
    /* Switch to cloud: pick the first cloud provider with a saved key, or
       fall back to OpenAI. */
    const firstSaved =
      CLOUD_PROVIDERS.find((p) => prefs.providers[p.id]?.apiKey)?.id ?? "openai";
    savePrefs({ ...prefs, mode, activeProvider: firstSaved });
  }

  function pickCloudProvider(p: ProviderId) {
    savePrefs({ ...prefs, mode: "cloud", activeProvider: p });
  }

  async function saveKey() {
    if (!prefs.activeProvider || prefs.activeProvider === "local") return;
    setStatus("saving");
    setMsg("");
    const meta = getProvider(prefs.activeProvider);
    try {
      const engine = createEngine({
        mode: "cloud",
        provider: prefs.activeProvider,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || meta.baseUrl,
        model: model.trim() || undefined,
      });
      await engine.validate();
      await saveProviderConfig({
        provider: prefs.activeProvider,
        apiKey: apiKey.trim(),
        baseUrl: meta.editableBaseUrl ? baseUrl.trim() || undefined : undefined,
        model: model.trim() || undefined,
      });
      savePrefs({ ...prefs, mode: "cloud" });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2500);
    } catch (e) {
      setStatus("error");
      setMsg(e instanceof Error ? e.message : "Could not validate the key.");
    }
  }

  async function removeKey() {
    if (!prefs.activeProvider) return;
    await clearProviderConfig(prefs.activeProvider);
    setApiKey("");
    setStatus("idle");
  }

  const inCloudMode = prefs.mode === "cloud";
  const activeMeta =
    prefs.activeProvider && prefs.activeProvider !== "local"
      ? getProvider(prefs.activeProvider)
      : null;

  return (
    <div className="px-10 py-8">
      <div className="flex items-center gap-3">
        <SettingsIcon className="size-6 text-accent" />
        <h1 className="text-4xl font-bold tracking-tight">Settings</h1>
      </div>
      <p className="mt-1 text-lg text-ink-faint">Manage your profile, engine, and preferences</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="overflow-hidden rounded-card border border-edge bg-card shadow-soft">
          <div className="h-24 bg-accent-softer" />
          <div className="-mt-10 flex flex-col items-center px-6 pb-6">
            <div className="flex size-20 items-center justify-center rounded-full border-4 border-card bg-accent-softer font-display text-2xl font-bold text-accent">
              <Sparkles className="size-8" />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="font-display text-xl font-bold">You</span>
              <Pencil className="size-3.5 text-ink-faint" />
            </div>
            <span className="text-sm text-ink-faint">
              Local account — nothing leaves this device
            </span>

            <div className="mt-5 w-full space-y-3">
              <Field label="Language" value={prefs.language} editable />
              <Field label="Data folder" value={DATA_FOLDER} copyable />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-card border border-edge bg-card p-6 shadow-soft">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="flex items-center gap-2 font-display text-xl font-bold">
                  <Cpu className="size-5 text-accent" />
                  AI Engine
                </h2>
                <p className="mt-1 text-sm text-ink-faint">
                  Run everything locally for free, or bring your own key for
                  cloud-quality output from any of the providers below.
                </p>
              </div>
              <div className="flex rounded-full border border-edge bg-panel p-1">
                {(
                  [
                    ["local", "Local"],
                    ["cloud", "Cloud"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setMode(k)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                      prefs.mode === k ? "bg-accent text-white" : "text-ink-faint hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {inCloudMode ? (
              <div className="mt-5 space-y-4">
                {/* Provider picker grid */}
                <div>
                  <label className="text-sm font-semibold text-ink-dim">Provider</label>
                  <div className="mt-1.5 grid grid-cols-2 gap-2 md:grid-cols-3">
                    {CLOUD_PROVIDERS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => pickCloudProvider(p.id)}
                        className={`rounded-xl border-2 px-3 py-2 text-left text-sm font-semibold transition ${
                          prefs.activeProvider === p.id
                            ? "border-accent bg-accent-softer text-accent"
                            : "border-edge bg-panel hover:bg-card-hover"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {activeMeta && (
                  <>
                    <div>
                      <label className="text-sm font-semibold text-ink-dim">
                        {activeMeta.label} API key
                      </label>
                      <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-edge bg-panel px-3 py-2.5">
                        <KeyRound className="size-4 text-ink-faint" />
                        <input
                          type="password"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder={activeMeta.keyPlaceholder || "Paste your key…"}
                          className="w-full bg-transparent text-sm outline-none placeholder:text-ink-faint"
                        />
                        {activeMeta.keyUrl && (
                          <a
                            href={activeMeta.keyUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 text-xs font-semibold text-accent underline"
                          >
                            Get key
                          </a>
                        )}
                      </div>
                    </div>
                    {activeMeta.editableBaseUrl && (
                      <div>
                        <label className="text-sm font-semibold text-ink-dim">Base URL</label>
                        <input
                          value={baseUrl}
                          onChange={(e) => setBaseUrl(e.target.value)}
                          placeholder={activeMeta.baseUrl}
                          className="mt-1.5 w-full rounded-xl border border-edge bg-panel px-3 py-2.5 text-sm outline-none placeholder:text-ink-faint"
                        />
                      </div>
                    )}
                    <div>
                      <label className="text-sm font-semibold text-ink-dim">
                        Model <span className="text-ink-faint">(optional)</span>
                      </label>
                      <input
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder={activeMeta.defaultModel || "Provider default"}
                        className="mt-1.5 w-full rounded-xl border border-edge bg-panel px-3 py-2.5 text-sm outline-none placeholder:text-ink-faint"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={saveKey}
                        disabled={status === "saving"}
                        className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-60"
                      >
                        {status === "saving" ? "Validating…" : "Save & validate"}
                      </button>
                      {status === "saved" && (
                        <span className="flex items-center gap-1 text-sm font-semibold text-green-600">
                          <CheckCircle2 className="size-4" /> Saved
                        </span>
                      )}
                      {apiKey && (
                        <button
                          onClick={removeKey}
                          className="text-sm font-semibold text-ink-faint hover:text-danger-ink"
                        >
                          Remove key
                        </button>
                      )}
                    </div>
                    {status === "error" && (
                      <p className="text-xs font-semibold text-danger-ink">{msg}</p>
                    )}
                    <p className="text-xs text-ink-faint">
                      Stored in your system keychain, never in app files. One key
                      powers every feature for this provider.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-edge bg-panel p-4">
                <p className="text-sm font-semibold">Local models</p>
                <p className="mt-1 text-sm text-ink-faint">
                  Speech-to-text, note generation, podcast voices, and search run on
                  this device via a local runtime (Ollama for text; Whisper &
                  Kokoro for audio). Start Ollama, or switch to a cloud key for the
                  audio features.
                </p>
                {prefs.activeProvider === "local" && (
                  <div className="mt-3 space-y-2">
                    <label className="text-xs font-semibold text-ink-dim">Base URL</label>
                    <input
                      value={baseUrl}
                      onChange={(e) => {
                        setBaseUrl(e.target.value);
                        savePrefs({
                          ...prefs,
                          providers: {
                            ...prefs.providers,
                            local: { provider: "local", apiKey: "", baseUrl: e.target.value, model },
                          },
                        });
                      }}
                      className="w-full rounded-xl border border-edge bg-card px-3 py-2 text-sm outline-none"
                    />
                    <label className="text-xs font-semibold text-ink-dim">Model</label>
                    <input
                      value={model}
                      onChange={(e) => {
                        setModel(e.target.value);
                        savePrefs({
                          ...prefs,
                          providers: {
                            ...prefs.providers,
                            local: { provider: "local", apiKey: "", baseUrl, model: e.target.value },
                          },
                        });
                      }}
                      className="w-full rounded-xl border border-edge bg-card px-3 py-2 text-sm outline-none"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-card border border-edge bg-card p-6 shadow-soft">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold">
              <Download className="size-5 text-accent" />
              Your data
            </h2>
            <p className="mt-1 text-sm text-ink-faint">
              SparkPilot is free and open source (AGPL-3.0). Your notes are yours —
              export any single note as Markdown, PDF, or Word from its menu, or
              export everything at once here. Nothing is ever locked behind a paywall.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={async () => {
                  const notes = (await repo?.listNotes()) ?? [];
                  if (notes.length === 0) {
                    setExportMsg("You don't have any notes yet.");
                    return;
                  }
                  const all = notes.map((n) => exportMarkdown(n)).join("\n\n---\n\n");
                  downloadText("sparkpilot-notes.md", all, "text/markdown");
                  setExportMsg(`Exported ${notes.length} note${notes.length > 1 ? "s" : ""}.`);
                }}
                className="rounded-xl border border-edge bg-panel px-4 py-2 text-sm font-semibold shadow-soft hover:bg-card-hover"
              >
                Export all notes (Markdown)
              </button>
              {exportMsg && <span className="text-sm text-ink-faint">{exportMsg}</span>}
            </div>
          </div>
        </div>
      </div>

      {localSetup && (
        <LocalSetupModal
          onDone={() => {
            setLocalSetup(false);
            savePrefs({ ...prefs, mode: "local", activeProvider: "local" });
          }}
          onCancel={() => setLocalSetup(false)}
        />
      )}
    </div>
  );
}

function Field({
  label,
  value,
  editable,
  copyable,
}: {
  label: string;
  value: string;
  editable?: boolean;
  copyable?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-edge bg-panel px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink-faint">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
      {editable && <Pencil className="size-3.5 shrink-0 text-ink-faint" />}
      {copyable && (
        <button
          onClick={() => navigator.clipboard.writeText(value)}
          className="rounded-lg border border-edge bg-card p-2 text-ink-dim shadow-soft hover:text-ink"
          aria-label={`Copy ${label}`}
        >
          <Copy className="size-3.5" />
        </button>
      )}
    </div>
  );
}
