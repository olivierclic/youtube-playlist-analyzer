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
  refreshSource: (key: string) =>
    request<Source>(`/sources/${encodeURIComponent(key)}/refresh`, { method: "POST" }),

  // Vidéos
  listVideos: (key: string) => request<Video[]>(`/sources/${encodeURIComponent(key)}/videos`),

  // Réglages
  getSettings: () => request<SettingsPresence>("/settings"),
  putSettings: (body: {
    preferences?: Record<string, string>;
    [k: string]: unknown;
  }) => request<SettingsPresence>("/settings", { method: "PUT", body: JSON.stringify(body) }),
};
