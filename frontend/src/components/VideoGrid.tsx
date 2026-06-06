import { useStore } from "../store/useStore.js";
import { formatDuration, formatNum, isNew, relativeDate } from "../lib/format.js";
import type { Video } from "../types.js";

export function VideoGrid({ videos }: { videos: Video[] }) {
  const selectedId = useStore((s) => s.selectedVideoId);
  const selectVideo = useStore((s) => s.selectVideo);

  return (
    <div className="grid">
      {videos.map((v) => (
        <div
          key={v.id}
          className={`card ${v.id === selectedId ? "selected" : ""} ${v.hidden ? "hidden-v" : ""}`}
          onClick={() => selectVideo(v.id)}
        >
          <div className="thumb-wrap">
            {v.thumbnail && <img src={v.thumbnail} alt="" loading="lazy" />}
            {v.hidden ? (
              <div className="hidden-badge">Masquée</div>
            ) : (
              isNew(v.added_at) && !v.is_short && <div className="new-badge">Nouveau</div>
            )}
            {v.is_short && <div className="short-badge">Short</div>}
            {v.favorite && <div className="fav-badge" title="Favori">★</div>}
            {v.note_html && <div className="note-dot">✎ note</div>}
            <div className="duration-badge">{formatDuration(v.duration_s)}</div>
          </div>
          <div className="card-body">
            <div className="card-title">{v.title}</div>
            <div className="card-channel">{v.channel}</div>
            <div className="card-meta">
              <span>{relativeDate(v.added_at)}</span>
              {v.views ? <span>· {formatNum(v.views)} vues</span> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
