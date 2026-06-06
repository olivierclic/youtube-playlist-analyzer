import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "./store/useStore.js";
import { getFiltered } from "./lib/filter.js";
import { Header } from "./components/Header.js";
import { FilterBar } from "./components/FilterBar.js";
import { VideoGrid } from "./components/VideoGrid.js";
import { VideoList } from "./components/VideoList.js";
import { DetailPanel } from "./components/DetailPanel.js";

export default function App() {
  const init = useStore((s) => s.init);
  const activeKey = useStore((s) => s.activeSourceKey);
  const videos = useStore((s) => s.videos);
  const loading = useStore((s) => s.loadingVideos);
  const error = useStore((s) => s.videosError);
  const view = useStore((s) => s.view);
  const period = useStore((s) => s.period);
  const type = useStore((s) => s.type);
  const channel = useStore((s) => s.channel);
  const sort = useStore((s) => s.sort);
  const showHidden = useStore((s) => s.showHidden);
  const favoritesOnly = useStore((s) => s.favoritesOnly);
  const keyword = useStore((s) => s.keyword);
  const selectedId = useStore((s) => s.selectedVideoId);
  const setPanelWidth = useStore((s) => s.setPanelWidth);

  const appBodyRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  const filtered = useMemo(
    () => getFiltered(videos, { period, type, channel, sort, showHidden, favoritesOnly, keyword }),
    [videos, period, type, channel, sort, showHidden, favoritesOnly, keyword],
  );

  // Redimensionnement du split (poignée).
  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const rect = appBodyRef.current?.getBoundingClientRect();
      if (!rect) return;
      let w = ((rect.right - e.clientX) / rect.width) * 100;
      w = Math.max(25, Math.min(80, w));
      setPanelWidth(`${w.toFixed(1)}%`);
    };
    const onUp = () => {
      setResizing(false);
      document.body.style.userSelect = "";
      setPanelWidth(useStore.getState().panelWidth, true); // persiste la largeur finale
    };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [resizing, setPanelWidth]);

  let content: React.ReactNode;
  if (loading) {
    content = (
      <div className="loading">
        <div className="spinner" />
        <div className="loading-main">Chargement en cours…</div>
        <div className="loading-sub">Récupération des vidéos</div>
      </div>
    );
  } else if (error) {
    content = (
      <div className="empty">
        <strong>Erreur</strong>
        {error}
      </div>
    );
  } else if (!activeKey) {
    content = (
      <div className="empty">
        <strong>Bienvenue</strong>
        Ajoute une playlist ou une chaîne via le sélecteur en haut.
      </div>
    );
  } else if (!filtered.length) {
    content = (
      <div className="empty">
        <strong>{videos.length ? "Aucune vidéo" : "Source vide"}</strong>
        {videos.length
          ? "Aucune vidéo ne correspond à ces filtres."
          : "Aucune vidéo lisible dans cette source."}
      </div>
    );
  } else {
    content = view === "grid" ? <VideoGrid videos={filtered} /> : <VideoList videos={filtered} />;
  }

  const hasSource = Boolean(activeKey);

  return (
    <>
      <Header />
      {hasSource && !loading && !error && <FilterBar filteredCount={filtered.length} />}
      <div className={`app-body ${selectedId ? "panel-open" : ""}`} ref={appBodyRef}>
        <div className="main-content">{content}</div>
        <div
          className="resizer"
          onMouseDown={(e) => {
            e.preventDefault();
            setResizing(true);
          }}
        />
        <DetailPanel resizing={resizing} />
      </div>
    </>
  );
}
