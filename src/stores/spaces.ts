import { create } from "zustand";
import type { SpaceRef } from "../types";
import {
  baseName,
  joinPath,
  parentPath,
  pickFolder,
  relPath,
  safeFileName,
  seedDemoSpace,
  spaceFs,
  withExtension,
  type FsEntry,
} from "../lib/fs";
import {
  appendTask,
  CLAUDE_FILE_NAME,
  CLAUDE_FILE_TEMPLATE,
  parseClaudeTasks,
  removeTask,
  setTaskStatus,
  type AssignInput,
  type ClaudeStatus,
  type ClaudeTask,
} from "../lib/claudeTasks";
import { useSettings } from "./settings";
import { useUI } from "./ui";

/** One entry in the `@` file/folder picker — a flattened, searchable listing. */
export interface MentionEntry {
  path: string;
  rel: string;
  isDir: boolean;
}

export interface OpenDoc {
  path: string;
  /** What's in the editor right now. */
  text: string;
  /** What we last read from / wrote to disk — the dirty check. */
  saved: string;
  loading: boolean;
  error: string | null;
}

interface SpacesState {
  activeSpaceId: string | null;
  setActiveSpace(id: string | null): void;

  /** dir path → children, cached so the tree doesn't re-hit disk on every render. */
  dirs: Record<string, FsEntry[]>;
  expanded: Record<string, boolean>;
  loadingDirs: Record<string, boolean>;
  loadDir(path: string, force?: boolean): Promise<void>;
  toggleDir(path: string): void;
  refresh(): Promise<void>;

  doc: OpenDoc | null;
  saving: boolean;
  savedAt: number | null;
  openFile(path: string): Promise<void>;
  closeFile(): void;
  setDocText(text: string): void;
  saveNow(): Promise<void>;

  createEntry(dir: string, name: string, isDir: boolean): Promise<string | null>;
  renameEntry(path: string, name: string): Promise<void>;
  deleteEntry(path: string): Promise<void>;

  panel: "files" | "claude";
  setPanel(p: "files" | "claude"): void;

  claude: { path: string; text: string; tasks: ClaudeTask[] } | null;
  claudeLoading: boolean;
  loadClaude(force?: boolean): Promise<void>;
  setClaudeStatus(key: string, status: ClaudeStatus): Promise<void>;
  removeClaudeTask(key: string): Promise<void>;

  connectFolder(): Promise<void>;
  createDemoSpace(): Promise<void>;
  removeSpace(id: string): void;

  /** Flattened file/folder listing per space root, for the `@` mention picker. */
  fileIndex: Record<string, MentionEntry[]>;
  buildFileIndex(spacePath: string, force?: boolean): Promise<void>;
}

/* ------------------------------ settings glue ------------------------------ */

export function spacesList(): SpaceRef[] {
  return useSettings.getState().settings.spaces ?? [];
}

function patchSpaces(next: SpaceRef[]): void {
  useSettings.getState().patch({ spaces: next });
}

/** The space "Assign to Claude" writes into: the chosen one, else the first. */
export function claudeSpace(): SpaceRef | null {
  const { claudeSpaceId, spaces } = useSettings.getState().settings;
  return spaces.find((s) => s.id === claudeSpaceId) ?? spaces[0] ?? null;
}

