import { siteConfig } from "@/config/site";

export function StudioCredit({
  locale,
  copyright = false,
}: {
  locale: string;
  copyright?: boolean;
}) {
  return (
    <p className="studio-credit">
      {locale === "es" ? "Una app de " : "An app by "}
      <span>{siteConfig.studio}</span>
      {copyright && (
        <small>
          © 2026 {siteConfig.studio}.{" "}
          {locale === "es"
            ? "Todos los derechos reservados."
            : "All rights reserved."}
        </small>
      )}
    </p>
  );
}
