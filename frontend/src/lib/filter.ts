import type { PeriodFilter, SortKey, TypeFilter, Video } from "../types.js";

export interface FilterState {
  period: PeriodFilter;
  type: TypeFilter;
  channel: string;
  sort: SortKey;
  showHidden: boolean;
  favoritesOnly: boolean;
  keyword: string;
}

/** Filtre par période (date d'ajout) + type (short/vidéo). Base du filtre créateur. */
export function dateTypeFiltered(videos: Video[], period: PeriodFilter, type: TypeFilter): Video[] {
  let v = videos;
  if (period > 0) {
    const cutoff = Date.now() - period * 86400000;
    v = v.filter((x) => x.added_at && new Date(x.added_at).getTime() >= cutoff);
  }
  if (type === "short") v = v.filter((x) => x.is_short);
  else if (type === "video") v = v.filter((x) => !x.is_short);
  return v;
}

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);

/** Applique filtres créateur + tri par-dessus dateTypeFiltered. */
export function getFiltered(videos: Video[], f: FilterState): Video[] {
  let v = dateTypeFiltered(videos, f.period, f.type);
  if (f.channel) v = v.filter((x) => x.channel === f.channel);
  if (f.favoritesOnly) v = v.filter((x) => x.favorite);
  const kw = f.keyword.trim().toLowerCase();
  if (kw) {
    v = v.filter((x) =>
      [x.title, x.channel, x.description].some((s) => s?.toLowerCase().includes(kw)),
    );
  }
  if (!f.showHidden) v = v.filter((x) => !x.hidden);

  const sorted = [...v];
  sorted.sort((a, b) => {
    switch (f.sort) {
      case "date_desc":
        return time(b.added_at) - time(a.added_at);
      case "date_asc":
        return time(a.added_at) - time(b.added_at);
      case "duration_desc":
        return (b.duration_s ?? 0) - (a.duration_s ?? 0);
      case "duration_asc":
        return (a.duration_s ?? 0) - (b.duration_s ?? 0);
      case "title_asc":
        return (a.title ?? "").localeCompare(b.title ?? "", "fr");
      case "views_desc":
        return (b.views ?? 0) - (a.views ?? 0);
      default:
        return 0;
    }
  });
  return sorted;
}

/** Compte par créateur sur la base date+type, trié par fréquence décroissante. */
export function channelCounts(
  videos: Video[],
  period: PeriodFilter,
  type: TypeFilter,
): { total: number; channels: { name: string; count: number }[] } {
  const base = dateTypeFiltered(videos, period, type);
  const counts = new Map<string, number>();
  for (const v of base) {
    const name = v.channel ?? "—";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const channels = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  return { total: base.length, channels };
}
