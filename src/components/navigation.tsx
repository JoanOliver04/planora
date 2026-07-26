"use client";
import {
  CalendarDays,
  Check,
  Clock3,
  FolderKanban,
  History,
  LayoutList,
  Plus,
  Settings,
  Tags,
} from "lucide-react";
import { Link, usePathname } from "@/i18n/routing";
import { useTranslations } from "next-intl";
const allItems = [
  ["today", Clock3],
  ["week", CalendarDays],
  ["tasks", LayoutList],
  ["events", CalendarDays],
  ["history", History],
  ["schedules", FolderKanban],
  ["categories", Tags],
  ["settings", Settings],
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
export function Logo() {
  return (
    <div className="brand">
      <span className="mark">
        <Check size={22} />
      </span>
      <span>Planora</span>
    </div>
  );
}
