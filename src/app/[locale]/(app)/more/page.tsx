import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { moreNavigationItems, type NavigationGroup } from "@/config/navigation";

const groups: NavigationGroup[] = ["activity", "organization", "account"];

export default async function MorePage() {
  const t = await getTranslations("More");
  const nav = await getTranslations("Nav");

  return (
    <section className="more-page" aria-labelledby="more-title">
      <header className="more-header">
        <p className="eyebrow">Planora</p>
        <h1 className="title" id="more-title">
          {nav("more")}
        </h1>
        <p>{t("description")}</p>
      </header>
      <nav className="more-groups" aria-label={t("navigationLabel")}>
        {groups.map((group) => (
          <section className="more-group surface" key={group}>
            <h2>{t(`groups.${group}`)}</h2>
            <div className="more-links">
              {moreNavigationItems
                .filter((item) => item.group === group)
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link className="more-link" href={item.href} key={item.id}>
                      <span className="more-link-icon" aria-hidden="true">
                        <Icon size={21} />
                      </span>
                      <span className="more-link-copy">
                        <strong>{nav(item.id)}</strong>
                        <small>{t(`items.${item.id}`)}</small>
                      </span>
                      <ChevronRight
                        className="more-link-chevron"
                        size={19}
                        aria-hidden="true"
                      />
                    </Link>
                  );
                })}
            </div>
          </section>
        ))}
      </nav>
    </section>
  );
}
