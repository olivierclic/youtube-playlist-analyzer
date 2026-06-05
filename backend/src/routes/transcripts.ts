import type { FastifyPluginAsync } from "fastify";
import { getApifyActor, getApifyToken } from "../config.js";
import { setTranscript, videoExists } from "../db/repo.js";
import { fetchTranscript } from "../services/apify.js";
import { BadRequestError, NotFoundError } from "../errors.js";

const transcriptsRoutes: FastifyPluginAsync = async (app) => {
  // Enregistrement manuel (collage).
  app.put(
    "/videos/:id/transcript",
    {
      schema: {
        params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        body: {
          type: "object",
          required: ["transcript"],
          additionalProperties: false,
          properties: { transcript: { type: "string" } },
        },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { transcript } = req.body as { transcript: string };
      if (!videoExists(id)) throw new NotFoundError("Vidéo inconnue.");
      setTranscript(id, transcript.trim() === "" ? null : transcript);
      return { ok: true };
    },
  );

  // Récupération via Apify (serveur).
  app.post(
    "/videos/:id/transcript/fetch",
    {
      schema: {
        params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      if (!videoExists(id)) throw new NotFoundError("Vidéo inconnue.");
      const token = getApifyToken();
      if (!token) throw new BadRequestError("Aucun token Apify configuré.", "apify_token_missing");

      const text = await fetchTranscript(id, token, getApifyActor());
      setTranscript(id, text);
      return { transcript: text };
    },
  );
};

export default transcriptsRoutes;
