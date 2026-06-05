import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildVideos,
  fetchVideoDetails,
  fetchAllPlaylistItems,
  mapYoutubeError,
  parseDuration,
  parseSourceInput,
  resolveSource,
  YoutubeError,
} from "./youtube.js";

describe("parseSourceInput", () => {
  it("reconnaît une URL de playlist (list=)", () => {
    expect(parseSourceInput("https://www.youtube.com/playlist?list=PL1234567890abc")).toEqual({
      type: "playlist",
      value: "PL1234567890abc",
    });
  });

  it("reconnaît un ID de playlist brut (PL/UU/FL/OL/RD/LL)", () => {
    expect(parseSourceInput("UUabcdefghij123")).toEqual({ type: "playlist", value: "UUabcdefghij123" });
    expect(parseSourceInput("FL0123456789xyz")).toEqual({ type: "playlist", value: "FL0123456789xyz" });
  });

  it("reconnaît une URL /channel/UC…", () => {
    expect(parseSourceInput("https://youtube.com/channel/UC_abc-123")).toEqual({
      type: "channelId",
      value: "UC_abc-123",
    });
  });

  it("reconnaît un ID de chaîne UC… brut", () => {
    const id = "UC" + "a".repeat(22);
    expect(parseSourceInput(id)).toEqual({ type: "channelId", value: id });
  });

  it("reconnaît un handle dans une URL et en brut", () => {
    expect(parseSourceInput("https://youtube.com/@MaChaine.TV")).toEqual({
      type: "handle",
      value: "@MaChaine.TV",
    });
    expect(parseSourceInput("@handle_x")).toEqual({ type: "handle", value: "@handle_x" });
  });

  it("reconnaît une URL /user/…", () => {
    expect(parseSourceInput("https://youtube.com/user/LegacyName")).toEqual({
      type: "username",
      value: "LegacyName",
    });
  });

  it("renvoie null pour une entrée non reconnue", () => {
    expect(parseSourceInput("pas une url")).toBeNull();
    expect(parseSourceInput("https://example.com")).toBeNull();
  });

  it("priorise list= même au sein d'une URL de watch", () => {
    expect(parseSourceInput("https://www.youtube.com/watch?v=abc&list=PLxyz1234567")).toEqual({
      type: "playlist",
      value: "PLxyz1234567",
    });
  });
});

describe("parseDuration", () => {
  it("parse heures/minutes/secondes", () => {
    expect(parseDuration("PT1H2M3S")).toEqual({ seconds: 3723, str: "1:02:03" });
  });
  it("parse minutes/secondes", () => {
    expect(parseDuration("PT4M5S")).toEqual({ seconds: 245, str: "4:05" });
  });
  it("détecte une durée courte (short ≤ 60 s)", () => {
    expect(parseDuration("PT45S").seconds).toBe(45);
  });
  it("gère une durée vide ou invalide", () => {
    expect(parseDuration("")).toEqual({ seconds: 0, str: "0:00" });
    expect(parseDuration("PT0S")).toEqual({ seconds: 0, str: "0:00" });
  });
});

describe("mapYoutubeError", () => {
  it("mappe une clé invalide", () => {
    const e = mapYoutubeError("API key not valid. Please pass a valid API key.");
    expect(e.code).toBe("youtube_key_invalid");
    expect(e.status).toBe(401);
  });
  it("mappe via la raison keyInvalid", () => {
    expect(mapYoutubeError("whatever", "keyInvalid").code).toBe("youtube_key_invalid");
  });
  it("mappe un quota dépassé", () => {
    expect(mapYoutubeError("The request cannot be completed because you have exceeded your quota.").status).toBe(429);
  });
  it("mappe une API non activée", () => {
    expect(mapYoutubeError("YouTube Data API v3 has not been used in project…").code).toBe(
      "youtube_api_disabled",
    );
  });
  it("mappe une source introuvable", () => {
    expect(mapYoutubeError("The playlist identified with the request's playlistId could not be found.").status).toBe(404);
  });
  it("retombe sur une erreur générique", () => {
    expect(mapYoutubeError("boom").code).toBe("youtube_error");
  });
});

