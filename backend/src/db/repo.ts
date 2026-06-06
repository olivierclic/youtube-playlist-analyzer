import { db } from "./index.js";
import type {
  ResolvedSource,
  Source,
  SourceWithCount,
  UserData,
  Video,
  VideoWithUserData,
} from "../types.js";

// ── Sources ─────────────────────────────────────────────────────────────--

const insertSourceStmt = db.prepare(
  `INSERT INTO sources (key, kind, playlist_id, title, origin, position, refreshed_at)
   VALUES (@key, @kind, @playlist_id, @title, @origin, @position, @refreshed_at)
   ON CONFLICT(key) DO UPDATE SET
     kind = excluded.kind,
     playlist_id = excluded.playlist_id,
     title = excluded.title,
     origin = excluded.origin`,
);

const listSourcesStmt = db.prepare<[], SourceWithCount>(
  `SELECT s.*, (SELECT COUNT(*) FROM videos v WHERE v.source_key = s.key AND COALESCE(v.deleted,0)=0) AS video_count
   FROM sources s
   ORDER BY s.position ASC, s.created_at ASC`,
);

const getSourceStmt = db.prepare<[string], Source>("SELECT * FROM sources WHERE key = ?");
const deleteSourceStmt = db.prepare<[string]>("DELETE FROM sources WHERE key = ?");
const maxPositionStmt = db.prepare<[], { maxPos: number | null }>(
  "SELECT MAX(position) AS maxPos FROM sources",
);
const touchRefreshedStmt = db.prepare<[string]>(
  "UPDATE sources SET refreshed_at = datetime('now') WHERE key = ?",
);

export function listSources(): SourceWithCount[] {
  return listSourcesStmt.all();
}

/** Compteurs pour le diagnostic. */
export function stats(): { sources: number; videos: number; imported: number; deleted: number } {
  const one = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    sources: one("SELECT COUNT(*) AS n FROM sources"),
    videos: one("SELECT COUNT(*) AS n FROM videos WHERE COALESCE(deleted,0)=0"),
    imported: one("SELECT COUNT(*) AS n FROM imported_videos"),
    deleted: one("SELECT COUNT(*) AS n FROM videos WHERE deleted=1"),
  };
}

export function getSource(key: string): Source | undefined {
  return getSourceStmt.get(key);
}

export function deleteSource(key: string): boolean {
  return deleteSourceStmt.run(key).changes > 0;
}

/** Crée ou met à jour une source à partir d'une résolution YouTube. */
export function upsertSource(resolved: ResolvedSource): void {
  const existing = getSource(resolved.key);
  const position = existing ? existing.position : (maxPositionStmt.get()?.maxPos ?? -1) + 1;
  insertSourceStmt.run({
    key: resolved.key,
    kind: resolved.kind,
    playlist_id: resolved.playlistId,
    title: resolved.title,
    origin: resolved.origin,
    position,
    refreshed_at: null,
  });
}

export function touchRefreshed(key: string): void {
  touchRefreshedStmt.run(key);
}

const updateSourceTitleStmt = db.prepare<[string, string]>(
  "UPDATE sources SET title = ? WHERE key = ?",
);

/** Renomme l'affichage d'une source. */
export function updateSourceTitle(key: string, title: string): boolean {
  return updateSourceTitleStmt.run(title, key).changes > 0;
}

// ── Vidéos ──────────────────────────────────────────────────────────────--

const insertVideoStmt = db.prepare(
  `INSERT INTO videos (
     id, source_key, title, channel, channel_id, published_at, added_at,
     description, thumbnail, duration_s, is_short, views, likes, comments,
     definition, lang, tags, position
   ) VALUES (
     @id, @source_key, @title, @channel, @channel_id, @published_at, @added_at,
     @description, @thumbnail, @duration_s, @is_short, @views, @likes, @comments,
     @definition, @lang, @tags, @position
   )
   ON CONFLICT(id, source_key) DO UPDATE SET
     title = excluded.title,
     channel = excluded.channel,
     channel_id = excluded.channel_id,
     published_at = excluded.published_at,
     added_at = excluded.added_at,
     description = excluded.description,
     thumbnail = excluded.thumbnail,
     duration_s = excluded.duration_s,
     is_short = excluded.is_short,
     views = excluded.views,
     likes = excluded.likes,
     comments = excluded.comments,
     definition = excluded.definition,
     lang = excluded.lang,
     tags = excluded.tags,
     position = excluded.position`,
);

