import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApifyError,
  decodeEntities,
  extractTranscriptText,
  fetchTranscript,
  formatTranscript,
} from "./apify.js";

describe("decodeEntities", () => {
  it("décode les entités numériques décimales et hex", () => {
    expect(decodeEntities("l&#39;été")).toBe("l'été");
    expect(decodeEntities("a&#x27;b")).toBe("a'b");
  });
  it("décode les entités nommées courantes", () => {
    expect(decodeEntities("a &amp; b &lt; c &gt; d &quot;e&quot;")).toBe('a & b < c > d "e"');
  });
  it("laisse les entités inconnues intactes", () => {
    expect(decodeEntities("&unknown;")).toBe("&unknown;");
  });
});

describe("formatTranscript", () => {
  it("met une phrase par ligne et normalise les espaces", () => {
    const out = formatTranscript("Bonjour   le monde. Ceci est   un test! Fin?");
    expect(out).toBe("Bonjour le monde.\nCeci est un test!\nFin?");
  });
  it("décode les entités au passage", () => {
    expect(formatTranscript("c&#39;est bon.")).toBe("c'est bon.");
  });
});

describe("extractTranscriptText", () => {
  it("retourne une chaîne directe", () => {
    expect(extractTranscriptText("hello")).toBe("hello");
  });
  it("extrait depuis un champ texte connu", () => {
    expect(extractTranscriptText({ transcript: "abc" })).toBe("abc");
  });
  it("assemble un tableau de segments", () => {
    expect(extractTranscriptText({ captions: [{ text: "a" }, { text: "b" }] })).toBe("a\nb");
  });
  it("gère un tableau de chaînes", () => {
    expect(extractTranscriptText({ subtitles: ["x", "y"] })).toBe("x\ny");
  });
  it("renvoie une chaîne vide pour null", () => {
    expect(extractTranscriptText(null)).toBe("");
  });
});

describe("fetchTranscript", () => {
  afterEach(() => vi.restoreAllMocks());

  it("récupère et formate la transcription", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [{ transcript: "Phrase une. Phrase deux." }],
    } as Response);

    const text = await fetchTranscript("vid1", "TOKEN", "actor1");
    expect(text).toBe("Phrase une.\nPhrase deux.");
  });

  it("lève ApifyError si le dataset est vide", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    } as Response);
    await expect(fetchTranscript("vid1", "TOKEN", "actor1")).rejects.toMatchObject({
      code: "apify_empty",
    });
  });

  it("propage une erreur HTTP Apify", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 402,
      json: async () => ({ error: { message: "Payment required" } }),
    } as Response);
    await expect(fetchTranscript("vid1", "TOKEN", "actor1")).rejects.toBeInstanceOf(ApifyError);
  });
});
