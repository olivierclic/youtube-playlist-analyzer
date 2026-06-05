import Database from "better-sqlite3";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Résout le chemin du fichier SQLite.
 * `DB_PATH` (relatif au cwd du backend) ou défaut `data/youtube.db`.
 */
function resolveDbPath(): string {
  const raw = process.env.DB_PATH?.trim() || "data/youtube.db";
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

function createDb(): Database.Database {
  const dbPath = resolveDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Migrations : exécution idempotente du schéma (CREATE TABLE IF NOT EXISTS).
  const schema = readFileSync(resolve(here, "schema.sql"), "utf8");
  db.exec(schema);

  return db;
}

/** Connexion SQLite partagée (singleton). */
export const db = createDb();
