import type { SqlDriver } from "./driver";
import m001 from "./migrations/001_init.sql?raw";

// Numbered migrations — append only, never mutate old entries.
const MIGRATIONS: { v: number; sql: string }[] = [{ v: 1, sql: m001 }];

function splitStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function migrate(db: SqlDriver): Promise<void> {
  const rows = await db.select<{ user_version: number }>("PRAGMA user_version");
  const current = rows[0]?.user_version ?? 0;
  for (const m of MIGRATIONS) {
    if (m.v <= current) continue;
    for (const stmt of splitStatements(m.sql)) {
      try {
        await db.execute(stmt);
      } catch (e) {
        // Idempotency guard: two windows can race on startup migrations.
        const msg = String(e);
        if (!/duplicate column|already exists/i.test(msg)) throw e;
      }
    }
    await db.execute(`PRAGMA user_version = ${m.v}`);
  }
}