// Insertion additive : n'insère jamais par-dessus une ligne existante (registre garant).
const insertVideoNewStmt = db.prepare(
  `INSERT INTO videos (
     id, source_key, title, channel, channel_id, published_at, added_at,
     description, thumbnail, duration_s, is_short, views, likes, comments,
     definition, lang, tags, position
   ) VALUES (
     @id, @source_key, @title, @channel, @channel_id, @published_at, @added_at,
     @description, @thumbnail, @duration_s, @is_short, @views, @likes, @comments,
     @definition, @lang, @tags, @position
   )
   ON CONFLICT(id, source_key) DO NOTHING`,
);

// Champs de jointure communs (vidéo + données utilisateur).
const VIDEO_SELECT = `SELECT v.*,
          u.note_html  AS note_html,
          u.transcript AS transcript,
          u.summary_md AS summary_md,
          u.summary_detailed_md AS summary_detailed_md,
          COALESCE(u.hidden, 0) AS hidden,
          COALESCE(u.favorite, 0) AS favorite
   FROM videos v
   LEFT JOIN video_user_data u ON u.video_id = v.id`;

const listVideosStmt = db.prepare<[string], VideoWithUserData>(
  `${VIDEO_SELECT} WHERE v.source_key = ? AND COALESCE(v.deleted,0)=0 ORDER BY v.position ASC`,
);
const listAllVideosStmt = db.prepare<[], VideoWithUserData>(
  `${VIDEO_SELECT} WHERE COALESCE(v.deleted,0)=0 ORDER BY v.source_key, v.position ASC`,
);
const listDuplicateVideosStmt = db.prepare<[], VideoWithUserData>(
  `${VIDEO_SELECT}
   WHERE COALESCE(v.deleted,0)=0 AND v.id IN (
     SELECT id FROM videos WHERE COALESCE(deleted,0)=0
     GROUP BY id HAVING COUNT(DISTINCT source_key) > 1
   )
   ORDER BY v.id, v.source_key`,
);
const countVideosStmt = db.prepare<[string], { n: number }>(
  "SELECT COUNT(*) AS n FROM videos WHERE source_key = ? AND COALESCE(deleted,0)=0",
);

export function listVideos(sourceKey: string): VideoWithUserData[] {
  return listVideosStmt.all(sourceKey);
}

/** Toutes les vidéos de toutes les sources (doublons conservés). */
export function listAllVideos(): VideoWithUserData[] {
  return listAllVideosStmt.all();
}

/** Vidéos présentes dans plusieurs sources (doublons). */
export function listDuplicateVideos(): VideoWithUserData[] {
  return listDuplicateVideosStmt.all();
}

export function countVideos(sourceKey: string): number {
  return countVideosStmt.get(sourceKey)?.n ?? 0;
}

// ── Registre d'import + import additif ──────────────────────────────────--

const importedIdsStmt = db.prepare<[string], { video_id: string }>(
  "SELECT video_id FROM imported_videos WHERE source_key = ?",
);
const importedCountStmt = db.prepare<[string], { n: number }>(
  "SELECT COUNT(*) AS n FROM imported_videos WHERE source_key = ?",
);
const recordImportedStmt = db.prepare<[string, string]>(
  "INSERT INTO imported_videos (source_key, video_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
);

export function importedIdSet(sourceKey: string): Set<string> {
  return new Set(importedIdsStmt.all(sourceKey).map((r) => r.video_id));
}
export function importedCount(sourceKey: string): number {
  return importedCountStmt.get(sourceKey)?.n ?? 0;
}
export const recordImported = db.transaction((sourceKey: string, ids: string[]): void => {
  for (const id of ids) recordImportedStmt.run(sourceKey, id);
});

/**
 * Import additif : n'insère que les vidéos dont l'ID n'est pas déjà au registre
 * de la source. Ne supprime rien, ne met pas à jour l'existant. Renvoie les
 * IDs fraîchement importés (= nouveautés pour le traitement auto).
 */
