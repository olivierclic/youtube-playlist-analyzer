import { create } from "zustand";
import { api, ApiError } from "../api/client.js";
import type {
  PeriodFilter,
  SettingsPresence,
  Source,
  SortKey,
  Theme,
  TypeFilter,
  Video,
  ViewMode,
} from "../types.js";

interface AppState {
  // Données
  sources: Source[];
  activeSourceKey: string | null;
  videos: Video[];
  settings: SettingsPresence | null;

  // UI async
  loadingVideos: boolean;
  videosError: string | null;
  addingSource: boolean;

  // Filtres / tri
  period: PeriodFilter;
  type: TypeFilter;
  channel: string;
  sort: SortKey;
  showHidden: boolean;

  // Préférences UI
  view: ViewMode;
  theme: Theme;
  panelWidth: string;

  // Sélection
  selectedVideoId: string | null;

  // Actions
  init: () => Promise<void>;
  loadSources: () => Promise<void>;
  addSource: (url: string) => Promise<void>;
  removeSource: (key: string) => Promise<void>;
  selectSource: (key: string) => Promise<void>;
  refreshActiveSource: () => Promise<void>;
  loadVideos: (key: string) => Promise<void>;

  setPeriod: (p: PeriodFilter) => void;
  setType: (t: TypeFilter) => void;
  setChannel: (c: string) => void;
  setSort: (s: SortKey) => void;
  setShowHidden: (v: boolean) => void;

  toggleView: () => void;
  toggleTheme: () => void;
  setPanelWidth: (w: string, persist?: boolean) => void;

  selectVideo: (id: string) => void;
  closePanel: () => void;
}

function applyTheme(theme: Theme) {
  document.body.classList.toggle("light", theme === "light");
}

/** Enregistre une préférence côté serveur (best-effort, non bloquant). */
function savePref(key: string, value: string) {
  void api.putSettings({ preferences: { [key]: value } }).catch(() => {
    /* la persistance des préférences est non critique */
  });
}

function errMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : "Erreur inattendue.";
}

export const useStore = create<AppState>((set, get) => ({
  sources: [],
  activeSourceKey: null,
  videos: [],
  settings: null,

  loadingVideos: false,
  videosError: null,
  addingSource: false,

  period: 0,
  type: "all",
  channel: "",
  sort: "date_desc",
  showHidden: false,

  view: "grid",
  theme: "dark",
  panelWidth: "50%",

  selectedVideoId: null,

  async init() {
    // Préférences UI depuis le backend.
    try {
      const settings = await api.getSettings();
      const p = settings.preferences;
      const theme: Theme = p.theme === "light" ? "light" : "dark";
      const view: ViewMode = p.view === "list" ? "list" : "grid";
      applyTheme(theme);
      set({
        settings,
        theme,
        view,
        panelWidth: p.panel_w || "50%",
        showHidden: p.show_hidden === "1",
      });
    } catch {
      applyTheme("dark");
    }
    await get().loadSources();
  },

  async loadSources() {
    try {
      const sources = await api.listSources();
      const active = get().activeSourceKey ?? sources[0]?.key ?? null;
      set({ sources, activeSourceKey: active });
      if (active) await get().loadVideos(active);
    } catch (e) {
      set({ videosError: errMessage(e) });
    }
  },

  async addSource(url) {
    set({ addingSource: true });
    try {
      const src = await api.addSource(url);
      const exists = get().sources.some((s) => s.key === src.key);
      const sources = exists
        ? get().sources.map((s) => (s.key === src.key ? src : s))
        : [...get().sources, src];
      set({ sources, activeSourceKey: src.key });
      await get().loadVideos(src.key);
    } finally {
      set({ addingSource: false });
    }
  },

  async removeSource(key) {
    await api.deleteSource(key);
    const sources = get().sources.filter((s) => s.key !== key);
    set({ sources });
    if (get().activeSourceKey === key) {
      const next = sources[0]?.key ?? null;
      set({ activeSourceKey: next, videos: [], selectedVideoId: null });
      if (next) await get().loadVideos(next);
    }
  },

  async selectSource(key) {
    if (get().activeSourceKey === key) return;
    // On conserve les filtres en cours (exigence du cahier des charges).
    set({ activeSourceKey: key, selectedVideoId: null });
    await get().loadVideos(key);
  },

  async refreshActiveSource() {
    const key = get().activeSourceKey;
    if (!key) return;
    set({ loadingVideos: true, videosError: null, selectedVideoId: null });
    try {
      const src = await api.refreshSource(key);
      set({ sources: get().sources.map((s) => (s.key === key ? src : s)) });
      const videos = await api.listVideos(key);
      set({ videos });
    } catch (e) {
      set({ videosError: errMessage(e) });
    } finally {
      set({ loadingVideos: false });
    }
  },

  async loadVideos(key) {
    set({ loadingVideos: true, videosError: null, videos: [] });
    try {
      const videos = await api.listVideos(key);
      set({ videos });
    } catch (e) {
      set({ videosError: errMessage(e) });
    } finally {
      set({ loadingVideos: false });
    }
  },

  setPeriod(period) {
    // Le filtre créateur courant peut devenir invalide ; on le laisse, FilterBar
    // le réinitialise s'il n'a plus d'occurrence.
    set({ period });
  },
  setType(type) {
    set({ type });
  },
  setChannel(channel) {
    set({ channel });
  },
  setSort(sort) {
    set({ sort });
  },
  setShowHidden(showHidden) {
    set({ showHidden });
    savePref("show_hidden", showHidden ? "1" : "0");
  },

  toggleView() {
    const view: ViewMode = get().view === "grid" ? "list" : "grid";
    set({ view });
    savePref("view", view);
  },
  toggleTheme() {
    const theme: Theme = get().theme === "dark" ? "light" : "dark";
    applyTheme(theme);
    set({ theme });
    savePref("theme", theme);
  },
  setPanelWidth(panelWidth, persist = false) {
    set({ panelWidth });
    if (persist) savePref("panel_w", panelWidth);
  },

  selectVideo(id) {
    set({ selectedVideoId: id });
  },
  closePanel() {
    set({ selectedVideoId: null });
  },
}));
