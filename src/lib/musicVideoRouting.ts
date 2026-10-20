import { rememberMusicVideo } from "./musicVideoProvenance";
import type { SongItem } from "../types/music";
import type { VideoSummary } from "../types/video";
import { getSettingValue } from "../store/useAppSettingsStore";
import { SETTINGS } from "./settings/schema";

export const musicVideoFirstEnabled = () =>
  getSettingValue(SETTINGS.MUSIC_VIDEO_FIRST_ENABLED) !== "false";

export const isVideoSong = (song: SongItem): boolean =>
  !!song.musicVideoType && song.musicVideoType !== "MUSIC_VIDEO_TYPE_ATV";

export const shouldWatchSong = (song: SongItem): boolean =>
  musicVideoFirstEnabled() && (isVideoSong(song) || !!song.libraryVideo) && !!(song.videoId ?? song.id);

export const songToVideoSummary = (song: SongItem): VideoSummary => {
  rememberMusicVideo(song.videoId ?? song.id, song.radioReason);
  return ({
  ...song.libraryVideo,
  id: song.videoId ?? song.id,
  title: song.title,
  channelName: song.artists.map((artist) => artist.name).join(", "),
  channelId: song.artists[0]?.id ?? undefined,
  thumbnailUrl: song.thumbnail,
  durationSeconds: song.duration,
});
};
