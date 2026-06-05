# ARCHITECTURE — YouTube Playlist Analyzer

Architecture technique cible. Voir `CAHIER_DES_CHARGES.md` pour le fonctionnel et `PROTOTYPE.html` pour la référence d'implémentation.

## 1. Vue d'ensemble

```
┌─────────────┐      HTTP/JSON      ┌──────────────┐      HTTPS      ┌───────────────┐
│  Frontend   │ ──────────────────> │   Backend    │ ──────────────> │ APIs externes │
│ React + TS  │ <────────────────── │ Fastify + TS │ <────────────── │ YouTube/      │
│  (Vite)     │                     │  + SQLite    │                 │ OpenRouter/   │
└─────────────┘                     └──────────────┘                 │ Apify         │
                                          │                          └───────────────┘
                                          ▼
                                    SQLite (volume)
```

- Le frontend ne parle qu'au backend. Aucune clé API côté client.
- Le backend détient les clés (`.env` + override en base), proxifie les API tierces, met en cache et persiste.

## 2. Arborescence du projet

```
youtube-analyzer/
├── docker-compose.yml
├── .env.example
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── server.ts            # bootstrap Fastify, plugins, CORS
│   │   ├── config.ts            # lecture .env + merge settings DB
│   │   ├── db/
│   │   │   ├── index.ts         # connexion better-sqlite3, migrations
│   │   │   └── schema.sql       # schéma (cf. §4)
│   │   ├── routes/
│   │   │   ├── sources.ts       # CRUD sources + refresh
│   │   │   ├── videos.ts        # liste vidéos, masquage
│   │   │   ├── notes.ts         # notes (markdown stocké)
│   │   │   ├── transcripts.ts   # proxy Apify
│   │   │   ├── summaries.ts     # proxy OpenRouter
│   │   │   ├── batch.ts         # traitement séquentiel + progression
│   │   │   ├── settings.ts      # clés/override, préférences
│   │   │   └── data.ts          # export/import global
│   │   ├── services/
│   │   │   ├── youtube.ts       # appels YouTube Data, parsing, cache
│   │   │   ├── apify.ts         # appel actor, decode entités, format
│   │   │   ├── openrouter.ts    # appel chat completions
│   │   │   └── markdown.ts      # html<->markdown (côté serveur si besoin export)
│   │   └── types.ts
│   └── data/                    # (volume) youtube.db
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api/client.ts        # wrapper fetch vers le backend
        ├── store/               # état global (Zustand recommandé, léger)
        ├── components/
        │   ├── Header.tsx       # logo, sélecteur de sources, actions
        │   ├── SourceSelector.tsx
        │   ├── FilterBar.tsx
        │   ├── VideoGrid.tsx
        │   ├── VideoList.tsx
        │   ├── DetailPanel.tsx  # split redimensionnable + onglets
        │   ├── NotesEditor.tsx  # TipTap/Lexical, HTML<->MD
        │   ├── TranscriptTab.tsx
        │   ├── SummaryTab.tsx
        │   └── SettingsModal.tsx
        ├── hooks/
        └── styles/              # thème clair/sombre (variables CSS)
```

## 3. Configuration des clés (serveur + override UI)

- `.env` (backend) : `YOUTUBE_API_KEY`, `OPENROUTER_API_KEY`, `APIFY_TOKEN`, `OPENROUTER_MODEL` (défaut `anthropic/claude-3.5-sonnet`), `APIFY_ACTOR` (défaut `vKlQCAJRI72MdyK1u`), `PORT`, `CORS_ORIGIN`.
- Table `settings` (clé/valeur) : permet d'**écraser** ces valeurs depuis l'UI Réglages. Résolution effective = valeur en base si présente, sinon `.env`.
- Endpoint `GET /api/settings` renvoie **uniquement la présence** des clés (`{ youtube: true, openrouter: false, apify: true, model: "…" }`), **jamais les valeurs**.
- Endpoint `PUT /api/settings` enregistre les overrides (les clés sont écrites en base, jamais relues en clair côté front).

## 4. Schéma SQLite

