"use client";

import { Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import Image from "next/image";
import { Link, usePathname } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { siteConfig } from "@/config/site";
import { isTypingTarget } from "@/features/focus/focus-keyboard";
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
  const searchLink = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    // The shell renders both navigation variants. Only one owns the shortcut.
    if (variant !== "desktop") return;
    function openSearch(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        event.ctrlKey === event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== "k"
      )
        return;
      const query = document.getElementById("workspace-search-query");
      const inSearch =
        path === "/search" &&
        event.target instanceof Element &&
        event.target.closest(".global-search-page");
      if (
        (!inSearch && isTypingTarget(event.target)) ||
        document.querySelector(
          'dialog[open], [role="dialog"]:not([hidden]), [role="alertdialog"]:not([hidden])',
        )
      )
        return;
      event.preventDefault();
      if (path !== "/search") searchLink.current?.click();
      else if (query instanceof HTMLInputElement) {
        query.focus();
        query.select();
      }
    }
    window.addEventListener("keydown", openSearch);
    return () => window.removeEventListener("keydown", openSearch);
  }, [variant, path]);

  return (
    <>
      {items.map((item) => {
        const active = isNavigationItemActive(item.id, path);
        const Icon = item.icon;
        const isSearch = variant === "desktop" && item.id === "search";
        return (
          <Link
            className="nav-link"
            data-active={active}
            aria-current={active ? "page" : undefined}
            href={item.href}
            ref={isSearch ? searchLink : undefined}
            aria-keyshortcuts={isSearch ? "Control+k Meta+k" : undefined}
            prefetch={false}
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
            {isSearch && (
              <kbd className="nav-shortcut" aria-hidden="true">
                Ctrl / ⌘ K
              </kbd>
            )}
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
          src={siteConfig.logo.url}
          alt="Planora"
          width={96}
          height={96}
          preload
        />
      </div>
    );
  }

  return (
    <div className="brand">
      <Image
        className="brand-logo brand-logo-light"
        src="/assets/planora-logo-light.webp"
        alt="Planora"
        width={112}
        height={103}
      />
      <Image
        className="brand-logo brand-logo-dark"
        src="/assets/planora-logo-dark.webp"
        alt="Planora"
        width={112}
        height={103}
      />
    </div>
  );
}

export function PublicHomeLogo({
  locale,
  variant = "theme",
}: {
  locale: string;
  variant?: "theme" | "login" | "compact";
}) {
  return (
    <a
      href={`/${locale}`}
      className={
        variant === "compact" ? "home-logo home-logo-compact" : "home-logo"
      }
      aria-label={
        locale === "es"
          ? "Planora, volver a la portada"
          : "Planora, back to home"
      }
    >
      {variant === "compact" ? (
        <Image src={siteConfig.logo.url} alt="" width={36} height={36} />
      ) : (
        <Logo variant={variant} />
      )}
    </a>
  );
}
