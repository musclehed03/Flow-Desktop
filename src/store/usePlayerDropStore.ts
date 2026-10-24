import { create } from "zustand";
import type { PlayerDrop } from "../lib/playerDrop";

interface PlayerDropState {
  pending: PlayerDrop | null;
  setPending: (pending: PlayerDrop | null) => void;
}

export const usePlayerDropStore = create<PlayerDropState>((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
}));
