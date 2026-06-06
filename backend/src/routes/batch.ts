import type { FastifyPluginAsync } from "fastify";
import {
  getApifyActor,
  getApifyToken,
  getOpenRouterKey,
  getOpenRouterModel,
  getSummaryPrompt,
} from "../config.js";
import { getSource, listVideos, setSummary, setTranscript } from "../db/repo.js";
import { fetchTranscript } from "../services/apify.js";
import { generateSummary } from "../services/openrouter.js";
import { formatDuration } from "../lib/duration.js";
import { NotFoundError } from "../errors.js";
import type { VideoWithUserData } from "../types.js";

interface ProcessBody {
  transcripts: boolean;
  summaries: boolean;
  onlyMissing: boolean;
  videoIds?: string[];
}

const batchRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Traitement séquentiel des vidéos d'une source.
   * Réponse en streaming NDJSON : une ligne JSON par événement
   * ({ type: 'start' | 'progress' | 'error' | 'done', … }).
   */
  app.post(
    "/sources/:key/process",
    {
      schema: {
        params: { type: "object", required: ["key"], properties: { key: { type: "string" } } },
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            transcripts: { type: "boolean", default: true },
            summaries: { type: "boolean", default: true },
            onlyMissing: { type: "boolean", default: true },
            videoIds: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    async (req, reply) => {
      const { key } = req.params as { key: string };
      // Validation AVANT de prendre la main sur le flux (sinon l'error handler ne s'applique plus).
      if (!getSource(key)) throw new NotFoundError("Source inconnue.");

      const { transcripts, summaries, onlyMissing, videoIds } = req.body as ProcessBody;
      const apifyToken = getApifyToken();
      const orKey = getOpenRouterKey();
      const wantT = transcripts && Boolean(apifyToken);
      const wantS = summaries && Boolean(orKey);

      const needsT = (v: VideoWithUserData) => wantT && (!onlyMissing || !v.transcript);
      const needsS = (v: VideoWithUserData) => wantS && (!onlyMissing || !v.summary_md);

      // Optionnel : restreindre à une liste d'ids (ex. nouvelles vidéos pour l'auto).
      const idFilter = videoIds && videoIds.length ? new Set(videoIds) : null;
      const videos = listVideos(key).filter((v) => !idFilter || idFilter.has(v.id));
      const work = videos.filter((v) => needsT(v) || needsS(v));

      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      const write = (obj: unknown) => raw.write(JSON.stringify(obj) + "\n");

      let aborted = false;
      raw.on("close", () => {
        aborted = true;
      });

      write({
        type: "start",
        total: work.length,
        transcripts: wantT,
        summaries: wantS,
        skipped: { apify: transcripts && !apifyToken, openrouter: summaries && !orKey },
      });

      let errors = 0;
      let done = 0;
      for (const v of work) {
        if (aborted) break;
        done++;
        write({ type: "progress", done, total: work.length, currentTitle: v.title, errors });

        let transcript = v.transcript ?? undefined;
        if (needsT(v)) {
          try {
            transcript = await fetchTranscript(v.id, apifyToken!, getApifyActor());
            setTranscript(v.id, transcript);
          } catch (e) {
            errors++;
            write({ type: "error", videoId: v.id, step: "transcript", message: (e as Error).message });
          }
        }

        if (needsS(v) && !aborted) {
          try {
            const summary = await generateSummary(
              {
                title: v.title,
                channel: v.channel,
                durationStr: formatDuration(v.duration_s),
                description: v.description,
                transcript: transcript ?? undefined,
              },
              orKey!,
              getOpenRouterModel(),
              getSummaryPrompt(),
            );
            setSummary(v.id, summary);
          } catch (e) {
            errors++;
            write({ type: "error", videoId: v.id, step: "summary", message: (e as Error).message });
          }
        }
      }

      if (!aborted) write({ type: "done", total: work.length, errors });
      raw.end();
    },
  );
};

export default batchRoutes;
