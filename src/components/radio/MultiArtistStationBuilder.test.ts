import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import settings from "../../locales/en/settings.json";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({ library: vi.fn(), catalog: vi.fn(), start: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const value = key.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], settings);
      if (typeof value !== "string") return key;
      return options ? value.replace(/\{\{(\w+)\}\}/g, (_, name) => options[name] ?? "") : value;
    },
  }),
}));
vi.mock("../../lib/multiArtistSearch", () => ({
  fetchLibraryArtists: mocks.library,
  searchCatalogArtists: mocks.catalog,
}));
vi.mock("../../store/useMusicPlayerStore", () => ({
  useMusicPlayerStore: { getState: () => ({ startMultiArtistStation: mocks.start }) },
}));

import { MultiArtistStationBuilder } from "./MultiArtistStationBuilder";

const artist = (id: string, title: string) => ({ id, title, thumbnail: null, channelId: null });

describe("MultiArtistStationBuilder", () => {
  let host: HTMLDivElement;
  let root: Root;

  const render = () => act(() => root.render(createElement(MultiArtistStationBuilder)));
  const buttonNamed = (text: string) =>
    [...document.body.querySelectorAll("button")].find((button) => button.textContent?.includes(text));
  const setInput = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    mocks.library.mockResolvedValue([artist("a", "Alpha"), artist("b", "Beta")]);
    mocks.catalog.mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
  });

  it("lists library artists, adds roots, and starts the station with them", async () => {
    render();
    await act(async () => { buttonNamed("New multi-artist station")?.click(); });
    expect(host.textContent).toContain("Alpha");
    expect(host.textContent).toContain("Beta");
    await act(async () => { buttonNamed("Alpha")?.click(); });
    await act(async () => { buttonNamed("Beta")?.click(); });
    expect(host.textContent).toContain("Alpha");
    await act(async () => { buttonNamed("Start station")?.click(); });
    expect(mocks.start).toHaveBeenCalledWith([artist("a", "Alpha"), artist("b", "Beta")]);
  });

  it("searches the catalog and merges results with the library", async () => {
    mocks.catalog.mockResolvedValue([artist("c", "Gamma")]);
    render();
    await act(async () => { buttonNamed("New multi-artist station")?.click(); });
    const input = host.querySelector("input")!;
    await act(async () => { setInput(input, "gam"); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); });
    expect(mocks.catalog).toHaveBeenCalledWith("gam");
    expect(host.textContent).toContain("Gamma");
  });

  it("disables Start with no roots selected", async () => {
    render();
    await act(async () => { buttonNamed("New multi-artist station")?.click(); });
    expect(buttonNamed("Start station")?.disabled).toBe(true);
  });
});
