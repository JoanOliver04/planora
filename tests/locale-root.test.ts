import { describe, expect, it, vi } from "vitest";
import LocaleHome, { generateMetadata } from "@/app/[locale]/page";

const navigation = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
}));

vi.mock("next/navigation", () => navigation);
vi.mock("@/i18n/routing", () => ({
  Link: "a",
  routing: { locales: ["es", "en"] },
}));

describe("locale root route", () => {
  it.each(["es", "en"])("renders the /%s product landing", async (locale) => {
    const result = await LocaleHome({ params: Promise.resolve({ locale }) });
    expect(result.props.className).toBe("landing");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale }),
    });
    expect(metadata.title).toBeTruthy();
    expect(metadata.description).toBeTruthy();
  });

  it("keeps invalid locales on the 404 path", async () => {
    await expect(
      LocaleHome({ params: Promise.resolve({ locale: "fr" }) }),
    ).rejects.toThrow("not-found");
    expect(navigation.notFound).toHaveBeenCalledOnce();
  });
});
