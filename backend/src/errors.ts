/** Erreur applicative générique → { error: { code, message } } + statut HTTP. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Ressource introuvable.", code = "not_found") {
    super(code, message, 404);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, code = "bad_request") {
    super(code, message, 400);
  }
}

/**
 * Duck-typing : toute erreur portant un `code` (string) et un `status` (number)
 * est traitée comme une erreur applicative par le gestionnaire global.
 * Couvre AppError, YoutubeError, ApifyError, OpenRouterError.
 */
export function asAppError(err: unknown): { code: string; message: string; status: number } | null {
  if (
    err &&
    typeof err === "object" &&
    typeof (err as { code?: unknown }).code === "string" &&
    typeof (err as { status?: unknown }).status === "number"
  ) {
    const e = err as { code: string; message?: string; status: number };
    return { code: e.code, message: e.message ?? "Erreur.", status: e.status };
  }
  return null;
}
