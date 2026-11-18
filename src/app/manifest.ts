import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

// Chromium compares icon URLs when checking existing installations for updates.
const iconVersion = "planora-logo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.shortName,
    description: siteConfig.description.es,
    id: "/es/today",
    start_url: "/es/today",
    display: "standalone",
    scope: "/",
    lang: "es",
    dir: "ltr",
    categories: ["productivity", "utilities", "lifestyle"],
    orientation: "any",
    background_color: "#f7f8f4",
    theme_color: "#546a42",
    icons: [
      {
        src: `/icon-192.png?v=${iconVersion}`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/icon-512.png?v=${iconVersion}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `/icon-maskable.png?v=${iconVersion}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
