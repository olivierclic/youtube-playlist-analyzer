import { useMemo, useState } from "react";
import { useStore } from "../store/useStore.js";
import { ApiError } from "../api/client.js";
import { htmlToMd, mdToHtml } from "../lib/markdown.js";
import { RichEditor } from "./RichEditor.js";

export type SummaryKind = "standard" | "detailed";

const LABELS: Record<SummaryKind, { placeholder: string; empty: string }> = {
  standard: {
    placeholder: "Résumé IA…",
    empty: "Aucun résumé. Clique « Générer » pour le créer à partir du titre, de la description et de la transcription (si disponible).",
  },
  detailed: {
    placeholder: "Résumé IA détaillé…",
    empty: "Aucun résumé détaillé. Clique « Générer » pour produire un résumé approfondi (déclenchement manuel uniquement).",
  },
};

export function SummaryEditorTab({
  videoId,
  kind,
  summaryMd,
}: {
  videoId: string;
  kind: SummaryKind;
  summaryMd: string | null;
}) {
  const openrouterAvailable = useStore((s) => s.settings?.openrouter ?? false);
  const generate = useStore((s) =>
    kind === "detailed" ? s.generateSummaryDetailed : s.generateSummary,
  );
  const save = useStore((s) => (kind === "detailed" ? s.saveSummaryDetailed : s.saveSummary));

  const [genVersion, setGenVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Recalculé depuis le markdown stocké ; l'éditeur ne se recharge que sur genVersion.
  const initialHtml = useMemo(() => (summaryMd ? mdToHtml(summaryMd) : ""), [summaryMd]);
  const hasContent = Boolean(summaryMd && summaryMd.trim());

  async function onGenerate() {
    if (hasContent && !window.confirm("Un résumé existe déjà. Le régénérer écrasera le contenu actuel. Continuer ?")) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      await generate(videoId);
      setGenVersion((v) => v + 1); // force le rechargement de l'éditeur avec le nouveau contenu
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Échec de la génération.");
    } finally {
      setLoading(false);
    }
  }

  const genButton = (
    <button
      className="btn-sm btn-sm-primary"
      onClick={() => void onGenerate()}
      disabled={loading || !openrouterAvailable}
      title={openrouterAvailable ? "" : "Clé OpenRouter requise (Réglages)"}
    >
      {loading ? "Génération…" : hasContent ? "✨ Régénérer" : "✨ Générer"}
    </button>
  );

  return (
    <div>
      {error && <div className="summary-error">Erreur : {error}</div>}
      {loading && <div className="summary-loading">Le modèle rédige le résumé…</div>}
      <RichEditor
        seedKey={`${videoId}:${kind}:${genVersion}`}
        initialHtml={initialHtml}
        onSaveHtml={(html) => save(videoId, htmlToMd(html))}
        placeholder={hasContent ? LABELS[kind].placeholder : LABELS[kind].empty}
        extraActions={genButton}
      />
    </div>
  );
}
