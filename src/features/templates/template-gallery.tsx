"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { importTemplate, savePersonalTemplate } from "@/app/actions/domain";
import { templateCatalog, type ScheduleTemplate } from "./catalog";
import type { Json } from "@/types/database";
type Personal = {
  id: string;
  name: string;
  emoji: string | null;
  content: Json;
  created_at: string;
};
type Preview = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  categories: Array<{
    key: string;
    name: string;
    colour: string;
    emoji: string;
  }>;
  tasks: Array<{ title: string; emoji: string; categoryKey: string }>;
  personal: boolean;
};
function localize(template: ScheduleTemplate, locale: "es" | "en"): Preview {
  return {
    id: template.id,
    name: template.name[locale],
    description: template.description[locale],
    emoji: template.emoji,
    categories: template.categories.map((item) => ({
      ...item,
      name: item.name[locale],
    })),
    tasks: template.tasks.map((item) => ({
      ...item,
      title: item.title[locale],
    })),
    personal: false,
  };
}
function personalPreview(template: Personal): Preview {
  const content = template.content as Record<string, unknown>;
  return {
    id: template.id,
    name: template.name,
    description: "",
    emoji: template.emoji ?? "📋",
    categories: (Array.isArray(content.categories)
      ? content.categories
      : []) as Preview["categories"],
    tasks: (Array.isArray(content.tasks)
      ? content.tasks
      : []) as Preview["tasks"],
    personal: true,
  };
}
export function TemplateGallery({
  locale,
  personal,
  schedules,
}: {
  locale: "es" | "en";
  personal: Personal[];
  schedules: Array<{ id: string; name: string; emoji: string | null }>;
}) {
  const es = locale === "es",
    router = useRouter();
  const builtins = useMemo(
    () => templateCatalog.map((item) => localize(item, locale)),
    [locale],
  );
  const [preview, setPreview] = useState<Preview | null>(null),
    [categories, setCategories] = useState(true),
    [tasks, setTasks] = useState(true),
    [scheduleId, setScheduleId] = useState(schedules[0]?.id ?? ""),
    [templateName, setTemplateName] = useState(""),
    [pending, startTransition] = useTransition();
  function runImport() {
    if (!preview || (!categories && !tasks)) return;
    const requestId = crypto.randomUUID();
    startTransition(async () => {
      try {
        await importTemplate({
          templateId: preview.id,
          locale,
          requestId,
          categories,
          tasks,
          personal: preview.personal,
        });
        toast.success(es ? "Plantilla importada" : "Template imported");
        setPreview(null);
        router.push("/" + locale + "/today");
        router.refresh();
      } catch {
        toast.error(
          es ? "No se pudo importar la plantilla" : "Could not import template",
        );
      }
    });
  }
  function save() {
    if (!scheduleId || !templateName.trim()) return;
    startTransition(async () => {
      try {
        await savePersonalTemplate({ scheduleId, name: templateName });
        toast.success(
          es ? "Plantilla personal guardada" : "Personal template saved",
        );
        setTemplateName("");
        router.refresh();
      } catch {
        toast.error(
          es ? "No se pudo guardar la plantilla" : "Could not save template",
        );
      }
    });
  }
  const card = (item: Preview) => (
    <button
      className="template-card"
      key={item.id}
      onClick={() => setPreview(item)}
    >
      <span>{item.emoji}</span>
      <h3>{item.name}</h3>
      <p>
        {item.description ||
          (es ? "Tu horario reutilizable" : "Your reusable schedule")}
      </p>
      <small>
        {item.categories.length} {es ? "categorías" : "categories"} ·{" "}
        {item.tasks.length} {es ? "tareas" : "tasks"}
      </small>
    </button>
  );
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            {es ? "Empieza más rápido" : "Start faster"}
          </p>
          <h1>{es ? "Plantillas" : "Templates"}</h1>
          <p className="muted">
            {es
              ? "Previsualiza e importa solo lo que necesites."
              : "Preview and import only what you need."}
          </p>
        </div>
      </header>
      <section aria-labelledby="builtins-title">
        <h2 id="builtins-title">{es ? "Recomendadas" : "Recommended"}</h2>
        <div className="template-grid">{builtins.map(card)}</div>
      </section>
      <section className="surface template-save" aria-labelledby="save-title">
        <div>
          <h2 id="save-title">
            {es ? "Guarda tu propio horario" : "Save your own schedule"}
          </h2>
          <p className="muted">
            {es
              ? "Conserva sus categorías y tareas como punto de partida."
              : "Keep its categories and tasks as a starting point."}
          </p>
        </div>
        <select
          aria-label={es ? "Horario de origen" : "Source schedule"}
          value={scheduleId}
          onChange={(e) => setScheduleId(e.target.value)}
        >
          {schedules.map((item) => (
            <option value={item.id} key={item.id}>
              {item.emoji} {item.name}
            </option>
          ))}
        </select>
        <input
          aria-label={es ? "Nombre de plantilla" : "Template name"}
          placeholder={es ? "Mi plantilla" : "My template"}
          maxLength={80}
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
        />
        <button
          className="primary"
          disabled={pending || !templateName.trim()}
          onClick={save}
        >
          {es ? "Guardar plantilla" : "Save template"}
        </button>
      </section>
      {personal.length > 0 && (
        <section aria-labelledby="personal-title">
          <h2 id="personal-title">
            {es ? "Tus plantillas" : "Your templates"}
          </h2>
          <div className="template-grid">
            {personal.map((item) => card(personalPreview(item)))}
          </div>
        </section>
      )}
      {preview && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="template-preview-title"
        >
          <section className="modal template-preview">
            <button
              className="modal-close"
              aria-label={es ? "Cerrar" : "Close"}
              onClick={() => setPreview(null)}
            >
              ×
            </button>
            <div className="template-preview-head">
              <span>{preview.emoji}</span>
              <div>
                <p className="eyebrow">{es ? "Vista previa" : "Preview"}</p>
                <h2 id="template-preview-title">{preview.name}</h2>
                <p className="muted">{preview.description}</p>
              </div>
            </div>
            <div className="template-preview-columns">
              <div>
                <h3>{es ? "Categorías" : "Categories"}</h3>
                {preview.categories.map((item) => (
                  <div className="template-item" key={item.key}>
                    <i style={{ background: item.colour }} /> {item.emoji}{" "}
                    {item.name}
                  </div>
                ))}
              </div>
              <div>
                <h3>{es ? "Tareas" : "Tasks"}</h3>
                {preview.tasks.map((item, index) => (
                  <div className="template-item" key={item.title + index}>
                    {item.emoji} {item.title}
                  </div>
                ))}
              </div>
            </div>
            <fieldset className="template-options">
              <legend>{es ? "Qué importar" : "What to import"}</legend>
              <label>
                <input
                  type="checkbox"
                  checked={categories}
                  onChange={(e) => setCategories(e.target.checked)}
                />{" "}
                {es ? "Categorías" : "Categories"}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={tasks}
                  onChange={(e) => setTasks(e.target.checked)}
                />{" "}
                {es ? "Tareas" : "Tasks"}
              </label>
            </fieldset>
            <button
              className="primary"
              disabled={pending || (!categories && !tasks)}
              onClick={runImport}
            >
              {pending
                ? es
                  ? "Importando…"
                  : "Importing…"
                : es
                  ? "Importar selección"
                  : "Import selection"}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
