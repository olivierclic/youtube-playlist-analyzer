# YouTube Playlist Analyzer

Outil personnel pour suivre, annoter et résumer des playlists/chaînes YouTube. Backend Fastify + SQLite, frontend React (Vite), conteneurisé.

> ⚠️ **Sécurité** : cette application n'a **aucune authentification** et est prévue pour un **réseau privé uniquement**. Ne l'expose pas publiquement sans ajouter une authentification (au minimum une basic auth / forward-auth au niveau de Traefik). Les clés API vivent côté serveur et ne sont jamais envoyées au navigateur.

## Documents

- `CLAUDE.md` — contexte et conventions pour Claude Code (à lire en premier).
- `CAHIER_DES_CHARGES.md` — toutes les fonctionnalités attendues.
- `ARCHITECTURE.md` — structure, schéma SQLite, routes API, intégrations.
- `PROTOTYPE.html` — prototype mono-fichier **fonctionnel** servant de référence visuelle et comportementale (toute la logique côté navigateur y est, à porter en back/front).

## Pour démarrer le développement avec Claude Code

1. Place-toi à la racine de ce dossier et lance `claude`.
2. Demande la mise en place selon la **roadmap** du cahier des charges (commencer par le backend socle).
3. Renseigne les clés dans `.env` (voir `.env.example`).

## Démarrage rapide (une fois le code généré)

```bash
cp .env.example .env   # puis remplis tes clés
docker compose up --build
# Frontend : http://localhost:5173 (ou le port configuré)
# Backend  : http://localhost:3000/api
```

## Clés API nécessaires

- **YouTube Data API v3** (obligatoire) — lister les vidéos. Console Google Cloud → activer l'API → créer une clé.
- **OpenRouter** (optionnel) — résumés IA. Slug de modèle de la forme `fournisseur/modèle`.
- **Apify** (optionnel) — transcriptions. Actor par défaut `vKlQCAJRI72MdyK1u`.

Les clés peuvent aussi être saisies/écrasées depuis la page Réglages de l'app (stockées côté serveur, jamais exposées au front).
