import { useEffect, useState } from "react";
import { useStore } from "../store/useStore.js";
import { ApiError } from "../api/client.js";

export function TranscriptTab({
  videoId,
  initial,
}: {
  videoId: string;
  initial: string;
}) {
  const fetchTranscript = useStore((s) => s.fetchTranscript);
  const saveTranscript = useStore((s) => s.saveTranscript);
  const apifyAvailable = useStore((s) => s.settings?.apify ?? false);

  const [text, setText] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setText(initial);
    setStatus("");
  }, [videoId, initial]);

  async function onFetch() {
    setLoading(true);
    setStatus("Appel d'Apify en cours (quelques secondes)…");
    try {
      const t = await fetchTranscript(videoId);
      setText(t);
      setStatus("✓ Transcription récupérée via Apify.");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Échec.";
      setStatus(`⚠ ${msg} Tu peux coller la transcription manuellement.`);
    } finally {
      setLoading(false);
    }
  }

  async function onSave() {
    if (text === initial) return;
    try {
      await saveTranscript(videoId, text);
      setStatus("✓ Enregistrée.");
      setTimeout(() => setStatus(""), 1500);
    } catch {
      setStatus("⚠ Échec de l'enregistrement.");
    }
  }

  return (
    <div>
      <div className="pane-head">
        <h4>Transcription</h4>
        <div className="btn-group">
          <button
            className="btn-sm btn-sm-primary"
            onClick={() => void onFetch()}
            disabled={loading || !apifyAvailable}
            title={apifyAvailable ? "" : "Token Apify requis (Réglages)"}
          >
            {loading ? "Récupération…" : "⤓ Récupérer (Apify)"}
          </button>
        </div>
      </div>
      <div className="m-hint">
        Récupère la transcription via Apify, ou colle-la manuellement. Sauvegardée et utilisée pour
        le résumé IA.
      </div>
      <textarea
        className="m-textarea transcript"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void onSave()}
        placeholder="Transcription…"
      />
      <div className="note-status">{status}</div>
    </div>
  );
}
