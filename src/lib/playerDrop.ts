import { getCurrentWindow } from "@tauri-apps/api/window";
import { parseYoutubeUrl } from "./youtubeUrl";

export type PlayerDrop =
  | { kind: "video"; videoId: string; source: string }
  | { kind: "local-files"; paths: string[] }
  | { kind: "unsupported"; values: string[] };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const MEDIA_FILE = /\.(?:mp3|m4a|aac|flac|wav|ogg|opus|mp4|m4v|webm|mkv|mov)$/i;

export function classifyPlayerDrop(values: string[]): PlayerDrop {
  const cleaned = values.map((value) => value.trim()).filter(Boolean);
  const first = cleaned[0] ?? "";
  const parsed = parseYoutubeUrl(first);
  if (parsed?.kind === "video") return { kind: "video", videoId: parsed.videoId, source: first };
  if (VIDEO_ID.test(first)) return { kind: "video", videoId: first, source: first };
  const mediaPaths = cleaned.filter((value) => !/^https?:\/\//i.test(value) && MEDIA_FILE.test(value));
  if (mediaPaths.length) return { kind: "local-files", paths: mediaPaths };
  return { kind: "unsupported", values: cleaned };
}

export async function listenForNativePlayerDrops(onDrop: (drop: PlayerDrop) => void): Promise<() => void> {
  return getCurrentWindow().onDragDropEvent((event) => {
    if (event.payload.type !== "drop") return;
    if (!document.querySelector("[data-flow-player-surface]")) return;
    onDrop(classifyPlayerDrop(event.payload.paths));
  });
}
