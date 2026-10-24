import { describe, expect, it } from "vitest";
import { classifyPlayerDrop } from "./playerDrop";

describe("player drag and drop", () => {
  it("accepts YouTube URLs and bare video IDs", () => {
    expect(classifyPlayerDrop(["https://youtu.be/dQw4w9WgXcQ"])).toEqual({ kind: "video", videoId: "dQw4w9WgXcQ", source: "https://youtu.be/dQw4w9WgXcQ" });
    expect(classifyPlayerDrop(["dQw4w9WgXcQ"])).toEqual({ kind: "video", videoId: "dQw4w9WgXcQ", source: "dQw4w9WgXcQ" });
  });

  it("keeps local media distinct when no local playback path exists", () => {
    expect(classifyPlayerDrop(["/music/track.flac"])).toEqual({ kind: "local-files", paths: ["/music/track.flac"] });
  });

  it("rejects unsupported text", () => {
    expect(classifyPlayerDrop(["https://example.com/file.mp3"])).toEqual({ kind: "unsupported", values: ["https://example.com/file.mp3"] });
  });
});
