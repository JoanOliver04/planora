import { siteConfig } from "@/config/site";

export function StudioCredit({ locale }: { locale: string }) {
  return (
    <p className="studio-credit">
      {locale === "es" ? "Una app de " : "An app by "}
      <span>{siteConfig.studio}</span>
    </p>
  );
}
