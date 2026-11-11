import { siteConfig } from "@/config/site";
import Link from "next/link";
import { StudioCredit } from "./studio-credit";

export function AppAbout({
  locale,
  source,
}: {
  locale: "es" | "en";
  source: "settings" | "demo-settings";
}) {
  const es = locale === "es";

  return (
    <section className="surface app-about" aria-labelledby="app-about-title">
      <div className="app-about-heading">
        <h2 id="app-about-title">
          {es ? "Acerca de Planora" : "About Planora"}
        </h2>
        <span className="muted">
          {es ? "Versión" : "Version"} {siteConfig.version}
        </span>
      </div>
      <StudioCredit locale={locale} />
      <p className="muted">
        {es
          ? "Un estudio independiente de una sola persona, dedicado a crear apps y juegos."
          : "A one-person independent studio creating apps and games."}
      </p>
      <nav aria-label={es ? "Información de Planora" : "Planora information"}>
        <Link href={`/${locale}/privacy?from=${source}`} prefetch={false}>
          {es ? "Privacidad" : "Privacy"}
        </Link>
        <Link href={`/${locale}/terms?from=${source}`} prefetch={false}>
          {es ? "Condiciones de uso" : "Terms of use"}
        </Link>
      </nav>
    </section>
  );
}