/* --------------------------------- store ---------------------------------- */

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useSpaces = create<SpacesState>((set, get) => ({
  activeSpaceId: null,
  setActiveSpace(id) {
    set({ activeSpaceId: id, doc: null, panel: "files", claude: null });
    const space = spacesList().find((s) => s.id === id);
    if (space) {
      void get().loadDir(space.path, true);
      // Read the hand-off file up front so the sidebar badge is honest before
      // the panel is ever opened.
      void get().loadClaude(true);
      void get().buildFileIndex(space.path);
    }
  },

  dirs: {},
  expanded: {},
  loadingDirs: {},

  async loadDir(path, force = false) {
    if (!force && get().dirs[path]) return;
    set({ loadingDirs: { ...get().loadingDirs, [path]: true } });
    try {
      const entries = await spaceFs.listDir(path);
      set({ dirs: { ...get().dirs, [path]: entries } });
    } catch (e) {
      console.error("listDir failed", path, e);
      useUI.getState().toast(`Couldn't read ${baseName(path)}`, "error");
    } finally {
      const { [path]: _drop, ...rest } = get().loadingDirs;
      set({ loadingDirs: rest });
    }
  },

  toggleDir(path) {
    const open = !get().expanded[path];
    set({ expanded: { ...get().expanded, [path]: open } });
    if (open) void get().loadDir(path);
  },

  async refresh() {
    const space = spacesList().find((s) => s.id === get().activeSpaceId);
    if (!space) return;
    const open = Object.keys(get().dirs);
    await Promise.all(open.map((p) => get().loadDir(p, true)));
    // Pull disk changes (Claude may have edited underneath us) into a clean doc.
    const doc = get().doc;
    if (doc && doc.text === doc.saved) {
      try {
        const text = await spaceFs.readText(doc.path);
        if (text !== doc.saved) set({ doc: { ...doc, text, saved: text } });
      } catch {
        /* file may have been deleted — the tree refresh will show that */
      }
    }
    if (get().panel === "claude") await get().loadClaude(true);
    void get().buildFileIndex(space.path, true);
  },

  doc: null,
  saving: false,
  savedAt: null,

  async openFile(path) {
    await get().saveNow();
    set({ doc: { path, text: "", saved: "", loading: true, error: null }, panel: "files" });
    try {
      const text = await spaceFs.readText(path);
      set({ doc: { path, text, saved: text, loading: false, error: null } });
    } catch (e) {
      set({
        doc: { path, text: "", saved: "", loading: false, error: String(e) },
      });
    }
  },

  closeFile() {
    void get().saveNow();
    set({ doc: null });
  },

  setDocText(text) {
    const doc = get().doc;
    if (!doc || doc.loading) return;
    set({ doc: { ...doc, text } });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void get().saveNow(), 700);
  },

  async saveNow() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const doc = get().doc;
    if (!doc || doc.loading || doc.text === doc.saved) return;
    const { path, text } = doc;
    set({ saving: true });
    try {
      await spaceFs.writeText(path, text);
      const cur = get().doc;
      // Keep whatever was typed while the write was in flight.
      if (cur && cur.path === path) set({ doc: { ...cur, saved: text } });
      set({ savedAt: Date.now() });
    } catch (e) {
      console.error("save failed", e);
      useUI.getState().toast(`Couldn't save ${baseName(path)}`, "error");
    } finally {
      set({ saving: false });
    }
  },

  async createEntry(dir, name, isDir) {
    const clean = safeFileName(name);
    if (!clean) return null;
    const path = joinPath(dir, isDir ? clean : withExtension(clean));
    try {
      if (await spaceFs.exists(path)) {
        useUI.getState().toast("Something with that name already exists", "error");
        return null;
      }
      if (isDir) await spaceFs.createDir(path);
      else await spaceFs.writeText(path, `# ${baseName(path).replace(/\.[^.]+$/, "")}\n\n`);
      set({ expanded: { ...get().expanded, [dir]: true } });
      await get().loadDir(dir, true);
      if (!isDir) await get().openFile(path);
      return path;
    } catch (e) {
      useUI.getState().toast(String(e), "error");
      return null;
    }
  },

  async renameEntry(path, name) {
    const clean = safeFileName(name);
    if (!clean || clean === baseName(path)) return;
    const dir = parentPath(path);
    const next = joinPath(dir, clean);
    try {
      await get().saveNow();
      await spaceFs.rename(path, next);
      await get().loadDir(dir, true);
      const doc = get().doc;
      if (doc?.path === path) set({ doc: { ...doc, path: next } });
    } catch (e) {
      useUI.getState().toast(String(e), "error");
    }
  },

  async deleteEntry(path) {
    const dir = parentPath(path);
    try {
      await spaceFs.remove(path);
      const doc = get().doc;
      if (doc && (doc.path === path || doc.path.startsWith(`${path}/`))) set({ doc: null });
      await get().loadDir(dir, true);
    } catch (e) {
      useUI.getState().toast(String(e), "error");
    }
  },

  panel: "files",
  setPanel(p) {
    set({ panel: p });
    if (p === "claude") void get().loadClaude(true);
  },

  claude: null,
  claudeLoading: false,

  async loadClaude(force = false) {
    const space = spacesList().find((s) => s.id === get().activeSpaceId);
    if (!space) return;
    if (!force && get().claude) return;
    const path = space.claudeFile ?? joinPath(space.path, CLAUDE_FILE_NAME);
    set({ claudeLoading: true });
    try {
      const text = (await spaceFs.exists(path)) ? await spaceFs.readText(path) : "";
      set({ claude: { path, text, tasks: parseClaudeTasks(text) } });
    } catch (e) {
      console.error("claude file read failed", e);
      set({ claude: { path, text: "", tasks: [] } });
    } finally {
      set({ claudeLoading: false });
    }
  },

  async setClaudeStatus(key, status) {
    const claude = get().claude;
    if (!claude) return;
    // Re-read first: Claude edits this file on its own schedule.
    const fresh = await spaceFs.readText(claude.path).catch(() => claude.text);
    const next = setTaskStatus(fresh, key, status);
    await spaceFs.writeText(claude.path, next);
    set({ claude: { ...claude, text: next, tasks: parseClaudeTasks(next) } });
    const doc = get().doc;
    if (doc?.path === claude.path) set({ doc: { ...doc, text: next, saved: next } });
  },

  async removeClaudeTask(key) {
    const claude = get().claude;
    if (!claude) return;
    const fresh = await spaceFs.readText(claude.path).catch(() => claude.text);
    const next = removeTask(fresh, key);
    await spaceFs.writeText(claude.path, next);
    set({ claude: { ...claude, text: next, tasks: parseClaudeTasks(next) } });
    const doc = get().doc;
    if (doc?.path === claude.path) set({ doc: { ...doc, text: next, saved: next } });
  },

  async connectFolder() {
    const ui = useUI.getState();
    if (spaceFs.kind !== "native") {
      ui.toast("Connecting a folder needs the desktop app", "info");
      return;
    }
    const path = await pickFolder();
    if (!path) return;
    if (spacesList().some((s) => s.path === path)) {
      ui.toast("That folder is already connected", "info");
      return;
    }
    const space: SpaceRef = {
      id: `sp_${Math.random().toString(36).slice(2, 10)}`,
      name: baseName(path),
      path,
      claudeFile: null,
    };
    patchSpaces([...spacesList(), space]);
    get().setActiveSpace(space.id);
    ui.toast(`Connected "${space.name}"`, "success");
  },

  async createDemoSpace() {
    const { name, path } = await seedDemoSpace();
    const existing = spacesList().find((s) => s.path === path);
    if (existing) {
      get().setActiveSpace(existing.id);
      await get().loadDir(path, true);
      return;
    }
    const space: SpaceRef = {
      id: `sp_${Math.random().toString(36).slice(2, 10)}`,
      name,
      path,
      claudeFile: null,
    };
    patchSpaces([...spacesList(), space]);
    get().setActiveSpace(space.id);
  },

  removeSpace(id) {
    const next = spacesList().filter((s) => s.id !== id);
    patchSpaces(next);
    const { claudeSpaceId } = useSettings.getState().settings;
    if (claudeSpaceId === id) useSettings.getState().patch({ claudeSpaceId: null });
    if (get().activeSpaceId === id) get().setActiveSpace(next[0]?.id ?? null);
  },

  fileIndex: {},

  async buildFileIndex(spacePath, force = false) {
    if (!force && get().fileIndex[spacePath]) return;
    // A capped, depth-limited walk — enough for a mention picker without
    // choking on someone connecting a huge folder.
    const CAP = 1500;
    const MAX_DEPTH = 8;
    const out: MentionEntry[] = [];
    const walk = async (dir: string, depth: number): Promise<void> => {
      if (out.length >= CAP || depth > MAX_DEPTH) return;
      let entries: FsEntry[];
      try {
        entries = await spaceFs.listDir(dir);
      } catch {
        return;
      }
      for (const e of entries) {
        if (out.length >= CAP) return;
        out.push({ path: e.path, rel: relPath(spacePath, e.path), isDir: e.isDir });
        if (e.isDir) await walk(e.path, depth + 1);
      }
    };
    await walk(spacePath, 0);
    set({ fileIndex: { ...get().fileIndex, [spacePath]: out } });
  },
}));

