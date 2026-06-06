import type { FastifyPluginAsync } from "fastify";
import { getYoutubeKey } from "../config.js";
import {
  countVideos,
  deleteSource,
  getSource,
  listSources,
  markAllSeen,
  replaceSourceVideos,
  touchRefreshed,
  unseenVideoIds,
  updateSourceTitle,
  upsertSource,
} from "../db/repo.js";
import { fetchSourceVideos, resolveSource, YoutubeError } from "../services/youtube.js";
import type { SourceWithCount } from "../types.js";

function requireYoutubeKey(): string {
  const key = getYoutubeKey();
  if (!key) {
    throw new YoutubeError(
      "youtube_key_missing",
      "Aucune clé YouTube configurée (.env ou Réglages).",
      400,
    );
  }
  return key;
}

/** Construit la réponse source enrichie du compte de vidéos. */
function sourceWithCount(key: string): SourceWithCount | undefined {
  const src = getSource(key);
  if (!src) return undefined;
  return { ...src, video_count: countVideos(key) };
}

const sourcesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/sources", async () => listSources());

  app.post(
    "/sources",
    {
      schema: {
        body: {
          type: "object",
          required: ["url"],
          additionalProperties: false,
          properties: { url: { type: "string", minLength: 1 } },
        },
      },
    },
    async (req, reply) => {
      const { url } = req.body as { url: string };
      const apiKey = requireYoutubeKey();

      const resolved = await resolveSource(url, apiKey);
      upsertSource(resolved);

      // Fetch immédiat : on remplit le cache de vidéos dès l'ajout.
      const videos = await fetchSourceVideos(resolved.playlistId, resolved.key, apiKey);
      replaceSourceVideos(resolved.key, videos);
      touchRefreshed(resolved.key);

      reply.code(201);
      return sourceWithCount(resolved.key);
    },
  );

  // Renommer l'affichage d'une source.
  app.patch(
    "/sources/:key",
    {
      schema: {
        params: { type: "object", required: ["key"], properties: { key: { type: "string" } } },
        body: {
          type: "object",
          required: ["title"],
          additionalProperties: false,
          properties: { title: { type: "string", minLength: 1 } },
        },
      },
    },
    async (req) => {
      const { key } = req.params as { key: string };
      const { title } = req.body as { title: string };
      if (!updateSourceTitle(key, title.trim())) {
        throw new YoutubeError("source_not_found", "Source inconnue.", 404);
      }
      return sourceWithCount(key);
    },
  );

  app.delete(
    "/sources/:key",
    {
      schema: {
        params: {
          type: "object",
          required: ["key"],
          properties: { key: { type: "string" } },
        },
      },
    },
    async (req, reply) => {
      const { key } = req.params as { key: string };
      const removed = deleteSource(key);
      if (!removed) {
        throw new YoutubeError("source_not_found", "Source inconnue.", 404);
      }
      reply.code(204);
      return null;
    },
  );

  app.post(
    "/sources/:key/refresh",
    {
      schema: {
        params: {
          type: "object",
          required: ["key"],
          properties: { key: { type: "string" } },
        },
      },
    },
    async (req) => {
      const { key } = req.params as { key: string };
      const src = getSource(key);
      if (!src) {
        throw new YoutubeError("source_not_found", "Source inconnue.", 404);
      }
      const apiKey = requireYoutubeKey();
      const videos = await fetchSourceVideos(src.playlist_id, key, apiKey);
      replaceSourceVideos(key, videos);
      touchRefreshed(key);
      // Vidéos jamais « vues » → candidates au traitement auto côté front.
      return { ...sourceWithCount(key), new_video_ids: unseenVideoIds(key) };
    },
  );

  // Baseline du traitement auto : marque toutes les vidéos de la source « vues ».
  app.post(
    "/sources/:key/baseline",
    {
      schema: {
        params: { type: "object", required: ["key"], properties: { key: { type: "string" } } },
      },
    },
    async (req) => {
      const { key } = req.params as { key: string };
      if (!getSource(key)) throw new YoutubeError("source_not_found", "Source inconnue.", 404);
      const count = markAllSeen(key);
      return { ok: true, seen: count };
    },
  );
};

export default sourcesRoutes;
