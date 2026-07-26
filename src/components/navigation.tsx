"use client";
import {
  CalendarDays,
  Check,
  Clock3,
  History,
  LayoutList,
  Plus,
  Settings,
} from "lucide-react";
import { Link, usePathname } from "@/i18n/routing";
import { useTranslations } from "next-intl";
const items = [
  ["today", Clock3],
  ["week", CalendarDays],
  ["tasks", LayoutList],
  ["history", History],
  ["settings", Settings],
] as const;
export function AppNavigation() {
  const t = useTranslations("Nav"),
    path = usePathname();
  return (
    <>
      {items.map(([key, Icon], i) =>
        i === 2 ? (
          <Link className="nav-link" href="/tasks" key={key}>
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
