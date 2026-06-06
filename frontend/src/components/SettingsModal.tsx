import { useRef, useState } from "react";
import { useStore, isVirtual } from "../store/useStore.js";
import { ApiError } from "../api/client.js";
import type { SettingsPayload } from "../store/useStore.js";
import { ExportDialog } from "./ExportDialog.js";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const autoProcess = useStore((s) => s.autoProcess);
  const setAutoProcess = useStore((s) => s.setAutoProcess);
  const showHidden = useStore((s) => s.showHidden);
  const setShowHidden = useStore((s) => s.setShowHidden);
  const showAllSource = useStore((s) => s.showAllSource);
  const setShowAllSource = useStore((s) => s.setShowAllSource);
  const videos = useStore((s) => s.videos);
  const activeKey = useStore((s) => s.activeSourceKey);
  const runBatch = useStore((s) => s.runBatch);
  const batch = useStore((s) => s.batch);
  const importData = useStore((s) => s.importData);

  const [keys, setKeys] = useState<SettingsPayload>({});
  const [model, setModel] = useState(settings?.model ?? "");
  const [actor, setActor] = useState(settings?.apifyActor ?? "");
  const [prompt, setPrompt] = useState(settings?.summaryPrompt ?? "");
  const [promptDetailed, setPromptDetailed] = useState(settings?.summaryDetailedPrompt ?? "");
  const [saveMsg, setSaveMsg] = useState("");
  const [ioMsg, setIoMsg] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<Record<string, unknown> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const ph = (present: boolean) => (present ? "•••••••• (défini)" : "Non défini");

  async function onSave() {
    const payload: SettingsPayload = { ...keys };
    if (model && model !== settings?.model) payload.openrouter_model = model;
    if (actor && actor !== settings?.apifyActor) payload.apify_actor = actor;
    if (prompt !== settings?.summaryPrompt) payload.summary_system_prompt = prompt;
    if (promptDetailed !== settings?.summaryDetailedPrompt)
      payload.summary_detailed_system_prompt = promptDetailed;
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
    if (!activeKey || isVirtual(activeKey)) {
      setSaveMsg("Sélectionne une playlist (pas une liste virtuelle) pour traiter.");
      return;
    }
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
    e.target.value = "";
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      setPendingImport(json); // ouvre le popup de choix d'écrasement
    } catch (err) {
      setIoMsg(`✗ ${err instanceof Error ? err.message : "Fichier illisible."}`);
    }
  }

  async function runImport(overwrite: boolean) {
    const json = pendingImport;
    setPendingImport(null);
    if (!json) return;
    try {
      await importData({ ...json, overwrite });
      setIoMsg("✓ Données importées.");
    } catch (err) {
      setIoMsg(`✗ ${err instanceof ApiError ? err.message : "Import impossible."}`);
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

        <div className="config-col">
          <label>Prompt système — Résumé IA</label>
          <textarea
            className="config-textarea"
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Instructions système pour le résumé standard…"
          />
        </div>
        <div className="config-col">
          <label>Prompt système — Résumé détaillé</label>
          <textarea
            className="config-textarea"
            rows={5}
            value={promptDetailed}
            onChange={(e) => setPromptDetailed(e.target.value)}
            placeholder="Instructions système pour le résumé détaillé…"
          />
          <small className="config-status">Laisse vide pour revenir au prompt par défaut.</small>
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
            Afficher les vidéos masquées (cachées de la liste)
          </label>
        </div>
        <div className="config-row">
          <label className="config-check">
            <input
              type="checkbox"
              checked={showAllSource}
              onChange={(e) => setShowAllSource(e.target.checked)}
            />
            Afficher la liste « Toutes » (agrégat de toutes les playlists)
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
          <button className="btn" onClick={() => setExportOpen(true)}>
            ⬇ Exporter… (réglages / playlists)
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
          Les clés vivent côté serveur (jamais renvoyées au navigateur, jamais exportées). Le
          traitement automatique ne concerne que les nouvelles vidéos importées lors d'un
          rafraîchissement ; utilise « Traiter les vidéos en attente » pour le rattrapage.
          <br />
          Version 1.0.0
        </div>
      </div>

      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
      {pendingImport && (
        <div className="modal-overlay" onClick={() => setPendingImport(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Importer ces données</h3>
            <p className="confirm-msg">
              En cas de doublon (même playlist ou même vidéo), faut-il écraser les données locales
              par celles du fichier ?
            </p>
            <div className="config-row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn" onClick={() => setPendingImport(null)}>
                Annuler
              </button>
              <button className="btn" onClick={() => void runImport(false)}>
                Conserver le local
              </button>
              <button className="btn btn-primary" onClick={() => void runImport(true)}>
                Écraser
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
