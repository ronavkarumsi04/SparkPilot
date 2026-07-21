import type { EnginePrefs } from "./types";

/* Engine preferences persist in localStorage. Provider keys/models themselves
   live in the keychain (see engine/keys.ts); this file keeps the *active*
   provider id + mode + UI prefs. `mode` is null until the user explicitly
   picks at onboarding. */

const KEY = "sparkpilot.prefs";

const defaults: EnginePrefs = {
  mode: null,
  onboarded: false,
  activeProvider: null,
  providers: {},
  language: "English",
};

export function getEnginePrefs(): EnginePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    const parsed = { ...defaults, ...(JSON.parse(raw) as Partial<EnginePrefs>) };
    /* Migrate old single-key prefs: if there's no activeProvider but mode is
       cloud, try to resolve from the deprecated loadApiKey path lazily. We
       don't import keys here to avoid a cycle — onboarding/app.tsx handles
       the actual migration. */
    return parsed;
  } catch {
    return { ...defaults };
  }
}

export function saveEnginePrefs(prefs: EnginePrefs): void {
  localStorage.setItem(KEY, JSON.stringify(prefs));
}

export function updateEnginePrefs(patch: Partial<EnginePrefs>): EnginePrefs {
  const next = { ...getEnginePrefs(), ...patch };
  saveEnginePrefs(next);
  return next;
}
