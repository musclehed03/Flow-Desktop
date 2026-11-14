import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import { VolumePopover } from "./VolumePopover";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("VolumePopover wheel", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const wheelUp = () => {
    act(() => {
      host
        .querySelector(".bg-surface-container")!
        .dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100 }));
    });
  };

  it("raises the volume", () => {
    const setVolume = vi.fn();
    useMusicPlayerStore.setState({ setVolume, volume: 0.5, isMuted: false });
    act(() => root.render(createElement(VolumePopover, { open: true, onClose: vi.fn(), triggerRef: { current: null } })));

    wheelUp();

    expect(setVolume).toHaveBeenCalledWith(0.55);
  });

  it("unmutes to the saved level", () => {
    const setVolume = vi.fn();
    const toggleMute = vi.fn();
    useMusicPlayerStore.setState({ setVolume, toggleMute, volume: 0.5, isMuted: true });
    act(() => root.render(createElement(VolumePopover, { open: true, onClose: vi.fn(), triggerRef: { current: null } })));

    wheelUp();

    expect(toggleMute).toHaveBeenCalledTimes(1);
    expect(setVolume).not.toHaveBeenCalled();
  });

  // A click or focus move back to the library closes the selector, library in
  // front (fixes batch #19). Each case renders fresh: the dismiss hook fires
  // once per open session, as it should — the parent closes on the first one.
  // The trigger and library live on document.body, not the render host:
  // React clears a host's pre-existing children on mount, which would detach
  // them and their events would never reach the document listener.
  const renderOpen = async (onClose: () => void) => {
    const trigger = document.createElement("button");
    const library = document.createElement("div");
    library.textContent = "Library";
    document.body.append(trigger, library);
    await act(async () => root.render(createElement(VolumePopover, { open: true, onClose, triggerRef: { current: trigger } })));
    return { trigger, library, cleanup: () => { trigger.remove(); library.remove(); } };
  };

  it("closes on a pointerdown back on the library", async () => {
    useMusicPlayerStore.setState({ setVolume: vi.fn(), toggleMute: vi.fn(), volume: 0.5, isMuted: false });
    const onClose = vi.fn();
    const { library, cleanup } = await renderOpen(onClose);
    await act(async () => { library.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); });
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("closes when focus moves back to the library, but not on the trigger", async () => {
    useMusicPlayerStore.setState({ setVolume: vi.fn(), toggleMute: vi.fn(), volume: 0.5, isMuted: false });
    const onClose = vi.fn();
    const { trigger, library, cleanup } = await renderOpen(onClose);
    await act(async () => { trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { library.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
  });
});

describe("VolumePopover closing by itself", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    useMusicPlayerStore.setState({ volume: 0.5, isMuted: false });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  const openWith = (onClose: () => void) => {
    act(() => root.render(createElement(VolumePopover, { open: true, onClose })));
    return host.querySelector<HTMLElement>(".bg-surface-container")!;
  };
  const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

  it("closes after 2.8 seconds untouched", () => {
    const onClose = vi.fn();
    openWith(onClose);

    wait(2799);
    expect(onClose).not.toHaveBeenCalled();
    wait(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open while the pointer is on it, then waits at least 1.5 seconds", () => {
    const onClose = vi.fn();
    const popover = openWith(onClose);

    wait(2000);
    act(() => popover.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
    wait(10_000);
    expect(onClose).not.toHaveBeenCalled();

    act(() => popover.dispatchEvent(new PointerEvent("pointerout", { bubbles: true })));
    wait(1499);
    expect(onClose).not.toHaveBeenCalled();
    wait(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("starts counting again when the volume changes", () => {
    const onClose = vi.fn();
    openWith(onClose);

    wait(2000);
    act(() => useMusicPlayerStore.setState({ volume: 0.6 }));
    wait(2000);
    expect(onClose).not.toHaveBeenCalled();
    wait(800);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
