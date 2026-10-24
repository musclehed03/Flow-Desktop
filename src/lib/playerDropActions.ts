import { getVideoDetails } from "./api/youtube";
import { loadStoredPlaylists, normalizePlaylist, persistStoredPlaylists, type StoredPlaylist } from "./playlistLibrary";
import type { VideoSummary } from "../types/video";

export async function resolveDroppedVideo(videoId: string): Promise<VideoSummary> {
  const details = await getVideoDetails(videoId);
  return {
    id: details.id || videoId,
    title: details.title,
    channelName: details.channelName,
    channelId: details.channelId,
    thumbnailUrl: details.thumbnailUrl,
    durationSeconds: details.durationSeconds,
    publishedText: details.publishedText,
    viewCountText: details.viewCountText,
    isLive: details.isLive,
  };
}

export async function importDroppedVideo(video: VideoSummary, playlistName: string, description: string): Promise<StoredPlaylist> {
  const playlists = await loadStoredPlaylists();
  const existingIndex = playlists.findIndex((playlist) => playlist.source === "Owned" && playlist.name === playlistName);
  const existing = existingIndex >= 0 ? playlists[existingIndex]! : null;
  const tracks = existing?.tracks.some((track) => track.id === video.id)
    ? existing.tracks
    : [...(existing?.tracks ?? []), { ...video, addedAtInPlaylist: Date.now() }];
  const playlist = normalizePlaylist({
    id: existing?.id ?? `playlist-${Date.now()}`,
    name: playlistName,
    sourceTitle: playlistName,
    description,
    source: "Owned",
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    tracks,
    thumbnailUrl: existing?.thumbnailUrl ?? video.thumbnailUrl ?? null,
  });
  const next = existingIndex >= 0
    ? playlists.map((item, index) => index === existingIndex ? playlist : item)
    : [...playlists, playlist];
  await persistStoredPlaylists(next);
  return playlist;
}
