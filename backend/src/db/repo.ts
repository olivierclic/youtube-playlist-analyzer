import { db } from "./index.js";
import type { ResolvedSource, Source, SourceWithCount, Video } from "../types.js";

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
const listVideosStmt = db.prepare<[string], Video>(
  "SELECT * FROM videos WHERE source_key = ? ORDER BY position ASC",
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

export function listVideos(sourceKey: string): Video[] {
  return listVideosStmt.all(sourceKey);
}

export function countVideos(sourceKey: string): number {
  return countVideosStmt.get(sourceKey)?.n ?? 0;
}
