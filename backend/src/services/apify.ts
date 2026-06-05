// Service Apify — récupération de transcriptions YouTube.
// Porte la logique du prototype (decodeEntities / formatTranscript / extractTranscriptText)
// côté serveur (sans DOM).

/** Erreur Apify normalisée. */
export class ApifyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApifyError";
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  laquo: "«",
  raquo: "»",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  ugrave: "ù",
  ocirc: "ô",
  icirc: "î",
  iuml: "ï",
};

/** Décode les entités HTML (numériques décimales/hex + nommées courantes). */
export function decodeEntities(input: string): string {
  return String(input).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

/** Reformate une transcription brute : une phrase par ligne. */
export function formatTranscript(raw: string): string {
  let t = decodeEntities(String(raw));
  t = t.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  // Saut de ligne en fin de phrase (avant une majuscule/chiffre).
  t = t.replace(/([.!?…])\s+(?=[A-ZÀ-ÖØ-Þ0-9])/g, "$1\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/** Extraction défensive du texte dans un item de dataset Apify. */
export function extractTranscriptText(item: unknown): string {
  if (!item) return "";
  if (typeof item === "string") return item;
  if (typeof item !== "object") return "";

  const obj = item as Record<string, unknown>;
  for (const k of ["transcript", "text", "captions", "content", "subtitles", "data"]) {
    const val = obj[k];
    if (!val) continue;
    if (typeof val === "string") return val;
    if (Array.isArray(val)) {
      return val
        .map((x) =>
          typeof x === "string"
            ? x
            : ((x?.text || x?.caption || x?.line || "") as string),
        )
        .filter(Boolean)
        .join("\n");
    }
  }
  return JSON.stringify(item, null, 2);
}

/**
 * Récupère et formate la transcription d'une vidéo via l'actor Apify
 * (endpoint synchrone run-sync-get-dataset-items).
 */
export async function fetchTranscript(
  videoId: string,
  token: string,
  actor: string,
): Promise<string> {
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(
    token,
  )}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        languages: ["fr", "en"],
        outputFormat: "text",
        urls: [{ url: "https://www.youtube.com/watch?v=" + videoId }],
      }),
    });
  } catch (e) {
    throw new ApifyError("apify_network_error", (e as Error)?.message ?? "Erreur réseau Apify.", 502);
  }

  const data: any = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || `Erreur Apify (${res.status})`;
    throw new ApifyError("apify_error", msg, res.status >= 400 && res.status < 600 ? res.status : 502);
  }

  const item = Array.isArray(data) ? data[0] : data;
  const text = extractTranscriptText(item);
  if (!text || !text.trim()) {
    throw new ApifyError("apify_empty", "Aucune transcription renvoyée par Apify.", 404);
  }
  return formatTranscript(text);
}
