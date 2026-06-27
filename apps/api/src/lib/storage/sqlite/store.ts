import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { MIGRATIONS } from "./migrations.js";

let db: Database.Database | null = null;
let initError: Error | null = null;
let activeDbPath: string | null = null;

function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedVersions = new Set(
    (
      database.prepare(`SELECT version FROM schema_migrations ORDER BY version`).all() as {
        version: number;
      }[]
    ).map((row) => row.version)
  );

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    database.exec(migration.sql);
    database
      .prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`)
      .run(migration.version, new Date().toISOString());
  }
}

export function getAnalyticsDb(dbPath: string): Database.Database {
  if (db && activeDbPath === dbPath) {
    return db;
  }

  if (initError && activeDbPath === dbPath) {
    throw initError;
  }

  if (db) {
    db.close();
    db = null;
    initError = null;
  }

  try {
    const directory = path.dirname(dbPath);
    fs.mkdirSync(directory, { recursive: true });

    const database = new Database(dbPath);
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    runMigrations(database);

    db = database;
    activeDbPath = dbPath;
    initError = null;
    return database;
  } catch (error) {
    initError = error instanceof Error ? error : new Error(String(error));
    throw initError;
  }
}

export function isAnalyticsDbAvailable(dbPath: string): boolean {
  try {
    getAnalyticsDb(dbPath);
    return true;
  } catch {
    return false;
  }
}

export function runInAnalyticsTransaction<T>(
  dbPath: string,
  fn: (database: Database.Database) => T
): T {
  const database = getAnalyticsDb(dbPath);
  const transaction = database.transaction(fn);
  return transaction(database);
}

export function closeAnalyticsDb(): void {
  if (db) {
    db.close();
    db = null;
  }

  activeDbPath = null;
  initError = null;
}
