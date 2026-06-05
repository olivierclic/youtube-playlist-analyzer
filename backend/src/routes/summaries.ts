import type { FastifyPluginAsync } from "fastify";
import { getOpenRouterKey, getOpenRouterModel } from "../config.js";
import { getUserData, getVideoMeta, setSummary } from "../db/repo.js";
import { generateSummary } from "../services/openrouter.js";
import { formatDuration } from "../lib/duration.js";
import { BadRequestError, NotFoundError } from "../errors.js";

const summariesRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/videos/:id/summary/generate",
    {
      schema: {
        params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const meta = getVideoMeta(id);
      if (!meta) throw new NotFoundError("Vidéo inconnue.");

      const apiKey = getOpenRouterKey();
      if (!apiKey)
        throw new BadRequestError("Aucune clé OpenRouter configurée.", "openrouter_key_missing");

      const transcript = getUserData(id)?.transcript ?? undefined;
      const summary = await generateSummary(
        {
          title: meta.title,
          channel: meta.channel,
          durationStr: formatDuration(meta.duration_s),
          description: meta.description,
          transcript: transcript ?? undefined,
        },
        apiKey,
        getOpenRouterModel(),
      );

      setSummary(id, summary);
      return { summary };
    },
  );
};

export default summariesRoutes;
