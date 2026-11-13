import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Logo } from "./Logo";
import { DDT_PALETTES, getDdtVariant } from "../../lib/brand/ddtMark";

describe("Logo", () => {
  it("renders the time-correct variant at large sizes, with DDT lettering", () => {
    const variant = getDdtVariant();
    const palette = DDT_PALETTES[variant];
    const markup = renderToStaticMarkup(React.createElement(Logo, { size: 72 }));
    expect(markup).toContain(palette.container);
    expect(markup).toContain(palette.mark);
    expect(markup).toContain("DDT");
  });

  it("renders F-only below 32px, no DDT lettering", () => {
    const markup = renderToStaticMarkup(React.createElement(Logo, { size: 16 }));
    expect(markup).not.toContain("DDT");
    expect(markup).toContain("M10 7L18 7");
  });

  it("renders the forced variant when one is passed", () => {
    const markup = renderToStaticMarkup(
      React.createElement(Logo, { size: 48, variant: "pink" }),
    );
    expect(markup).toContain(DDT_PALETTES.pink.container);
    expect(markup).toContain("DDT");
  });

  it("starts the intro on the legacy red logo (static markup is frame 0)", () => {
    const markup = renderToStaticMarkup(
      React.createElement(Logo, { size: 72, intro: true }),
    );
    expect(markup).toContain("#FF0000");
    expect(markup).not.toContain("DDT");
  });
});
