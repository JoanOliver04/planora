export const siteConfig = {
  name: "Planora",
  shortName: "Planora",
  description: {
    es: "Tus rutinas, hábitos y eventos en armonía.",
    en: "Your routines, habits and events in harmony.",
  },
  url:
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://planora-lake-one.vercel.app",
  version: "0.1.0",
} as const;
