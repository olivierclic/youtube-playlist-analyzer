import { useState } from "react";
import { useStore } from "../store/useStore.js";

// Champs exportables (miroir du backend).
const FIELDS: { id: string; label: string }[] = [
  { id: "title", label: "Titre" },
  { id: "channel", label: "Chaîne" },
  { id: "channel_id", label: "ID chaîne" },
  { id: "published_at", label: "Date de publication" },
  { id: "added_at", label: "Date d'ajout" },
  { id: "description", label: "Description" },
  { id: "thumbnail", label: "Miniature" },
  { id: "duration_s", label: "Durée" },
  { id: "is_short", label: "Short ?" },
  { id: "views", label: "Vues" },
  { id: "likes", label: "Likes" },
  { id: "comments", label: "Commentaires" },
  { id: "definition", label: "Définition" },
  { id: "lang", label: "Langue" },
  { id: "tags", label: "Tags" },
  { id: "position", label: "Position" },
  { id: "note_html", label: "Note perso" },
  { id: "transcript", label: "Transcription" },
  { id: "summary_md", label: "Résumé IA" },
  { id: "summary_detailed_md", label: "Résumé détaillé" },
  { id: "favorite", label: "Favori" },
  { id: "hidden", label: "Masquée" },
];

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const sources = useStore((s) => s.sources);
  const exportData = useStore((s) => s.exportData);

  const [settings, setSettings] = useState(true);
  const [srcSel, setSrcSel] = useState<Set<string>>(new Set(sources.map((s) => s.key)));
  const [fieldSel, setFieldSel] = useState<Set<string>>(new Set(FIELDS.map((f) => f.id)));
  const [busy, setBusy] = useState(false);

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    set((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const canExport = settings || (srcSel.size > 0 && fieldSel.size > 0);

  async function onExport() {
    setBusy(true);
    try {
      await exportData({
        settings,
        sourceKeys: [...srcSel],
        fields: [...fieldSel],
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="export-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="config-modal-head">
          <h3>⬇ Exporter les données</h3>
          <button className="panel-close" style={{ position: "static" }} onClick={onClose}>
            ×
          </button>
        </div>

        <label className="config-check" style={{ marginBottom: 12 }}>
          <input type="checkbox" checked={settings} onChange={(e) => setSettings(e.target.checked)} />
          Réglages de l'application (préférences, modèle, prompts — sans les clés API)
        </label>

        <div className="export-cols">
          <div className="export-col">
            <div className="export-col-head">
              <strong>Playlists</strong>
              <button className="link-btn" onClick={() => setSrcSel(new Set(sources.map((s) => s.key)))}>
                tout
              </button>
              <button className="link-btn" onClick={() => setSrcSel(new Set())}>
                rien
              </button>
            </div>
            {sources.length === 0 && <div className="config-status">Aucune playlist.</div>}
            {sources.map((s) => (
              <label key={s.key} className="config-check">
                <input
                  type="checkbox"
                  checked={srcSel.has(s.key)}
                  onChange={() => toggle(setSrcSel, s.key)}
                />
                {s.title}
              </label>
            ))}
          </div>

          <div className="export-col">
            <div className="export-col-head">
              <strong>Champs</strong>
              <button className="link-btn" onClick={() => setFieldSel(new Set(FIELDS.map((f) => f.id)))}>
                tout
              </button>
              <button className="link-btn" onClick={() => setFieldSel(new Set())}>
                rien
              </button>
            </div>
            {FIELDS.map((f) => (
              <label key={f.id} className="config-check">
                <input
                  type="checkbox"
                  checked={fieldSel.has(f.id)}
                  onChange={() => toggle(setFieldSel, f.id)}
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>

        <div className="config-row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" disabled={!canExport || busy} onClick={() => void onExport()}>
            {busy ? "Export…" : "Exporter (JSON)"}
          </button>
        </div>
      </div>
    </div>
  );
}