/* ------------------------------ assign to Claude ---------------------------- */

/**
 * Append a task to the hand-off file of the Claude space, creating the file the
 * first time. Returns the file path, or null when no space is connected yet.
 */
export async function assignToClaude(input: AssignInput): Promise<string | null> {
  const space = claudeSpace();
  if (!space) return null;
  const path = space.claudeFile ?? joinPath(space.path, CLAUDE_FILE_NAME);
  const current = (await spaceFs.exists(path))
    ? await spaceFs.readText(path)
    : CLAUDE_FILE_TEMPLATE;
  await spaceFs.writeText(path, appendTask(current, input));

  if (space.claudeFile !== path) {
    patchSpaces(spacesList().map((s) => (s.id === space.id ? { ...s, claudeFile: path } : s)));
  }
  const st = useSpaces.getState();
  if (st.activeSpaceId === space.id) {
    await st.loadDir(parentPath(path), true);
    if (st.claude) await st.loadClaude(true);
  }
  return path;
}

/**
 * Read the hand-off file of the Claude space without opening Spaces — used by
 * the task detail panel to show where a handed-off task currently stands.
 */
export async function readClaudeTasks(): Promise<{ path: string; tasks: ClaudeTask[] } | null> {
  const space = claudeSpace();
  if (!space) return null;
  const path = space.claudeFile ?? joinPath(space.path, CLAUDE_FILE_NAME);
  if (!(await spaceFs.exists(path))) return { path, tasks: [] };
  const text = await spaceFs.readText(path).catch(() => "");
  return { path, tasks: parseClaudeTasks(text) };
}

/** How many tasks in the hand-off file are waiting on the user right now. */
export function claudeAwaitingCount(tasks: ClaudeTask[]): number {
  return tasks.filter((t) => t.status === "waiting_review").length;
}
