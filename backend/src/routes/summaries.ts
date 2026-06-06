import type { FastifyPluginAsync } from "fastify";
import {
  getOpenRouterKey,
  getOpenRouterModel,
  getSummaryDetailedPrompt,
  getSummaryPrompt,
} from "../config.js";
import {
  getUserData,
  getVideoMeta,
  setSummary,
  setSummaryDetailed,
  videoExists,
} from "../db/repo.js";
import { generateSummary } from "../services/openrouter.js";
import { formatDuration } from "../lib/duration.js";
import { BadRequestError, NotFoundError } from "../errors.js";

const idParams = {
  params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
} as const;
const mdBody = {
  body: {
    type: "object",
    required: ["summary_md"],
    additionalProperties: false,
    properties: { summary_md: { type: "string" } },
  },
} as const;

const summariesRoutes: FastifyPluginAsync = async (app) => {
  // Génère un résumé (standard ou détaillé) via OpenRouter.
  async function generate(id: string, detailed: boolean) {
    const meta = getVideoMeta(id);
    if (!meta) throw new NotFoundError("Vidéo inconnue.");
    const apiKey = getOpenRouterKey();
    if (!apiKey)
      throw new BadRequestError("Aucune clé OpenRouter configurée.", "openrouter_key_missing");

    const transcript = getUserData(id)?.transcript ?? undefined;
    const systemPrompt = detailed ? getSummaryDetailedPrompt() : getSummaryPrompt();
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
      systemPrompt,
      detailed ? 2048 : 1024,
    );

    if (detailed) setSummaryDetailed(id, summary);
    else setSummary(id, summary);
    return { summary };
  }

  app.post("/videos/:id/summary/generate", { schema: idParams }, async (req) =>
    generate((req.params as { id: string }).id, false),
  );

  app.post("/videos/:id/summary-detailed/generate", { schema: idParams }, async (req) =>
    generate((req.params as { id: string }).id, true),
  );

  // Sauvegarde manuelle (corrections de l'utilisateur).
  app.put("/videos/:id/summary", { schema: { ...idParams, ...mdBody } }, async (req) => {
    const { id } = req.params as { id: string };
    const { summary_md } = req.body as { summary_md: string };
    if (!videoExists(id)) throw new NotFoundError("Vidéo inconnue.");
    setSummary(id, summary_md.trim() === "" ? null : summary_md);
    return { ok: true };
  });

  app.put("/videos/:id/summary-detailed", { schema: { ...idParams, ...mdBody } }, async (req) => {
    const { id } = req.params as { id: string };
    const { summary_md } = req.body as { summary_md: string };
    if (!videoExists(id)) throw new NotFoundError("Vidéo inconnue.");
    setSummaryDetailed(id, summary_md.trim() === "" ? null : summary_md);
    return { ok: true };
  });
};

export default summariesRoutes;
