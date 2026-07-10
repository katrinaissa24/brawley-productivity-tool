import { isTauri } from "../db/driver";

/** GitHub repo that publishes Flow releases (owner/name). */
const REPO = "katrinaissa24/brawley-productivity-tool";

/** Version of the running app, injected at build time from package.json. */
export const APP_VERSION: string = __APP_VERSION__;

export type UpdateStatus = "current" | "available" | "error";

export interface UpdateResult {
  status: UpdateStatus;
  currentVersion: string;
  /** Latest published version (without a leading "v"), when known. */
  latestVersion?: string;
  /** Release notes (markdown) from the GitHub release body. */
  notes?: string;
  /** GitHub release page. */
  releaseUrl?: string;
  /** Direct link to the .dmg asset, falling back to the release page. */
  downloadUrl?: string;
  /** Human-readable reason when status is "error". */
  message?: string;
}

interface GithubAsset {
  name: string;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
  assets?: GithubAsset[];
}

/**
 * Compare two dotted numeric versions.
 * Returns >0 if a is newer than b, <0 if older, 0 if equal.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .trim()
      .replace(/^v/i, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Ask GitHub for the latest published release and compare it to this build.
 * Never throws — network / API failures come back as `status: "error"`.
 */
export async function checkForUpdate(): Promise<UpdateResult> {
  const currentVersion = APP_VERSION;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    // 404 = no published release yet — treat as "nothing newer".
    if (res.status === 404) return { status: "current", currentVersion };
    if (!res.ok) {
      return { status: "error", currentVersion, message: `GitHub returned ${res.status}` };
    }
    const data = (await res.json()) as GithubRelease;
    const latestVersion = String(data.tag_name ?? "").replace(/^v/i, "");
    if (!latestVersion || compareVersions(latestVersion, currentVersion) <= 0) {
      return { status: "current", currentVersion, latestVersion: latestVersion || undefined };
    }
    const dmg = (data.assets ?? []).find((a) => a.name.toLowerCase().endsWith(".dmg"));
    return {
      status: "available",
      currentVersion,
      latestVersion,
      notes: typeof data.body === "string" ? data.body.trim() : undefined,
      releaseUrl: data.html_url,
      downloadUrl: dmg?.browser_download_url ?? data.html_url,
    };
  } catch (e) {
    return { status: "error", currentVersion, message: String(e) };
  }
}

/**
 * Open a URL in the system browser (desktop app) or a new tab (browser preview).
 */
export async function openExternal(url: string): Promise<void> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_url", { url });
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
