import { notFound } from "next/navigation";
import { DemoWorkspace } from "@/features/demo/demo-workspace";

const views = [
  "today",
  "week",
  "tasks",
  "events",
  "history",
  "schedules",
  "categories",
  "settings",
] as const;

export default async function DemoPage({
  params,
}: {
  params: Promise<{ locale: string; view?: string[] }>;
}) {
  const { locale, view } = await params;
  const selected = view?.[0] ?? "today";
  if (
    (locale !== "es" && locale !== "en") ||
    !views.includes(selected as (typeof views)[number])
  )
    notFound();
  return (
    <DemoWorkspace locale={locale} view={selected as (typeof views)[number]} />
  );
}