export const importNewVideos = db.transaction((sourceKey: string, videos: Video[]): string[] => {
  const known = importedIdSet(sourceKey);
  const fresh = videos.filter((v) => !known.has(v.id));
  for (const v of fresh) insertVideoNewStmt.run(v as unknown as Record<string, unknown>);
  for (const v of fresh) recordImportedStmt.run(sourceKey, v.id);
  return fresh.map((v) => v.id);
});

// ── Suppression / déplacement locaux ────────────────────────────────────--

const deleteVideoStmt = db.prepare<[string, string]>(
  "UPDATE videos SET deleted = 1 WHERE id = ? AND source_key = ?",
);
const undeleteVideoStmt = db.prepare<[string, string]>(
  "UPDATE videos SET deleted = 0 WHERE id = ? AND source_key = ?",
);
const videoInSourceStmt = db.prepare<[string, string], { n: number }>(
  "SELECT COUNT(*) AS n FROM videos WHERE id = ? AND source_key = ?",
);
const dropVideoRowStmt = db.prepare<[string, string]>(
  "DELETE FROM videos WHERE id = ? AND source_key = ?",
);
const maxVideoPosStmt = db.prepare<[string], { maxPos: number | null }>(
  "SELECT MAX(position) AS maxPos FROM videos WHERE source_key = ?",
);
const moveVideoStmt = db.prepare<[string, number, string, string]>(
  "UPDATE videos SET source_key = ?, position = ? WHERE id = ? AND source_key = ?",
);

/** Suppression locale persistante (par copie source). */
export function deleteVideo(videoId: string, sourceKey: string): boolean {
  return deleteVideoStmt.run(videoId, sourceKey).changes > 0;
}

/** Déplace une vidéo d'une source à une autre (local). Fusionne si la cible l'a déjà. */
export const moveVideo = db.transaction(
  (videoId: string, fromKey: string, toKey: string): "moved" | "merged" | "noop" => {
    if (fromKey === toKey) return "noop";
    const inTarget = (videoInSourceStmt.get(videoId, toKey)?.n ?? 0) > 0;
    let result: "moved" | "merged";
    if (inTarget) {
      // La cible possède déjà la vidéo : on retire la copie source et on dé-supprime la cible.
      dropVideoRowStmt.run(videoId, fromKey);
      undeleteVideoStmt.run(videoId, toKey);
      result = "merged";
    } else {
      const pos = (maxVideoPosStmt.get(toKey)?.maxPos ?? -1) + 1;
      moveVideoStmt.run(toKey, pos, videoId, fromKey);
      result = "moved";
    }
    recordImportedStmt.run(toKey, videoId); // la cible « connaît » désormais cette vidéo
    return result;
  },
);

// ── Données utilisateur par vidéo ───────────────────────────────────────--

const videoExistsStmt = db.prepare<[string], { n: number }>(
  "SELECT COUNT(*) AS n FROM videos WHERE id = ?",
);
const getUserDataStmt = db.prepare<[string], UserData>(
  "SELECT video_id, note_html, transcript, summary_md, summary_detailed_md, hidden, favorite, seen, updated_at FROM video_user_data WHERE video_id = ?",
);

/** Vrai si au moins une ligne `videos` porte cet id (toutes sources confondues). */
export function videoExists(videoId: string): boolean {
  return (videoExistsStmt.get(videoId)?.n ?? 0) > 0;
}

const getVideoMetaStmt = db.prepare<[string], Pick<
  Video,
  "id" | "title" | "channel" | "description" | "duration_s"
>>(
  "SELECT id, title, channel, description, duration_s FROM videos WHERE id = ? LIMIT 1",
);

/** Métadonnées d'une vidéo (1re source trouvée) pour bâtir le prompt de résumé. */
export function getVideoMeta(videoId: string) {
  return getVideoMetaStmt.get(videoId);
}

export function getUserData(videoId: string): UserData | undefined {
  return getUserDataStmt.get(videoId);
}

/**
 * Upsert d'un champ utilisateur (note_html | transcript | summary_md | hidden).
 * Le nom de colonne est contrôlé (liste blanche), jamais une entrée libre.
 */
