import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { GET } from "@/app/api/health/route";

describe("platform integration", () => {
  it("publishes an installable manifest using the product logo", () => {
    const value = manifest();

    expect(value).toMatchObject({
      name: "Planora",
      display: "standalone",
      scope: "/",
      start_url: "/es/today",
    });
    expect(value.icons).toContainEqual(
      expect.objectContaining({ src: "/assets/logo.png", type: "image/png" }),
    );
  });

  it("returns an uncached health response without build details", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
