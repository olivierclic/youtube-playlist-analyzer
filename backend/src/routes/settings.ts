import type { FastifyPluginAsync } from "fastify";
import {
  getApifyActor,
  getOpenRouterModel,
  hasConfig,
  listPreferences,
  setSetting,
  type ConfigKey,
} from "../config.js";
import type { SettingsPresence } from "../types.js";

/** Clés de config modifiables via l'UI (secrètes ou non). */
const WRITABLE_CONFIG_KEYS: ConfigKey[] = [
  "youtube_api_key",
  "openrouter_api_key",
  "apify_token",
  "openrouter_model",
  "apify_actor",
];

function presence(): SettingsPresence {
  return {
    youtube: hasConfig("youtube_api_key"),
    openrouter: hasConfig("openrouter_api_key"),
    apify: hasConfig("apify_token"),
    model: getOpenRouterModel(),
    apifyActor: getApifyActor(),
    preferences: listPreferences(),
  };
}

const settingsRoutes: FastifyPluginAsync = async (app) => {
  // Présence des clés + préférences — JAMAIS les valeurs des clés.
  app.get("/settings", async () => presence());

  app.put(
    "/settings",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            youtube_api_key: { type: "string" },
            openrouter_api_key: { type: "string" },
            apify_token: { type: "string" },
            openrouter_model: { type: "string" },
            apify_actor: { type: "string" },
            preferences: {
              type: "object",
              additionalProperties: { type: "string" },
            },
          },
        },
      },
    },
    async (req) => {
      const body = req.body as Record<string, unknown> & {
        preferences?: Record<string, string>;
      };

      for (const key of WRITABLE_CONFIG_KEYS) {
        const value = body[key];
        if (typeof value === "string") {
          // Chaîne vide => efface l'override (repli .env/défaut reprend la main).
          setSetting(key, value.trim() === "" ? null : value);
        }
      }

      if (body.preferences) {
        for (const [k, v] of Object.entries(body.preferences)) setSetting(k, v);
      }

      return presence();
    },
  );
};

export default settingsRoutes;
