import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { db } from "./db/index.js";

/**
 * Charge le fichier .env (si présent) dans process.env, sans écraser les
 * variables déjà définies par l'environnement. Idempotent et silencieux.
 */
function loadEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
    // Node >= 20.12 / 22 : chargement natif des fichiers .env.
    process.loadEnvFile(envPath);
  }
}
loadEnv();

/** Version applicative (affichée dans la page de diagnostic / les réglages). */
export const APP_VERSION = "1.0.0";

/**
 * Clés de configuration stockables en base (table `settings`) et leur
 * variable d'environnement de repli + valeur par défaut éventuelle.
 */
const CONFIG_KEYS = {
  youtube_api_key: { env: "YOUTUBE_API_KEY" },
  openrouter_api_key: { env: "OPENROUTER_API_KEY" },
  openrouter_model: { env: "OPENROUTER_MODEL", default: "anthropic/claude-3.5-sonnet" },
  apify_token: { env: "APIFY_TOKEN" },
  apify_actor: { env: "APIFY_ACTOR", default: "vKlQCAJRI72MdyK1u" },
} as const;

export type ConfigKey = keyof typeof CONFIG_KEYS;

// Prompts système des résumés IA (éditables via Réglages, défaut si non défini).
export const DEFAULT_SUMMARY_PROMPT =
  "Tu es un assistant qui résume des vidéos YouTube. Rédige un résumé clair et structuré en français, au format Markdown. Produis : un titre court (##), 2-3 phrases de synthèse, puis une liste à puces des points clés. Sois concis et factuel. Réponds uniquement avec le Markdown du résumé.";

export const DEFAULT_SUMMARY_DETAILED_PROMPT =
  "Tu es un assistant qui résume des vidéos YouTube de façon détaillée. Rédige en français, au format Markdown, un résumé approfondi et structuré : un titre (##), une synthèse de quelques paragraphes, puis des sections thématiques avec sous-titres (###) et listes à puces couvrant les points importants, exemples et nuances abordés. Reste fidèle au contenu, sans inventer. Réponds uniquement avec le Markdown du résumé.";

const SUMMARY_PROMPT_KEY = "summary_system_prompt";
const SUMMARY_DETAILED_PROMPT_KEY = "summary_detailed_system_prompt";

export const getSummaryPrompt = (): string =>
  getSetting(SUMMARY_PROMPT_KEY)?.trim() || DEFAULT_SUMMARY_PROMPT;
export const getSummaryDetailedPrompt = (): string =>
  getSetting(SUMMARY_DETAILED_PROMPT_KEY)?.trim() || DEFAULT_SUMMARY_DETAILED_PROMPT;

const selectSetting = db.prepare<[string], { value: string | null }>(
  "SELECT value FROM settings WHERE key = ?",
);
const upsertSetting = db.prepare<[string, string | null]>(
  `INSERT INTO settings (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
);

/** Lit une valeur brute de la table `settings` (sans repli .env). */
export function getSetting(key: string): string | undefined {
  const row = selectSetting.get(key);
  const value = row?.value;
  return value === null || value === undefined ? undefined : value;
}

/** Écrit (ou met à jour) une valeur dans la table `settings`. */
export function setSetting(key: string, value: string | null): void {
  upsertSetting.run(key, value);
}

/**
 * Résolution effective d'une valeur de configuration :
 * 1) override en base (`settings`) s'il est défini et non vide,
 * 2) sinon variable d'environnement,
 * 3) sinon valeur par défaut éventuelle.
 */
export function resolveConfig(key: ConfigKey): string | undefined {
  const dbValue = getSetting(key);
  if (dbValue && dbValue.trim() !== "") return dbValue;

  const spec = CONFIG_KEYS[key];
  const envValue = process.env[spec.env]?.trim();
  if (envValue) return envValue;

  return "default" in spec ? spec.default : undefined;
}

/** Indique si une clé secrète est disponible (base ou .env), sans la révéler. */
export function hasConfig(key: ConfigKey): boolean {
  return Boolean(resolveConfig(key));
}

const listSettingsStmt = db.prepare<[], { key: string; value: string | null }>(
  "SELECT key, value FROM settings",
);

// Clés exposées hors `preferences` (gérées explicitement par l'UI).
const NON_PREFERENCE_KEYS = new Set([
  SUMMARY_PROMPT_KEY,
  SUMMARY_DETAILED_PROMPT_KEY,
  "ledger_backfilled", // marqueur interne de migration
]);

/** Réglages non-secrets (préférences UI) : toutes les lignes hors clés de config/prompts. */
export function listPreferences(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of listSettingsStmt.all()) {
    if (row.key in CONFIG_KEYS || NON_PREFERENCE_KEYS.has(row.key)) continue;
    if (row.value !== null) out[row.key] = row.value;
  }
  return out;
}

// Helpers ciblés -------------------------------------------------------------

export const getYoutubeKey = (): string | undefined => resolveConfig("youtube_api_key");
export const getOpenRouterKey = (): string | undefined => resolveConfig("openrouter_api_key");
export const getOpenRouterModel = (): string => resolveConfig("openrouter_model")!;
export const getApifyToken = (): string | undefined => resolveConfig("apify_token");
export const getApifyActor = (): string => resolveConfig("apify_actor")!;

/** Paramètres serveur (non surchargeables via l'UI). */
export const serverConfig = {
  port: Number(process.env.PORT) || 3000,
  corsOrigin: process.env.CORS_ORIGIN?.trim() || "http://localhost:5173",
};
