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

const deleteVideosBySourceStmt = db.prepare<[string]>("DELETE FROM videos WHERE source_key = ?");
const listVideosStmt = db.prepare<[string], VideoWithUserData>(
  `SELECT v.*,
          u.note_html  AS note_html,
          u.transcript AS transcript,
          u.summary_md AS summary_md,
          u.summary_detailed_md AS summary_detailed_md,
          COALESCE(u.hidden, 0) AS hidden,
          COALESCE(u.favorite, 0) AS favorite
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
const setSeenStmt = makeFieldUpsert("seen");

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

// ── Suivi « vu » (baseline du traitement auto) ──────────────────────────--

const sourceVideoIdsStmt = db.prepare<[string], { id: string }>(
  "SELECT id FROM videos WHERE source_key = ?",
);
const unseenVideoIdsStmt = db.prepare<[string], { id: string }>(
  `SELECT v.id FROM videos v
   LEFT JOIN video_user_data u ON u.video_id = v.id
   WHERE v.source_key = ? AND COALESCE(u.seen, 0) = 0
   ORDER BY v.position ASC`,
);

/** Ids des vidéos d'une source jamais « vues » (candidates au traitement auto). */
export function unseenVideoIds(sourceKey: string): string[] {
  return unseenVideoIdsStmt.all(sourceKey).map((r) => r.id);
}

/** Marque une liste de vidéos comme « vues » (transaction). */
export const markSeen = db.transaction((ids: string[]): void => {
  for (const id of ids) setSeenStmt.run({ id, value: 1 });
});

/** Marque toutes les vidéos d'une source comme « vues » (baseline). */
export function markAllSeen(sourceKey: string): number {
  const ids = sourceVideoIdsStmt.all(sourceKey).map((r) => r.id);
  markSeen(ids);
  return ids.length;
}

// ── Export / import global ──────────────────────────────────────────────--

export interface DataDump {
  sources: Source[];
  videos: Video[];
  user_data: UserData[];
}

export function dumpData(): DataDump {
  return {
    sources: db.prepare("SELECT * FROM sources ORDER BY position").all() as Source[],
    videos: db.prepare("SELECT * FROM videos").all() as Video[],
    user_data: db.prepare("SELECT * FROM video_user_data").all() as UserData[],
  };
}

const insertUserDataStmt = db.prepare(
  `INSERT INTO video_user_data (video_id, note_html, transcript, summary_md, summary_detailed_md, hidden, favorite, seen, updated_at)
   VALUES (@video_id, @note_html, @transcript, @summary_md, @summary_detailed_md, @hidden, @favorite, @seen, @updated_at)`,
);

/** Remplace toutes les données (sources + vidéos + données utilisateur) en une transaction. */
export const importData = db.transaction((dump: DataDump): void => {
  db.prepare("DELETE FROM video_user_data").run();
  db.prepare("DELETE FROM videos").run();
  db.prepare("DELETE FROM sources").run();

  for (const s of dump.sources) {
    insertSourceStmt.run({
      key: s.key,
      kind: s.kind,
      playlist_id: s.playlist_id,
      title: s.title,
      origin: s.origin ?? null,
      position: s.position ?? 0,
      refreshed_at: s.refreshed_at ?? null,
    });
  }
  for (const v of dump.videos) insertVideoStmt.run(v as unknown as Record<string, unknown>);
  for (const u of dump.user_data) {
    insertUserDataStmt.run({
      video_id: u.video_id,
      note_html: u.note_html ?? null,
      transcript: u.transcript ?? null,
      summary_md: u.summary_md ?? null,
      summary_detailed_md: u.summary_detailed_md ?? null,
      hidden: u.hidden ?? 0,
      favorite: u.favorite ?? 0,
      seen: u.seen ?? 0,
      updated_at: u.updated_at ?? new Date().toISOString(),
    });
  }
});
