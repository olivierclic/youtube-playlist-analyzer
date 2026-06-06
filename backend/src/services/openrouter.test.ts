import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildUserContent,
  extractSummary,
  generateSummary,
  OpenRouterError,
} from "./openrouter.js";

describe("buildUserContent", () => {
  const base = { title: "Titre", channel: "Chaîne", durationStr: "4:05", description: "Desc" };

  it("inclut titre, chaîne, durée et description", () => {
    const p = buildUserContent(base);
    expect(p).toContain("Titre : Titre");
    expect(p).toContain("Chaîne : Chaîne");
    expect(p).toContain("Durée : 4:05");
    expect(p).toContain("Desc");
  });
  it("inclut la transcription tronquée si présente", () => {
    const p = buildUserContent({ ...base, transcript: "T".repeat(20000) });
    expect(p).toContain("Transcription :");
    expect(p.length).toBeLessThan(20000 + 2000);
  });
  it("signale l'absence de transcription", () => {
    expect(buildUserContent(base)).toContain("Pas de transcription");
  });
});

describe("extractSummary", () => {
  it("extrait le contenu du message", () => {
    expect(extractSummary({ choices: [{ message: { content: "  résumé  " } }] })).toBe("résumé");
  });
  it("renvoie une chaîne vide si absent", () => {
    expect(extractSummary({})).toBe("");
  });
});

describe("generateSummary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renvoie le markdown du résumé", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "## Résumé\n- point" } }] }),
    } as Response);

    const out = await generateSummary(
      { title: "T", channel: "C", durationStr: "1:00", description: "D" },
      "KEY",
      "model-x",
      "prompt système",
    );
    expect(out).toBe("## Résumé\n- point");
  });

  it("lève OpenRouterError sur réponse vide", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "" } }] }),
    } as Response);
    await expect(
      generateSummary({ title: "T", channel: "C", durationStr: "1:00", description: "D" }, "KEY", "m", "sys"),
    ).rejects.toBeInstanceOf(OpenRouterError);
  });

  it("propage une erreur HTTP", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "no key" } }),
    } as Response);
    await expect(
      generateSummary({ title: "T", channel: "C", durationStr: "1:00", description: "D" }, "K", "m", "sys"),
    ).rejects.toMatchObject({ code: "openrouter_error", status: 401 });
  });
});
