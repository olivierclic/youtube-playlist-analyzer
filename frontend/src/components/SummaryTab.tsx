import { useEffect, useState } from "react";
import { useStore } from "../store/useStore.js";
import { ApiError } from "../api/client.js";
import { mdToHtml } from "../lib/markdown.js";

export function SummaryTab({ videoId, initial }: { videoId: string; initial: string }) {
  const generateSummary = useStore((s) => s.generateSummary);
  const openrouterAvailable = useStore((s) => s.settings?.openrouter ?? false);

  const [md, setMd] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    setMd(initial);
    setError("");
    setStatus("");
  }, [videoId, initial]);

  async function onGenerate() {
    setLoading(true);
    setError("");
    try {
      const summary = await generateSummary(videoId);
      setMd(summary);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Échec de la génération.");
    } finally {
      setLoading(false);
    }
  }

  async function onCopy() {
    if (!md.trim()) return;
    await navigator.clipboard.writeText(md);
    setStatus("Copié ✓");
    setTimeout(() => setStatus(""), 1300);
  }

  return (
    <div>
      <div className="pane-head">
        <h4>Résumé IA</h4>
        <div className="btn-group">
          {md && (
            <button className="btn-sm" onClick={() => void onCopy()}>
              Copier (Markdown)
            </button>
          )}
          <button
            className="btn-sm btn-sm-primary"
            onClick={() => void onGenerate()}
            disabled={loading || !openrouterAvailable}
            title={openrouterAvailable ? "" : "Clé OpenRouter requise (Réglages)"}
          >
            {loading ? "Génération…" : md ? "✨ Régénérer" : "✨ Générer un résumé"}
          </button>
        </div>
      </div>

      {status && <div className="note-status">{status}</div>}
      {error && <div className="summary-error">Erreur : {error}</div>}

      {loading ? (
        <div className="summary-loading">Le modèle rédige le résumé…</div>
      ) : md ? (
        <div className="summary-output visible" dangerouslySetInnerHTML={{ __html: mdToHtml(md) }} />
      ) : (
        <div className="pane-placeholder">
          Aucun résumé. Clique « Générer » pour le créer à partir du titre, de la description et de
          la transcription (si disponible).
        </div>
      )}
    </div>
  );
}
