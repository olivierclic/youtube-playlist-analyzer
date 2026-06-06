import type { Source, SettingsPresence, Video } from "../types.js";

/** Erreur applicative portant le code renvoyé par le backend. */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("network_error", "Impossible de joindre le serveur.", 0);
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(err?.code ?? "error", err?.message ?? `Erreur ${res.status}`, res.status);
  }
  return data as T;
}

export const api = {
  // Sources
  listSources: () => request<Source[]>("/sources"),
  addSource: (url: string) =>
    request<Source>("/sources", { method: "POST", body: JSON.stringify({ url }) }),
  deleteSource: (key: string) =>
    request<void>(`/sources/${encodeURIComponent(key)}`, { method: "DELETE" }),
  renameSource: (key: string, title: string) =>
    request<Source>(`/sources/${encodeURIComponent(key)}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  refreshSource: (key: string) =>
    request<Source & { new_video_ids: string[] }>(
      `/sources/${encodeURIComponent(key)}/refresh`,
      { method: "POST" },
    ),

  // Vidéos
  listVideos: (key: string) => request<Video[]>(`/sources/${encodeURIComponent(key)}/videos`),
  listAllVideos: () => request<Video[]>("/videos/all"),
  listDuplicates: () => request<Video[]>("/videos/duplicates"),

  // Masquage / favori / suppression / déplacement
  setHidden: (id: string, hidden: boolean) =>
    request<{ ok: true; hidden: boolean }>(`/videos/${encodeURIComponent(id)}/hidden`, {
      method: "PATCH",
      body: JSON.stringify({ hidden }),
    }),
  setFavorite: (id: string, favorite: boolean) =>
    request<{ ok: true; favorite: boolean }>(`/videos/${encodeURIComponent(id)}/favorite`, {
      method: "PATCH",
      body: JSON.stringify({ favorite }),
    }),
  deleteVideo: (sourceKey: string, id: string) =>
    request<void>(
      `/sources/${encodeURIComponent(sourceKey)}/videos/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
  moveVideo: (id: string, from: string, to: string) =>
    request<{ ok: true; result: string }>(`/videos/${encodeURIComponent(id)}/move`, {
      method: "POST",
      body: JSON.stringify({ from, to }),
    }),

  // Export / import
  exportData: (opts: { settings: boolean; sourceKeys?: string[]; fields?: string[] }) =>
    request<Record<string, unknown>>("/data/export", {
      method: "POST",
      body: JSON.stringify(opts),
    }),
  importData: (payload: unknown) =>
    request<{ ok: true }>("/data/import", { method: "POST", body: JSON.stringify(payload) }),

  // Batch (flux NDJSON) — renvoie la réponse brute pour lire le stream.
  processStream: (
    key: string,
    body: { transcripts: boolean; summaries: boolean; onlyMissing: boolean; videoIds?: string[] },
  ) =>
    fetch(`/api/sources/${encodeURIComponent(key)}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  // Données utilisateur
  saveNote: (id: string, note_html: string) =>
    request<{ ok: true }>(`/videos/${encodeURIComponent(id)}/note`, {
      method: "PUT",
      body: JSON.stringify({ note_html }),
    }),
  saveTranscript: (id: string, transcript: string) =>
    request<{ ok: true }>(`/videos/${encodeURIComponent(id)}/transcript`, {
      method: "PUT",
      body: JSON.stringify({ transcript }),
    }),
  fetchTranscript: (id: string) =>
    request<{ transcript: string }>(`/videos/${encodeURIComponent(id)}/transcript/fetch`, {
      method: "POST",
    }),
  generateSummary: (id: string) =>
    request<{ summary: string; transcript: string | null }>(
      `/videos/${encodeURIComponent(id)}/summary/generate`,
      { method: "POST" },
    ),
  generateSummaryDetailed: (id: string) =>
    request<{ summary: string; transcript: string | null }>(
      `/videos/${encodeURIComponent(id)}/summary-detailed/generate`,
      { method: "POST" },
    ),
  saveSummary: (id: string, summary_md: string) =>
    request<{ ok: true }>(`/videos/${encodeURIComponent(id)}/summary`, {
      method: "PUT",
      body: JSON.stringify({ summary_md }),
    }),
  saveSummaryDetailed: (id: string, summary_md: string) =>
    request<{ ok: true }>(`/videos/${encodeURIComponent(id)}/summary-detailed`, {
      method: "PUT",
      body: JSON.stringify({ summary_md }),
    }),

  // Réglages
  getSettings: () => request<SettingsPresence>("/settings"),
  putSettings: (body: {
    preferences?: Record<string, string>;
    [k: string]: unknown;
  }) => request<SettingsPresence>("/settings", { method: "PUT", body: JSON.stringify(body) }),
};
