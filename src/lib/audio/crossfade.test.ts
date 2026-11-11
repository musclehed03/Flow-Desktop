import { describe, expect, it } from "vitest";

import type { SongItem } from "../../types/music";
import {
  crossfadeSeconds,
  crossfadeTarget,
  equalPowerCurves,
  planCrossfade,
  shouldCrossfade,
  type CrossfadeQueue,
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

const song = (id: string, albumId: string | null = null): SongItem => ({
  id,
  title: id,
  artists: [],
  album: albumId ? { id: albumId, name: albumId } : null,
  duration: 200,
  musicVideoType: "MUSIC_VIDEO_TYPE_ATV",
  thumbnail: "",
  explicit: false,
  videoId: id,
  playlistId: null,
  params: null,
});

const near = (patch: Partial<CrossfadeQueue> = {}): CrossfadeQueue => {
  const queue = [song("a"), song("b")];
  return {
    queue,
    currentIndex: 0,
    currentTrack: queue[0]!,
    isShuffle: false,
    repeatMode: "none",
    isPlaying: true,
    loadingStreamId: null,
    progress: 196,
    duration: 200,
    ...patch,
  };
};

describe("crossfadeTarget", () => {
  it("starts the fade once the song is inside its last seconds", () => {
    expect(crossfadeTarget(near(), 5)).toBe(1);
    expect(crossfadeTarget(near({ progress: 190 }), 5)).toBe(-1);
    expect(crossfadeTarget(near({ progress: 199.9 }), 5)).toBe(-1);
  });

  it("stays off when disabled, paused, loading, on repeat-one or at the end of the queue", () => {
    expect(crossfadeTarget(near(), 0)).toBe(-1);
    expect(crossfadeTarget(near({ isPlaying: false }), 5)).toBe(-1);
    expect(crossfadeTarget(near({ loadingStreamId: "a" }), 5)).toBe(-1);
    expect(crossfadeTarget(near({ repeatMode: "one" }), 5)).toBe(-1);
    expect(crossfadeTarget(near({ queue: [song("a")] }), 5)).toBe(-1);
  });

  it("keeps consecutive album tracks gapless unless shuffled", () => {
    const album = [song("a", "LP"), song("b", "LP")];
    const inOrder = near({ queue: album, currentTrack: album[0]! });
    expect(crossfadeTarget(inOrder, 5)).toBe(-1);
    expect(crossfadeTarget({ ...inOrder, isShuffle: true }, 5)).toBe(1);
  });

  it("never fades a song too short to hold the fade twice", () => {
    expect(crossfadeTarget(near({ duration: 8, progress: 5 }), 5)).toBe(-1);
  });
});
