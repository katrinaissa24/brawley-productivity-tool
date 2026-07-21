import { isTauri } from "../db/driver";
import { useUI } from "../stores/ui";

/** Reveal the SQLite database file in Finder. */
export async function revealDb(): Promise<void> {
  if (!isTauri) {
    useUI.getState().toast("Only available in the desktop app", "info");
    return;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("reveal_db");
}

/** Copy the .db to a user-chosen location with a timestamp. */
export async function exportBackup(): Promise<void> {
  const ui = useUI.getState();
  if (!isTauri) {
    ui.toast("Only available in the desktop app", "info");
    return;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");
  const stamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replaceAll(":", "-")
    .replace("T", "_");
  const dest = await save({
    defaultPath: `flow-backup_${stamp}.db`,
    filters: [{ name: "SQLite database", extensions: ["db"] }],
  });
  if (!dest) return;
  await invoke("export_db", { dest });
  ui.toast("Backup exported", "success");
}

/** Replace the current database with a backup file, then relaunch. */
export async function importBackup(): Promise<void> {
  const ui = useUI.getState();
  if (!isTauri) {
    ui.toast("Only available in the desktop app", "info");
    return;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const src = await open({
    multiple: false,
    filters: [{ name: "SQLite database", extensions: ["db"] }],
  });
  if (!src || typeof src !== "string") return;
  ui.ask({
    title: "Import backup?",
    message:
      "This replaces ALL current data with the backup and restarts Brawley. This cannot be undone.",
    confirmLabel: "Replace & restart",
    danger: true,
    onConfirm: () => {
      void (async () => {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("import_db", { src });
        await invoke("restart_app");
      })();
    },
  });
}

/** Register / update the system-wide quick-capture shortcut. */
export async function syncGlobalShortcut(accelerator: string): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_capture_shortcut", { accel: accelerator });
}
