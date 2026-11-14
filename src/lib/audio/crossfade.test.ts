import { describe, expect, it } from "vitest";

import type { SongItem } from "../../types/music";
import {
  chosenFadeSeconds,
  crossfadeSeconds,
  crossfadeStart,
  equalPowerCurves,
  planCrossfade,
  shouldCrossfade,
  skipFadeSeconds,
  SKIP_BLEND_SECONDS,
  type CrossfadeQueue,
  type CrossfadeSettings,
} from "./crossfade";

describe('musical crossfade planning', () => {
  it('maps persisted duration to one through twelve seconds', () => {
    expect([-4,1,6,12,99,'bad'].map(crossfadeSeconds)).toEqual([1,1,6,12,12,6]);
  });
  it('keeps equal-power curves complementary at every sample', () => {
    const [outgoing,incoming] = equalPowerCurves();
    expect(outgoing[0]).toBe(1); expect(incoming[0]).toBe(0);
    expect(outgoing[outgoing.length-1]).toBeCloseTo(0); expect(incoming[incoming.length-1]).toBe(1);
    for (let i=0;i<outgoing.length;i++) expect(outgoing[i]! ** 2 + incoming[i]! ** 2).toBeCloseTo(1,6);
  });
  it('uses a plain equal-power duration when tempo metadata is unavailable', () => {
    expect(planCrossfade(6,90,10)).toEqual({ seconds:6, delay:0, incomingStart:0, reason:'plain' });
  });
  it('lands on the incoming downbeat and exits on an available outgoing phrase boundary', () => {
    const plan = planCrossfade(4,9,15,{ bpm:120,beatsPerPhrase:16 },{ bpm:120,downbeatSeconds:.2 });
    expect(plan.delay + plan.seconds + 9).toBe(16);
    expect(plan.incomingStart).toBe(.2); expect(plan.reason).toBe('phrase');
  });
  it('prefers a tail ride for a large tempo mismatch and a clean quick fade for a known clash', () => {
    expect(planCrossfade(3,0,12,{bpm:70},{bpm:150}).seconds).toBe(8);
    const clash = planCrossfade(6,0,12,{bpm:120,musicalKey:'1A'},{bpm:120,musicalKey:'7A'});
    expect(clash.seconds).toBe(.35); expect(clash.reason).toBe('clash');
  });
  it('never fades a seek or an explicit pick by default, and OFF keeps hard cuts', () => {
    expect(shouldCrossfade(true,'seek',true)).toBe(false);
    expect(shouldCrossfade(true,'explicit',false)).toBe(false);
    expect(shouldCrossfade(true,'explicit',true)).toBe(true);
    expect(shouldCrossfade(true,'advance',false)).toBe(true);
    expect(shouldCrossfade(false,'advance',true)).toBe(false);
  });
});

const song = (id: string, album: string | null = null): SongItem => ({
  id,
  title: id,
  artists: [],
  album: album ? { id: album, name: album } : null,
  duration: 200,
  musicVideoType: "MUSIC_VIDEO_TYPE_ATV",
  thumbnail: "",
  explicit: false,
  videoId: id,
  playlistId: null,
  params: null,
});

const queue = (patch: Partial<CrossfadeQueue> = {}): CrossfadeQueue => {
  const songs = [song("a"), song("b")];
  return {
    queue: songs,
    currentIndex: 0,
    currentTrack: songs[0]!,
    repeatMode: "none",
    isPlaying: true,
    loadingStreamId: null,
    duration: 200,
    ...patch,
  };
};

const settings = (patch: Partial<CrossfadeSettings> = {}): CrossfadeSettings => ({
  seconds: 6,
  keepAlbums: true,
  onAutoAdvance: true,
  onManualSkip: true,
  ...patch,
});

