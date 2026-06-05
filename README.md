# YouTube Playlist Analyzer

Outil personnel pour suivre, filtrer, annoter et résumer des **playlists / chaînes YouTube** :
liste des vidéos avec filtres et tri, notes riches (WYSIWYG), transcriptions (via Apify),
résumés IA (via OpenRouter), masquage local, export/import des données.

Backend **Fastify + TypeScript + SQLite**, frontend **React + Vite + TypeScript**, conteneurisé.

> ⚠️ **Sécurité** : cette application n'a **aucune authentification** et est prévue pour un
> **réseau privé uniquement**. Ne l'expose **pas** publiquement sans ajouter une authentification
> (au minimum une *basic auth* / *forward-auth* au niveau de Traefik — voir les labels commentés
> dans `docker-compose.yml`). Les clés API vivent côté serveur et ne sont **jamais** envoyées au
> navigateur.

## Architecture

```
Frontend (React/Vite, nginx)  ──/api──>  Backend (Fastify)  ──>  YouTube / OpenRouter / Apify
                                              │
                                              └── SQLite (volume)
```

Le frontend ne parle qu'au backend ; en production, nginx sert le statique et proxifie `/api`
vers le backend. Détails dans `ARCHITECTURE.md`, fonctionnel dans `CAHIER_DES_CHARGES.md`.

## Prérequis

- Node.js LTS (≥ 20) pour le développement.
- Docker + Docker Compose pour l'exécution conteneurisée.
- Une clé **YouTube Data API v3** (obligatoire). OpenRouter et Apify sont optionnels.

## Configuration

Copie `.env.example` vers `.env` à la racine, puis renseigne tes clés :

| Variable | Rôle | Requis |
|---|---|---|
| `YOUTUBE_API_KEY` | Lister/résoudre les sources et vidéos | ✅ |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | Résumés IA | optionnel |
| `APIFY_TOKEN` / `APIFY_ACTOR` | Transcriptions (actor défaut `vKlQCAJRI72MdyK1u`) | optionnel |
| `PORT` | Port d'écoute du backend (défaut `3000`) | — |
| `CORS_ORIGIN` | Origine autorisée en dev (défaut `http://localhost:5173`) | — |
| `DB_PATH` | Chemin du fichier SQLite | — |
| `FRONTEND_PORT` | Port hôte du frontend en Docker (défaut `8080`) | — |

Les clés peuvent aussi être saisies/écrasées depuis la page **Réglages** de l'app
(stockées côté serveur dans la table `settings`, jamais exposées au front).

## Développement

```bash
# Backend (http://localhost:3000)
cd backend && npm install && npm run dev

# Frontend (http://localhost:5173, proxy /api -> :3000)
cd frontend && npm install && npm run dev
```

Tests et qualité backend :

```bash
cd backend && npm test        # vitest
cd backend && npm run typecheck
```

## Exécution conteneurisée

```bash
cp .env.example .env          # puis remplis tes clés
docker compose up --build
```

- Frontend : http://localhost:8080 (configurable via `FRONTEND_PORT`).
- Le backend n'expose **pas** de port par défaut (joignable seulement via le réseau interne et le
  proxy nginx). La base SQLite est persistée dans le volume Docker `sqlite-data`.

### Derrière Traefik

Le `docker-compose.yml` contient des **labels Traefik commentés** (router, entrypoint,
certresolver, et une *basic-auth*). Décommente-les et adapte les variables
(`APP_DOMAIN`, `TRAEFIK_ENTRYPOINT`, `TRAEFIK_CERTRESOLVER`, `BASIC_AUTH_USERS`) à ton installation.
Rappel : **active une auth au niveau de Traefik**, l'application n'en fournit aucune.

## Fonctionnalités

- Sources multiples (playlists ou chaînes), une active à la fois ; ajout via l'URL du presse-papier.
- Vues **grille** / **liste**, filtres période + type + créateur, tris, thème clair/sombre.
- Panneau de détail redimensionnable : **Notes** (éditeur riche, copie MD/txt), **Description**,
  **Transcription** (Apify ou collage), **Résumé IA** (OpenRouter, rendu Markdown).
- **Masquage** local des vidéos, **traitement par lot** séquentiel avec progression, **traitement
  automatique** des nouvelles vidéos, **export/import** JSON.

## Documents

- `CLAUDE.md` — contexte et conventions.
- `CAHIER_DES_CHARGES.md` — fonctionnalités attendues (fait foi).
- `ARCHITECTURE.md` — structure, schéma SQLite, routes API, intégrations.
- `PROTOTYPE.html` — prototype mono-fichier de référence visuelle/comportementale.

## Évolutions futures (hors périmètre)

Suppression réelle de vidéos YouTube (OAuth), réordonnancement de playlist, authentification
multi-utilisateurs, file de jobs asynchrone pour le batch. Voir §6 du cahier des charges.
