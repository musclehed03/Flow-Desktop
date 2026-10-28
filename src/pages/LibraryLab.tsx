import { useEffect, useState } from "react";
import { Activity, Stethoscope } from "lucide-react";
import { getWatchHistory } from "../lib/api/db";
import { getString } from "../lib/i18n/index";
import { buildLocalLibraryStats, diagnoseLibrary, type LibraryDiagnosis, type LocalLibraryStats } from "../lib/libraryIntelligence";
import { loadStoredPlaylists } from "../lib/playlistLibrary";
import { usePublishTitle } from "../lib/usePublishTitle";
import { getLibraryMetadataBackfillReport, type MetadataBackfillReport } from "../lib/libraryMetadataBackfill";
import { SmartPlaylistEditor } from "../components/library/SmartPlaylistEditor";

export default function LibraryLab() {
  usePublishTitle(getString("library_lab_title"));
  const [stats, setStats] = useState<LocalLibraryStats | null>(null);
  const [diagnosis, setDiagnosis] = useState<LibraryDiagnosis | null>(null);
  const [coverage, setCoverage] = useState<MetadataBackfillReport | null>(null);
  useEffect(() => { void Promise.all([getWatchHistory(10000, 0), loadStoredPlaylists(), getLibraryMetadataBackfillReport()]).then(([history, playlists, report]) => {
    setStats(buildLocalLibraryStats(history)); setDiagnosis(diagnoseLibrary(playlists)); setCoverage(report);
  }); }, []);
  return <main className="mx-auto w-full max-w-6xl space-y-6 p-6 text-on-surface">
    <header><h1 className="text-3xl font-bold">{getString("library_lab_title")}</h1><p className="text-on-surface-variant">{getString("library_lab_desc")}</p></header>
    <section className="grid gap-4 md:grid-cols-3" aria-label={getString("local_stats_title")}>
      <div className="rounded-2xl border-2 border-outline-variant p-5"><Activity aria-hidden="true" /><p className="mt-3 text-3xl font-bold">{stats?.plays ?? 0}</p><p>{getString("local_stats_plays")}</p></div>
      <div className="rounded-2xl border-2 border-outline-variant p-5"><p className="text-3xl font-bold">{Math.round((stats?.listeningSeconds ?? 0) / 3600)}</p><p>{getString("local_stats_hours")}</p></div>
      <div className="rounded-2xl border-2 border-outline-variant p-5"><p className="text-3xl font-bold">{stats?.skips ?? 0}</p><p>{getString("local_stats_skips")}</p></div>
    </section>
    <section className="rounded-2xl border-2 border-outline-variant p-5"><h2 className="flex items-center gap-2 text-xl font-semibold"><Stethoscope aria-hidden="true" />{getString("library_doctor_title")}</h2><p className="text-sm text-on-surface-variant">{getString("library_doctor_report_only")}</p><dl className="mt-4 grid gap-3 sm:grid-cols-3"><div><dt>{getString("library_doctor_exact")}</dt><dd className="text-2xl font-bold">{diagnosis?.exactDuplicates.length ?? 0}</dd></div><div><dt>{getString("library_doctor_near")}</dt><dd className="text-2xl font-bold">{diagnosis?.nearDuplicates.length ?? 0}</dd></div><div><dt>{getString("library_doctor_broken")}</dt><dd className="text-2xl font-bold">{diagnosis?.emptyEntries.length ?? 0}</dd></div></dl></section>
    {coverage ? <section className="rounded-2xl border-2 border-outline-variant p-5"><h2 className="text-xl font-semibold">{getString("metadata_coverage_title")}</h2><p className="text-sm text-on-surface-variant">{getString(coverage.status === "complete" ? "metadata_coverage_complete" : "metadata_coverage_running")}</p><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>{getString("metadata_field")}</th><th>{getString("metadata_before")}</th><th>{getString("metadata_after")}</th></tr></thead><tbody>{(["genre", "artist", "year", "playCount", "lastPlayed", "likes"] as const).map((field) => <tr key={field} className="border-t border-outline-variant"><th className="py-2">{getString(`metadata_${field}`)}</th><td>{coverage.before[field]} / {coverage.before.total}</td><td>{coverage.after[field]} / {coverage.after.total}</td></tr>)}</tbody></table></div></section> : null}
    <section className="rounded-2xl border-2 border-outline-variant p-5"><h2 className="text-xl font-semibold">{getString("local_stats_top_tracks")}</h2><ol className="mt-3 space-y-2">{stats?.topTracks.map((track) => <li key={track.id} className="flex justify-between gap-4"><span className="truncate">{track.title}</span><span>{track.plays}</span></li>)}</ol></section>
    <SmartPlaylistEditor />
  </main>;
}
