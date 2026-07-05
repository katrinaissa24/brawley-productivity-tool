/** Normalize a KeyboardEvent to a combo string like "mod+shift+k". */
export function comboFromEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey) parts.push("mod");
  if (e.ctrlKey && !e.metaKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  let key = e.key.toLowerCase();
  if (key === " ") key = "space";
  if (key === "meta" || key === "control" || key === "alt" || key === "shift") return "";
  // Prefer the physical key for letters so ⌥-combos still resolve.
  if (/^key[a-z]$/.test(e.code.toLowerCase())) key = e.code.slice(3).toLowerCase();
  if (/^digit[0-9]$/.test(e.code.toLowerCase())) key = e.code.slice(5);
  parts.push(key);
  return parts.join("+");
}

export function matchCombo(e: KeyboardEvent, combo: string): boolean {
  if (!combo) return false;
  return comboFromEvent(e) === combo.toLowerCase().replaceAll("cmd", "mod").replaceAll("meta", "mod");
}

export function isEditableTarget(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    t.isContentEditable
  );
}

/** Pretty-print a combo for display, e.g. "⌘⇧Space". */
export function comboLabel(combo: string): string {
  return combo
    .split("+")
    .map((p) => {
      switch (p) {
        case "mod":
        case "cmd":
          return "⌘";
        case "shift":
          return "⇧";
        case "alt":
          return "⌥";
        case "ctrl":
          return "⌃";
        case "space":
          return "Space";
        case "enter":
          return "↩";
        default:
          return p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1);
      }
    })
    .join("");
}

/** Convert our combo format to a Tauri global-shortcut accelerator. */
export function comboToAccelerator(combo: string): string {
  return combo
    .split("+")
    .map((p) => {
      switch (p) {
        case "mod":
          return "CmdOrCtrl";
        case "cmd":
          return "Cmd";
        case "shift":
          return "Shift";
        case "alt":
          return "Alt";
        case "ctrl":
          return "Ctrl";
        case "space":
          return "Space";
        default:
          return p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1);
      }
    })
    .join("+");
}
