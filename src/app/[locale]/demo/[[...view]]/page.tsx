import { notFound } from "next/navigation";
import { DemoWorkspace } from "@/features/demo/demo-workspace";
import { createDemoState } from "@/features/demo/demo-store";
import { isDemoView } from "@/features/demo/demo-views";

export default async function DemoPage({
  params,
}: {
  params: Promise<{ locale: string; view?: string[] }>;
}) {
  const { locale, view } = await params;
  const selected = view?.[0] ?? "today";
  if ((locale !== "es" && locale !== "en") || !isDemoView(selected)) notFound();
  return (
    <DemoWorkspace
      initialState={createDemoState(new Date(), locale)}
      locale={locale}
      view={selected}
    />
  );
}
