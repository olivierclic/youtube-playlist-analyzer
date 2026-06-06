import type { ResolvedSource, SourceKind, Video } from "../types.js";

const API_BASE = "https://www.googleapis.com/youtube/v3";

// ── Erreurs ────────────────────────────────────────────────────────────────

/** Erreur YouTube normalisée (code applicatif + statut HTTP à renvoyer). */
export class YoutubeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "YoutubeError";
  }
}

/**
 * Traduit un message/raison d'erreur YouTube en erreur applicative.
 * Reprend la logique de `handleApiError` du prototype.
 */
export function mapYoutubeError(message: string, reason = ""): YoutubeError {
  const m = message || "";
  if (reason === "keyInvalid" || /API key not valid/i.test(m)) {
    return new YoutubeError("youtube_key_invalid", "Clé API YouTube refusée par Google.", 401);
  }
  if (/accessNotConfigured|not been used|disabled/i.test(m)) {
    return new YoutubeError(
      "youtube_api_disabled",
      "YouTube Data API v3 n'est pas activée pour cette clé.",
      403,
    );
  }
  if (reason === "quotaExceeded" || /quota/i.test(m)) {
    return new YoutubeError(
      "youtube_quota_exceeded",
      "Quota YouTube quotidien dépassé. Réessaie demain.",
      429,
    );
  }
  if (/playlistNotFound|channelNotFound|not be found|introuvable/i.test(m)) {
    return new YoutubeError(
      "source_not_found",
      "Source introuvable. Vérifie l'URL et que le contenu est public.",
      404,
    );
  }
  if (/Failed to fetch|NetworkError|fetch failed|ENOTFOUND|ECONNREFUSED/i.test(m)) {
    return new YoutubeError("youtube_network_error", "Erreur réseau vers l'API YouTube.", 502);
  }
  return new YoutubeError("youtube_error", m || "Erreur API YouTube.", 502);
}

