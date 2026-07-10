/// <reference types="vite/client" />

/** Package version injected at build time (see vite.config.ts `define`). */
declare const __APP_VERSION__: string;

declare module "*.sql?raw" {
  const content: string;
  export default content;
}

declare module "sql.js" {
  export interface SqlJsStatement {
    bind(params?: unknown[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): boolean;
    reset(): void;
  }
  export interface SqlJsDatabase {
    run(sql: string, params?: unknown[]): SqlJsDatabase;
    prepare(sql: string): SqlJsStatement;
    export(): Uint8Array;
    close(): void;
  }
  export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => SqlJsDatabase;
  }
  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string;
  }): Promise<SqlJsStatic>;
}

declare module "sql.js/dist/sql-wasm.wasm?url" {
  const url: string;
  export default url;
}
