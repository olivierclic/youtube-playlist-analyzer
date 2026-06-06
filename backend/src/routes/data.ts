import type { FastifyPluginAsync } from "fastify";
import {
  ALL_FIELDS,
  dumpData,
  mergeImport,
  type DataDump,
  type ExportField,
} from "../db/repo.js";
import {
  getApifyActor,
  getOpenRouterModel,
  getSummaryDetailedPrompt,
  getSummaryPrompt,
  listPreferences,
  setSetting,
} from "../config.js";

export const EXPORT_VERSION = 2;

// Clés secrètes jamais exportées ni importées.
const SECRET_KEYS = new Set(["youtube_api_key", "openrouter_api_key", "apify_token"]);

/** Réglages applicatifs exportables (jamais les clés API). */
function appSettings(): Record<string, string> {
  return {
    ...listPreferences(),
    openrouter_model: getOpenRouterModel(),
    apify_actor: getApifyActor(),
    summary_system_prompt: getSummaryPrompt(),
    summary_detailed_system_prompt: getSummaryDetailedPrompt(),
  };
}

const dataRoutes: FastifyPluginAsync = async (app) => {
  // Export sélectif (sources + champs + réglages). Aucune clé API.
  app.post(
    "/data/export",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            settings: { type: "boolean", default: true },
            sourceKeys: { type: "array", items: { type: "string" } },
            fields: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    async (req) => {
      const body = (req.body ?? {}) as {
        settings?: boolean;
        sourceKeys?: string[];
        fields?: ExportField[];
      };
      const fields = body.fields?.filter((f): f is ExportField =>
        (ALL_FIELDS as readonly string[]).includes(f),
      );
      const dump = dumpData({ sourceKeys: body.sourceKeys, fields });
      return {
        app: "youtube-playlist-analyzer",
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        ...(body.settings === false ? {} : { settings: appSettings() }),
        ...dump,
      };
    },
  );

  // Import fusionnel : payloads partiels, dédoublonnage, écrasement optionnel.
  app.post(
    "/data/import",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: true,
          properties: {
            overwrite: { type: "boolean", default: false },
            settings: { type: "object", additionalProperties: { type: "string" } },
            sources: { type: "array" },
            videos: { type: "array" },
            user_data: { type: "array" },
            imported_videos: { type: "array" },
          },
        },
      },
    },
    async (req) => {
      const body = req.body as DataDump & {
        overwrite?: boolean;
        settings?: Record<string, string>;
      };
      const overwrite = body.overwrite === true;

      const result = mergeImport(
        {
          sources: body.sources,
          videos: body.videos,
          user_data: body.user_data,
          imported_videos: body.imported_videos,
        },
        overwrite,
      );

      // Réglages applicatifs (jamais les clés API).
      if (body.settings) {
        for (const [k, v] of Object.entries(body.settings)) {
          if (!SECRET_KEYS.has(k)) setSetting(k, v);
        }
      }

      return { ok: true, ...result };
    },
  );
};

export default dataRoutes;
