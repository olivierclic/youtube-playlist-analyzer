import type { FastifyPluginAsync } from "fastify";
import { getYoutubeKey } from "../config.js";
import {
  countVideos,
  getSource,
  listVideos,
  replaceSourceVideos,
  touchRefreshed,
} from "../db/repo.js";
import { fetchSourceVideos, YoutubeError } from "../services/youtube.js";
import type { VideoWithUserData } from "../types.js";

/** Sérialise une vidéo pour le front : `tags` JSON décodé, booléens normalisés. */
function serialize(v: VideoWithUserData) {
  let tags: string[] = [];
  if (v.tags) {
    try {
      const parsed = JSON.parse(v.tags);
      if (Array.isArray(parsed)) tags = parsed;
    } catch {
      /* tags malformés : on renvoie un tableau vide */
    }
  }
  return { ...v, tags, is_short: v.is_short === 1, hidden: v.hidden === 1 };
}

const videosRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/sources/:key/videos",
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

      // Repli : cache vide => on tente un fetch (si une clé est dispo).
      if (countVideos(key) === 0) {
        const apiKey = getYoutubeKey();
        if (apiKey) {
          const videos = await fetchSourceVideos(src.playlist_id, key, apiKey);
          replaceSourceVideos(key, videos);
          touchRefreshed(key);
        }
      }

      return listVideos(key).map(serialize);
    },
  );
};

export default videosRoutes;
