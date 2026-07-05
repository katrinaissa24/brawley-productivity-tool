import { create } from "zustand";
import { DEFAULT_SETTINGS, DEFAULT_SHORTCUTS, type Settings } from "../types";
import { saveSettingsJson } from "../db/repo";
import { hexToTriple } from "../lib/util";

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  init(json: string | null): void;
  patch(p: Partial<Settings>): void;
  patchShortcut(key: keyof Settings["shortcuts"], combo: string): void;
  setViewPref(key: string, value: string): void;
}

export function isDark(settings: Settings): boolean {
  return (
    settings.theme === "dark" ||
    (settings.theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  );
}

export function applyTheme(settings: Settings): void {
  const root = document.documentElement;
  root.classList.toggle("dark", isDark(settings));
  root.style.setProperty("--c-accent", hexToTriple(settings.accentColor));
  try {
    localStorage.setItem("flow:themeCache", settings.theme);
    localStorage.setItem("flow:accentCache", hexToTriple(settings.accentColor));
  } catch {
    /* private mode etc. */
  }
}

let watching = false;
function watchSystemTheme() {
  if (watching) return;
  watching = true;
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => applyTheme(useSettings.getState().settings));
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  init(json) {
    let s: Settings = DEFAULT_SETTINGS;
    if (json) {
      try {
        const parsed = JSON.parse(json) as Partial<Settings>;
        s = {
          ...DEFAULT_SETTINGS,
          ...parsed,
          shortcuts: { ...DEFAULT_SHORTCUTS, ...(parsed.shortcuts ?? {}) },
          viewPrefs: { ...(parsed.viewPrefs ?? {}) },
        };
      } catch (e) {
        console.error("settings parse failed, using defaults", e);
      }
    }
    set({ settings: s, loaded: true });
    applyTheme(s);
    watchSystemTheme();
  },

  patch(p) {
    const next = { ...get().settings, ...p };
    set({ settings: next });
    applyTheme(next);
    saveSettingsJson(JSON.stringify(next)).catch((e) =>
      console.error("settings save failed", e),
    );
  },

  patchShortcut(key, combo) {
    get().patch({ shortcuts: { ...get().settings.shortcuts, [key]: combo } });
  },

  setViewPref(key, value) {
    get().patch({ viewPrefs: { ...get().settings.viewPrefs, [key]: value } });
  },
}));
