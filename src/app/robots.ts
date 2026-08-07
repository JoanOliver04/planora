import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/es", "/en"],
        disallow: ["/api/", "/auth/", "/es/today", "/en/today"],
      },
    ],
    sitemap: siteConfig.url + "/sitemap.xml",
    host: siteConfig.url,
  };
}
