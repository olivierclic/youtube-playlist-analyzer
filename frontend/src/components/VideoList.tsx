import { useStore } from "../store/useStore.js";
import { formatDuration, relativeDate } from "../lib/format.js";
import { htmlToPlain, mdToPlain } from "../lib/markdown.js";
import type { Video } from "../types.js";

/** Sous-texte par priorité : note perso → résumé IA → description. */
function subText(v: Video): { text: string; label: string; cls: string } {
  if (v.note_html) {
    const t = htmlToPlain(v.note_html);
    if (t) return { text: t.slice(0, 260), label: "Ma note", cls: "is-note" };
  }
  if (v.summary_md) {
    const t = mdToPlain(v.summary_md);
    if (t) return { text: t.slice(0, 260), label: "Résumé IA", cls: "is-summary" };
  }
  const desc = v.description ? v.description.slice(0, 260) : "(aucune description)";
  return { text: desc, label: "", cls: "" };
}

export function VideoList({ videos }: { videos: Video[] }) {
  const selectedId = useStore((s) => s.selectedVideoId);
  const selectVideo = useStore((s) => s.selectVideo);

  return (
    <div className="list">
      {videos.map((v) => {
        const sub = subText(v);
        return (
          <div
            key={v.id}
            className={`list-row ${v.id === selectedId ? "selected" : ""}`}
            onClick={() => selectVideo(v.id)}
          >
            {v.thumbnail && <img className="list-thumb" src={v.thumbnail} alt="" loading="lazy" />}
            <div className="list-info">
              <div className="list-title">{v.title}</div>
              <div className={`list-sub ${sub.cls}`}>
                {sub.label && <span className="list-sub-label">{sub.label}</span>}
                {sub.text}
              </div>
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
