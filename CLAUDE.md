# CLAUDE.md — YouTube Playlist Analyzer

Ce fichier oriente Claude Code sur ce projet. Lis-le en premier, ainsi que `CAHIER_DES_CHARGES.md` et `ARCHITECTURE.md`.

## Vue d'ensemble

Application web personnelle pour suivre et analyser des **playlists et chaînes YouTube** : liste des vidéos, filtres, notes personnelles riches, transcriptions (via Apify), résumés IA (via OpenRouter), export/import des données.

Il existe un **prototype mono-fichier** fonctionnel (`PROTOTYPE.html`, à la racine des specs) qui implémente déjà toute l'UI et la logique côté navigateur. Il sert de **référence fonctionnelle et visuelle**. L'objectif est de le réécrire en architecture **backend + frontend séparés**, conteneurisée.

## Stack imposée

- **Backend** : Node.js (LTS) + **Fastify** + **TypeScript**. Base **SQLite** via `better-sqlite3`.
- **Frontend** : **Vite + React + TypeScript**. Pas de framework CSS lourd imposé (CSS modules ou Tailwind au choix, garder le thème clair/sombre du prototype).
- **Conteneurisation** : `docker-compose` avec 2 services (backend, frontend) + 1 volume pour SQLite. Pensé pour tourner derrière un **Traefik** existant (labels à prévoir, mais configurables).
- **Gestionnaire de paquets** : npm (sauf préférence contraire).

## Décisions structurantes (déjà tranchées)

1. **Authentification : aucune.** L'app tourne sur réseau privé uniquement. Ne pas ajouter de login. Documenter clairement que l'app ne doit PAS être exposée publiquement sans ajout d'auth (voir section Sécurité du cahier des charges).
2. **Clés API : serveur + override UI.** Les clés (YouTube Data, OpenRouter, Apify) vivent côté serveur dans `.env`. Le frontend NE reçoit JAMAIS les clés. Une page Réglages permet de définir/écraser ces clés ; les overrides sont stockés **en base côté serveur** (table `settings`), pas dans le navigateur. Tous les appels aux API tierces passent par le backend (proxy).
3. **Traitement par lot : synchrone simple.** Pas de file de jobs ni de worker. Une route backend traite les vidéos en attente de façon séquentielle et renvoie la progression (voir cahier des charges pour le mécanisme de streaming/polling simple retenu). Acceptable pour un usage perso.

## Conventions de code

- TypeScript strict (`strict: true`) côté back et front.
- Backend : organisation par domaine (routes / services / db). Validation des entrées via les **JSON Schemas Fastify**.
- Pas de secret en dur dans le code. Tout via variables d'environnement (`.env`, non commité ; fournir `.env.example`).
- Messages d'erreur explicites renvoyés au front sous forme `{ error: { code, message } }`.
- Commits clairs, petites unités. Pas de réécriture massive non demandée.

## Commandes (à créer / maintenir)

```bash
# Backend
cd backend && npm install && npm run dev     # dev (tsx/nodemon)
cd backend && npm run build && npm start      # prod

# Frontend
cd frontend && npm install && npm run dev     # Vite dev server
cd frontend && npm run build                  # build statique

# Tout en conteneurs
docker compose up --build
```

## Points d'attention spécifiques

> **MAJ v1.0.0 — modèle d'import ADDITIF (l'app est la source de vérité).** Le refresh n'importe que
> les vidéos **jamais importées** (registre `imported_videos`, par `source_key`+`video_id`). Il ne
> supprime jamais et ne met pas à jour les vidéos existantes (stats figées). Suppression locale
> **persistante** (`videos.deleted`, par copie source) ; **déplacement** local entre playlists
> (`moveVideo`). Listes virtuelles « Toutes » (doublons inclus) et « Doublons ». Sélection frontend
> par clé composite `source_key|id`. Ne PAS revenir à un refresh « purge + ré-import » (l'ancien
> `replaceSourceVideos` a été supprimé). Voir `ARCHITECTURE.md` §4/§5 (à jour).

- **Transcriptions** : l'API YouTube ne permet pas de télécharger le texte (OAuth propriétaire requis). On utilise un **actor Apify** (voir `ARCHITECTURE.md` pour l'ID et le format). Décoder les entités HTML et reformater en phrases (logique déjà présente dans le prototype : `decodeEntities`, `formatTranscript`).
- **Notes riches** : éditeur HTML (WYSIWYG) avec conversion HTML↔Markdown à l'import/export. Le prototype utilise `document.execCommand` ; pour la version pérenne, **préférer un éditeur dédié** (TipTap ou Lexical) côté React.
- **Quota YouTube** : 10 000 unités/jour. Mettre en cache les réponses en base et ne rafraîchir que sur demande explicite (bouton refresh) ou pagination.
- **Suppression de vidéo** : **masquage** (`hidden`, réversible) ET **suppression définitive locale** (`videos.deleted`, persistante, par copie source) — toutes deux locales. La vraie suppression côté YouTube (OAuth) reste une évolution future, pas à implémenter.
- Ne pas régresser sur les fonctionnalités existantes du prototype : la liste de `CAHIER_DES_CHARGES.md` fait foi.

## Ordre de travail suggéré

Voir la section « Roadmap d'implémentation » du cahier des charges. En résumé : (1) backend proxy + SQLite + endpoints lecture, (2) frontend liste + filtres + détail, (3) notes/transcriptions/résumés, (4) batch + réglages, (5) Docker + Traefik.
