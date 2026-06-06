import { useEffect, useState } from "react";
import { useStore } from "../store/useStore.js";
import { formatDuration, longDate } from "../lib/format.js";
import { htmlToPlain } from "../lib/markdown.js";
import { NotesEditor } from "./NotesEditor.js";
import { TranscriptTab } from "./TranscriptTab.js";
import { SummaryEditorTab } from "./SummaryEditorTab.js";
import { PdfDialog } from "./PdfDialog.js";
import { ConfirmDialog } from "./ConfirmDialog.js";

type Tab = "notes" | "description" | "transcript" | "summary" | "summary_detailed";

const TABS: { id: Tab; label: string }[] = [
  { id: "notes", label: "Notes" },
  { id: "description", label: "Description" },
  { id: "transcript", label: "Transcription" },
  { id: "summary", label: "Résumé IA" },
  { id: "summary_detailed", label: "Résumé détaillé" },
];

export function DetailPanel({ resizing }: { resizing: boolean }) {
  const selectedKey = useStore((s) => s.selectedKey);
  const videos = useStore((s) => s.videos);
  const sources = useStore((s) => s.sources);
  const panelWidth = useStore((s) => s.panelWidth);
  const closePanel = useStore((s) => s.closePanel);
  const setVideoHidden = useStore((s) => s.setVideoHidden);
  const setVideoFavorite = useStore((s) => s.setVideoFavorite);
  const deleteVideoLocal = useStore((s) => s.deleteVideoLocal);
  const moveVideoLocal = useStore((s) => s.moveVideoLocal);

  // selectedKey = `${source_key}|${id}` → on retrouve la copie exacte.
  const video =
    videos.find((v) => `${v.source_key}|${v.id}` === selectedKey) ?? null;

  const [tab, setTab] = useState<Tab>("description");
  const [pdfOpen, setPdfOpen] = useState(false);
  const [trashMenu, setTrashMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const hasNote = Boolean(video?.note_html && htmlToPlain(video.note_html));

  useEffect(() => {
    setTab(hasNote ? "notes" : "description");
    setTrashMenu(false);
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const moveTargets = video
    ? sources.filter((s) => s.key !== video.source_key)
    : [];

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
            <a
              className="modal-thumb-link"
              href={`https://www.youtube.com/watch?v=${video.id}`}
              target="_blank"
              rel="noreferrer"
              title="Ouvrir la vidéo sur YouTube"
            >
              {video.thumbnail && <img className="modal-thumb" src={video.thumbnail} alt="" />}
            </a>
            <div className="modal-head-text">
              <div className="modal-title">{video.title}</div>
              <div className="modal-meta">
                {video.channel_id ? (
                  <a
                    href={`https://www.youtube.com/channel/${video.channel_id}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Ouvrir la chaîne"
                  >
                    📺 {video.channel}
                  </a>
                ) : (
                  <span>📺 {video.channel}</span>
                )}
                <span>📅 {longDate(video.added_at)}</span>
                <span>
                  ⏱ {formatDuration(video.duration_s)}
                  {video.is_short ? " · Short" : ""}
                </span>
                <button
                  className={`meta-icon ${video.favorite ? "is-fav" : ""}`}
                  onClick={() => void setVideoFavorite(video.id, !video.favorite)}
                  title={video.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                >
                  {video.favorite ? "★" : "☆"}
                </button>
                <div className="trash-wrap">
                  <button
                    className="meta-icon"
                    onClick={() => setTrashMenu((v) => !v)}
                    title="Retirer / supprimer"
                  >
                    🗑
                  </button>
                  {trashMenu && (
                    <div className="trash-menu">
                      <button
                        onClick={() => {
                          setTrashMenu(false);
                          void setVideoHidden(video.id, !video.hidden);
                        }}
                      >
                        {video.hidden ? "↩ Restaurer (rendre visible)" : "🙈 Cacher de la liste"}
                      </button>
                      <button
                        className="danger"
                        onClick={() => {
                          setTrashMenu(false);
                          setConfirmDelete(true);
                        }}
                      >
                        🗑 Supprimer définitivement
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-head-actions">
                <button className="btn-sm" onClick={() => setPdfOpen(true)} title="Générer un PDF de la fiche">
                  📄 PDF
                </button>
                {moveTargets.length > 0 && (
                  <select
                    className="move-select"
                    value=""
                    title="Déplacer vers une autre playlist"
                    onChange={(e) => {
                      const to = e.target.value;
                      if (to) void moveVideoLocal(video.id, video.source_key, to);
                    }}
                  >
                    <option value="">↪ Déplacer vers…</option>
                    {moveTargets.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          <div className="tabs">
            {TABS.map((t) => {
              const dot =
                (t.id === "notes" && hasNote) ||
                (t.id === "description" && video.description) ||
                (t.id === "transcript" && video.transcript) ||
                (t.id === "summary" && video.summary_md) ||
                (t.id === "summary_detailed" && video.summary_detailed_md);
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
              <SummaryEditorTab key={`${video.id}-s`} videoId={video.id} kind="standard" summaryMd={video.summary_md} />
            )}
            {tab === "summary_detailed" && (
              <SummaryEditorTab key={`${video.id}-d`} videoId={video.id} kind="detailed" summaryMd={video.summary_detailed_md} />
            )}
          </div>

          {pdfOpen && <PdfDialog video={video} onClose={() => setPdfOpen(false)} />}
          {confirmDelete && (
            <ConfirmDialog
              title="Supprimer définitivement ?"
              message="La vidéo est retirée de cette playlist dans l'application et ne réapparaîtra plus, même après un rafraîchissement. (Elle reste sur YouTube.)"
              confirmLabel="Supprimer"
              danger
              onConfirm={() => {
                setConfirmDelete(false);
                void deleteVideoLocal(video.source_key, video.id);
              }}
              onCancel={() => setConfirmDelete(false)}
            />
          )}
        </>
      )}
    </aside>
  );
}