describe("crossfadeStart", () => {
  it("starts the chosen length before the end", () => {
    expect(crossfadeStart(queue(), settings(), 194, 1, false)).toEqual({ index: 1, seconds: 6 });
    expect(crossfadeStart(queue(), settings(), 193.9, 1, false)).toBeNull();
  });

  it("shortens the fade to what is left after a late seek", () => {
    expect(crossfadeStart(queue(), settings(), 198, 1, false)).toEqual({ index: 1, seconds: 2 });
  });

  it("lasts the chosen length on the clock at any speed", () => {
    expect(crossfadeStart(queue(), settings(), 188, 2, false)).toEqual({ index: 1, seconds: 6 });
    expect(crossfadeStart(queue(), settings(), 187.9, 2, false)).toBeNull();
  });

  it("fades a song into its own start on Repeat one", () => {
    expect(crossfadeStart(queue({ repeatMode: "one" }), settings(), 195, 1, false)?.index).toBe(0);
  });

  it("fades short songs that can hold the fade", () => {
    expect(crossfadeStart(queue({ duration: 6.3 }), settings(), 1, 1, false)?.seconds).toBe(5.3);
    expect(crossfadeStart(queue({ duration: 6.2 }), settings(), 1, 1, false)).toBeNull();
  });

  it("does nothing while off, paused, loading, at the end of the queue or with the sleep timer at the end", () => {
    expect(crossfadeStart(queue(), settings({ seconds: 0 }), 195, 1, false)).toBeNull();
    expect(crossfadeStart(queue(), settings({ onAutoAdvance: false }), 195, 1, false)).toBeNull();
    expect(crossfadeStart(queue({ isPlaying: false }), settings(), 195, 1, false)).toBeNull();
    expect(crossfadeStart(queue({ loadingStreamId: "b" }), settings(), 195, 1, false)).toBeNull();
    expect(crossfadeStart(queue({ queue: [song("a")] }), settings(), 195, 1, false)).toBeNull();
    expect(crossfadeStart(queue(), settings(), 195, 1, true)).toBeNull();
  });

  it("keeps tracks of one album gapless only when asked, by album id or name", () => {
    const sameId = [song("a", "x"), song("b", "x")];
    const album = queue({ queue: sameId, currentTrack: sameId[0]! });
    expect(crossfadeStart(album, settings(), 195, 1, false)).toBeNull();
    expect(crossfadeStart(album, settings({ keepAlbums: false }), 195, 1, false)?.index).toBe(1);

    const sameName = [{ ...song("a"), album: { id: "", name: "Live" } }, { ...song("b"), album: { id: "", name: "Live" } }];
    expect(crossfadeStart(queue({ queue: sameName, currentTrack: sameName[0]! }), settings(), 195, 1, false)).toBeNull();
  });
});

describe("skipFadeSeconds", () => {
  it("fades over the chosen length, or what is left of the song", () => {
    expect(skipFadeSeconds(settings(), 30, 200, 1)).toBe(6);
    expect(skipFadeSeconds(settings(), 196, 200, 1)).toBe(4);
  });

  it("only blends briefly when skips don't fade, crossfade off included", () => {
    expect(skipFadeSeconds(settings({ onManualSkip: false }), 30, 200, 1)).toBe(SKIP_BLEND_SECONDS);
    expect(skipFadeSeconds(settings({ seconds: 0 }), 30, 200, 1)).toBe(SKIP_BLEND_SECONDS);
  });

  it("cuts a song barely heard or about to end", () => {
    expect(skipFadeSeconds(settings(), 0.5, 200, 1)).toBe(0);
    expect(skipFadeSeconds(settings(), 198.5, 200, 1)).toBe(0);
    expect(skipFadeSeconds(settings(), 30, 0, 1)).toBe(0);
  });
});

describe("chosenFadeSeconds", () => {
  it("is 0 while off and stays within the offered lengths", () => {
    expect(chosenFadeSeconds(false, 3)).toBe(0);
    expect(chosenFadeSeconds(true, 0.25)).toBe(0.25);
    expect(chosenFadeSeconds(true, 0.1)).toBe(0.25);
    expect(chosenFadeSeconds(true, 30)).toBe(12);
  });
});
