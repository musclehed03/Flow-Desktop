import { ListMusic } from "lucide-react";

import { getString } from "../../lib/i18n/index";
import { songToMixedPlaylistTrack } from "../../lib/mixedMediaQueue";
import { usePlaylistModalStore } from "../../store/usePlaylistModalStore";
import type { SongItem } from "../../types/music";
import type { MusicMenuAction } from "./MusicCardMenu";

/** Adds a music-engine track to the shared stored-playlist shape. */
export function useTrackPlaylistAction(track: SongItem | null): MusicMenuAction[] {
  const openAddToPlaylist = usePlaylistModalStore((state) => state.openAddToPlaylist);
  if (!track) return [];
  return [{
    id: "add-to-playlist",
    label: getString("music_add_to_playlist"),
    icon: <ListMusic size={16} />,
    onSelect: () => openAddToPlaylist(songToMixedPlaylistTrack(track)),
  }];
}
