import type { FastifyPluginAsync } from "fastify";
import { getYoutubeKey } from "../config.js";
import {
  countVideos,
  getSource,
  listVideos,
  replaceSourceVideos,
  setFavorite,
  setHidden,
  touchRefreshed,
  videoExists,
} from "../db/repo.js";
import { fetchSourceVideos, YoutubeError } from "../services/youtube.js";
import { NotFoundError } from "../errors.js";
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
  return {
    ...v,
    tags,
    is_short: v.is_short === 1,
    hidden: v.hidden === 1,
    favorite: v.favorite === 1,
  };
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

  // Masquage local (la vidéo reste sur YouTube).
  app.patch(
    "/videos/:id/hidden",
    {
      schema: {
        params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        body: {
          type: "object",
          required: ["hidden"],
          additionalProperties: false,
          properties: { hidden: { type: "boolean" } },
        },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { hidden } = req.body as { hidden: boolean };
      if (!videoExists(id)) throw new NotFoundError("Vidéo inconnue.");
      setHidden(id, hidden);
      return { ok: true, hidden };
    },
  );

  // Favori.
  app.patch(
    "/videos/:id/favorite",
    {
      schema: {
        params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        body: {
          type: "object",
          required: ["favorite"],
          additionalProperties: false,
          properties: { favorite: { type: "boolean" } },
        },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { favorite } = req.body as { favorite: boolean };
      if (!videoExists(id)) throw new NotFoundError("Vidéo inconnue.");
      setFavorite(id, favorite);
      return { ok: true, favorite };
    },
  );
};

export default videosRoutes;