```sql
-- Sources (playlists / chaînes)
CREATE TABLE sources (
  key         TEXT PRIMARY KEY,      -- 'pl:<id>' ou 'ch:<channelId>'
  kind        TEXT NOT NULL,         -- 'playlist' | 'channel'
  playlist_id TEXT NOT NULL,         -- playlist réelle (uploads pour une chaîne)
  title       TEXT NOT NULL,
  origin      TEXT,                  -- entrée utilisateur d'origine
  position    INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now')),
  refreshed_at TEXT
);

-- Vidéos (cache des métadonnées YouTube + liaison source)
CREATE TABLE videos (
  id           TEXT NOT NULL,        -- videoId YouTube
  source_key   TEXT NOT NULL REFERENCES sources(key) ON DELETE CASCADE,
  title        TEXT,
  channel      TEXT,
  channel_id   TEXT,
  published_at TEXT,
  added_at     TEXT,                 -- date d'ajout à la playlist
  description  TEXT,
  thumbnail    TEXT,
  duration_s   INTEGER,
  is_short     INTEGER DEFAULT 0,
  views        INTEGER,
  likes        INTEGER,
  comments     INTEGER,
  definition   TEXT,
  lang         TEXT,
  tags         TEXT,                 -- JSON
  PRIMARY KEY (id, source_key)
);

-- Données utilisateur par vidéo (indépendantes de la source)
CREATE TABLE video_user_data (
  video_id   TEXT PRIMARY KEY,
  note_html  TEXT,                   -- note riche en HTML
  transcript TEXT,
  summary_md TEXT,                   -- résumé en markdown
  hidden     INTEGER DEFAULT 0,
  seen       INTEGER DEFAULT 0,      -- pour le traitement auto des nouveautés
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Réglages clé/valeur (clés API override + préférences)
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,            -- 'youtube_api_key', 'theme', 'auto_process', 'show_hidden', 'panel_w', 'view', ...
  value TEXT
);
```

Notes :
- `video_user_data` est volontairement **indépendant de la source** (clé = `video_id`) pour qu'une note/transcription suive la vidéo même si elle apparaît dans plusieurs playlists.
- Les clés API stockées dans `settings` ne sont jamais renvoyées au front (cf. §3).

## 5. Routes API (REST)

Toutes préfixées `/api`. Réponses d'erreur : `{ error: { code, message } }`.

### Sources
- `GET  /sources` → liste des sources (avec compte de vidéos).
- `POST /sources` `{ url }` → résout (playlist/chaîne), vérifie via YouTube, persiste, renvoie la source. Erreur claire si URL invalide/introuvable.
- `DELETE /sources/:key` → supprime la source (et ses lignes `videos`).
- `POST /sources/:key/refresh` → re-fetch depuis YouTube, met à jour le cache `videos`.

### Vidéos
- `GET /sources/:key/videos` → vidéos de la source (depuis le cache ; déclenche un fetch si vide). Le **filtrage/tri se fait côté frontend** (volumes modestes), mais l'API peut accepter des query params optionnels.
- `PATCH /videos/:id/hidden` `{ hidden }` → masquer/réafficher.

### Données utilisateur
- `PUT /videos/:id/note` `{ note_html }` → enregistre la note (HTML).
- `PUT /videos/:id/transcript` `{ transcript }` → enregistre une transcription (collée manuellement).
- `POST /videos/:id/transcript/fetch` → récupère via Apify (serveur), enregistre, renvoie le texte formaté.
- `POST /videos/:id/summary/generate` → génère via OpenRouter (serveur), enregistre, renvoie le markdown.

