import { useState } from "react";
import { useStore } from "../store/useStore.js";
import { SourceSelector } from "./SourceSelector.js";
import { SettingsModal } from "./SettingsModal.js";

export function Header() {
  const view = useStore((s) => s.view);
  const theme = useStore((s) => s.theme);
  const toggleView = useStore((s) => s.toggleView);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const refresh = useStore((s) => s.refreshActiveSource);
  const activeKey = useStore((s) => s.activeSourceKey);
  const loading = useStore((s) => s.loadingVideos);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header>
      <div className="logo">
        <svg viewBox="0 0 90 20" xmlns="http://www.w3.org/2000/svg">
          <rect width="90" height="20" rx="4" fill="#FF0000" />
          <polygon points="36,4 36,16 56,10" fill="white" />
        </svg>
        <span>Playlists</span>
      </div>

      <SourceSelector />

      <div className="header-right">
        <button
          className="icon-btn"
          onClick={toggleView}
          title="Affichage grille/liste"
        >
          {view === "grid" ? "▦" : "☰"}
        </button>
        <button className="icon-btn" onClick={toggleTheme} title="Thème clair/sombre">
          {theme === "dark" ? "☾" : "☀"}
        </button>
        {activeKey && (
          <button
            className="icon-btn"
            onClick={() => void refresh()}
            title="Rafraîchir cette source"
            disabled={loading}
          >
            ⟳
          </button>
        )}
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Configuration">
          ⚙
        </button>
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </header>
  );
}
