import { create } from "zustand";

import { resolveSupporterStatus, type SupporterStatus } from "../lib/monetization/status";

interface SupporterStoreState {
  /** The current supporter status; free until a verifier plugs in (see status.ts). */
  status: SupporterStatus;
  /** Re-reads the status. Called at startup; the verifier will call it after a purchase. */
  refresh: () => void;
}

export const useSupporterStore = create<SupporterStoreState>((set) => ({
  status: resolveSupporterStatus(),
  refresh: () => set({ status: resolveSupporterStatus() }),
}));
