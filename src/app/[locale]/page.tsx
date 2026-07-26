import { notFound, redirect } from "next/navigation";
import { routing } from "@/i18n/routing";

export default async function LocaleHome({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as "es" | "en")) notFound();
  redirect(`/${locale}/today`);
}
