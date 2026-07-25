/**
 * Thin filesystem layer behind Spaces.
 *
 * - In the Tauri app: real files on disk via the Rust `fs_*` commands, so the
 *   same folder stays editable by Claude / Obsidian / anything else.
 * - In a plain browser (dev preview): a small localStorage-backed demo volume
 *   so the whole UI is explorable without a desktop build.
 */
import { isTauri } from "../db/driver";

export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modifiedMs: number | null;
}

export interface SpaceFs {
  /** "native" can pick real folders; "demo" is the browser sandbox. */
  readonly kind: "native" | "demo";
  listDir(path: string): Promise<FsEntry[]>;
  readText(path: string): Promise<string>;
  writeText(path: string, contents: string): Promise<void>;
  createDir(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  reveal(path: string): Promise<void>;
}

/* --------------------------------- paths ---------------------------------- */

export const TEXT_EXTS = ["md", "markdown", "mdx", "txt", "canvas", "csv", "json", "yml", "yaml"];
export const MARKDOWN_EXTS = ["md", "markdown", "mdx"];

export function extOf(nameOrPath: string): string {
  const base = baseName(nameOrPath);
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
}

export const isMarkdown = (p: string) => MARKDOWN_EXTS.includes(extOf(p));
export const isTextFile = (p: string) => TEXT_EXTS.includes(extOf(p));

export function baseName(path: string): string {
  const clean = path.replace(/[/\\]+$/, "");
  const i = Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\"));
  return i >= 0 ? clean.slice(i + 1) : clean;
}

export function parentPath(path: string): string {
  const clean = path.replace(/[/\\]+$/, "");
  const i = Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\"));
  return i > 0 ? clean.slice(0, i) : "/";
}

export function joinPath(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, "")}/${name}`;
}

/** Path shown relative to its space root — "notes/ideas.md". */
export function relPath(root: string, path: string): string {
  if (path === root) return baseName(root);
  return path.startsWith(root) ? path.slice(root.length).replace(/^\/+/, "") : path;
}

/** Strip characters that would break a filename on macOS. */
export function safeFileName(name: string): string {
  return name.replace(/[/\\:]/g, "-").replace(/\s+/g, " ").trim();
}

/** Title → filename, e.g. "Ship the fix" → "Ship the fix.md". */
export function withExtension(name: string, ext = "md"): string {
  return extOf(name) ? name : `${name}.${ext}`;
}

/* -------------------------------- native ---------------------------------- */

async function cmd<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(name, args);
}

const nativeFs: SpaceFs = {
  kind: "native",
  listDir: (path) => cmd<FsEntry[]>("fs_list_dir", { path }),
  readText: (path) => cmd<string>("fs_read_text", { path }),
  writeText: (path, contents) => cmd<void>("fs_write_text", { path, contents }),
  createDir: (path) => cmd<void>("fs_create_dir", { path }),
  rename: (from, to) => cmd<void>("fs_rename", { from, to }),
  remove: (path) => cmd<void>("fs_delete", { path }),
  exists: (path) => cmd<boolean>("fs_exists", { path }),
  reveal: (path) => cmd<void>("fs_reveal", { path }),
};

/* --------------------------------- demo ----------------------------------- */

const DEMO_KEY = "brawley:spaces-demo-volume";

/** Flat path → contents map; `null` marks a directory. */
type DemoVolume = Record<string, string | null>;

function readVolume(): DemoVolume {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    return raw ? (JSON.parse(raw) as DemoVolume) : {};
  } catch {
    return {};
  }
}

function writeVolume(v: DemoVolume): void {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(v));
  } catch (e) {
    console.warn("demo volume save failed", e);
  }
}

const demoFs: SpaceFs = {
  kind: "demo",
  async listDir(path) {
    const v = readVolume();
    const prefix = `${path.replace(/\/+$/, "")}/`;
    const out: FsEntry[] = [];
    for (const [p, contents] of Object.entries(v)) {
      if (!p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length);
      if (rest.includes("/")) continue; // grandchild
      out.push({
        name: baseName(p),
        path: p,
        isDir: contents === null,
        size: contents?.length ?? 0,
        modifiedMs: null,
      });
    }
    out.sort((a, b) =>
      a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1,
    );
    return out;
  },
  async readText(path) {
    const v = readVolume();
    const contents = v[path];
    if (contents == null) throw new Error(`No such file: ${path}`);
    return contents;
  },
  async writeText(path, contents) {
    const v = readVolume();
    // Materialise missing parents so a nested write behaves like mkdir -p.
    let dir = parentPath(path);
    while (dir && dir !== "/" && !(dir in v)) {
      v[dir] = null;
      dir = parentPath(dir);
    }
    v[path] = contents;
    writeVolume(v);
  },
  async createDir(path) {
    const v = readVolume();
    v[path] = null;
    writeVolume(v);
  },
  async rename(from, to) {
    const v = readVolume();
    if (to in v) throw new Error("A file with that name already exists");
    for (const p of Object.keys(v)) {
      if (p === from || p.startsWith(`${from}/`)) {
        v[to + p.slice(from.length)] = v[p];
        delete v[p];
      }
    }
    writeVolume(v);
  },
  async remove(path) {
    const v = readVolume();
    for (const p of Object.keys(v)) {
      if (p === path || p.startsWith(`${path}/`)) delete v[p];
    }
    writeVolume(v);
  },
  async exists(path) {
    return path in readVolume();
  },
  async reveal() {
    /* nothing to reveal in the browser */
  },
};

export const spaceFs: SpaceFs = isTauri ? nativeFs : demoFs;

/* ------------------------------- demo seed -------------------------------- */

const DEMO_ROOT = "/Demo Space";

const DEMO_FILES: Record<string, string> = {
  "Welcome.md": `# Welcome to Spaces

