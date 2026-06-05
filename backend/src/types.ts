// Types partagés du backend.

export type SourceKind = "playlist" | "channel";

/** Source telle que persistée en base (table `sources`). */
export interface Source {
  key: string; // 'pl:<id>' | 'ch:<channelId>'
  kind: SourceKind;
  playlist_id: string;
  title: string;
  origin: string | null;
  position: number;
  created_at: string;
  refreshed_at: string | null;
}

/** Source enrichie renvoyée par l'API (avec compte de vidéos). */
export interface SourceWithCount extends Source {
  video_count: number;
}

/** Résultat de la résolution d'une entrée utilisateur via YouTube. */
export interface ResolvedSource {
  key: string;
  kind: SourceKind;
  playlistId: string;
  title: string;
  origin: string;
}

/** Vidéo telle que persistée/renvoyée (table `videos`). */
export interface Video {
  id: string;
  source_key: string;
  title: string | null;
  channel: string | null;
  channel_id: string | null;
  published_at: string | null;
  added_at: string | null;
  description: string | null;
  thumbnail: string | null;
  duration_s: number | null;
  is_short: 0 | 1;
  views: number | null;
  likes: number | null;
  comments: number | null;
  definition: string | null;
  lang: string | null;
  tags: string | null; // JSON
  position: number;
}

/** Présence des clés + préférences renvoyées par GET /api/settings. */
export interface SettingsPresence {
  youtube: boolean;
  openrouter: boolean;
  apify: boolean;
  model: string;
  apifyActor: string;
  preferences: Record<string, string>;
}

/** Forme d'erreur normalisée renvoyée au frontend. */
export interface ApiError {
  error: { code: string; message: string };
}