function makeFieldUpsert(
  column:
    | "note_html"
    | "transcript"
    | "summary_md"
    | "summary_detailed_md"
    | "hidden"
    | "favorite"
    | "seen",
) {
  return db.prepare(
    `INSERT INTO video_user_data (video_id, ${column}, updated_at)
     VALUES (@id, @value, datetime('now'))
     ON CONFLICT(video_id) DO UPDATE SET
       ${column} = excluded.${column},
       updated_at = datetime('now')`,
  );
}
const setNoteStmt = makeFieldUpsert("note_html");
const setTranscriptStmt = makeFieldUpsert("transcript");
const setSummaryStmt = makeFieldUpsert("summary_md");
const setSummaryDetailedStmt = makeFieldUpsert("summary_detailed_md");
const setHiddenStmt = makeFieldUpsert("hidden");
const setFavoriteStmt = makeFieldUpsert("favorite");

export function setNote(videoId: string, noteHtml: string | null): void {
  setNoteStmt.run({ id: videoId, value: noteHtml });
}
export function setTranscript(videoId: string, transcript: string | null): void {
  setTranscriptStmt.run({ id: videoId, value: transcript });
}
export function setSummary(videoId: string, summaryMd: string | null): void {
  setSummaryStmt.run({ id: videoId, value: summaryMd });
}
export function setSummaryDetailed(videoId: string, summaryMd: string | null): void {
  setSummaryDetailedStmt.run({ id: videoId, value: summaryMd });
}
export function setHidden(videoId: string, hidden: boolean): void {
  setHiddenStmt.run({ id: videoId, value: hidden ? 1 : 0 });
}
export function setFavorite(videoId: string, favorite: boolean): void {
  setFavoriteStmt.run({ id: videoId, value: favorite ? 1 : 0 });
}

// ── Export sélectif ─────────────────────────────────────────────────────--

// Champs vidéo (métadonnées) et données utilisateur exportables/importables.
export const VIDEO_FIELDS = [
  "title", "channel", "channel_id", "published_at", "added_at", "description",
  "thumbnail", "duration_s", "is_short", "views", "likes", "comments",
  "definition", "lang", "tags", "position",
] as const;
export const USERDATA_FIELDS = [
  "note_html", "transcript", "summary_md", "summary_detailed_md", "favorite", "hidden",
] as const;
export const ALL_FIELDS = [...VIDEO_FIELDS, ...USERDATA_FIELDS] as const;
export type ExportField = (typeof ALL_FIELDS)[number];

export interface ExportOptions {
  sourceKeys?: string[]; // undefined = toutes
  fields?: ExportField[]; // undefined = tous
}

export interface DataDump {
  sources?: Source[];
  videos?: Partial<Video>[];
  user_data?: Partial<UserData>[];
  imported_videos?: { source_key: string; video_id: string }[];
}

/** Export filtré par sources et par champs (jamais les clés API). */
export function dumpData(opts: ExportOptions = {}): DataDump {
  const allSources = db.prepare("SELECT * FROM sources ORDER BY position").all() as Source[];
  const sources = opts.sourceKeys
    ? allSources.filter((s) => opts.sourceKeys!.includes(s.key))
    : allSources;
  const keys = sources.map((s) => s.key);

  const videosRaw =
    keys.length === 0
      ? []
      : (db
          .prepare(
            `SELECT * FROM videos WHERE source_key IN (${keys.map(() => "?").join(",")})`,
          )
          .all(...keys) as Video[]);

  const fields = opts.fields ?? [...ALL_FIELDS];
  const videoFields = VIDEO_FIELDS.filter((f) => fields.includes(f));
  const userFields = USERDATA_FIELDS.filter((f) => fields.includes(f));

  // Vidéos : id + source_key toujours, + champs vidéo choisis.
  const videos: Partial<Video>[] = videosRaw.map((v) => {
    const out: Record<string, unknown> = { id: v.id, source_key: v.source_key };
    for (const f of videoFields) out[f] = (v as unknown as Record<string, unknown>)[f];
    return out as Partial<Video>;
  });

  // Données utilisateur : pour les vidéos exportées, video_id + champs user choisis.
  const ids = [...new Set(videosRaw.map((v) => v.id))];
  let user_data: Partial<UserData>[] = [];
  if (userFields.length && ids.length) {
    const cols = ["video_id", ...userFields].join(", ");
    const rows = db
      .prepare(`SELECT ${cols} FROM video_user_data WHERE video_id IN (${ids.map(() => "?").join(",")})`)
      .all(...ids) as Partial<UserData>[];
    user_data = rows;
  }

  // Registre des sources exportées (pour restaurer « déjà importé »).
  const imported_videos =
    keys.length === 0
      ? []
      : (db
          .prepare(
            `SELECT source_key, video_id FROM imported_videos WHERE source_key IN (${keys.map(() => "?").join(",")})`,
          )
          .all(...keys) as { source_key: string; video_id: string }[]);

  return { sources, videos, user_data, imported_videos };
}

