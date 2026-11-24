import { redirect } from "next/navigation";
import { DataTools } from "@/features/backup/data-tools";
import { createClient } from "@/lib/supabase/server";

export default async function DataPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const db = await createClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error && !user && error.name !== "AuthSessionMissingError") throw error;
  if (!user) redirect(`/${locale}/login`);

  return (
    <DataTools key={user.id} userId={user.id} locale={locale as "es" | "en"} />
  );
}
