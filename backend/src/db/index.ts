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

  // Migrations additives pour les bases existantes (colonnes ajoutées après coup).
  ensureColumn(db, "video_user_data", "summary_detailed_md", "TEXT");
  ensureColumn(db, "video_user_data", "favorite", "INTEGER DEFAULT 0");
  ensureColumn(db, "videos", "deleted", "INTEGER DEFAULT 0");

  backfillImportedLedger(db);

  return db;
}

/**
 * Initialise le registre `imported_videos` à partir des vidéos déjà présentes,
 * UNE SEULE FOIS. Sans ça, après mise à jour, le 1er refresh verrait toutes les
 * vidéos existantes comme « nouvelles » et déclencherait l'auto-traitement en masse.
 */
function backfillImportedLedger(db: Database.Database): void {
  const done = db.prepare("SELECT value FROM settings WHERE key = 'ledger_backfilled'").get() as
    | { value: string }
    | undefined;
  if (done?.value === "1") return;
  db.exec(
    "INSERT OR IGNORE INTO imported_videos (source_key, video_id) SELECT source_key, id FROM videos",
  );
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('ledger_backfilled', '1') ON CONFLICT(key) DO UPDATE SET value = '1'",
  ).run();
}

/** Ajoute une colonne si elle n'existe pas déjà (ALTER TABLE idempotent). */
function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  type: string,
): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

/** Connexion SQLite partagée (singleton). */
export const db = createDb();
