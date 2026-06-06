-- Schéma SQLite — YouTube Playlist Analyzer
-- Idempotent : exécuté à chaque démarrage (CREATE TABLE IF NOT EXISTS).
-- Voir ARCHITECTURE.md §4.

-- Sources (playlists / chaînes)
CREATE TABLE IF NOT EXISTS sources (
  key          TEXT PRIMARY KEY,      -- 'pl:<id>' ou 'ch:<channelId>'
  kind         TEXT NOT NULL,         -- 'playlist' | 'channel'
  playlist_id  TEXT NOT NULL,         -- playlist réelle (uploads pour une chaîne)
  title        TEXT NOT NULL,
  origin       TEXT,                  -- entrée utilisateur d'origine
  position     INTEGER DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now')),
  refreshed_at TEXT
);

-- Vidéos (cache des métadonnées YouTube + liaison source)
CREATE TABLE IF NOT EXISTS videos (
  id           TEXT NOT NULL,         -- videoId YouTube
  source_key   TEXT NOT NULL REFERENCES sources(key) ON DELETE CASCADE,
  title        TEXT,
  channel      TEXT,
  channel_id   TEXT,
  published_at TEXT,
  added_at     TEXT,                  -- date d'ajout à la playlist
  description  TEXT,
  thumbnail    TEXT,
  duration_s   INTEGER,
  is_short     INTEGER DEFAULT 0,
  views        INTEGER,
  likes        INTEGER,
  comments     INTEGER,
  definition   TEXT,
  lang         TEXT,
  tags         TEXT,                  -- JSON
  position     INTEGER DEFAULT 0,     -- ordre dans la playlist
  PRIMARY KEY (id, source_key)
);

CREATE INDEX IF NOT EXISTS idx_videos_source ON videos (source_key);

-- Données utilisateur par vidéo (indépendantes de la source)
CREATE TABLE IF NOT EXISTS video_user_data (
  video_id   TEXT PRIMARY KEY,
  note_html  TEXT,                    -- note riche en HTML
  transcript TEXT,
  summary_md TEXT,                    -- résumé IA (markdown)
  summary_detailed_md TEXT,           -- résumé IA détaillé (markdown)
  hidden     INTEGER DEFAULT 0,
  seen       INTEGER DEFAULT 0,       -- pour le traitement auto des nouveautés
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Réglages clé/valeur (clés API override + préférences UI)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
