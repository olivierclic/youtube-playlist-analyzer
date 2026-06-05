import { useEffect, useState } from "react";
import { useStore } from "../store/useStore.js";
import { formatDuration, formatNum, longDate } from "../lib/format.js";
import { htmlToPlain } from "../lib/markdown.js";
import { NotesEditor } from "./NotesEditor.js";
import { TranscriptTab } from "./TranscriptTab.js";
import { SummaryTab } from "./SummaryTab.js";

type Tab = "notes" | "description" | "transcript" | "summary";

const TABS: { id: Tab; label: string }[] = [
  { id: "notes", label: "Notes" },
  { id: "description", label: "Description" },
  { id: "transcript", label: "Transcription" },
  { id: "summary", label: "Résumé IA" },
];

export function DetailPanel({ resizing }: { resizing: boolean }) {
  const selectedId = useStore((s) => s.selectedVideoId);
  const videos = useStore((s) => s.videos);
  const panelWidth = useStore((s) => s.panelWidth);
  const closePanel = useStore((s) => s.closePanel);
  const setVideoHidden = useStore((s) => s.setVideoHidden);

  const video = videos.find((v) => v.id === selectedId) ?? null;
  const [tab, setTab] = useState<Tab>("description");

  const hasNote = Boolean(video?.note_html && htmlToPlain(video.note_html));

  // À chaque changement de vidéo : Notes si une note existe, sinon Description.
  useEffect(() => {
    setTab(hasNote ? "notes" : "description");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <aside
      className={`detail-panel ${video ? "open" : ""} ${resizing ? "resizing" : ""}`}
      style={{ ["--panel-w" as string]: panelWidth }}
    >
      {video && (
        <>
          <button className="panel-close" onClick={closePanel} title="Fermer">
            ×
          </button>

          <div className="modal-head">
            {video.thumbnail && <img className="modal-thumb" src={video.thumbnail} alt="" />}
            <div className="modal-head-text">
              <div className="modal-title">{video.title}</div>
              <div className="modal-meta">
                <span>📺 {video.channel}</span>
                <span>📅 {longDate(video.added_at)}</span>
                <span>
                  ⏱ {formatDuration(video.duration_s)}
                  {video.is_short ? " · Short" : ""}
                </span>
                {video.views ? <span>👁 {formatNum(video.views)} vues</span> : null}
                {video.likes ? <span>👍 {formatNum(video.likes)}</span> : null}
                {video.definition === "hd" ? <span>🔷 HD</span> : null}
              </div>
            </div>
          </div>

          <div className="tabs">
            {TABS.map((t) => {
              const dot =
                (t.id === "notes" && hasNote) ||
                (t.id === "description" && video.description) ||
                (t.id === "transcript" && video.transcript) ||
                (t.id === "summary" && video.summary_md);
              return (
                <button
                  key={t.id}
                  className={`tab ${tab === t.id ? "active" : ""}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                  {dot ? <span className="tab-dot" /> : null}
                </button>
              );
            })}
          </div>

          <div className="tab-content">
            {tab === "notes" && (
              <NotesEditor key={video.id} videoId={video.id} initialHtml={video.note_html ?? ""} />
            )}
            {tab === "description" && (
              <div className="modal-desc">{video.description || "Aucune description."}</div>
            )}
            {tab === "transcript" && (
              <TranscriptTab key={video.id} videoId={video.id} initial={video.transcript ?? ""} />
            )}
            {tab === "summary" && (
              <SummaryTab key={video.id} videoId={video.id} initial={video.summary_md ?? ""} />
            )}
          </div>

          <div className="panel-foot">
            <a
              className="btn btn-primary"
              href={`https://www.youtube.com/watch?v=${video.id}`}
              target="_blank"
              rel="noreferrer"
            >
              ▶ Ouvrir sur YouTube
            </a>
            <button
              className="btn"
              onClick={() => void setVideoHidden(video.id, !video.hidden)}
            >
              {video.hidden ? "↩ Restaurer dans la liste" : "🚫 Retirer de la liste"}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
