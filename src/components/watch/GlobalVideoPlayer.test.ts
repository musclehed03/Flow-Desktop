import { useDjSession } from "../../lib/djSession";
import { useWatchQueue } from "../../lib/useWatchQueue";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalVideoPlayer } from "./GlobalVideoPlayer";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useAppSettingsStore } from "../../store/useAppSettingsStore";
import { SETTINGS } from "../../lib/settings/schema";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../accessibility/SensoryAdvisory", () => ({ SensoryAdvisory: () => null }));
vi.mock("./FlowPlayerCore", () => ({
  FlowPlayerCore: () => createElement("div", { "data-testid": "flow-player-core" }),
}));
vi.mock("./FullscreenPanelHost", () => ({
  FullscreenPanelHost: () => null,
}));
vi.mock("../../lib/useMediaSessionMetadata", () => ({
  useMediaSessionMetadata: vi.fn(),
}));
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

describe("GlobalVideoPlayer mini player buttons", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    usePlayerStore.setState({
      currentVideo: { id: "test-video", title: "Test Video", channelName: "Channel" },
      videoPlayerMode: "pip",
      isVideoFullscreen: false,
      isVideoFullscreenTransitioning: false,
      isTheaterMode: false,
      watchPageCache: null,
      isPlayerChromeShown: true,
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
  });

  const buttons = () => host.querySelector('button[aria-label="Expand video"]')!.parentElement!;
  const grip = () => host.querySelector('[aria-hidden="true"]')!;

  it("fades with the player's controls", () => {
    act(() => root.render(createElement(MemoryRouter, { initialEntries: ["/"] }, createElement(GlobalVideoPlayer))));
    expect(buttons().className).toContain("opacity-100");
    expect(grip().className).toContain("opacity-100");

    act(() => usePlayerStore.setState({ isPlayerChromeShown: false }));
    expect(buttons().className).toContain("opacity-0");
    expect(buttons().className).toContain("pointer-events-none");
    expect(grip().className).toContain("opacity-0");
  });

  it("stays up while the pointer rests on the buttons", () => {
    act(() => root.render(createElement(MemoryRouter, { initialEntries: ["/"] }, createElement(GlobalVideoPlayer))));

    act(() => buttons().dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
    act(() => usePlayerStore.setState({ isPlayerChromeShown: false }));
    expect(buttons().className).toContain("opacity-100");

    act(() => buttons().dispatchEvent(new PointerEvent("pointerout", { bubbles: true })));
    expect(buttons().className).toContain("opacity-0");
  });
});

describe("GlobalVideoPlayer beside the top bar", () => {
  let host: HTMLDivElement;
  let root: Root;
  let page: HTMLElement;
  let slotTop = 72;

  const rect = (top: number, height: number) =>
    ({ top, left: 0, width: 800, height, right: 800, bottom: top + height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    page = document.createElement("main");
    page.getBoundingClientRect = () => rect(56, 800);
    const slot = document.createElement("div");
    slot.dataset.flowWatchPlayerSlot = "true";
    slot.getBoundingClientRect = () => rect(slotTop, 450);
    page.append(slot);
    host = document.createElement("div");
    document.body.append(page, host);
    root = createRoot(host);
    usePlayerStore.setState({
      currentVideo: { id: "test-video", title: "Test Video", channelName: "Channel" },
      videoPlayerMode: "watch",
      isVideoFullscreen: false,
      isTheaterMode: false,
      watchPageCache: null,
      isPlayerBelowTopbar: false,
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    page.remove();
    vi.unstubAllGlobals();
  });

  it("says when the docked player sits below the top bar", () => {
    slotTop = 72;
    act(() => root.render(createElement(MemoryRouter, { initialEntries: ["/"] }, createElement(GlobalVideoPlayer))));
    expect(usePlayerStore.getState().isPlayerBelowTopbar).toBe(true);

    act(() => root.unmount());
    expect(usePlayerStore.getState().isPlayerBelowTopbar).toBe(false);
    root = createRoot(host);
  });

  it("reports the player under the bar once the page scrolls it there", () => {
    slotTop = 40;
    act(() => root.render(createElement(MemoryRouter, { initialEntries: ["/"] }, createElement(GlobalVideoPlayer))));
    expect(usePlayerStore.getState().isPlayerBelowTopbar).toBe(false);
  });
});

describe("Watch route transitions", () => {
  beforeEach(async () => {
    useDjSession.setState({ played: [] });
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
