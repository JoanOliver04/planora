import {
  BellRing,
  CalendarDays,
  ChartNoAxesCombined,
  CircleEllipsis,
  Clock3,
  DatabaseBackup,
  FolderKanban,
  History,
  LayoutList,
  LibraryBig,
  Settings,
  Tags,
  type LucideIcon,
} from "lucide-react";

export type NavigationGroup = "activity" | "organization" | "account";
export type NavigationId =
  | "today"
  | "week"
  | "tasks"
  | "events"
  | "history"
  | "statistics"
  | "reminders"
  | "schedules"
  | "categories"
  | "templates"
  | "settings"
  | "data"
  | "more";

export type NavigationItem = {
  id: NavigationId;
  href: `/${string}`;
  icon: LucideIcon;
  desktopOrder?: number;
  mobileOrder?: number;
  moreOrder?: number;
  group?: NavigationGroup;
};

export const navigationItems: readonly NavigationItem[] = [
  {
    id: "today",
    href: "/today",
    icon: Clock3,
    desktopOrder: 1,
    mobileOrder: 1,
  },
  {
    id: "week",
    href: "/week",
    icon: CalendarDays,
    desktopOrder: 2,
    mobileOrder: 2,
  },
  {
    id: "tasks",
    href: "/tasks",
    icon: LayoutList,
    desktopOrder: 3,
    mobileOrder: 3,
  },
  {
    id: "events",
    href: "/events",
    icon: CalendarDays,
    desktopOrder: 4,
    mobileOrder: 4,
  },
  {
    id: "history",
    href: "/history",
    icon: History,
    desktopOrder: 5,
    moreOrder: 1,
    group: "activity",
  },
  {
    id: "statistics",
    href: "/statistics",
    icon: ChartNoAxesCombined,
    desktopOrder: 6,
    moreOrder: 2,
    group: "activity",
  },
  {
    id: "reminders",
    href: "/reminders",
    icon: BellRing,
    desktopOrder: 7,
    moreOrder: 3,
    group: "activity",
  },
  {
    id: "schedules",
    href: "/schedules",
    icon: FolderKanban,
    desktopOrder: 8,
    moreOrder: 1,
    group: "organization",
  },
  {
    id: "categories",
    href: "/categories",
    icon: Tags,
    desktopOrder: 9,
    moreOrder: 2,
    group: "organization",
  },
  {
    id: "templates",
    href: "/templates",
    icon: LibraryBig,
    desktopOrder: 10,
    moreOrder: 3,
    group: "organization",
  },
  {
    id: "settings",
    href: "/settings",
    icon: Settings,
    desktopOrder: 11,
    moreOrder: 1,
    group: "account",
  },
  {
    id: "data",
    href: "/data",
    icon: DatabaseBackup,
    desktopOrder: 12,
    moreOrder: 2,
    group: "account",
  },
  { id: "more", href: "/more", icon: CircleEllipsis, mobileOrder: 5 },
];

const orderedBy = (key: "desktopOrder" | "mobileOrder" | "moreOrder") =>
  navigationItems
    .filter((item) => item[key] !== undefined)
    .toSorted((left, right) => left[key]! - right[key]!);

export const desktopNavigationItems = orderedBy("desktopOrder");
export const mobileNavigationItems = orderedBy("mobileOrder");
export const moreNavigationItems = orderedBy("moreOrder");

export function matchesNavigationPath(pathname: string, href: string) {
  const path =
    pathname.replace(/^\/(?:es|en)(?=\/|$)/, "").replace(/\/$/, "") || "/";
  return path === href || path.startsWith(`${href}/`);
}

export function isNavigationItemActive(id: NavigationId, pathname: string) {
  if (id === "more")
    return (
      matchesNavigationPath(pathname, "/more") ||
      moreNavigationItems.some((item) =>
        matchesNavigationPath(pathname, item.href),
      )
    );
  const item = navigationItems.find((candidate) => candidate.id === id);
  return item ? matchesNavigationPath(pathname, item.href) : false;
}