// ── Tests réseau (fetch mocké) ──────────────────────────────────────────────

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveSource", () => {
  it("résout une playlist", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockFetchOnce({ items: [{ snippet: { title: "Ma Playlist" } }] }));

    const res = await resolveSource("https://youtube.com/playlist?list=PLabc1234567", "KEY");
    expect(res).toEqual({
      key: "pl:PLabc1234567",
      kind: "playlist",
      playlistId: "PLabc1234567",
      title: "Ma Playlist",
      origin: "https://youtube.com/playlist?list=PLabc1234567",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]![0]).toContain("/playlists?");
  });

  it("résout une chaîne vers sa playlist uploads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockFetchOnce({
        items: [
          {
            id: "UCxyz",
            snippet: { title: "Ma Chaîne" },
            contentDetails: { relatedPlaylists: { uploads: "UUxyz" } },
          },
        ],
      }),
    );

    const res = await resolveSource("https://youtube.com/channel/UCxyz", "KEY");
    expect(res.kind).toBe("channel");
    expect(res.key).toBe("ch:UCxyz");
    expect(res.playlistId).toBe("UUxyz");
    expect(res.title).toContain("chaîne");
  });

  it("rejette une URL non reconnue (sans appel réseau)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(resolveSource("n'importe quoi", "KEY")).rejects.toMatchObject({
      code: "invalid_source_url",
      status: 400,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propage une erreur API (clé invalide)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockFetchOnce(
        { error: { message: "API key not valid", errors: [{ reason: "keyInvalid" }] } },
        false,
        400,
      ),
    );
    await expect(resolveSource("PLabc1234567", "BAD")).rejects.toBeInstanceOf(YoutubeError);
  });

  it("renvoie source_not_found si la playlist n'existe pas", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockFetchOnce({ items: [] }));
    await expect(resolveSource("PLabc1234567", "KEY")).rejects.toMatchObject({
      code: "source_not_found",
    });
  });
});

describe("fetchAllPlaylistItems", () => {
  it("pagine jusqu'à épuisement du nextPageToken", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockFetchOnce({ items: [{ a: 1 }], nextPageToken: "p2" }))
      .mockResolvedValueOnce(mockFetchOnce({ items: [{ a: 2 }], nextPageToken: "p3" }))
      .mockResolvedValueOnce(mockFetchOnce({ items: [{ a: 3 }] }));

    const items = await fetchAllPlaylistItems("PL1", "KEY");
    expect(items).toHaveLength(3);
  });
});

describe("fetchVideoDetails", () => {
  it("découpe les ids en lots de 50", async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `id${i}`);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(mockFetchOnce({ items: [{ id: "x" }] }));

    await fetchVideoDetails(ids, "KEY");
    expect(fetchMock).toHaveBeenCalledTimes(3); // 50 + 50 + 20
  });
});

describe("buildVideos", () => {
  const items = [
    {
      snippet: {
        title: "Vidéo A",
        videoOwnerChannelTitle: "Créateur A",
        videoOwnerChannelId: "UCa",
        publishedAt: "2024-01-01T00:00:00Z",
        description: "desc",
        thumbnails: { medium: { url: "http://thumb/a.jpg" } },
      },
      contentDetails: { videoId: "vidA" },
    },
    {
      snippet: { title: "Private video", resourceId: { videoId: "vidPriv" } },
    },
    {
      snippet: { title: "Vidéo C", resourceId: { videoId: "vidC" } },
    },
  ];
  const details = [
    {
      id: "vidA",
      contentDetails: { duration: "PT2M", definition: "hd" },
      statistics: { viewCount: "1000", likeCount: "50" },
      snippet: { tags: ["x", "y"], publishedAt: "2023-12-31T00:00:00Z", defaultLanguage: "fr" },
    },
    {
      id: "vidC",
      contentDetails: { duration: "PT30S" },
      statistics: {},
      snippet: {},
    },
  ];

  it("mappe les vidéos et filtre les privées/supprimées", () => {
    const out = buildVideos(items, details, "pl:PL1");
    expect(out).toHaveLength(2); // 'Private video' filtrée
    const a = out[0]!;
    expect(a.id).toBe("vidA");
    expect(a.source_key).toBe("pl:PL1");
    expect(a.duration_s).toBe(120);
    expect(a.is_short).toBe(0);
    expect(a.views).toBe(1000);
    expect(a.likes).toBe(50);
    expect(a.thumbnail).toBe("http://thumb/a.jpg");
    expect(a.tags).toBe(JSON.stringify(["x", "y"]));
    expect(a.position).toBe(0);
  });

  it("marque is_short pour une durée ≤ 60 s", () => {
    const out = buildVideos(items, details, "pl:PL1");
    const c = out.find((v) => v.id === "vidC")!;
    expect(c.is_short).toBe(1);
    expect(c.views).toBeNull();
  });
});
