import { describe, expect, it } from "vitest";
import { join } from "node:path";
import sharp from "sharp";
import manifest from "@/app/manifest";
import { GET } from "@/app/api/health/route";

describe("platform integration", () => {
  it("publishes versioned square installation icons with and without a mask", async () => {
    const value = manifest();

    expect(value).toMatchObject({
      name: "Planora",
      display: "standalone",
      scope: "/",
      id: "/es/today",
      start_url: "/es/today",
    });
    expect(value.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", purpose: "any" }),
        expect.objectContaining({ sizes: "512x512", purpose: "any" }),
        expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
      ]),
    );

    for (const icon of value.icons ?? []) {
      const { pathname, searchParams } = new URL(
        icon.src,
        "https://planora.test",
      );
      expect(searchParams.get("v")).toBeTruthy();
      const size = Number(icon.sizes?.split("x")[0]);
      const image = sharp(join(process.cwd(), "public", pathname));
      await expect(image.metadata()).resolves.toMatchObject({
        width: size,
        height: size,
        format: "png",
      });
      await expect(image.stats()).resolves.toMatchObject({
        isOpaque: icon.purpose === "maskable",
      });
    }
  });

  it.each([
    { path: "icon-maskable.png", size: 512, minFill: 0.64, maxRadius: 0.4 },
    { path: "apple-touch-icon.png", size: 180, minFill: 0.79, maxRadius: 0.5 },
  ])(
    "centers the launcher symbol in $path",
    async ({ path, size, minFill, maxRadius }) => {
      const image = sharp(join(process.cwd(), "public", path));
      await expect(image.stats()).resolves.toMatchObject({ isOpaque: true });

      const { data, info } = await image
        .toColourspace("srgb")
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(info).toMatchObject({ width: size, height: size, channels: 3 });

      const background = data.subarray(0, 3);
      let left = size;
      let right = -1;
      let top = size;
      let bottom = -1;
      let radius = 0;

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const offset = (y * size + x) * 3;
          // Ignore pixels within the antialiased edge of the symbol.
          if (
            background.every(
              (channel, i) => Math.abs(channel - data[offset + i]) <= 12,
            )
          ) {
            continue;
          }
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
          radius = Math.max(
            radius,
            Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2),
          );
        }
      }

      expect(Math.abs(left - (size - 1 - right))).toBeLessThanOrEqual(1);
      expect(Math.abs(top - (size - 1 - bottom))).toBeLessThanOrEqual(1);
      expect(
        Math.min(right - left + 1, bottom - top + 1) / size,
      ).toBeGreaterThanOrEqual(minFill);
      expect(radius / size).toBeLessThanOrEqual(maxRadius);
    },
  );

  it("returns an uncached health response without build details", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
