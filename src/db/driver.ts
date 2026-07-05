import { migrate } from "./migrate";

/**
 * Thin SQL driver abstraction.
 * - In the Tauri app: tauri-plugin-sql (native SQLite file on disk).
 * - In a plain browser (dev preview): sql.js (WASM SQLite) persisted to IndexedDB.
 * Both speak the same SQL, so all app code above this layer is identical.
 */
export interface SqlDriver {
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<void>;
}

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let dbPromise: Promise<SqlDriver> | null = null;

export function getDb(): Promise<SqlDriver> {
  if (!dbPromise) dbPromise = init();
  return dbPromise;
}

async function init(): Promise<SqlDriver> {
  const driver = isTauri ? await initTauriDriver() : await initWasmDriver();
  await migrate(driver);
  return driver;
}

async function initTauriDriver(): Promise<SqlDriver> {
  const { invoke } = await import("@tauri-apps/api/core");
  const Database = (await import("@tauri-apps/plugin-sql")).default;
  // Rust resolves ~/Library/Application Support/flow/flow.db and creates the dir.
  let path = "flow.db";
  try {
    path = await invoke<string>("db_path");
  } catch (e) {
    console.warn("db_path command unavailable, using default location", e);
  }
  const db = await Database.load(`sqlite:${path}`);
  return {
    select: <T>(sql: string, params?: unknown[]) => db.select<T[]>(sql, params ?? []),
    execute: async (sql: string, params?: unknown[]) => {
      await db.execute(sql, params ?? []);
    },
  };
}

const IDB_NAME = "flow-db";
const IDB_STORE = "kv";
const IDB_KEY = "sqlite";

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(): Promise<Uint8Array | null> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(value: Uint8Array): Promise<void> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function initWasmDriver(): Promise<SqlDriver> {
  const mod = (await import("sql.js")) as unknown as {
    default?: typeof import("sql.js").default;
  } & typeof import("sql.js");
  const initSqlJs = (mod.default ?? mod) as typeof import("sql.js").default;
  const wasmUrl = (await import("sql.js/dist/sql-wasm.wasm?url")).default;
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const saved = await idbGet().catch(() => null);
  const db = saved ? new SQL.Database(saved) : new SQL.Database();

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const persist = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      idbSet(db.export()).catch((e) => console.error("persist failed", e));
    }, 250);
  };
  window.addEventListener("beforeunload", () => {
    try {
      idbSet(db.export());
    } catch {
      /* best effort */
    }
  });

  return {
    async select<T>(sql: string, params?: unknown[]): Promise<T[]> {
      const stmt = db.prepare(sql);
      try {
        if (params && params.length) stmt.bind(params);
        const rows: T[] = [];
        while (stmt.step()) rows.push(stmt.getAsObject() as T);
        return rows;
      } finally {
        stmt.free();
      }
    },
    async execute(sql: string, params?: unknown[]): Promise<void> {
      db.run(sql, params);
      persist();
    },
  };
}
