# Journal des modifications (Changelog)

Toutes les évolutions notables de ce projet sont consignées ici.

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
versions selon [SemVer](https://semver.org/lang/fr/) (`MAJEUR.MINEUR.CORRECTIF`).

## [Non publié]

_(rien pour l'instant)_

## [1.0.0] — 2026-06-06

Première version complète. Application personnelle de suivi/annotation de vidéos YouTube
(backend Fastify + SQLite, frontend React/Vite), conteneurisée.

### Principe directeur
- **L'application est la source de vérité, pas YouTube.** Le rafraîchissement d'une playlist ne sert
  qu'à **importer les nouvelles vidéos**.

### Ajouté
- **Sources** : ajout de playlists/chaînes via l'URL du presse-papier, renommage de l'affichage,
  ouverture de la playlist sur YouTube, suppression.
- **Import additif** : registre permanent par playlist (`imported_videos`) ; une vidéo déjà importée
  n'est jamais réimportée (même supprimée ou déplacée dans l'app) ; les vidéos retirées côté YouTube
  restent dans l'app.
- **Affichage** : vues grille/liste, thème clair/sombre, panneau de détail redimensionnable.
- **Filtres** : période, type (short/vidéo), créateur (recalculé selon tous les filtres actifs),
  **mot-clé**, **favoris** ; tris multiples.
- **Listes virtuelles** : « Toutes » (agrégat de toutes les playlists, doublons inclus, activable
  dans les Réglages) et « Doublons » (vidéos présentes dans plusieurs playlists).
- **Par vidéo** : notes riches (éditeur, copie MD/txt), transcription (Apify ou collage),
  **Résumé IA** et **Résumé IA détaillé** — tous deux **éditables** ; **favori** ; **cacher** ;
  **suppression définitive locale** (persistante, par copie) ; **déplacement** vers une autre
  playlist ; **export PDF** de la fiche (rubriques au choix, avec miniature).
- **Traitement par lot** séquentiel avec progression (streaming NDJSON) ; **traitement automatique**
  des nouvelles vidéos au rafraîchissement.
- **Réglages** : clés API (write-only), modèle IA, actor Apify, **prompts système** des deux résumés
  (éditables), options d'affichage.
- **Export/import** sélectifs et **fusionnels** : choix des playlists et des champs ; import multi-
  formats avec dédoublonnage et choix écraser/conserver.
- **Page de diagnostic** backend (`/` + `/api/check`).
- **Conteneurisation** : Dockerfiles backend/frontend, `docker-compose`, labels Traefik configurables.

### Modifié
- Le rafraîchissement ne réactualise plus les métadonnées des vidéos déjà importées (vues/likes/titre
  **figés** à l'import) — économie de quota, cohérent avec « l'app = référence ».
- Confirmations via **popups applicatives** au lieu des boîtes natives du navigateur.

### Sécurité
- Aucune authentification (réseau privé uniquement) — voir avertissements README/UI.
- Les clés API restent côté serveur : jamais renvoyées au frontend ni incluses dans les exports.

[Non publié]: https://github.com/olivierclic/youtube-playlist-analyzer/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/olivierclic/youtube-playlist-analyzer/releases/tag/v1.0.0
