import { describe, expect, it, vi } from "vitest";
import LocaleHome from "@/app/[locale]/page";

const navigation = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
}));

vi.mock("next/navigation", () => navigation);
vi.mock("@/i18n/routing", () => ({
  routing: { locales: ["es", "en"] },
}));

describe("locale root route", () => {
  it.each([
    ["es", "/es/today"],
    ["en", "/en/today"],
  ])("redirects /%s to today", async (locale, destination) => {
    await expect(
      LocaleHome({ params: Promise.resolve({ locale }) }),
    ).rejects.toThrow(`redirect:${destination}`);
    expect(navigation.redirect).toHaveBeenCalledWith(destination);
  });

  it("keeps invalid locales on the 404 path", async () => {
    await expect(
      LocaleHome({ params: Promise.resolve({ locale: "fr" }) }),
    ).rejects.toThrow("not-found");
    expect(navigation.notFound).toHaveBeenCalledOnce();
  });
});