This is a **demo space** — it lives in your browser, not on disk. In the desktop
app you'd hit *Connect folder* and point Brawley at a real folder (say your
Obsidian vault or a plain \`~/Notes\` directory).

## What works here

- Browse folders and files on the left, like Finder
- Click any \`.md\` file to open it
- Edit with **bold**, *italic*, \`code\`, headings, lists, quotes
- Everything you type is saved back to the file automatically

> The point: one folder, shared between you and Claude.

## Try it

1. Open \`Claude Tasks.md\`
2. Flip a task's status
3. Watch the markdown change underneath
`,
  "Ideas/Product ideas.md": `# Product ideas

- [ ] Weekly digest email
- [ ] Keyboard-first goal review
- [x] Sprint reviews live on the sprint page

## Notes

Nothing here is precious — this is a scratch file.
`,
  "Ideas/Reading list.md": `# Reading list

| Title | Why |
| --- | --- |
| Deep Work | focus |
| The Making of a Manager | teams |
`,
  "Meetings/2026-07-20 standup.md": `# Standup — 20 Jul

**Present:** me, myself

- Shipped the calendar rework
- Next: Spaces
`,
};

/** Create the browser-only sample space and return its root path. */
export async function seedDemoSpace(): Promise<{ name: string; path: string }> {
  const v = readVolume();
  v[DEMO_ROOT] = null;
  v[`${DEMO_ROOT}/Ideas`] = null;
  v[`${DEMO_ROOT}/Meetings`] = null;
  for (const [rel, body] of Object.entries(DEMO_FILES)) {
    v[`${DEMO_ROOT}/${rel}`] = body;
  }
  writeVolume(v);
  return { name: "Demo Space", path: DEMO_ROOT };
}

/** Native folder picker; null when the user cancels or isn't on desktop. */
export async function pickFolder(): Promise<string | null> {
  if (!isTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ directory: true, multiple: false });
  return typeof picked === "string" ? picked : null;
}
