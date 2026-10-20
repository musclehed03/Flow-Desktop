import { useWatchQueue } from "../../lib/useWatchQueue";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalVideoPlayer } from "./GlobalVideoPlayer";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useAppSettingsStore } from "../../store/useAppSettingsStore";
import { SETTINGS } from "../../lib/settings/schema";

vi.mock("../accessibility/SensoryAdvisory", () => ({ SensoryAdvisory: () => null }));
vi.mock("./FlowPlayerCore", () => ({ FlowPlayerCore: () => null }));
vi.mock("../../lib/useMediaSessionMetadata", () => ({ useMediaSessionMetadata: () => {} }));
vi.mock("../../lib/streamResolution", () => ({ prefetchStreamInfo: vi.fn() }));
let root: Root;
let host: HTMLDivElement;
let path: string;
let go: ReturnType<typeof useNavigate>;
const resetError = () => {};
function Location() {
  path = useLocation().pathname;
  go = useNavigate();
  useWatchQueue(path.startsWith("/watch/") ? path.slice(7) : undefined, null, 0, resetError);
  return null;
}
const video = (id: string) => ({ id, title: id, channelName: "Artist" });

beforeEach(async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  useAppSettingsStore.setState({ values: { ...useAppSettingsStore.getState().values,
    [SETTINGS.KEEP_WATCHING_VIEW_ENABLED]: "true", [SETTINGS.AUTO_PIP_ENABLED]: "true" } });
  usePlayerStore.getState().setQueue([video("one"), video("two")]);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(MemoryRouter, { initialEntries: ["/watch/one"] },
    createElement(Location), createElement(GlobalVideoPlayer))));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  usePlayerStore.getState().clearQueue();
  vi.unstubAllGlobals();
});

describe("Watch route transitions", () => {
  it("replaces the track route without auto-PiP or loss of fullscreen/theater", async () => {
    await act(async () => usePlayerStore.setState({ isVideoFullscreen: true, isTheaterMode: true }));
    await act(async () => { usePlayerStore.getState().playNext(); });
    expect(path).toBe("/watch/two");
    expect(usePlayerStore.getState()).toMatchObject({ videoPlayerMode: "watch", isVideoFullscreen: true, isTheaterMode: true });
  });
  it("returns from route-leave auto-PiP on advance", async () => {
    await act(async () => go("/music"));
    expect(usePlayerStore.getState()).toMatchObject({ videoPlayerMode: "pip", videoPipIntent: "auto" });
    await act(async () => { usePlayerStore.getState().playNext(); });
    expect(path).toBe("/watch/two");
    expect(usePlayerStore.getState().videoPlayerMode).toBe("watch");
  });
  it("respects manual PiP through track route replacement", async () => {
    await act(async () => usePlayerStore.getState().enterVideoPip("manual"));
    await act(async () => { usePlayerStore.getState().playNext(); });
    expect(path).toBe("/watch/two");
    expect(usePlayerStore.getState()).toMatchObject({ videoPlayerMode: "pip", videoPipIntent: "manual" });
  });
  it("retains upstream auto-PiP advance behavior when disabled", async () => {
    await act(async () => useAppSettingsStore.setState({ values: { ...useAppSettingsStore.getState().values, [SETTINGS.KEEP_WATCHING_VIEW_ENABLED]: "false" } }));
    await act(async () => go("/music"));
    await act(async () => { usePlayerStore.getState().playNext(); });
    expect(path).toBe("/music");
    expect(usePlayerStore.getState()).toMatchObject({ videoPlayerMode: "pip", videoPipIntent: "auto" });
  });
  it("allows back navigation to an earlier queued track", async () => {
    await act(async () => { usePlayerStore.getState().playNext(); });
    await act(async () => go("/watch/one"));
    expect(path).toBe("/watch/one");
    expect(usePlayerStore.getState().currentVideo?.id).toBe("one");
  });
  it("handles an explicit music-to-Watch request from another route", async () => {
    await act(async () => go("/music"));
    await act(async () => useAppSettingsStore.setState({ values: { ...useAppSettingsStore.getState().values, [SETTINGS.KEEP_WATCHING_VIEW_ENABLED]: "false" } }));
    await act(async () => {
      usePlayerStore.getState().setQueue([video("music-video")]);
      window.dispatchEvent(new Event("flow-video-expand-request"));
    });
    expect(path).toBe("/watch/music-video");
    expect(usePlayerStore.getState().videoPlayerMode).toBe("watch");
  });
});
