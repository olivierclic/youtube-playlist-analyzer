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
  favoritesOnly: boolean;
  keyword: string;

  // Préférences UI
  view: ViewMode;
  theme: Theme;
  panelWidth: string;
  autoProcess: boolean;

  // Sélection
  selectedVideoId: string | null;

  // Traitement par lot (progression)
  batch: BatchState | null;

  // Actions
  init: () => Promise<void>;
  loadSources: () => Promise<void>;
  addSource: (url: string) => Promise<void>;
  removeSource: (key: string) => Promise<void>;
  renameSource: (key: string, title: string) => Promise<void>;
  selectSource: (key: string) => Promise<void>;
  refreshActiveSource: () => Promise<void>;
  loadVideos: (key: string) => Promise<void>;

  setPeriod: (p: PeriodFilter) => void;
  setType: (t: TypeFilter) => void;
  setChannel: (c: string) => void;
  setSort: (s: SortKey) => void;
  setShowHidden: (v: boolean) => void;
  setFavoritesOnly: (v: boolean) => void;
  setKeyword: (v: string) => void;

  toggleView: () => void;
  toggleTheme: () => void;
  setPanelWidth: (w: string, persist?: boolean) => void;

  selectVideo: (id: string) => void;
  closePanel: () => void;

  // Données utilisateur
  saveNote: (id: string, noteHtml: string) => Promise<void>;
  saveTranscript: (id: string, transcript: string) => Promise<void>;
  fetchTranscript: (id: string) => Promise<string>;
  generateSummary: (id: string) => Promise<string>;
  generateSummaryDetailed: (id: string) => Promise<string>;
  saveSummary: (id: string, md: string) => Promise<void>;
  saveSummaryDetailed: (id: string, md: string) => Promise<void>;

  // Masquage / favoris
  setVideoHidden: (id: string, hidden: boolean) => Promise<void>;
  setVideoFavorite: (id: string, favorite: boolean) => Promise<void>;

  // Réglages / auto / export-import / batch
  saveSettings: (payload: SettingsPayload) => Promise<void>;
  setAutoProcess: (v: boolean) => Promise<void>;
  exportData: () => Promise<void>;
  importData: (json: unknown) => Promise<void>;
  runBatch: (opts: { transcripts: boolean; summaries: boolean; videoIds?: string[] }) => Promise<void>;
}

export interface BatchState {
  running: boolean;
  done: number;
  total: number;
  currentTitle: string;
  errors: number;
  message: string;
}

export interface SettingsPayload {
  youtube_api_key?: string;
  openrouter_api_key?: string;
  apify_token?: string;
  openrouter_model?: string;
  apify_actor?: string;
  summary_system_prompt?: string;
  summary_detailed_system_prompt?: string;
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
  favoritesOnly: false,
  keyword: "",

  view: "grid",
  theme: "dark",
  panelWidth: "50%",
  autoProcess: false,

  selectedVideoId: null,
  batch: null,

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
        autoProcess: p.auto_process === "1",
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

