import { useEffect, useState } from "react";
import { useStore } from "../store/useStore.js";
import { formatDuration, formatNum, longDate } from "../lib/format.js";

type Tab = "notes" | "description" | "transcript" | "summary";

const TABS: { id: Tab; label: string }[] = [
  { id: "notes", label: "Notes" },
  { id: "description", label: "Description" },
  { id: "transcript", label: "Transcription" },
  { id: "summary", label: "Résumé IA" },
];

const PLACEHOLDER: Record<Exclude<Tab, "description">, string> = {
  notes: "L'éditeur de notes riches arrive à l'étape 3.",
  transcript: "La récupération de transcription (Apify) arrive à l'étape 3.",
  summary: "La génération de résumé IA (OpenRouter) arrive à l'étape 3.",
};

export function DetailPanel({ resizing }: { resizing: boolean }) {
  const selectedId = useStore((s) => s.selectedVideoId);
  const videos = useStore((s) => s.videos);
  const panelWidth = useStore((s) => s.panelWidth);
  const closePanel = useStore((s) => s.closePanel);

  const video = videos.find((v) => v.id === selectedId) ?? null;
  const [tab, setTab] = useState<Tab>("description");

  // À chaque changement de vidéo, on revient sur Description (Notes à l'étape 3).
  useEffect(() => {
    setTab("description");
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
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`tab ${tab === t.id ? "active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.id === "description" && video.description ? (
                  <span className="tab-dot" />
                ) : null}
              </button>
            ))}
          </div>

          <div className="tab-content">
            {tab === "description" ? (
              <div className="modal-desc">{video.description || "Aucune description."}</div>
            ) : (
              <div className="pane-placeholder">{PLACEHOLDER[tab]}</div>
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
          </div>
        </>
      )}
    </aside>
  );
}
