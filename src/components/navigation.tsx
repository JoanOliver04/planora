"use client";

import { Plus } from "lucide-react";
import Image from "next/image";
import { Link, usePathname } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import {
  desktopNavigationItems,
  isNavigationItemActive,
  mobileNavigationItems,
} from "@/config/navigation";

export function AppNavigation({
  variant = "mobile",
}: {
  variant?: "mobile" | "desktop";
}) {
  const t = useTranslations("Nav");
  const path = usePathname();
  const items =
    variant === "desktop" ? desktopNavigationItems : mobileNavigationItems;

  return (
    <>
      {items.map((item) => {
        const active = isNavigationItemActive(item.id, path);
        const Icon = item.icon;
        return (
          <Link
            className="nav-link"
            data-active={active}
            aria-current={active ? "page" : undefined}
            href={item.href}
            key={item.id}
          >
            {variant === "mobile" && item.id === "tasks" ? (
              <span className="add-orb" aria-hidden="true">
                <Plus />
              </span>
            ) : (
              <Icon size={20} aria-hidden="true" />
            )}
            <span>{t(item.id)}</span>
          </Link>
        );
      })}
    </>
  );
}

export function Logo({ variant = "theme" }: { variant?: "theme" | "login" }) {
  if (variant === "login") {
    return (
      <div className="brand">
        <Image
          className="brand-logo"
          src="/assets/logo.webp"
          alt="Planora"
          width={1024}
          height={1024}
          priority
        />
      </div>
    );
  }

  return (
    <div className="brand">
      <Image
        className="brand-logo brand-logo-light"
        src="/assets/logo_modo_claro.webp"
        alt="Planora"
        width={1024}
        height={1024}
        priority
      />
      <Image
        className="brand-logo brand-logo-dark"
        src="/assets/logo_modo_oscuro.webp"
        alt="Planora"
        width={1024}
        height={1024}
        priority
      />
    </div>
  );
}
