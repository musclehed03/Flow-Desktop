import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUpdaterStore } from "../../store/useUpdaterStore";
import { LONG_SESSION_CHECK_MS, UpdateManager } from "./UpdateManager";

vi.mock("./UpdateDialog", () => ({ UpdateDialog: () => null }));

const { checkForkRelease } = vi.hoisted(() => ({ checkForkRelease: vi.fn(async () => null) }));
vi.mock("../../lib/forkUpdateCheck", () => ({ checkForkRelease }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STARTUP_MS = 4_000;

describe("UpdateManager", () => {
  let root: Root;

  const mount = () =>
    act(() => {
      root = createRoot(document.createElement("div"));
      root.render(createElement(UpdateManager, { enabled: true }));
    });
  const pass = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

  beforeEach(() => {
    vi.useFakeTimers();
    checkForkRelease.mockClear();
    useUpdaterStore.setState({
      phase: "idle",
      autoCheck: true,
      prefsLoaded: true,
      loadPreferences: async () => {},
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("checks at launch and again every 12 hours", async () => {
    mount();
    await pass(STARTUP_MS);
    expect(checkForkRelease).toHaveBeenCalledTimes(1);
    await pass(LONG_SESSION_CHECK_MS);
    expect(checkForkRelease).toHaveBeenCalledTimes(2);
  });

  it("leaves an update in progress alone", async () => {
    mount();
    await pass(STARTUP_MS);
    useUpdaterStore.setState({ phase: "installed" });
    await pass(LONG_SESSION_CHECK_MS);
    expect(checkForkRelease).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when automatic checks are off", async () => {
    useUpdaterStore.setState({ autoCheck: false });
    mount();
    await pass(STARTUP_MS + LONG_SESSION_CHECK_MS);
    expect(checkForkRelease).not.toHaveBeenCalled();
  });
});