  async renameSource(key, title) {
    const updated = await api.renameSource(key, title);
    set({ sources: get().sources.map((s) => (s.key === key ? updated : s)) });
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
    let newIds: string[] = [];
    try {
      const src = await api.refreshSource(key);
      newIds = src.new_video_ids ?? [];
      set({ sources: get().sources.map((s) => (s.key === key ? src : s)) });
      const videos = await api.listVideos(key);
      set({ videos });
    } catch (e) {
      set({ videosError: errMessage(e) });
      set({ loadingVideos: false });
      return;
    }
    set({ loadingVideos: false });

    // Traitement auto des nouvelles vidéos, puis baseline.
    if (get().autoProcess && newIds.length) {
      await get()
        .runBatch({ transcripts: true, summaries: true, videoIds: newIds })
        .catch(() => undefined);
    }
    if (get().autoProcess) await api.baseline(key).catch(() => undefined);
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
  setFavoritesOnly(favoritesOnly) {
    set({ favoritesOnly });
  },
  setKeyword(keyword) {
    set({ keyword });
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

  async saveNote(id, noteHtml) {
    await api.saveNote(id, noteHtml);
    patchVideo(set, get, id, { note_html: noteHtml.trim() === "" ? null : noteHtml });
  },
  async saveTranscript(id, transcript) {
    await api.saveTranscript(id, transcript);
    patchVideo(set, get, id, { transcript: transcript.trim() === "" ? null : transcript });
  },
  async fetchTranscript(id) {
    const { transcript } = await api.fetchTranscript(id);
    patchVideo(set, get, id, { transcript });
    return transcript;
  },
  async generateSummary(id) {
    const { summary, transcript } = await api.generateSummary(id);
    patchVideo(set, get, id, { summary_md: summary, ...(transcript ? { transcript } : {}) });
    return summary;
  },
  async generateSummaryDetailed(id) {
    const { summary, transcript } = await api.generateSummaryDetailed(id);
    patchVideo(set, get, id, {
      summary_detailed_md: summary,
      ...(transcript ? { transcript } : {}),
    });
    return summary;
  },
  async saveSummary(id, md) {
    await api.saveSummary(id, md);
    patchVideo(set, get, id, { summary_md: md.trim() === "" ? null : md });
  },
  async saveSummaryDetailed(id, md) {
    await api.saveSummaryDetailed(id, md);
    patchVideo(set, get, id, { summary_detailed_md: md.trim() === "" ? null : md });
  },

  async setVideoHidden(id, hidden) {
    await api.setHidden(id, hidden);
    patchVideo(set, get, id, { hidden });
    // Si on masque et que les masquées ne sont pas affichées, on referme le panneau.
    if (hidden && !get().showHidden && get().selectedVideoId === id) {
      set({ selectedVideoId: null });
    }
  },
  async setVideoFavorite(id, favorite) {
    await api.setFavorite(id, favorite);
    patchVideo(set, get, id, { favorite });
  },

  async saveSettings(payload) {
    const settings = await api.putSettings(payload as Record<string, unknown>);
    set({ settings });
  },

  async setAutoProcess(v) {
    set({ autoProcess: v });
    savePref("auto_process", v ? "1" : "0");
    // À l'activation, l'existant sert de référence (baseline).
    const key = get().activeSourceKey;
    if (v && key) await api.baseline(key).catch(() => undefined);
  },

  async exportData() {
    const data = await api.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `youtube-analyzer-sauvegarde_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  async importData(json) {
    await api.importData(json);
    // Recharge tout depuis le backend.
    set({ activeSourceKey: null, selectedVideoId: null });
    await get().loadSources();
    const settings = await api.getSettings().catch(() => null);
    if (settings) set({ settings });
  },

  async runBatch({ transcripts, summaries, videoIds }) {
    const key = get().activeSourceKey;
    if (!key || get().batch?.running) return;
    set({
      batch: { running: true, done: 0, total: 0, currentTitle: "", errors: 0, message: "Démarrage…" },
    });
    try {
      const res = await api.processStream(key, { transcripts, summaries, onlyMissing: true, videoIds });
      if (!res.ok || !res.body) throw new Error("Échec du démarrage du traitement.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          handleBatchLine(set, get, JSON.parse(line));
        }
      }
      // Recharge les vidéos pour refléter transcriptions/résumés ajoutés.
      const videos = await api.listVideos(key);
      set({ videos });
      const b = get().batch;
      if (b) set({ batch: { ...b, running: false } });
    } catch (e) {
      const b = get().batch;
      set({
        batch: {
          ...(b ?? { done: 0, total: 0, currentTitle: "", errors: 0 }),
          running: false,
          message: `⚠ ${errMessage(e)}`,
        },
      });
    }
  },
}));

interface BatchLine {
  type: "start" | "progress" | "error" | "done";
  total?: number;
  done?: number;
  currentTitle?: string;
  errors?: number;
}

/** Met à jour l'état de progression du batch à partir d'une ligne NDJSON. */
function handleBatchLine(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
  line: BatchLine,
) {
  const b = get().batch ?? {
    running: true,
    done: 0,
    total: 0,
    currentTitle: "",
    errors: 0,
    message: "",
  };
  if (line.type === "start") {
    set({ batch: { ...b, total: line.total ?? 0, message: `${line.total ?? 0} vidéo(s) à traiter` } });
  } else if (line.type === "progress") {
    set({
      batch: {
        ...b,
        done: line.done ?? b.done,
        total: line.total ?? b.total,
        currentTitle: line.currentTitle ?? "",
        errors: line.errors ?? b.errors,
        message: `Traitement ${line.done}/${line.total}…`,
      },
    });
  } else if (line.type === "done") {
    const errs = line.errors ?? b.errors;
    set({
      batch: {
        ...b,
        done: line.total ?? b.done,
        total: line.total ?? b.total,
        errors: errs,
        message: `✓ Terminé : ${line.total ?? 0} traitée(s)${errs ? `, ${errs} échec(s)` : ""}.`,
      },
    });
  }
}

/** Met à jour une vidéo en place dans le tableau `videos`. */
function patchVideo(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
  id: string,
  patch: Partial<Video>,
) {
  set({ videos: get().videos.map((v) => (v.id === id ? { ...v, ...patch } : v)) });
}
