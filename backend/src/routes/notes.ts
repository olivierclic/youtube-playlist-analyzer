import type { FastifyPluginAsync } from "fastify";
import { setNote, videoExists } from "../db/repo.js";
import { NotFoundError } from "../errors.js";

const notesRoutes: FastifyPluginAsync = async (app) => {
  app.put(
    "/videos/:id/note",
    {
      schema: {
        params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        body: {
          type: "object",
          required: ["note_html"],
          additionalProperties: false,
          properties: { note_html: { type: "string" } },
        },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { note_html } = req.body as { note_html: string };
      if (!videoExists(id)) throw new NotFoundError("Vidéo inconnue.");
      const value = note_html.trim() === "" ? null : note_html;
      setNote(id, value);
      return { ok: true };
    },
  );
};

export default notesRoutes;
