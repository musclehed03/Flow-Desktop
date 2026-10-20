import { getRelatedVideos } from "./api/youtube";
import type { VideoSummary } from "../types/video";
import { fetchStationPage, expandStationCandidates, rankStationBatch, type MusicStation } from "./musicStation";
import { songToVideoSummary } from "./musicVideoRouting";

export async function refillVideoCandidates(lastId: string, station: MusicStation | null, playedIds: readonly string[] = []): Promise<{ videos: VideoSummary[]; station: MusicStation | null }> {
  if (station) {
    const page = await fetchStationPage(station, { ...station.seed, videoId: lastId, id: lastId });
    const expanded = await expandStationCandidates(page.station, page.songs);
    const songs = await rankStationBatch(expanded.songs.filter((song) => !playedIds.includes(song.videoId ?? song.id)), expanded.station);
    return { videos: songs.map(songToVideoSummary), station: expanded.station };
  }
  const related = await getRelatedVideos(lastId);
  return { videos: related.filter((item) => item.itemType === "video" && !item.isLive).map((item) => ({
    id: item.videoId ?? item.id, title: item.title, channelName: item.channelName,
    channelId: item.channelId, thumbnailUrl: item.thumbnailUrl, durationSeconds: item.durationSeconds,
    publishedText: item.publishedText, viewCountText: item.viewCountText,
  })), station: null };
}
