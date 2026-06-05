# Cahier des charges — YouTube Playlist Analyzer

Document fonctionnel de référence. Le prototype `PROTOTYPE.html` implémente déjà tout ce qui suit côté navigateur ; il sert de référence visuelle et comportementale. La cible est une réécriture en **backend Fastify/TypeScript + frontend React/TypeScript**, conteneurisée.

## 1. Objectif

Outil personnel pour suivre des sources YouTube (playlists ou chaînes), consulter et filtrer leurs vidéos, prendre des notes riches, récupérer des transcriptions et générer des résumés IA, le tout persistant et synchronisable entre appareils via un backend.

## 2. Concepts

- **Source** : une playlist OU une chaîne YouTube. Une chaîne est résolue vers sa playlist « uploads ». L'utilisateur peut ajouter plusieurs sources, mais **une seule est active/affichée à la fois**.
- **Vidéo** : appartient à une source. Porte des métadonnées YouTube + des données utilisateur (note, transcription, résumé, masquée).
- **Créateur** : l'auteur d'une vidéo (utile car une playlist agrège plusieurs chaînes).

## 3. Fonctionnalités (exhaustif)

### 3.1 Gestion des sources
- Ajouter une source via une URL collée depuis le presse-papier (un seul bouton « Ajouter l'URL du presse-papier » ; lecture du presse-papier au clic uniquement).
- Formats reconnus : URL de playlist (`…list=PL…`), ID de playlist brut (`PL`,`UU`,`FL`,`OL`,`RD`,`LL`…), URL de chaîne (`/channel/UC…`, `/@handle`, `/user/…`), handle `@…` ou ID `UC…` brut.
- Une chaîne est résolue vers sa playlist « uploads » (via `channels.list`).
- Vérifier que l'URL fonctionne (résolution via l'API) **avant** d'intégrer la source.
- Sélecteur de sources dans le bandeau du haut ; basculer entre sources **conserve les filtres en cours**.
- Retirer une source. Afficher le nombre de vidéos par source.

### 3.2 Affichage des vidéos
- Deux vues commutables : **grille** (cartes avec miniature, titre, créateur, date relative, vues, durée, badges) et **liste compacte** (miniature + titre + sous-texte).
- En vue liste, le sous-texte affiche par priorité : **note perso** → sinon **résumé IA** → sinon **description** du créateur (markdown/HTML aplati en texte).
- Badges : « Nouveau » (< 7 j), « Short » (durée ≤ 60 s), pastille « note » si une note existe, badge « Masquée ».
- Indicateur visuel de la vidéo sélectionnée.

