import { getMusicLinkedArtists, searchMusicTyped } from "./api/music";
import type { ArtistItem, YTItem } from "../types/music";

/** Library artists: the artists linked to the user's own library. */
export async function fetchLibraryArtists(limit = 24): Promise<ArtistItem[]> {
  return getMusicLinkedArtists(limit).catch(() => []);
}

/** Catalog artists matching a query, via typed music search. */
export async function searchCatalogArtists(query: string): Promise<ArtistItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const response = await searchMusicTyped(trimmed, "artists").catch(() => null);
  if (!response) return [];
  return response.sections.flatMap((section) => section.items)
    .filter((item): item is Extract<YTItem, { type: "artist" }> => item.type === "artist");
}
