import Fastify from "fastify";
import cors from "@fastify/cors";
import { serverConfig } from "./config.js";
import { asAppError } from "./errors.js";
import settingsRoutes from "./routes/settings.js";
import sourcesRoutes from "./routes/sources.js";
import videosRoutes from "./routes/videos.js";
import notesRoutes from "./routes/notes.js";
import transcriptsRoutes from "./routes/transcripts.js";
import summariesRoutes from "./routes/summaries.js";
import batchRoutes from "./routes/batch.js";
import dataRoutes from "./routes/data.js";

export function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
      transport:
        process.env.NODE_ENV === "production"
          ? undefined
          : { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } },
    },
  });

  app.register(cors, { origin: serverConfig.corsOrigin });

  // Gestionnaire d'erreurs global → format { error: { code, message } }.
  app.setErrorHandler((err: Error & { statusCode?: number; validation?: unknown }, req, reply) => {
    const appErr = asAppError(err);
    if (appErr) {
      reply.code(appErr.status).send({ error: { code: appErr.code, message: appErr.message } });
      return;
    }
    // Erreurs de validation Fastify (JSON Schema).
    if ((err as { validation?: unknown }).validation) {
      reply.code(400).send({ error: { code: "validation_error", message: err.message } });
      return;
    }
    req.log.error(err);
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    reply
      .code(status)
      .send({ error: { code: "internal_error", message: err.message || "Erreur interne." } });
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: { code: "not_found", message: "Route inconnue." } });
  });

  app.get("/api/health", async () => ({ status: "ok" }));

  app.register(settingsRoutes, { prefix: "/api" });
  app.register(sourcesRoutes, { prefix: "/api" });
  app.register(videosRoutes, { prefix: "/api" });
  app.register(notesRoutes, { prefix: "/api" });
  app.register(transcriptsRoutes, { prefix: "/api" });
  app.register(summariesRoutes, { prefix: "/api" });
  app.register(batchRoutes, { prefix: "/api" });
  app.register(dataRoutes, { prefix: "/api" });

  return app;
}

async function start() {
  const app = buildServer();
  try {
    await app.listen({ port: serverConfig.port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
