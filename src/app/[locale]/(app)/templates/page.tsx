import { createClient } from "@/lib/supabase/server";
import { TemplateGallery } from "@/features/templates/template-gallery";
export default async function TemplatesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const db = await createClient();
  const [{ data: templates }, { data: schedules }] = await Promise.all([
    db
      .from("schedule_templates")
      .select("id,name,emoji,content,created_at")
      .order("created_at", { ascending: false }),
    db
      .from("schedules")
      .select("id,name,emoji")
      .eq("is_archived", false)
      .order("created_at"),
  ]);
  return (
    <TemplateGallery
      locale={locale as "es" | "en"}
      personal={templates ?? []}
      schedules={schedules ?? []}
    />
  );
}
