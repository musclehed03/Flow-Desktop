import { act, createElement, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDismissOnOutsideInteraction } from "./useDismissOnOutsideInteraction";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: ReturnType<typeof createRoot>; host: HTMLDivElement }> = [];

afterEach(async () => {
  while (mounted.length > 0) {
    const item = mounted.pop();
    if (!item) continue;
    await act(async () => item.root.unmount());
    item.host.remove();
  }
});

function Harness({ onDismiss }: { onDismiss: () => void }) {
  const openerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useDismissOnOutsideInteraction<HTMLDivElement>({
    open: true,
    onDismiss,
    restoreFocusRef: openerRef,
    additionalRefs: [openerRef],
  });

  return createElement(
    "div",
    null,
    createElement("button", { ref: openerRef, id: "opener" }, "Open"),
    createElement(
      "div",
      { ref: panelRef, id: "panel" },
      createElement("button", { id: "inside" }, "Inside"),
    ),
    createElement("button", { id: "outside" }, "Outside"),
  );
}

async function renderHarness(onDismiss: () => void) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  await act(async () => root.render(createElement(Harness, { onDismiss })));
  return host;
}

describe("useDismissOnOutsideInteraction", () => {
  it("dismisses on pointer-down outside but not inside", async () => {
    const onDismiss = vi.fn();
    const host = await renderHarness(onDismiss);

    host.querySelector<HTMLButtonElement>("#inside")?.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true }),
    );
    expect(onDismiss).not.toHaveBeenCalled();

    host.querySelector<HTMLButtonElement>("#outside")?.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true }),
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses when focus leaves its boundaries", async () => {
    const onDismiss = vi.fn();
    const host = await renderHarness(onDismiss);

    await act(async () => host.querySelector<HTMLButtonElement>("#inside")?.focus());
    expect(onDismiss).not.toHaveBeenCalled();

    await act(async () => host.querySelector<HTMLButtonElement>("#outside")?.focus());
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses on Escape and restores focus to its opener", async () => {
    const onDismiss = vi.fn();
    const onOuterEscape = vi.fn();
    const host = await renderHarness(onDismiss);
    const opener = host.querySelector<HTMLButtonElement>("#opener")!;
    window.addEventListener("keydown", onOuterEscape);
    await act(async () => host.querySelector<HTMLButtonElement>("#inside")?.focus());

    await act(async () => document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onOuterEscape).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);
    window.removeEventListener("keydown", onOuterEscape);
  });
});
