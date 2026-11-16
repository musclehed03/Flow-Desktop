import { useNavigate } from "react-router-dom";
import { ChartNoAxesColumn } from "lucide-react";

import { Button } from "../../components/ui/Button";
import { ClockCard } from "../../components/recap/RecapOverviewCards";
import { RankRows } from "../../components/recap/RankRows";
import { Figure, RecapCard } from "../../components/recap/RecapCard";
import type { MusicRecap, RankedItem } from "../../lib/api/recap";
import { getPlural, getString } from "../../lib/i18n/index";
import { ALL_TIME, periodLabel, spentTimeLabel } from "../../lib/recap/recapFormat";
import { recapPath } from "../../lib/recap/recapPath";
import { formatTimeAgo } from "../../lib/timeAgo";
import {
  clockStats,
  skipRate,
  statsEmpty,
  trackSkipRates,
  type ForgottenFavorite,
} from "../../lib/stats/localStats";
import { useLocalStats } from "../../lib/stats/useLocalStats";

const RANKED_ROWS = 5;
const LIST_SPAN = "col-span-12 md:col-span-6 xl:col-span-4";

const playsLabel = (item: RankedItem) => getPlural("recap_plays_count", item.count);
const timesLabel = (item: RankedItem) => getPlural("recap_times_count", item.count);

function EmptyPanel({ title, body }: { title: string; body?: string }) {
  return (
    <div className="col-span-12 flex flex-col items-center gap-3 rounded-3xl border border-outline-variant bg-surface-container-low px-6 py-16 text-center">
      <ChartNoAxesColumn className="h-8 w-8 text-chrome-neutral-400" />
      <h2 className="text-base font-medium text-on-surface">{title}</h2>
      {body && <p className="max-w-md text-sm text-on-surface-variant">{body}</p>}
    </div>
  );
}

function LoadingCards() {
  const spans = ["col-span-12 h-36", "col-span-12 md:col-span-6 h-64", "col-span-12 md:col-span-6 h-64"];
  return (
    <>
      {spans.map((span, index) => (
        <div key={index} className={`${span} animate-pulse rounded-2xl border border-outline-variant bg-surface-container-low`} />
      ))}
    </>
  );
}

function OverviewCard({ music }: { music: MusicRecap }) {
  const rate = skipRate(music.skips, music.plays);
  return (
    <RecapCard span="col-span-12" title={getString("recap_total_time")}>
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <Figure emphasized value={spentTimeLabel(music.activity.totalMs)} label={periodLabel(ALL_TIME)} />
        <div className="flex flex-wrap gap-x-10 gap-y-3">
          <Figure value={String(music.plays)} label={getString("recap_plays")} />
          <Figure value={rate === null ? "—" : `${Math.round(rate * 100)}%`} label={getString("music_stats_skip_rate")} />
          <Figure value={String(music.activity.activeDays)} label={getString("recap_active_days")} />
        </div>
      </div>
    </RecapCard>
  );
}

/** Most-skipped tracks as ranked rows: the share when its plays are known, the count otherwise. */
function SkipsCard({ music }: { music: MusicRecap }) {
  const rates = trackSkipRates(music);
  const byId = new Map(rates.map((rate) => [rate.id, rate]));
  const items: RankedItem[] = rates.map((rate) => ({
    id: rate.id,
    name: rate.name,
    count: rate.skips,
    durationMs: 0,
    detail: rate.plays === null
      ? getPlural("recap_times_count", rate.skips)
      : `${getPlural("recap_times_count", rate.skips)} · ${getPlural("recap_plays_count", rate.plays)}`,
    imageUrl: "",
    kind: "TRACK",
  }));
  return (
    <RecapCard span={LIST_SPAN} title={getString("music_stats_skips_title")}>
      <RankRows
        items={items.slice(0, RANKED_ROWS)}
        images={false}
        value={(item) => {
          const rate = byId.get(item.id)?.rate ?? null;
          return rate === null ? timesLabel(item) : `${Math.round(rate * 100)}%`;
        }}
      />
    </RecapCard>
  );
}

function ForgottenCard({ forgotten }: { forgotten: ForgottenFavorite[] }) {
  const now = Date.now();
  return (
    <RecapCard span={LIST_SPAN} title={getString("music_stats_forgotten_title")}>
      <ol className="flex flex-col gap-0.5">
        {forgotten.map((favorite) => {
          const artists = favorite.song.artists.map((artist) => artist.name).filter(Boolean).join(", ");
          const silence = favorite.lastPlayedMs === null
            ? getString("music_stats_never_played")
            : getString("music_stats_last_played", formatTimeAgo(favorite.lastPlayedMs, now));
          return (
            <li key={favorite.song.videoId ?? favorite.song.id}>
              <div dir="auto" className="flex items-center gap-3 p-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-on-surface">{favorite.song.title}</span>
                  <span className="block truncate text-xs text-on-surface-variant">
                    {artists ? `${artists} · ${silence}` : silence}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </RecapCard>
  );
}

/** Your music stats, all-time and all on this device: no artwork, no network, nothing leaves. */
export default function MusicStatsPage() {
  const navigate = useNavigate();
  const stats = useLocalStats();
  const music = stats.music;
  const firstLoad = stats.loading && !music;
  const clock = music ? clockStats(music.activity.hourCounts) : null;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-6 pb-12 pt-8 md:px-8">
      <header>
        <h1 className="text-4xl font-bold tracking-tight text-chrome-neutral-100">{getString("music_stats_title")}</h1>
        <p className="mt-2 text-sm text-chrome-neutral-400">{getString("music_stats_subtitle")}</p>
      </header>
      <div className="grid grid-cols-12 gap-4">
        {stats.error ? (
          <div className="col-span-12 flex flex-col items-center gap-3 rounded-3xl border border-outline-variant bg-surface-container-low px-6 py-16 text-center">
            <h2 className="text-base font-medium text-on-surface">{getString("music_stats_load_failed")}</h2>
            <Button variant="secondary" size="sm" onClick={stats.retry}>{getString("retry")}</Button>
          </div>
        ) : firstLoad || !music ? (
          <LoadingCards />
        ) : statsEmpty(music) ? (
          <EmptyPanel title={getString("music_stats_empty_title")} body={getString("music_stats_empty_body")} />
        ) : (
          <>
            <OverviewCard music={music} />
            {music.topArtists.length > 0 && (
              <RecapCard span={LIST_SPAN} title={getString("recap_top_artists")}>
                <RankRows items={music.topArtists.slice(0, RANKED_ROWS)} images={false} value={playsLabel} />
              </RecapCard>
            )}
            {music.topTracks.length > 0 && (
              <RecapCard span={LIST_SPAN} title={getString("recap_top_tracks")}>
                <RankRows items={music.topTracks.slice(0, RANKED_ROWS)} images={false} value={playsLabel} />
              </RecapCard>
            )}
            {clock && clock.totalPlays > 0 && <ClockCard activity={music.activity} />}
            {music.skips > 0 && <SkipsCard music={music} />}
            {stats.forgotten.length > 0 && <ForgottenCard forgotten={stats.forgotten} />}
            <RecapCard span="col-span-12" title={getString("recap_title")} subtitle={getString("recap_summary")}>
              <div>
                <Button variant="secondary" size="sm" onClick={() => navigate(recapPath())}>
                  {getString("settings_open")}
                </Button>
              </div>
            </RecapCard>
          </>
        )}
      </div>
    </div>
  );
}
