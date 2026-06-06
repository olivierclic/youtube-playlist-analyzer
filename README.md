# YouTube Playlists Analyser — v1.0.0

Outil **personnel** pour suivre, filtrer, annoter et résumer des vidéos YouTube. Tu importes des
playlists / chaînes, puis **tout se gère dans l'application** : notes riches, transcriptions (Apify),
résumés IA (OpenRouter), favoris, masquage, suppression, déplacement entre playlists.

Backend **Fastify + TypeScript + SQLite**, frontend **React + Vite + TypeScript**, conteneurisé.

> ⚠️ **Sécurité** : aucune authentification, prévu pour un **réseau privé uniquement**. Ne pas
> exposer publiquement sans auth au niveau du reverse proxy (voir labels Traefik dans
> `docker-compose.yml`). Les clés API vivent côté serveur, ne sont **jamais** renvoyées au
> navigateur ni exportées.

## Principe directeur (important)

**L'application est la source de vérité, pas YouTube.** Le rafraîchissement d'une playlist ne sert
qu'à **importer les nouvelles vidéos** :

- Une vidéo déjà importée n'est **jamais réimportée** (identifiée par son ID YouTube, **par
  playlist**), même si tu l'as ensuite **supprimée** ou **déplacée** dans l'app.
- Une vidéo retirée d'une playlist côté YouTube **reste** dans l'app.
- Les infos des vidéos déjà importées sont **figées** au moment de l'import (vues/likes/titre ne sont
  pas réactualisés) — économise du quota et préserve ta base.

Un **registre permanent** (`imported_videos`) mémorise ce qui a déjà été importé par playlist.

## Architecture

```
Frontend (React/Vite, nginx)  ──/api──>  Backend (Fastify)  ──>  YouTube / OpenRouter / Apify
                                              │
                                              └── SQLite (volume)
```

Détails techniques dans `ARCHITECTURE.md`, fonctionnel dans `CAHIER_DES_CHARGES.md`.

## Fonctionnalités

- **Sources** : playlists ou chaînes ; ajout via l'URL du presse-papier ; renommage de l'affichage ;
  bouton d'ouverture de la playlist sur YouTube. Import **additif** (cf. ci-dessus).
- **Vues** grille / liste, **thème** clair/sombre, panneau de détail redimensionnable.
- **Filtres** : période, type (short/vidéo), créateur (recalculé selon tous les filtres actifs),
  **mot-clé**, favoris ; tri multiple.
- **Listes virtuelles** : **« Toutes »** (agrégat de toutes les playlists, doublons inclus —
  activable dans les Réglages) et **« Doublons »** (vidéos présentes dans plusieurs playlists).
- **Par vidéo** : **notes** riches (éditeur, copie MD/txt), **transcription** (Apify ou collage),
  **Résumé IA** et **Résumé détaillé** — tous deux **éditables** ; **favori** ; **cacher** ;
  **supprimer définitivement** (persistant) ; **déplacer** vers une autre playlist ; **export PDF**
  de la fiche (rubriques au choix).
- **Traitement par lot** séquentiel avec progression ; **traitement automatique** des nouvelles
  vidéos au refresh (pas à l'ajout d'une source).
- **Export / import** sélectifs : choix des playlists et des champs ; réglages exportés **sans les
  clés API** ; import fusionnel (dédoublonnage, fusion par champ, choix écraser/conserver).
- **Réglages** : clés API (write-only), modèle IA, actor Apify, **prompts système** des deux résumés
  (éditables), options d'affichage.
- **Page de diagnostic** backend : `http://<backend>/` (doc courte + bouton de check).

## Prérequis

- Node.js LTS (≥ 20) pour le développement ; Docker + Compose pour l'exécution conteneurisée.
- Une clé **YouTube Data API v3** (obligatoire). OpenRouter (résumés) et Apify (transcriptions) sont
  optionnels.

## Configuration

Copier `.env.example` → `.env` à la racine et renseigner les clés :

| Variable | Rôle | Requis |
|---|---|---|
| `YOUTUBE_API_KEY` | Résoudre/importer les sources et vidéos | ✅ |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | Résumés IA | optionnel |
| `APIFY_TOKEN` / `APIFY_ACTOR` | Transcriptions (actor défaut `vKlQCAJRI72MdyK1u`) | optionnel |
| `PORT` | Port du backend (défaut `3000`) | — |
| `CORS_ORIGIN` | Origine autorisée en dev (défaut `http://localhost:5173`) | — |
| `DB_PATH` | Chemin du fichier SQLite | — |
| `FRONTEND_PORT` | Port hôte du frontend en Docker (défaut `8080`) | — |

Les clés peuvent aussi être saisies/écrasées depuis la page **Réglages** (stockées côté serveur,
jamais exposées au front). Les **prompts système** des résumés y sont aussi modifiables.

## Développement

```bash
# Backend (http://localhost:3000) — page de diagnostic sur /
cd backend && npm install && npm run dev

# Frontend (http://localhost:5173, proxy /api -> :3000)
cd frontend && npm install && npm run dev
```

Qualité backend :

```bash
cd backend && npm test          # vitest (fonctions pures + services mockés)
cd backend && npm run typecheck
```

> Au **premier démarrage** de la v1 sur une base existante, une migration ajoute la colonne
> `videos.deleted`, crée la table `imported_videos` et **enregistre les vidéos déjà présentes comme
> « déjà importées »**. Conséquence : le premier refresh ne réimporte rien (pas de re-traitement en
> masse). C'est sûr et additif.

## Exécution conteneurisée

```bash
cp .env.example .env            # puis remplis tes clés
docker compose up --build
```

- Frontend : http://localhost:8080 (configurable via `FRONTEND_PORT`).
- Backend non exposé par défaut (joignable via le réseau interne + proxy nginx). SQLite persistée
  dans le volume Docker `sqlite-data`.

### Derrière Traefik

Labels Traefik **commentés** dans `docker-compose.yml` (router, entrypoint, certresolver, basic-auth).
Décommenter/adapter selon ton install. **Active une auth au niveau de Traefik** — l'app n'en fournit
aucune.

## Documents

- `CLAUDE.md` — contexte et conventions.
- `CAHIER_DES_CHARGES.md` — fonctionnalités attendues.
- `ARCHITECTURE.md` — structure, schéma SQLite, routes API, intégrations.
- `PROTOTYPE.html` — prototype mono-fichier de référence visuelle initiale.

## Évolutions futures (hors périmètre)

Édition réelle des playlists YouTube (OAuth `youtube.force-ssl`), authentification multi-utilisateurs,
file de jobs asynchrone pour le batch, récupération multi-URL Apify. Voir §6 du cahier des charges.
