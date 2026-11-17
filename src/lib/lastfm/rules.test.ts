import { describe, expect, it } from "vitest";

import type { SongItem } from "../../types/music";
import {
  classifyReply,
  countsAsPlayed,
  lastfmSignature,
  md5hex,
  nowPlayingParams,
  scrobbleEntryFor,
  scrobbleParams,
  scrobbleThresholdMs,
  signedForm,
} from "./rules";

const song = (overrides: Partial<SongItem> = {}): SongItem => ({
  id: "v1",
  videoId: "v1",
  title: "Song",
  artists: [{ id: "a1", name: "Artist" }],
  album: null,
  duration: 200,
  musicVideoType: null,
  thumbnail: "",
  explicit: false,
  playlistId: null,
  params: null,
  ...overrides,
});

describe("scrobbleThresholdMs", () => {
  it("is half the track", () => {
    expect(scrobbleThresholdMs(200_000)).toBe(100_000);
  });

  it("caps at four minutes, whichever comes first", () => {
    expect(scrobbleThresholdMs(20 * 60_000)).toBe(4 * 60_000);
  });

  it("is absent for tracks of thirty seconds or less", () => {
    expect(scrobbleThresholdMs(30_000)).toBeNull();
    expect(scrobbleThresholdMs(10_000)).toBeNull();
    expect(scrobbleThresholdMs(0)).toBeNull();
    expect(scrobbleThresholdMs(-5)).toBeNull();
    expect(scrobbleThresholdMs(Number.NaN)).toBeNull();
  });

  it("counts a track just over thirty seconds", () => {
    expect(scrobbleThresholdMs(30_001)).toBe(15_000);
  });
});

describe("countsAsPlayed", () => {
  it("counts at half the track", () => {
    expect(countsAsPlayed(200_000, 99_999)).toBe(false);
    expect(countsAsPlayed(200_000, 100_000)).toBe(true);
  });

  it("counts a long track at four minutes", () => {
    expect(countsAsPlayed(20 * 60_000, 4 * 60_000 - 1)).toBe(false);
    expect(countsAsPlayed(20 * 60_000, 4 * 60_000)).toBe(true);
  });

  it("never counts a short track", () => {
    expect(countsAsPlayed(30_000, 30_000)).toBe(false);
  });

  it("never counts unreadable progress", () => {
    expect(countsAsPlayed(200_000, Number.NaN)).toBe(false);
    expect(countsAsPlayed(200_000, -1)).toBe(false);
  });
});

describe("scrobbleEntryFor", () => {
  it("takes the first artist and drops the topic suffix", () => {
    const entry = scrobbleEntryFor(
      song({ artists: [{ id: "a", name: "Lead - Topic" }, { id: "b", name: "Guest" }] }),
      5_000_000,
    )!;
    expect(entry.artist).toBe("Lead");
    expect(entry.title).toBe("Song");
    expect(entry.timestampSec).toBe(5_000);
  });

  it("drops placeholder albums and floors the duration", () => {
    expect(scrobbleEntryFor(song({ album: { id: "r", name: "Unknown Album" } }), 0)!.album).toBe("");
    expect(scrobbleEntryFor(song({ album: { id: "r", name: " Record " } }), 0)!.album).toBe("Record");
    expect(scrobbleEntryFor(song({ duration: 199.9 }), 0)!.durationSec).toBe(199);
  });

  it("sends nothing without an artist or title", () => {
    expect(scrobbleEntryFor(song({ artists: [] }), 0)).toBeNull();
    expect(scrobbleEntryFor(song({ artists: [{ id: null, name: "  " }] }), 0)).toBeNull();
    expect(scrobbleEntryFor(song({ title: "  " }), 0)).toBeNull();
  });
});

