// Service OpenRouter — génération de résumés (API compatible OpenAI).

/** Erreur OpenRouter normalisée. */
export class OpenRouterError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

export interface SummaryInput {
  title: string | null;
  channel: string | null;
  durationStr: string;
  description: string | null;
  transcript?: string;
}

/** Construit le prompt de résumé (FR, sortie Markdown). Repris du prototype. */
export function buildSummaryPrompt(v: SummaryInput): string {
  const transcript = v.transcript?.trim();
  return (
    `Tu es un assistant qui résume des vidéos YouTube. Rédige un résumé clair et structuré en français, au format Markdown.\n\n` +
    `Titre : ${v.title || "(sans titre)"}\n` +
    `Chaîne : ${v.channel || "—"}\n` +
    `Durée : ${v.durationStr}\n\n` +
    `Description :\n${v.description || "(aucune)"}\n\n` +
    `${
      transcript
        ? "Transcription :\n" + transcript.slice(0, 12000)
        : "(Pas de transcription — base-toi sur le titre et la description.)"
    }\n\n` +
    `Produis : un titre court (##), 2-3 phrases de synthèse, puis une liste à puces des points clés. ` +
    `Sois concis et factuel. Réponds uniquement avec le Markdown du résumé.`
  );
}

/** Extrait le contenu texte d'une réponse chat-completions. */
export function extractSummary(data: unknown): string {
  const content = (data as any)?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

/** Génère un résumé Markdown via OpenRouter. */
export async function generateSummary(
  input: SummaryInput,
  apiKey: string,
  model: string,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + apiKey,
        "X-Title": "Playlists YouTube",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: buildSummaryPrompt(input) }],
      }),
    });
  } catch (e) {
    throw new OpenRouterError(
      "openrouter_network_error",
      (e as Error)?.message ?? "Erreur réseau OpenRouter.",
      502,
    );
  }

  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || `Erreur OpenRouter (${res.status})`;
    throw new OpenRouterError(
      "openrouter_error",
      msg,
      res.status >= 400 && res.status < 600 ? res.status : 502,
    );
  }

  const text = extractSummary(data);
  if (!text) throw new OpenRouterError("openrouter_empty", "Réponse vide du modèle.", 502);
  return text;
}
