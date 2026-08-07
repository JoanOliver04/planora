import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
export default function sitemap(): MetadataRoute.Sitemap {
  return ["es", "en"].flatMap((locale) =>
    ["", "/demo/today", "/privacy", "/terms"].map((path) => ({
      url: siteConfig.url + "/" + locale + path,
      lastModified: new Date(),
      changeFrequency: path ? ("monthly" as const) : ("weekly" as const),
      priority: path ? 0.7 : 1,
    })),
  );
}
