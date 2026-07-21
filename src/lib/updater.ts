import { isTauri } from "../db/driver";
import { useUI } from "../stores/ui";

/**
 * Auto-update, backed by tauri-plugin-updater.
 *
 * The desktop app checks a GitHub Releases feed (`latest.json`, see
 * `src-tauri/tauri.conf.json` → plugins.updater.endpoints) for a newer signed
 * build. When one exists we download it, swap it in, and relaunch. Updates are
 * verified against the minisign public key in the Tauri config, so a release
 * only installs if it was signed with the matching private key.
 */

/**
 * Check GitHub for a newer release and, if the user agrees, install it.
 *
 * @param opts.silent  When true, stay quiet if already up to date (used for the
 *                      background check on launch). When false, always report
 *                      the outcome — this is the "Check for updates" button.
 */
export async function checkForUpdate({ silent }: { silent: boolean }): Promise<void> {
  const ui = useUI.getState();
  if (!isTauri) {
    if (!silent) ui.toast("Updates are only available in the desktop app", "info");
    return;
  }

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();

    if (!update) {
      if (!silent) ui.toast("You're on the latest version", "success");
      return;
    }

    ui.ask({
      title: `Update available — ${update.version}`,
      message: update.body?.trim()
        ? update.body.trim()
        : "A newer version of Brawley is ready. Download and install it now? Brawley will restart to finish.",
      confirmLabel: "Update & restart",
      onConfirm: () => void downloadInstallRestart(update),
    });
  } catch (e) {
    console.warn("update check failed", e);
    if (!silent) ui.toast("Couldn't check for updates — try again later", "error");
  }
}

// The object returned by check() — kept loose to avoid importing the plugin's
// types at module scope (it isn't present in the browser preview build).
type PendingUpdate = {
  version: string;
  body?: string;
  downloadAndInstall: (
    onEvent?: (e: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void,
  ) => Promise<void>;
};

async function downloadInstallRestart(update: PendingUpdate): Promise<void> {
  const ui = useUI.getState();
  try {
    ui.toast("Downloading update…", "info");

    let downloaded = 0;
    let total = 0;
    await update.downloadAndInstall((e) => {
      if (e.event === "Started") total = e.data?.contentLength ?? 0;
      else if (e.event === "Progress") downloaded += e.data?.chunkLength ?? 0;
      else if (e.event === "Finished") {
        void total; // total/downloaded are wired up for a future progress bar
        void downloaded;
      }
    });

    ui.toast("Update installed — restarting…", "success");
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("restart_app");
  } catch (e) {
    console.error("update install failed", e);
    ui.toast("Update failed to install", "error");
  }
}

/** The app's version string, e.g. "0.1.0". Empty in the browser preview. */
export async function appVersion(): Promise<string> {
  if (!isTauri) return "";
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return "";
  }
}
