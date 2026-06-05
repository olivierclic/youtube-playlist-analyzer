import type { FastifyPluginAsync } from "fastify";
import { dumpData, importData, type DataDump } from "../db/repo.js";
import { listPreferences, setSetting } from "../config.js";
import { BadRequestError } from "../errors.js";

const EXPORT_VERSION = 1;

const dataRoutes: FastifyPluginAsync = async (app) => {
  // Export complet (sans les clés API).
  app.get("/data/export", async () => {
    const dump = dumpData();
    return {
      app: "youtube-playlist-analyzer",
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      preferences: listPreferences(),
      ...dump,
    };
  });

  // Import (remplace les données). Les clés API ne sont jamais importées.
  app.post(
    "/data/import",
    {
      schema: {
        body: {
          type: "object",
          required: ["sources", "videos", "user_data"],
          properties: {
            sources: { type: "array" },
            videos: { type: "array" },
            user_data: { type: "array" },
            preferences: { type: "object", additionalProperties: { type: "string" } },
          },
        },
      },
    },
    async (req) => {
      const body = req.body as Partial<DataDump> & { preferences?: Record<string, string> };
      if (!Array.isArray(body.sources) || !Array.isArray(body.videos) || !Array.isArray(body.user_data)) {
        throw new BadRequestError("Format d'import invalide.", "invalid_import");
      }

      importData({
        sources: body.sources,
        videos: body.videos,
        user_data: body.user_data,
      });

      if (body.preferences) {
        for (const [k, v] of Object.entries(body.preferences)) setSetting(k, v);
      }

      return { ok: true, sources: body.sources.length, videos: body.videos.length };
    },
  );
};

export default dataRoutes;
