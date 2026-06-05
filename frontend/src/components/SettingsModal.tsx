import { useRef, useState } from "react";
import { useStore } from "../store/useStore.js";
import { ApiError } from "../api/client.js";
import type { SettingsPayload } from "../store/useStore.js";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const autoProcess = useStore((s) => s.autoProcess);
  const setAutoProcess = useStore((s) => s.setAutoProcess);
  const showHidden = useStore((s) => s.showHidden);
  const setShowHidden = useStore((s) => s.setShowHidden);
  const videos = useStore((s) => s.videos);
  const activeKey = useStore((s) => s.activeSourceKey);
  const runBatch = useStore((s) => s.runBatch);
  const batch = useStore((s) => s.batch);
  const exportData = useStore((s) => s.exportData);
  const importData = useStore((s) => s.importData);

  const [keys, setKeys] = useState<SettingsPayload>({});
  const [model, setModel] = useState(settings?.model ?? "");
  const [actor, setActor] = useState(settings?.apifyActor ?? "");
  const [saveMsg, setSaveMsg] = useState("");
  const [ioMsg, setIoMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const ph = (present: boolean) => (present ? "•••••••• (défini)" : "Non défini");

  async function onSave() {
    const payload: SettingsPayload = { ...keys };
    if (model && model !== settings?.model) payload.openrouter_model = model;
    if (actor && actor !== settings?.apifyActor) payload.apify_actor = actor;
    try {
      await saveSettings(payload);
      setKeys({});
      setSaveMsg("✓ Réglages enregistrés.");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (e) {
      setSaveMsg(`⚠ ${e instanceof ApiError ? e.message : "Échec."}`);
    }
  }

  // Estimation des vidéos à traiter (transcription ou résumé manquants, clé dispo).
  const pending = videos.filter(
    (v) =>
      (!v.transcript && settings?.apify) || (!v.summary_md && settings?.openrouter),
  ).length;

  async function onProcess() {
    if (!activeKey) return;
    if (!settings?.apify && !settings?.openrouter) {
      setSaveMsg("Ajoute une clé Apify (transcriptions) et/ou OpenRouter (résumés).");
      return;
    }
    if (!pending) {
      setSaveMsg("Tout est déjà à jour pour cette source.");
      return;
    }
    if (
      !window.confirm(
        `Traiter ${pending} vidéo(s) ?\nCela consomme des crédits Apify/OpenRouter et peut prendre du temps.`,
      )
    )
      return;
    await runBatch({ transcripts: true, summaries: true });
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if (!window.confirm("Importer ces données ? Cela remplacera sources, notes, transcriptions et résumés.")) {
        e.target.value = "";
        return;
      }
      await importData(json);
      setIoMsg("✓ Données importées.");
    } catch (err) {
      setIoMsg(`✗ ${err instanceof Error ? err.message : "Import impossible."}`);
    } finally {
      e.target.value = "";
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="config-panel-modal" onClick={(e) => e.stopPropagation()}>
        <div className="config-modal-head">
          <h3>⚙ Configuration</h3>
          <button className="panel-close" style={{ position: "static" }} onClick={onClose}>
            ×
          </button>
        </div>

        <div className="config-row">
          <label>Clé API YouTube</label>
          <input
            className="config-input"
            type="password"
            placeholder={ph(settings?.youtube ?? false)}
            value={keys.youtube_api_key ?? ""}
            onChange={(e) => setKeys({ ...keys, youtube_api_key: e.target.value })}
          />
        </div>
        <div className="config-row">
          <label>Clé API OpenRouter</label>
          <input
            className="config-input"
            type="password"
            placeholder={ph(settings?.openrouter ?? false)}
            value={keys.openrouter_api_key ?? ""}
            onChange={(e) => setKeys({ ...keys, openrouter_api_key: e.target.value })}
          />
        </div>
        <div className="config-row">
          <label>Modèle IA</label>
          <input
            className="config-input"
            placeholder="anthropic/claude-3.5-sonnet"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </div>
        <div className="config-row">
          <label>Token Apify</label>
          <input
            className="config-input"
            type="password"
            placeholder={ph(settings?.apify ?? false)}
            value={keys.apify_token ?? ""}
            onChange={(e) => setKeys({ ...keys, apify_token: e.target.value })}
          />
        </div>
        <div className="config-row">
          <label>Actor Apify</label>
          <input
            className="config-input"
            placeholder="vKlQCAJRI72MdyK1u"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
          />
        </div>
        <div className="config-row">
          <button className="btn btn-primary" onClick={() => void onSave()}>
            Enregistrer
          </button>
          <span className="config-status">{saveMsg}</span>
        </div>

        <div className="config-sep" />

        <div className="config-row">
          <label className="config-check">
            <input
              type="checkbox"
              checked={autoProcess}
              onChange={(e) => void setAutoProcess(e.target.checked)}
            />
            Récupérer automatiquement transcription + résumé des nouvelles vidéos à venir
          </label>
        </div>
        <div className="config-row">
          <label className="config-check">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
            />
            Afficher les vidéos masquées (retirées de la liste)
          </label>
        </div>
        <div className="config-row">
          <button className="btn" onClick={() => void onProcess()} disabled={batch?.running}>
            ⚡ Traiter les vidéos en attente
          </button>
          {batch && (
            <span className="config-status">
              {batch.message}
              {batch.running && batch.currentTitle ? ` — ${batch.currentTitle.slice(0, 40)}…` : ""}
            </span>
          )}
        </div>
        {batch && batch.total > 0 && (
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${Math.round((batch.done / batch.total) * 100)}%` }}
            />
          </div>
        )}

        <div className="config-sep" />

        <div className="config-row">
          <button className="btn" onClick={() => void exportData()}>
            ⬇ Exporter toutes les données (JSON)
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            ⬆ Importer des données
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => void onImportFile(e)}
          />
          <span className="config-status">{ioMsg}</span>
        </div>

        <div className="config-hint">
          Les clés vivent côté serveur (jamais renvoyées au navigateur). Le traitement automatique ne
          concerne que les vidéos apparues <em>après</em> activation ; utilise « Traiter les vidéos en
          attente » pour le rattrapage.
        </div>
      </div>
    </div>
  );
}
