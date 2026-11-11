import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchLibraryArtists, searchCatalogArtists } from "../../lib/multiArtistSearch";
import { useDebounce } from "../../lib/useDebounce";
import { useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import type { ArtistItem } from "../../types/music";

/**
 * Multi-artist station picker: library artists plus catalog search, merged
 * and deduplicated. Collapsed by default so the library fetch only runs when
 * the picker opens. Playback starts from the first roots and the refill
 * rotation discovers across the rest.
 */
export function MultiArtistStationBuilder() {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query);
  const [library, setLibrary] = useState<ArtistItem[]>([]);
  const [catalog, setCatalog] = useState<ArtistItem[]>([]);
  const [selected, setSelected] = useState<ArtistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [libraryAttempt, setLibraryAttempt] = useState(0);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    setError(false);
    fetchLibraryArtists().then((artists) => {
      if (!live) return;
      setLibrary(artists);
      setLoading(false);
    }).catch(() => { if (live) { setError(true); setLoading(false); } });
    return () => { live = false; };
  }, [open, libraryAttempt]);

  useEffect(() => {
    if (!debouncedQuery.trim()) { setCatalog([]); return; }
    let live = true;
    searchCatalogArtists(debouncedQuery).then((artists) => { if (live) setCatalog(artists); })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [debouncedQuery]);

  const selectedIds = useMemo(() => new Set(selected.map((artist) => artist.id)), [selected]);
  const candidates = useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase();
    const seen = new Set<string>();
    const out: ArtistItem[] = [];
    for (const artist of [...library, ...catalog]) {
      if (selectedIds.has(artist.id) || seen.has(artist.id)) continue;
      seen.add(artist.id);
      if (needle && !artist.title.toLowerCase().includes(needle)) continue;
      out.push(artist);
    }
    return out;
  }, [library, catalog, selectedIds, debouncedQuery]);

  const start = async () => {
    if (!selected.length || starting) return;
    setStarting(true);
    try {
      await useMusicPlayerStore.getState().startMultiArtistStation(selected);
    } finally {
      setStarting(false);
    }
  };

  return <section className="mb-6 rounded-2xl border border-outline-variant p-4 text-on-surface">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">{t("radio.multiArtist")}</h2>
      <button type="button" aria-expanded={open} data-tooltip={t(open ? "radio.multiArtistHide" : "radio.multiArtistNew")}
        onClick={() => setOpen((value) => !value)} className="rounded-full border border-outline-variant px-4 py-2">
        {open ? "▾" : "▸"} {t(open ? "radio.multiArtistHide" : "radio.multiArtistNew")}
      </button>
    </div>
    {open && <>
      <p className="mt-2 text-sm text-on-surface-variant">{t("radio.multiArtistDescription")}</p>
      <div className="mt-3 flex flex-wrap gap-2" aria-label={t("radio.multiArtistSelected")}>
        {selected.map((artist) => <span key={artist.id} className="flex items-center gap-2 rounded-full border border-outline-variant px-3 py-1">
          {artist.title}
          <button type="button" aria-label={t("radio.multiArtistRemove", { name: artist.title })}
            data-tooltip={t("radio.multiArtistRemove", { name: artist.title })}
            onClick={() => setSelected((roots) => roots.filter((root) => root.id !== artist.id))}
            className="rounded-lg px-1">×</button>
        </span>)}
      </div>
      <input aria-label={t("radio.multiArtistSearch")} placeholder={t("radio.multiArtistSearch")}
        value={query} onChange={(event) => setQuery(event.target.value)}
        data-tooltip={t("radio.multiArtistSearch")}
        className="mt-3 w-full rounded-lg border border-outline-variant bg-surface px-2 py-1 text-on-surface" />
      {loading && <p role="status" className="mt-2 text-sm text-on-surface-variant">{t("radio.multiArtistLoading")}</p>}
      <ul className="mt-2 flex flex-col gap-1">
        {candidates.map((artist) => <li key={artist.id}>
          <button type="button" data-tooltip={t("radio.multiArtistAdd", { name: artist.title })}
            onClick={() => setSelected((roots) => [...roots, artist])}
            className="w-full rounded-lg border border-outline-variant px-3 py-2 text-left">
            {artist.title}
          </button>
        </li>)}
      </ul>
      {!loading && !candidates.length && <p className="mt-2 text-sm text-on-surface-variant">
        {t(query.trim() ? "radio.multiArtistEmpty" : "radio.multiArtistLibraryEmpty")}</p>}
      {error && <p role="status" className="mt-2 text-sm text-on-surface">{t("radio.multiArtistFailed")}{" "}
        <button type="button" className="rounded-lg border border-outline-variant px-3 py-1"
          onClick={() => setLibraryAttempt((attempt) => attempt + 1)}>{t("radio.retry")}</button></p>}
      <button type="button" disabled={!selected.length || starting} data-tooltip={t("radio.multiArtistStart")}
        onClick={() => void start()}
        className="mt-3 rounded-full border border-outline-variant px-4 py-2 disabled:opacity-50">
        {starting ? t("radio.multiArtistStarting") : t("radio.multiArtistStart")}
      </button>
    </>}
  </section>;
}