### Batch (synchrone)
- `POST /sources/:key/process` `{ transcripts: bool, summaries: bool, onlyMissing: bool }` → traite **séquentiellement** les vidéos concernées.
  - Mécanisme de progression retenu : **réponse en streaming** (`text/event-stream` ou chunked NDJSON) émettant une ligne `{ done, total, currentTitle, errors }` par vidéo, puis un récap final. Le frontend lit le flux et met à jour une barre de progression. (Alternative acceptable si plus simple : endpoint qui démarre le traitement + `GET /process/status` pollé par le front. Choisir l'option la plus simple à implémenter proprement ; documenter le choix.)
- Logique « nouvelles vidéos » : à chaque refresh, comparer aux `seen` ; si auto activé et non-baseline, traiter les nouvelles puis marquer `seen`.

### Réglages & données
- `GET /settings` → présence des clés + préférences (jamais les valeurs des clés).
- `PUT /settings` → enregistre overrides clés + préférences.
- `GET /data/export` → JSON complet (sources, videos user data, settings non sensibles).
- `POST /data/import` → restaure depuis un JSON (remplace).

## 6. Intégrations externes (détails)

### YouTube Data API v3 (clé API, lecture seule)
- `playlists.list?part=snippet&id=<PL>` → titre playlist.
- `channels.list?part=snippet,contentDetails&id=UC… | forHandle=@… | forUsername=…` → titre + `contentDetails.relatedPlaylists.uploads`.
- `playlistItems.list?part=snippet,contentDetails&maxResults=50&playlistId=<PL>&pageToken=…` → pagination complète.
- `videos.list?part=contentDetails,statistics,snippet&id=<≤50 ids>` → durée (ISO 8601), stats, langue, définition. Découper par lots de 50.
- Parsing durée ISO → secondes ; `is_short` = durée ≤ 60 s.

### Apify — transcriptions
- Actor par défaut : `vKlQCAJRI72MdyK1u` (configurable via `APIFY_ACTOR`).
- Endpoint synchrone : `POST https://api.apify.com/v2/acts/<ACTOR>/run-sync-get-dataset-items?token=<APIFY_TOKEN>`
- Corps (une vidéo) : `{ "languages": ["fr","en"], "outputFormat": "text", "urls": [{ "url": "https://www.youtube.com/watch?v=<ID>" }] }`
- Réponse : tableau d'items. Extraction défensive du texte (champs probables : `transcript`, `text`, `captions`, `content`, `subtitles`…). Puis **décoder les entités HTML** (`&#39;` etc.) et reformater : une phrase par ligne (saut après `.`/`!`/`?`). Voir `formatTranscript`/`decodeEntities`/`extractTranscriptText` dans le prototype.
- Évolution : appel **multi-URL** en un run pour le batch (le prototype documente l'entrée à 10 URLs).

### OpenRouter — résumés
- `POST https://openrouter.ai/api/v1/chat/completions`
- Headers : `Authorization: Bearer <OPENROUTER_API_KEY>`, `Content-Type: application/json`. (`HTTP-Referer`/`X-Title` optionnels.)
- Corps : `{ model: <OPENROUTER_MODEL>, max_tokens: 1024, messages: [{ role:'user', content: <prompt> }] }`
- Réponse : `data.choices[0].message.content`. Le prompt (FR, sortie Markdown : titre `##`, synthèse, puces) est repris du prototype (`buildSummaryPrompt`).

## 7. Frontend — points clés

- État global léger (Zustand suggéré) : source active, filtres, vue, thème, largeur panneau, vidéo sélectionnée.
- Persistance des **préférences UI** côté backend (`settings`) pour la synchro multi-appareils — le navigateur ne stocke plus rien d'essentiel.
- **NotesEditor** : TipTap (recommandé) configuré pour produire du HTML ; conversion HTML→Markdown pour les boutons « Copier MD » et l'export ; conversion Markdown→HTML au collage et à l'import d'un résumé IA.
- Panneau split redimensionnable : largeur en % stockée dans `settings`.
- Reprendre le thème clair/sombre et les styles du prototype (variables CSS).

## 8. Docker / Traefik

- `backend/Dockerfile` : build TS → run Node ; volume `./backend/data:/app/data` pour SQLite.
- `frontend/Dockerfile` : build Vite → servir le statique (nginx ou `vite preview`/serveur statique léger).
- `docker-compose.yml` : services `backend` et `frontend`, réseau commun, volume SQLite, variables depuis `.env`.
- **Labels Traefik** fournis en commentaire/optionnels (router + service + certresolver), à activer selon l'install existante. Par défaut, exposition sur le réseau privé.
- Rappel sécurité : pas d'auth applicative → ne pas exposer publiquement sans auth au niveau Traefik.
