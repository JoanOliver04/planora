import { describe, expect, it } from "vitest";
import {
  accessibleAccent,
  contrastForeground,
  contrastRatio,
  relativeLuminance,
} from "@/lib/colors";

describe("accessible accent colors", () => {
  it("uses WCAG luminance instead of weighted sRGB brightness", () => {
    expect(relativeLuminance("#ffffff")).toBe(1);
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ff0000")).toBeCloseTo(0.2126);
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    // The old brightness threshold selected white (only 4:1) on red.
    expect(contrastForeground("#ff0000")).toBe("#000000");
  });

  it("keeps button text readable across the RGB gamut and hover state", () => {
    for (const red of [0, 51, 102, 153, 204, 255])
      for (const green of [0, 51, 102, 153, 204, 255])
        for (const blue of [0, 51, 102, 153, 204, 255]) {
          const hex =
            "#" +
            [red, green, blue]
              .map((value) => value.toString(16).padStart(2, "0"))
              .join("");
          const palette = accessibleAccent(hex);
          expect(
            contrastRatio(hex, palette.foreground),
            hex,
          ).toBeGreaterThanOrEqual(4.5);
          expect(
            contrastRatio(palette.hover, palette.foreground),
            hex + " hover",
          ).toBeGreaterThanOrEqual(4.5);
          for (const background of ["#ffffff", "#f3f5ef", "#e9eee5"])
            expect(
              contrastRatio(palette.lightText, background),
              hex + " light text",
            ).toBeGreaterThanOrEqual(4.5);
          for (const background of ["#181d16", "#222a1f", "#293725"])
            expect(
              contrastRatio(palette.darkText, background),
              hex + " dark text",
            ).toBeGreaterThanOrEqual(4.5);
        }
  });
});
