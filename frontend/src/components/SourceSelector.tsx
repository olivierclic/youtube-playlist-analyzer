import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore.js";
import { ApiError } from "../api/client.js";

export function SourceSelector() {
  const sources = useStore((s) => s.sources);
  const activeKey = useStore((s) => s.activeSourceKey);
  const addingSource = useStore((s) => s.addingSource);
  const addSource = useStore((s) => s.addSource);
  const removeSource = useStore((s) => s.removeSource);
  const renameSource = useStore((s) => s.renameSource);
  const selectSource = useStore((s) => s.selectSource);

  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const activeName = sources.find((s) => s.key === activeKey)?.title ?? "Aucune source";

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function onAddFromClipboard() {
    setError("");
    let text = "";
    try {
      text = (await navigator.clipboard.readText()).trim();
    } catch {
      setError("Accès au presse-papier refusé par le navigateur.");
      return;
    }
    if (!text) {
      setError("Le presse-papier est vide.");
      return;
    }
    try {
      await addSource(text);
      setOpen(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Échec de l'ajout.");
    }
  }

  async function onRemove(e: React.MouseEvent, key: string) {
    e.stopPropagation();
    try {
      await removeSource(key);
    } catch {
      /* ignore */
    }
  }

  async function onRename(e: React.MouseEvent, key: string, current: string) {
    e.stopPropagation();
    const next = window.prompt("Nouveau nom de la source :", current);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === current) return;
    try {
      await renameSource(key, trimmed);
    } catch {
      /* ignore */
    }
  }

  function onOpen(e: React.MouseEvent, playlistId: string) {
    e.stopPropagation();
    window.open(`https://www.youtube.com/playlist?list=${playlistId}`, "_blank", "noopener");
  }

  return (
    <div className="source-wrap" ref={wrapRef}>
      <button className="source-btn" onClick={() => setOpen((v) => !v)}>
        <span className="src-name">{activeName}</span>
        <span className="chev">▼</span>
      </button>
      {open && (
        <div className="source-menu">
          <div>
            {sources.length === 0 ? (
              <div className="source-empty">Aucune source. Ajoute-en une ci-dessous.</div>
            ) : (
              sources.map((s) => (
                <div
                  key={s.key}
                  className={`source-item ${s.key === activeKey ? "active" : ""}`}
                  onClick={() => {
                    void selectSource(s.key);
                    setOpen(false);
                  }}
                >
                  <div className="si-info">
                    <div className="si-title">{s.title}</div>
                    <div className="si-meta">
                      {s.kind === "channel" ? "Chaîne" : "Playlist"} · {s.video_count} vidéos
                    </div>
                  </div>
                  <button
                    className="si-action"
                    title="Ouvrir la playlist sur YouTube"
                    onClick={(e) => onOpen(e, s.playlist_id)}
                  >
                    ↗
                  </button>
                  <button
                    className="si-action"
                    title="Renommer"
                    onClick={(e) => void onRename(e, s.key, s.title)}
                  >
                    ✎
                  </button>
                  <button
                    className="si-remove"
                    title="Retirer"
                    onClick={(e) => void onRemove(e, s.key)}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="source-add">
            <button
              className="source-add-btn"
              style={{ width: "100%" }}
              disabled={addingSource}
              onClick={() => void onAddFromClipboard()}
            >
              {addingSource ? "Vérification…" : "📋 Ajouter l'URL du presse-papier"}
            </button>
            {error && <div className="source-add-err">{error}</div>}
            <div className="source-add-hint">
              Copie l'URL d'une playlist (<code>…list=PL…</code>) ou d'une chaîne (
              <code>/@handle</code>, <code>/channel/UC…</code>), puis clique ce bouton.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
