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

## 4. Schéma SQLite (implémenté en v1.0.0)

```sql
-- Sources (playlists / chaînes)
CREATE TABLE sources (
  key         TEXT PRIMARY KEY,      -- 'pl:<id>' ou 'ch:<channelId>'
  kind        TEXT NOT NULL,         -- 'playlist' | 'channel'
  playlist_id TEXT NOT NULL,         -- playlist réelle (uploads pour une chaîne)
  title       TEXT NOT NULL,         -- affichage (renommable)
  origin      TEXT,
  position    INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now')),
  refreshed_at TEXT
);

-- Vidéos (métadonnées YouTube + liaison source). Mêmes id sous plusieurs sources = doublons.
CREATE TABLE videos (
  id           TEXT NOT NULL,        -- videoId YouTube
  source_key   TEXT NOT NULL REFERENCES sources(key) ON DELETE CASCADE,
  title, channel, channel_id, published_at, added_at, description, thumbnail TEXT,
  duration_s   INTEGER,
  is_short     INTEGER DEFAULT 0,
  views, likes, comments INTEGER,
  definition, lang, tags TEXT,       -- tags = JSON
  position     INTEGER DEFAULT 0,
  deleted      INTEGER DEFAULT 0,    -- suppression locale persistante (par copie source)
  PRIMARY KEY (id, source_key)
);

-- Registre permanent : tout (source, vidéo) déjà importé. Garant de l'import ADDITIF :
-- une vidéo présente ici n'est jamais réimportée (même supprimée/déplacée dans l'app).
-- Purgé uniquement si la source est supprimée (CASCADE).
CREATE TABLE imported_videos (
  source_key  TEXT NOT NULL REFERENCES sources(key) ON DELETE CASCADE,
  video_id    TEXT NOT NULL,
  imported_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (source_key, video_id)
);

-- Données utilisateur par vidéo (indépendantes de la source, clé = video_id)
CREATE TABLE video_user_data (
  video_id            TEXT PRIMARY KEY,
  note_html           TEXT,          -- note riche (HTML)
  transcript          TEXT,
  summary_md          TEXT,          -- résumé IA (markdown)
  summary_detailed_md TEXT,          -- résumé IA détaillé (markdown)
  hidden              INTEGER DEFAULT 0,
  favorite            INTEGER DEFAULT 0,
  seen                INTEGER DEFAULT 0,   -- legacy (plus utilisé en v1)
  updated_at          TEXT DEFAULT (datetime('now'))
);

-- Réglages clé/valeur (clés API override + préférences + prompts système)
CREATE TABLE settings ( key TEXT PRIMARY KEY, value TEXT );
```

Notes :
- **Import additif** : refresh/ajout insèrent uniquement les ID absents du registre de la source ;
  rien n'est supprimé ni mis à jour. La suppression locale (`videos.deleted=1`) est **par copie
  source** (gère les doublons). Voir `repo.importNewVideos`, `deleteVideo`, `moveVideo`.
- `video_user_data` est **indépendant de la source** (clé `video_id`) : note/résumé/favori/masquage
  suivent la vidéo, partagés entre ses copies dans plusieurs playlists. La **suppression**, elle, est
  par copie (sur `videos`).
- `summary_detailed_md` et `favorite` sont ajoutés par migration (`ensureColumn`) ; `imported_videos`
  est créée au démarrage, avec **backfill une-fois** des vidéos existantes.
- Les clés API dans `settings` ne sont jamais renvoyées au front (cf. §3) ni exportées.

## 5. Routes API (REST) — implémentées en v1.0.0

Toutes sous `/api` (sauf la page de diagnostic `GET /`). Erreurs : `{ error: { code, message } }`.

### Sources
- `GET  /sources` → liste + compte de vidéos (hors supprimées).
- `POST /sources` `{ url }` → résout, vérifie via YouTube, **import additif** des vidéos.
- `PATCH /sources/:key` `{ title }` → renomme l'affichage.
- `DELETE /sources/:key` → supprime la source (CASCADE `videos` + `imported_videos`).
- `POST /sources/:key/refresh` → **import additif** ; renvoie `{ …source, new_video_ids }`
  (= ID fraîchement importés, pour le traitement auto).

### Vidéos
- `GET /sources/:key/videos` → vidéos de la source (import au 1er accès si registre vide).
- `GET /videos/all` → agrégat de toutes les sources (doublons inclus).
- `GET /videos/duplicates` → vidéos présentes sous plusieurs sources.
- `PATCH /videos/:id/hidden` `{ hidden }` → cacher/réafficher (global par id).
- `PATCH /videos/:id/favorite` `{ favorite }` → favori (global par id).
- `DELETE /sources/:key/videos/:id` → **suppression locale persistante** (par copie source).
- `POST /videos/:id/move` `{ from, to }` → déplace la copie vers une autre playlist (fusion si déjà présente).
- Filtrage/tri/recherche : **côté frontend**.

### Données utilisateur
- `PUT /videos/:id/note` `{ note_html }`.
- `PUT /videos/:id/transcript` `{ transcript }` ; `POST /videos/:id/transcript/fetch` (Apify).
- `POST /videos/:id/summary/generate` et `POST /videos/:id/summary-detailed/generate` → génèrent
  via OpenRouter (récupèrent d'abord la transcription si absente et Apify configuré). Renvoient
  `{ summary, transcript }`.
- `PUT /videos/:id/summary` et `PUT /videos/:id/summary-detailed` `{ summary_md }` → sauvegarde des
  corrections (résumés éditables).

### Batch (streaming NDJSON)
- `POST /sources/:key/process` `{ transcripts, summaries, onlyMissing, videoIds? }` → traite
  **séquentiellement**, **streaming NDJSON** : lignes `start` / `progress` `{ done, total, currentTitle, errors }`
  / `error` / `done`. `videoIds` restreint le lot (utilisé pour l'auto sur les nouveautés).
- Traitement auto = sur les `new_video_ids` renvoyés par le refresh (plus de mécanique `seen`).

### Réglages & données
- `GET /settings` → présence des clés + modèle + actor + **prompts système** + préférences.
- `PUT /settings` → overrides clés (jamais relues), prompts, préférences.
- `POST /data/export` `{ settings, sourceKeys?, fields? }` → export sélectif (réglages **sans clés API**).
- `POST /data/import` `{ overwrite, settings?, sources?, videos?, user_data?, imported_videos? }` →
  **import fusionnel** (dédoublonnage, fusion par champ, écrasement optionnel).

### Diagnostic
- `GET /` → page HTML (doc + bouton check). `GET /api/check` → diagnostic JSON (DB, présence des clés, version).

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
