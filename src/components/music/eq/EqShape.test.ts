import { expect, it } from "vitest";

import { band } from "../../../lib/audio/eq/models";
import { shapeDescriptionKey } from "./EqShape";

it("names a bell by its width: narrow at Q 3 and over, wide at Q 0.7 and under", () => {
  expect(shapeDescriptionKey(band(1_000, 3, 10, "PEAK"))).toBe("eq_shape_peak_narrow");
  expect(shapeDescriptionKey(band(1_000, 3, 3, "PEAK"))).toBe("eq_shape_peak_narrow");
  expect(shapeDescriptionKey(band(1_000, 3, 1.41, "PEAK"))).toBe("eq_shape_peak");
  expect(shapeDescriptionKey(band(1_000, 3, 0.7, "PEAK"))).toBe("eq_shape_peak_wide");
  expect(shapeDescriptionKey(band(1_000, 3, 0.3, "PEAK"))).toBe("eq_shape_peak_wide");
});

it("names every other shape after what it does to the sound", () => {
  expect(shapeDescriptionKey(band(100, 4, 0.707, "LOW_SHELF"))).toBe("eq_shape_low_shelf");
  expect(shapeDescriptionKey(band(5_000, 4, 0.707, "HIGH_SHELF"))).toBe("eq_shape_high_shelf");
  expect(shapeDescriptionKey(band(5_000, 0, 0.707, "LOW_PASS"))).toBe("eq_shape_low_pass");
  expect(shapeDescriptionKey(band(100, 0, 0.707, "HIGH_PASS"))).toBe("eq_shape_high_pass");
  expect(shapeDescriptionKey(band(1_000, 0, 10, "NOTCH"))).toBe("eq_shape_notch");
});