### 3.3 Filtres et tri
- Filtre par période : Toutes / 7 j / 14 j / 30 j (basé sur la date d'ajout).
- Filtre par type : Tout / Shorts / Vidéos.
- Filtre par créateur : liste déroulante dont les options **reflètent les filtres date+type actifs** (avec compte par créateur).
- Tri : plus récentes, plus anciennes, plus longues, plus courtes, A→Z, plus vues.
- Compteur discret du nombre de vidéos affichées (pas de grand bandeau de stats).

### 3.4 Panneau de détail (split)
- À la sélection d'une vidéo, un **panneau latéral se déplie à droite**, la liste se comprimant à gauche. Les en-têtes de filtres restent visibles.
- La **répartition est redimensionnable** (poignée), entre ~25 % et ~80 %, et la dernière largeur est mémorisée.
- Sur mobile, le panneau passe en plein écran.
- En-tête du panneau : miniature, titre, métadonnées (créateur, date, durée, vues, likes, HD…).
- Onglets : **Notes**, **Description**, **Transcription**, **Résumé IA**. Pastille indiquant les onglets contenant du contenu.
- Onglet ouvert par défaut : **Notes** s'il existe une note, sinon **Description**.
- Barre d'actions en bas : « Ouvrir sur YouTube » + bouton masquer/restaurer.

### 3.5 Notes riches
- Éditeur **HTML (WYSIWYG)** : gras, italique, souligné, titres, listes, code.
- Barre d'outils au-dessus du champ + boutons de copie à droite (séparés par un séparateur) : **Copier MD** et **Copier txt**.
- Conversion **HTML↔Markdown à la volée** : collage de Markdown converti en HTML à l'import ; export/copie en Markdown ; texte brut pour « txt ».
- Sauvegarde automatique. (Prototype : `execCommand` ; cible : éditeur TipTap/Lexical.)

### 3.6 Transcriptions (Apify)
- Bouton « Récupérer (Apify) » par vidéo : appelle l'actor Apify, décode les entités HTML, reformate en phrases, remplit et sauvegarde.
- Indiquer la disponibilité / l'échec. Permettre le collage manuel.
- La transcription nourrit le résumé IA.

### 3.7 Résumés IA (OpenRouter)
- Bouton « Générer un résumé » par vidéo : appelle OpenRouter avec titre + description + transcription (si dispo), produit un résumé **Markdown** rendu, avec bouton « Copier (Markdown) ».
- Modèle configurable (défaut `anthropic/claude-3.5-sonnet`).

### 3.8 Traitement automatique et par lot
- Case « Récupérer automatiquement transcription + résumé des nouvelles vidéos à venir ». À l'activation, l'existant sert de référence (baseline) ; ensuite seules les **vidéos nouvellement apparues** lors d'un rafraîchissement sont traitées.
- Bouton « Traiter les vidéos en attente » : traite toutes les vidéos de la source active sans transcription et/ou résumé, **séquentiellement**, avec **indicateur de progression** et confirmation préalable (nombre + avertissement coût).
- Si une clé manque (Apify ou OpenRouter), l'étape correspondante est sautée.

### 3.9 Masquage local des vidéos
- Bouton « Retirer de la liste » : masque la vidéo **localement** (champ en base), elle reste sur YouTube.
- Case « Afficher les vidéos masquées » dans les réglages : les réaffiche (semi-transparentes, badge « Masquée », bouton « Restaurer »).

### 3.10 Export / Import
- Export JSON de toutes les données (réglages non sensibles + sources + notes + transcriptions + résumés + état masqué).
- Import JSON (avec confirmation, remplace les données).
- Export JSON par source au choix : **sélection filtrée** ou **toute la source** ; chaque vidéo inclut métadonnées + note (markdown) + transcription + résumé + flag `masquee`.

### 3.11 Réglages
- Clés API : YouTube, OpenRouter, Apify ; modèle IA. (Stockées côté serveur — voir Sécurité.)
- Cases : traitement auto, afficher masquées.
- Thème clair/sombre (mémorisé). Largeur du panneau (mémorisée). Vue grille/liste (mémorisée).
- Favicon présent.

## 4. Sécurité et déploiement

- **Aucune authentification** : l'app est prévue pour un **réseau privé uniquement**. Le README et l'UI doivent avertir clairement de **ne pas l'exposer publiquement** sans ajouter d'auth (réservée à une évolution future). Si exposée via Traefik, recommander au minimum une auth Traefik (basic auth / forward-auth) au niveau du reverse proxy.
- **Clés API côté serveur** : définies dans `.env`, jamais renvoyées au frontend. Override possible via l'UI Réglages, stocké en base (table `settings`). Tous les appels YouTube/OpenRouter/Apify passent par le **backend (proxy)**.
- Le frontend ne contient aucun secret.

## 5. Contraintes techniques

- Quota YouTube Data : 10 000 unités/jour. Mettre en cache les vidéos en base ; rafraîchir une source uniquement sur action explicite.
- Transcriptions via Apify (endpoint synchrone `run-sync-get-dataset-items`). Détails dans `ARCHITECTURE.md`.
- Résumés via OpenRouter (format compatible OpenAI).

## 6. Évolutions futures (hors périmètre initial, à documenter)

- Suppression réelle d'une vidéo de la playlist YouTube (nécessite OAuth 2.0 côté serveur, scope `youtube.force-ssl`).
- Réordonnancement / ajout de vidéos dans une playlist.
- Authentification multi-utilisateurs.
- File de jobs asynchrone pour le batch (si volumétrie importante).
- Récupération automatique des transcriptions par lot Apify (entrée multi-URL) pour réduire le nombre d'appels.

## 7. Roadmap d'implémentation

1. **Backend socle** : projet Fastify+TS, SQLite (schéma `ARCHITECTURE.md`), table `settings`, endpoints proxy YouTube (résolution source, items playlist, détails vidéos) avec cache en base.
2. **Frontend socle** : Vite+React+TS, layout (header + filtres + split), vue grille/liste, appels au backend, thème clair/sombre.
3. **Détail & données utilisateur** : panneau split redimensionnable, onglets, notes riches (TipTap), transcription (proxy Apify), résumé (proxy OpenRouter), persistance en base.
4. **Batch & réglages** : traitement séquentiel + progression, auto sur nouvelles vidéos, masquage, export/import, page réglages (clés/override).
5. **Conteneurisation** : Dockerfiles, `docker-compose`, `.env.example`, labels Traefik configurables, README.
