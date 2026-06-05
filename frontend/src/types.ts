// Types côté client (miroir des réponses backend).

export type SourceKind = "playlist" | "channel";

export interface Source {
  key: string;
  kind: SourceKind;
  playlist_id: string;
  title: string;
  origin: string | null;
  position: number;
  created_at: string;
  refreshed_at: string | null;
  video_count: number;
}

/** Vidéo telle que sérialisée par GET /api/sources/:key/videos. */
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
  is_short: boolean;
  views: number | null;
  likes: number | null;
  comments: number | null;
  definition: string | null;
  lang: string | null;
  tags: string[];
  position: number;
}

export interface SettingsPresence {
  youtube: boolean;
  openrouter: boolean;
  apify: boolean;
  model: string;
  apifyActor: string;
  preferences: Record<string, string>;
}

// Filtres / vues / tri ------------------------------------------------------

export type PeriodFilter = 0 | 7 | 14 | 30;
export type TypeFilter = "all" | "short" | "video";
export type ViewMode = "grid" | "list";
export type Theme = "dark" | "light";
export type SortKey =
  | "date_desc"
  | "date_asc"
  | "duration_desc"
  | "duration_asc"
  | "title_asc"
  | "views_desc";
