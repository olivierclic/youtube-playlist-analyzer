import { useState } from "react";
import type { Video } from "../types.js";
import { availableSections, printVideoSheet, type PdfSection } from "../lib/pdf.js";

const SECTION_LABELS: { id: PdfSection; label: string }[] = [
  { id: "notes", label: "Notes" },
  { id: "description", label: "Description" },
  { id: "summary", label: "Résumé IA" },
  { id: "summary_detailed", label: "Résumé détaillé" },
];

const NONE: Record<PdfSection, boolean> = {
  notes: false,
  description: false,
  summary: false,
  summary_detailed: false,
};

export function PdfDialog({ video, onClose }: { video: Video; onClose: () => void }) {
  // Aucune case cochée par défaut.
  const [selected, setSelected] = useState<Record<PdfSection, boolean>>({ ...NONE });
  const available = availableSections(video);

  const toggle = (id: PdfSection) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const checkAll = () => {
    // Coche uniquement les rubriques disponibles (non vides).
    const next = { ...NONE };
    for (const { id } of SECTION_LABELS) next[id] = available[id];
    setSelected(next);
  };

  const anySelected = SECTION_LABELS.some(({ id }) => selected[id] && available[id]);

  function onGenerate() {
    printVideoSheet(video, selected);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="pdf-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="config-modal-head">
          <h3>📄 Générer un PDF</h3>
          <button className="panel-close" style={{ position: "static" }} onClick={onClose}>
            ×
          </button>
        </div>

        <p className="m-hint">Choisis les rubriques à inclure dans le PDF.</p>

        <div className="pdf-sections">
          {SECTION_LABELS.map(({ id, label }) => (
            <label
              key={id}
              className={`config-check ${available[id] ? "" : "disabled"}`}
              title={available[id] ? "" : "Rubrique vide"}
            >
              <input
                type="checkbox"
                checked={selected[id]}
                disabled={!available[id]}
                onChange={() => toggle(id)}
              />
              {label}
              {!available[id] && <span className="pdf-empty"> (vide)</span>}
            </label>
          ))}
        </div>

        <div className="config-row" style={{ marginTop: 12 }}>
          <button className="link-btn" onClick={checkAll}>
            Tout cocher
          </button>
          <div className="sep" />
          <button className="btn btn-primary" onClick={onGenerate} disabled={!anySelected}>
            Générer le PDF
          </button>
        </div>
      </div>
    </div>
  );
}