/** Effectue un GET YouTube et renvoie le JSON, en mappant les erreurs. */
async function ytGet(path: string, params: Record<string, string>, apiKey: string): Promise<any> {
  const qs = new URLSearchParams({ ...params, key: apiKey }).toString();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/${path}?${qs}`);
  } catch (e) {
    throw mapYoutubeError((e as Error)?.message ?? "fetch failed");
  }
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const apiErr = data?.error;
    throw mapYoutubeError(apiErr?.message ?? `Erreur API (${res.status})`, apiErr?.errors?.[0]?.reason);
  }
  return data;
}

// ── Parsing ──────────────────────────────────────────────────────────────--

export interface ParsedSourceInput {
  type: "playlist" | "channelId" | "handle" | "username";
  value: string;
}

/**
 * Reconnaît une entrée utilisateur (URL ou identifiant brut) et la classe.
 * Repris à l'identique de `parseSourceInput` du prototype.
 */
export function parseSourceInput(input: string): ParsedSourceInput | null {
  const s = input.trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/[?&]list=([0-9A-Za-z\-_]+)/))) return { type: "playlist", value: m[1]! };
  if (/^(PL|UU|FL|OL|RD|LL)[0-9A-Za-z\-_]{10,}$/.test(s)) return { type: "playlist", value: s };
  if ((m = s.match(/\/channel\/(UC[0-9A-Za-z\-_]+)/))) return { type: "channelId", value: m[1]! };
  if (/^UC[0-9A-Za-z\-_]{20,}$/.test(s)) return { type: "channelId", value: s };
  if ((m = s.match(/\/@([0-9A-Za-z\-_.]+)/)) || (m = s.match(/^@([0-9A-Za-z\-_.]+)$/)))
    return { type: "handle", value: "@" + m[1]! };
  if ((m = s.match(/\/user\/([0-9A-Za-z\-_]+)/))) return { type: "username", value: m[1]! };
  return null;
}

export interface ParsedDuration {
  seconds: number;
  str: string;
}

/** Parse une durée ISO 8601 (PT#H#M#S) en secondes + libellé. */
export function parseDuration(iso: string): ParsedDuration {
  const m = (iso || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return { seconds: 0, str: "0:00" };
  const h = +(m[1] || 0);
  const mi = +(m[2] || 0);
  const s = +(m[3] || 0);
  const t = h * 3600 + mi * 60 + s;
  const str =
    h > 0
      ? `${h}:${String(mi).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${mi}:${String(s).padStart(2, "0")}`;
  return { seconds: t, str };
}

// ── Résolution d'une source ────────────────────────────────────────────────

/**
 * Résout une entrée utilisateur en source vérifiée via l'API YouTube.
 * Une chaîne est résolue vers sa playlist « uploads ».
 */
export async function resolveSource(input: string, apiKey: string): Promise<ResolvedSource> {
  const parsed = parseSourceInput(input);
  if (!parsed) {
    throw new YoutubeError(
      "invalid_source_url",
      "URL non reconnue (playlist …list=PL… ou chaîne /@handle, /channel/UC…).",
      400,
    );
  }

  if (parsed.type === "playlist") {
    const d = await ytGet("playlists", { part: "snippet", id: parsed.value }, apiKey);
    const it = d.items?.[0];
    if (!it) throw new YoutubeError("source_not_found", "Playlist introuvable (publique ?).", 404);
    return {
      key: "pl:" + parsed.value,
      kind: "playlist" as SourceKind,
      playlistId: parsed.value,
      title: it.snippet.title,
      origin: input.trim(),
    };
  }

  const params: Record<string, string> = { part: "snippet,contentDetails" };
  if (parsed.type === "channelId") params.id = parsed.value;
  else if (parsed.type === "handle") params.forHandle = parsed.value;
  else params.forUsername = parsed.value;

  const d = await ytGet("channels", params, apiKey);
  const it = d.items?.[0];
  if (!it) throw new YoutubeError("source_not_found", "Chaîne introuvable.", 404);
  const uploads = it.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new YoutubeError("source_not_found", "Vidéos de la chaîne introuvables.", 404);
  return {
    key: "ch:" + it.id,
    kind: "channel" as SourceKind,
    playlistId: uploads,
    title: it.snippet.title + " (chaîne)",
    origin: input.trim(),
  };
}

// ── Récupération des vidéos ──────────────────────────────────────────────--

/** Pagination complète des items d'une playlist. */
export async function fetchAllPlaylistItems(playlistId: string, apiKey: string): Promise<any[]> {
  let items: any[] = [];
  let pageToken = "";
  do {
    const params: Record<string, string> = {
      part: "snippet,contentDetails",
      maxResults: "50",
      playlistId,
    };
    if (pageToken) params.pageToken = pageToken;
    const d = await ytGet("playlistItems", params, apiKey);
    items = items.concat(d.items || []);
    pageToken = d.nextPageToken || "";
  } while (pageToken);
  return items;
}

/** Détails des vidéos par lots de 50. */
export async function fetchVideoDetails(ids: string[], apiKey: string): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const d = await ytGet(
      "videos",
      { part: "contentDetails,statistics,snippet", id: chunk.join(",") },
      apiKey,
    );
    out.push(...(d.items || []));
  }
  return out;
}

const UNREADABLE_TITLES = new Set(["Vidéo privée", "Private video", "Deleted video"]);

function pickThumbnail(thumbs: any): string | null {
  if (!thumbs) return null;
  return (
    thumbs.medium?.url || thumbs.high?.url || thumbs.standard?.url || thumbs.default?.url || null
  );
}

function toInt(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Combine items de playlist + détails vidéos en lignes `videos` prêtes pour
 * la base. Filtre les vidéos privées/supprimées (logique du prototype).
 */
export function buildVideos(
  items: any[],
  details: any[],
  sourceKey: string,
  skipIds: Set<string> = new Set(),
): Video[] {
  const map = new Map<string, any>();
  for (const d of details) map.set(d.id, d);

  const videos: Video[] = [];
  items.forEach((item, index) => {
    const vid: string | undefined =
      item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
    if (!vid || skipIds.has(vid)) return;
    const d = map.get(vid) || {};
    const title = item.snippet?.title || "Sans titre";
    if (UNREADABLE_TITLES.has(title)) return;

    const dur = parseDuration(d.contentDetails?.duration || "PT0S");
    const tags: string[] = d.snippet?.tags || [];

    videos.push({
      id: vid,
      source_key: sourceKey,
      title,
      channel:
        item.snippet?.videoOwnerChannelTitle || item.snippet?.channelTitle || "—",
      channel_id: item.snippet?.videoOwnerChannelId || "",
      published_at: d.snippet?.publishedAt || item.snippet?.publishedAt || "",
      added_at: item.snippet?.publishedAt || "",
      description: item.snippet?.description || "",
      thumbnail: pickThumbnail(item.snippet?.thumbnails),
      duration_s: dur.seconds,
      is_short: dur.seconds > 0 && dur.seconds <= 60 ? 1 : 0,
      views: toInt(d.statistics?.viewCount),
      likes: toInt(d.statistics?.likeCount),
      comments: toInt(d.statistics?.commentCount),
      definition: d.contentDetails?.definition || "",
      lang: d.snippet?.defaultLanguage || d.snippet?.defaultAudioLanguage || "",
      tags: JSON.stringify(tags),
      position: index,
    });
  });

  return videos;
}

/**
 * Orchestration : récupère les vidéos d'une playlist prêtes pour la base.
 * `knownIds` (déjà importées) sont ignorées : on ne télécharge PAS leurs détails
 * (économie de quota) et on ne les reconstruit pas.
 */
export async function fetchSourceVideos(
  playlistId: string,
  sourceKey: string,
  apiKey: string,
  knownIds: Set<string> = new Set(),
): Promise<Video[]> {
  const items = await fetchAllPlaylistItems(playlistId, apiKey);
  const newIds = items
    .map((i) => i.contentDetails?.videoId || i.snippet?.resourceId?.videoId)
    .filter((x: unknown): x is string => Boolean(x))
    .filter((id: string) => !knownIds.has(id));
  const details = newIds.length ? await fetchVideoDetails(newIds, apiKey) : [];
  return buildVideos(items, details, sourceKey, knownIds);
}
