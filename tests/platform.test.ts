import { describe, expect, it } from "vitest";
import { join } from "node:path";
import sharp from "sharp";
import manifest from "@/app/manifest";
import { GET } from "@/app/api/health/route";

describe("platform integration", () => {
  it("publishes square installation icons with and without a mask", async () => {
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
      const size = Number(icon.sizes?.split("x")[0]);
      const image = sharp(join(process.cwd(), "public", icon.src));
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

  it("returns an uncached health response without build details", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
