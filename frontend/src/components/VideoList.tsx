import { useStore } from "../store/useStore.js";
import { formatDuration, relativeDate } from "../lib/format.js";
import type { Video } from "../types.js";

export function VideoList({ videos }: { videos: Video[] }) {
  const selectedId = useStore((s) => s.selectedVideoId);
  const selectVideo = useStore((s) => s.selectVideo);

  return (
    <div className="list">
      {videos.map((v) => {
        const sub = v.description ? v.description.slice(0, 260) : "(aucune description)";
        return (
          <div
            key={v.id}
            className={`list-row ${v.id === selectedId ? "selected" : ""}`}
            onClick={() => selectVideo(v.id)}
          >
            {v.thumbnail && <img className="list-thumb" src={v.thumbnail} alt="" loading="lazy" />}
            <div className="list-info">
              <div className="list-title">{v.title}</div>
              <div className="list-sub">{sub}</div>
              <div className="list-dur">
                {v.channel} · {formatDuration(v.duration_s)} · {relativeDate(v.added_at)}
                {v.is_short ? " · Short" : ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
