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
  `SELECT s.*, (SELECT COUNT(*) FROM videos v WHERE v.source_key = s.key) AS video_count
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

const deleteVideosBySourceStmt = db.prepare<[string]>("DELETE FROM videos WHERE source_key = ?");
const listVideosStmt = db.prepare<[string], VideoWithUserData>(
  `SELECT v.*,
          u.note_html  AS note_html,
          u.transcript AS transcript,
          u.summary_md AS summary_md,
          COALESCE(u.hidden, 0) AS hidden
   FROM videos v
   LEFT JOIN video_user_data u ON u.video_id = v.id
   WHERE v.source_key = ?
   ORDER BY v.position ASC`,
);
const countVideosStmt = db.prepare<[string], { n: number }>(
  "SELECT COUNT(*) AS n FROM videos WHERE source_key = ?",
);

/**
 * Remplace l'intégralité des vidéos d'une source (cache YouTube).
 * Transaction : on purge puis on réinsère pour refléter les retraits côté YouTube.
 */
export const replaceSourceVideos = db.transaction((sourceKey: string, videos: Video[]): void => {
  deleteVideosBySourceStmt.run(sourceKey);
  for (const v of videos) insertVideoStmt.run(v as unknown as Record<string, unknown>);
});

export function listVideos(sourceKey: string): VideoWithUserData[] {
  return listVideosStmt.all(sourceKey);
}

export function countVideos(sourceKey: string): number {
  return countVideosStmt.get(sourceKey)?.n ?? 0;
}

// ── Données utilisateur par vidéo ───────────────────────────────────────--

const videoExistsStmt = db.prepare<[string], { n: number }>(
  "SELECT COUNT(*) AS n FROM videos WHERE id = ?",
);
const getUserDataStmt = db.prepare<[string], UserData>(
  "SELECT video_id, note_html, transcript, summary_md, hidden, seen, updated_at FROM video_user_data WHERE video_id = ?",
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
function makeFieldUpsert(column: "note_html" | "transcript" | "summary_md" | "hidden") {
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
const setHiddenStmt = makeFieldUpsert("hidden");

export function setNote(videoId: string, noteHtml: string | null): void {
  setNoteStmt.run({ id: videoId, value: noteHtml });
}
export function setTranscript(videoId: string, transcript: string | null): void {
  setTranscriptStmt.run({ id: videoId, value: transcript });
}
export function setSummary(videoId: string, summaryMd: string | null): void {
  setSummaryStmt.run({ id: videoId, value: summaryMd });
}
export function setHidden(videoId: string, hidden: boolean): void {
  setHiddenStmt.run({ id: videoId, value: hidden ? 1 : 0 });
}
