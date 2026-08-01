"use client";
import {
  CalendarDays,
  Clock3,
  FolderKanban,
  History,
  LayoutList,
  Plus,
  Settings,
  Tags,
  LibraryBig,
  ChartNoAxesCombined,
  BellRing,
  DatabaseBackup,
} from "lucide-react";
import Image from "next/image";
import { Link, usePathname } from "@/i18n/routing";
import { useTranslations } from "next-intl";
const allItems = [
  ["today", Clock3],
  ["week", CalendarDays],
  ["tasks", LayoutList],
  ["events", CalendarDays],
  ["history", History],
  ["statistics", ChartNoAxesCombined],
  ["reminders", BellRing],
  ["schedules", FolderKanban],
  ["categories", Tags],
  ["templates", LibraryBig],
  ["settings", Settings],
  ["data", DatabaseBackup],
] as const;
const mobileKeys = new Set(["today", "week", "tasks", "events", "settings"]);
export function AppNavigation({
  variant = "mobile",
}: {
  variant?: "mobile" | "desktop";
}) {
  const t = useTranslations("Nav"),
    path = usePathname(),
    items =
      variant === "desktop"
        ? allItems
        : allItems.filter(([key]) => mobileKeys.has(key));
  return (
    <>
      {items.map(([key, Icon]) =>
        variant === "mobile" && key === "tasks" ? (
          <Link
            className="nav-link"
            data-active={path.includes("/tasks")}
            aria-current={path.includes("/tasks") ? "page" : undefined}
            href="/tasks"
            key={key}
          >
            <span className="add-orb">
              <Plus />
            </span>
            <span>{t(key)}</span>
          </Link>
        ) : (
          <Link
            className="nav-link"
            data-active={path.includes(`/${key}`)}
            aria-current={path.includes(`/${key}`) ? "page" : undefined}
            href={`/${key}`}
            key={key}
          >
            <Icon size={20} />
            <span>{t(key)}</span>
          </Link>
        ),
      )}
    </>
  );
}
export function Logo({ variant = "theme" }: { variant?: "theme" | "login" }) {
  if (variant === "login") {
    return (
      <div className="brand">
        <Image
          className="brand-logo"
          src="/assets/logo.png"
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
        src="/assets/logo_modo_claro.png"
        alt="Planora"
        width={1024}
        height={1024}
        priority
      />
      <Image
        className="brand-logo brand-logo-dark"
        src="/assets/logo_modo_oscuro.png"
        alt="Planora"
        width={1024}
        height={1024}
        priority
      />
    </div>
  );
}
