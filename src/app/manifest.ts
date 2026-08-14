import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
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
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
