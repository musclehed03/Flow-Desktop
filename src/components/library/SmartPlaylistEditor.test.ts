import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadRules: vi.fn(), loadInputs: vi.fn(), preview: vi.fn(), save: vi.fn(), remove: vi.fn(),
}));
vi.mock("../../lib/smartPlaylists", async (original) => ({
  ...await original<typeof import("../../lib/smartPlaylists")>(),
  loadSmartPlaylists: mocks.loadRules,
  loadSmartPlaylistInputs: mocks.loadInputs,
  previewSmartPlaylist: mocks.preview,
  saveSmartPlaylist: mocks.save,
  deleteSmartPlaylist: mocks.remove,
}));

import { SmartPlaylistEditor } from "./SmartPlaylistEditor";

afterEach(() => { document.body.innerHTML = ""; vi.clearAllMocks(); });

describe("SmartPlaylistEditor", () => {
  it("lists saved rules and opens a live-preview editor", async () => {
    mocks.loadRules.mockResolvedValue([{ id: "rule", playlistId: "smart", name: "My rules", rule: { limit: 10, random: false }, createdAt: "", updatedAt: "" }]);
    mocks.loadInputs.mockResolvedValue({ playlists: [], history: [], likedIds: new Set() });
    mocks.preview.mockReturnValue([{ id: "track", title: "Preview track", channelName: "Artist" }]);
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => { root.render(React.createElement(MemoryRouter, null, React.createElement(SmartPlaylistEditor))); });
    expect(host.textContent).toContain("My rules");
    const create = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("New smart playlist"));
    await act(async () => { create?.click(); });
    expect(host.textContent).toContain("1 matching tracks");
    expect(host.textContent).toContain("Preview track");
    await act(async () => root.unmount());
  });
});