describe("md5hex", () => {
  it("matches the RFC vectors", () => {
    expect(md5hex("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(md5hex("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(md5hex("message digest")).toBe("f96b697d7cb7938d525a2f31aaf161d0");
    expect(md5hex("abcdefghijklmnopqrstuvwxyz")).toBe("c3fcd3d76192e4007dfb496cca67e13b");
    expect(md5hex("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")).toBe(
      "d174ab98d277d9f5a5611c2c9f419d9f",
    );
  });

  it("hashes titles as UTF-8", () => {
    expect(md5hex("héllo wörld 😀 — “quoted”")).toBe("7426bdf8e49ab8a786479efc8884cd9c");
  });
});

describe("lastfmSignature", () => {
  it("follows the documented recipe, as the backend's vector shows", () => {
    expect(
      lastfmSignature(
        {
          username: "u",
          method: "auth.getMobileSession",
          password: "p",
          api_key: "xxx",
          format: "json",
        },
        "s",
      ),
    ).toBe("f02a24fa543d12eeed6c58ed55b6c83a");
  });

  it("sorts parameters and skips format and callback", () => {
    const a = lastfmSignature({ b: "2", a: "1", format: "json", callback: "x" }, "s");
    const b = lastfmSignature({ a: "1", b: "2" }, "s");
    expect(a).toBe(b);
  });
});

describe("signedForm", () => {
  it("carries the key, the signature and the JSON format", () => {
    const form = signedForm({ method: "track.scrobble", sk: "SK" }, "key", "secret");
    const get = (name: string) => form.find(([key]) => key === name)?.[1];
    expect(get("api_key")).toBe("key");
    expect(get("format")).toBe("json");
    expect(get("api_sig")).toBe(lastfmSignature({ method: "track.scrobble", sk: "SK", api_key: "key" }, "secret"));
  });
});

describe("scrobbleParams", () => {
  it("sends indexed fields and skips empty album and duration", () => {
    const params = scrobbleParams(
      [
        { artist: "A", title: "One", album: "", durationSec: 0, timestampSec: 10 },
        { artist: "B", title: "Two", album: "Record", durationSec: 180, timestampSec: 20 },
      ],
      "SK",
    );
    expect(params["track[1]"]).toBe("Two");
    expect(params["album[1]"]).toBe("Record");
    expect("album[0]" in params).toBe(false);
    expect("duration[0]" in params).toBe(false);
    expect(params["timestamp[0]"]).toBe("10");
    expect(params["sk"]).toBe("SK");
  });

  it("caps a batch at fifty", () => {
    const entries = Array.from({ length: 60 }, (_, i) => ({
      artist: "A",
      title: `Song ${i}`,
      album: "",
      durationSec: 0,
      timestampSec: i,
    }));
    const params = scrobbleParams(entries, "SK");
    expect("track[49]" in params).toBe(true);
    expect("track[50]" in params).toBe(false);
  });
});

describe("nowPlayingParams", () => {
  it("names the song without a timestamp", () => {
    const params = nowPlayingParams(
      { artist: "A", title: "Song", album: "", durationSec: 200, timestampSec: 10 },
      "SK",
    );
    expect(params["method"]).toBe("track.updateNowPlaying");
    expect(params["artist"]).toBe("A");
    expect(params["track"]).toBe("Song");
    expect("timestamp" in params).toBe(false);
  });
});

describe("classifyReply", () => {
  it("sends on a clean reply", () => {
    expect(classifyReply(200, "{}")).toEqual({ outcome: "sent", errorCode: null });
  });

  it("signs out on session and key errors", () => {
    for (const code of [4, 9, 10, 26]) {
      expect(classifyReply(200, JSON.stringify({ error: code }))).toEqual({ outcome: "signedOut", errorCode: code });
    }
  });

  it("retries outages, rate limits and unreadable replies", () => {
    for (const code of [8, 11, 16, 29]) {
      expect(classifyReply(200, JSON.stringify({ error: code }))).toEqual({ outcome: "retry", errorCode: code });
    }
    expect(classifyReply(429, "{}").outcome).toBe("retry");
    expect(classifyReply(200, "not json").outcome).toBe("retry");
    expect(classifyReply(500, "").outcome).toBe("retry");
  });

  it("drops a batch that would fail the same way again", () => {
    expect(classifyReply(200, JSON.stringify({ error: 6 }))).toEqual({ outcome: "sent", errorCode: 6 });
    expect(classifyReply(200, JSON.stringify({ error: 13 })).outcome).toBe("sent");
  });
});
