import { useEffect, useMemo } from "react";
import { useStore } from "../store/useStore.js";
import { channelCounts } from "../lib/filter.js";
import type { PeriodFilter, SortKey, TypeFilter } from "../types.js";

const PERIODS: { value: PeriodFilter; label: string }[] = [
  { value: 0, label: "Toutes" },
  { value: 7, label: "7 j" },
  { value: 14, label: "14 j" },
  { value: 30, label: "30 j" },
];

const TYPES: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "Tout type" },
  { value: "short", label: "Shorts" },
  { value: "video", label: "Vidéos" },
];

const SORTS: { value: SortKey; label: string }[] = [
  { value: "date_desc", label: "Plus récentes" },
  { value: "date_asc", label: "Plus anciennes" },
  { value: "duration_desc", label: "Plus longues" },
  { value: "duration_asc", label: "Plus courtes" },
  { value: "title_asc", label: "A → Z" },
  { value: "views_desc", label: "Plus vues" },
];

export function FilterBar({ filteredCount }: { filteredCount: number }) {
  const videos = useStore((s) => s.videos);
  const period = useStore((s) => s.period);
  const type = useStore((s) => s.type);
  const channel = useStore((s) => s.channel);
  const sort = useStore((s) => s.sort);
  const setPeriod = useStore((s) => s.setPeriod);
  const setType = useStore((s) => s.setType);
  const setChannel = useStore((s) => s.setChannel);
  const setSort = useStore((s) => s.setSort);

  // Options créateur reflétant les filtres date+type actifs.
  const { total, channels } = useMemo(
    () => channelCounts(videos, period, type),
    [videos, period, type],
  );

  // Réinitialise le filtre créateur s'il n'a plus d'occurrence.
  useEffect(() => {
    if (channel && !channels.some((c) => c.name === channel)) setChannel("");
  }, [channel, channels, setChannel]);

  return (
    <div className="controls">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          className={`filter-btn ${period === p.value ? "active" : ""}`}
          onClick={() => setPeriod(p.value)}
        >
          {p.label}
        </button>
      ))}

      <div className="ctrl-divider" />

      {TYPES.map((t) => (
        <button
          key={t.value}
          id={`t-${t.value}`}
          className={`filter-btn type-btn ${type === t.value ? "active" : ""}`}
          onClick={() => setType(t.value)}
        >
          {t.label}
        </button>
      ))}

      <div className="ctrl-divider" />

      <select
        className="sort-select"
        value={channel}
        onChange={(e) => setChannel(e.target.value)}
      >
        <option value="">Tous les créateurs ({total})</option>
        {channels.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name} ({c.count})
          </option>
        ))}
      </select>

      <select
        className="sort-select"
        value={sort}
        onChange={(e) => setSort(e.target.value as SortKey)}
      >
        {SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <div className="sep" />
      <div className="count-badge">
        {filteredCount} vidéo{filteredCount !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
