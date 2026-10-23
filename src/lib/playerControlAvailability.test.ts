import { describe, expect, it } from "vitest";

import {
  PLAYER_CONTROL_MATRIX,
  REQUIRED_PLAYER_CONTROLS,
} from "./playerControlAvailability";

describe("player control availability", () => {
  it("keeps every required control reachable on every player surface", () => {
    for (const [surface, controls] of Object.entries(PLAYER_CONTROL_MATRIX)) {
      for (const control of REQUIRED_PLAYER_CONTROLS) {
        expect(controls[control], `${surface} is missing ${control}`).toBeTruthy();
      }
    }
  });

  it("documents controls that change presentation on compact surfaces", () => {
    expect(PLAYER_CONTROL_MATRIX.musicDock.fullscreen).toContain("overlay");
    expect(PLAYER_CONTROL_MATRIX.videoMiniPip.queue).toContain("panel");
  });
});