// ── Import fusionnel ────────────────────────────────────────────────────--

const userDataColExists = new Set<string>(USERDATA_FIELDS);

/**
 * Import fusionnel (pas de wipe). Dédoublonne par clé. `overwrite` décide
 * remplacement vs conservation du local. Fusion par champ pour user_data
 * (n'écrit que les colonnes présentes). Enregistre au registre.
 */
export const mergeImport = db.transaction(
  (dump: DataDump, overwrite: boolean): { sources: number; videos: number } => {
    // Sources
    for (const s of dump.sources ?? []) {
      if (overwrite) {
        insertSourceStmt.run({
          key: s.key, kind: s.kind, playlist_id: s.playlist_id, title: s.title,
          origin: s.origin ?? null, position: s.position ?? 0, refreshed_at: s.refreshed_at ?? null,
        });
      } else {
        db.prepare(
          `INSERT INTO sources (key, kind, playlist_id, title, origin, position, refreshed_at)
           VALUES (@key,@kind,@playlist_id,@title,@origin,@position,@refreshed_at)
           ON CONFLICT(key) DO NOTHING`,
        ).run({
          key: s.key, kind: s.kind, playlist_id: s.playlist_id, title: s.title,
          origin: s.origin ?? null, position: s.position ?? 0, refreshed_at: s.refreshed_at ?? null,
        });
      }
    }

    // Vidéos (dédoublonnage par (id, source_key)) + registre.
    for (const v of dump.videos ?? []) {
      if (!v.id || !v.source_key) continue;
      const row = {
        id: v.id, source_key: v.source_key,
        title: v.title ?? null, channel: v.channel ?? null, channel_id: v.channel_id ?? null,
        published_at: v.published_at ?? null, added_at: v.added_at ?? null,
        description: v.description ?? null, thumbnail: v.thumbnail ?? null,
        duration_s: v.duration_s ?? null, is_short: v.is_short ?? 0,
        views: v.views ?? null, likes: v.likes ?? null, comments: v.comments ?? null,
        definition: v.definition ?? null, lang: v.lang ?? null,
        tags: v.tags ?? "[]", position: v.position ?? 0,
      };
      if (overwrite) insertVideoStmt.run(row as unknown as Record<string, unknown>);
      else insertVideoNewStmt.run(row as unknown as Record<string, unknown>);
      recordImportedStmt.run(v.source_key, v.id);
    }

    // Registre éventuellement fourni explicitement.
    for (const r of dump.imported_videos ?? []) {
      if (r.source_key && r.video_id) recordImportedStmt.run(r.source_key, r.video_id);
    }

    // Données utilisateur : fusion par champ.
    for (const u of dump.user_data ?? []) {
      if (!u.video_id) continue;
      const present = Object.keys(u).filter(
        (k) => k !== "video_id" && userDataColExists.has(k) && (u as Record<string, unknown>)[k] != null,
      );
      if (!present.length) continue;
      const setClause = present
        .map((c) => (overwrite ? `${c}=excluded.${c}` : `${c}=COALESCE(video_user_data.${c}, excluded.${c})`))
        .join(", ");
      const cols = ["video_id", ...present];
      const stmt = db.prepare(
        `INSERT INTO video_user_data (${cols.join(",")}, updated_at)
         VALUES (${cols.map((c) => "@" + c).join(",")}, datetime('now'))
         ON CONFLICT(video_id) DO UPDATE SET ${setClause}, updated_at = datetime('now')`,
      );
      const params: Record<string, unknown> = { video_id: u.video_id };
      for (const c of present) params[c] = (u as Record<string, unknown>)[c];
      stmt.run(params);
    }

    return {
      sources: (dump.sources ?? []).length,
      videos: (dump.videos ?? []).length,
    };
  },
);
