"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeGuidedOnboarding } from "@/app/actions/domain";
import {
  getOnboardingPreset,
  onboardingPresets,
  type OnboardingGoal,
} from "./presets";

type Draft = {
  step: 0 | 1 | 2;
  goal: OnboardingGoal;
  name: string;
  weekStart: 0 | 1;
  accent: string;
  tour: number;
};
const storageKey = "planora-onboarding-v1";

export function GuidedOnboarding({ locale }: { locale: "es" | "en" }) {
  const es = locale === "es";
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>({
    step: 0,
    goal: "personal",
    name: onboardingPresets.personal.schedule[locale],
    weekStart: 1,
    accent: onboardingPresets.personal.accent,
    tour: 0,
  });
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) setDraft(JSON.parse(stored) as Draft);
      } catch {
        localStorage.removeItem(storageKey);
      }
      setReady(true);
    });
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem(storageKey, JSON.stringify(draft));
  }, [draft, ready]);

  function choose(goal: OnboardingGoal) {
    const preset = getOnboardingPreset(goal);
    setDraft((value) => ({
      ...value,
      goal,
      name: preset.schedule[locale],
      accent: preset.accent,
    }));
  }
  function complete(skip = false) {
    setError("");
    startTransition(async () => {
      try {
        await completeGuidedOnboarding({
          goal: draft.goal,
          scheduleName: skip ? (es ? "Mi horario" : "My schedule") : draft.name,
          timezone:
            Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Madrid",
          weekStart: draft.weekStart,
          accent: draft.accent,
          skip,
        });
        localStorage.removeItem(storageKey);
        setVisible(false);
        router.refresh();
      } catch {
        setError(
          es
            ? "No se pudo guardar. Tus elecciones siguen aquí para reintentarlo."
            : "Could not save. Your choices are still here so you can retry.",
        );
      }
    });
  }
  if (!ready || !visible) return null;

  const preset = getOnboardingPreset(draft.goal);
  const tour = es
    ? [
        [
          "Hoy primero",
          "Completa tareas y céntrate en lo que toca ahora.",
          "✓",
        ],
        [
          "Tu semana completa",
          "Detecta carga y huecos desde la vista Semana.",
          "7",
        ],
        [
          "Siempre adaptable",
          "Cambia horarios, aspecto y categorías en Ajustes.",
          "⚙",
        ],
      ]
    : [
        ["Today first", "Complete tasks and focus on what matters now.", "✓"],
        [
          "Your whole week",
          "Spot workload and free space from Week view.",
          "7",
        ],
        [
          "Always adaptable",
          "Change schedules, appearance and categories in Settings.",
          "⚙",
        ],
      ];
  return (
    <div
      className="guided-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guided-title"
    >
      <section className="guided-card">
        <div className="guided-steps" aria-label={es ? "Progreso" : "Progress"}>
          {[0, 1, 2].map((step) => (
            <span key={step} data-active={draft.step === step} />
          ))}
        </div>
        <button
          className="guided-skip"
          onClick={() => complete(true)}
          disabled={pending}
        >
          {es ? "Omitir" : "Skip"}
        </button>
        {draft.step === 0 && (
          <>
            <p className="eyebrow">
              {es ? "Empecemos por ti" : "Let's start with you"}
            </p>
            <h1 id="guided-title">
              {es ? "¿Qué quieres organizar?" : "What do you want to organize?"}
            </h1>
            <p className="muted">
              {es
                ? "Te recomendaremos un punto de partida que podrás cambiar cuando quieras."
                : "We'll recommend a starting point you can change at any time."}
            </p>
            <div className="guided-goals">
              {Object.values(onboardingPresets).map((option) => (
                <button
                  key={option.goal}
                  data-selected={draft.goal === option.goal}
                  onClick={() => choose(option.goal)}
                >
                  <span>{option.emoji}</span>
                  <strong>{option.schedule[locale]}</strong>
                  <small>{option.description[locale]}</small>
                </button>
              ))}
            </div>
            <button
              className="primary guided-next"
              onClick={() => setDraft((v) => ({ ...v, step: 1 }))}
            >
              {es ? "Personalizar mi espacio" : "Customize my space"} →
            </button>
          </>
        )}
        {draft.step === 1 && (
          <>
            <p className="eyebrow">
              {es ? "Plantilla recomendada" : "Recommended template"}
            </p>
            <h1 id="guided-title">
              {preset.emoji} {es ? "Hazlo tuyo" : "Make it yours"}
            </h1>
            <div className="guided-fields">
              <label>
                {es ? "Nombre del horario" : "Schedule name"}
                <input
                  value={draft.name}
                  maxLength={80}
                  onChange={(e) =>
                    setDraft((v) => ({ ...v, name: e.target.value }))
                  }
                />
              </label>
              <label>
                {es ? "La semana empieza el" : "Week starts on"}
                <select
                  value={draft.weekStart}
                  onChange={(e) =>
                    setDraft((v) => ({
                      ...v,
                      weekStart: Number(e.target.value) as 0 | 1,
                    }))
                  }
                >
                  <option value={1}>{es ? "Lunes" : "Monday"}</option>
                  <option value={0}>{es ? "Domingo" : "Sunday"}</option>
                </select>
              </label>
              <label>
                {es ? "Color principal" : "Accent color"}
                <input
                  type="color"
                  value={draft.accent}
                  onChange={(e) =>
                    setDraft((v) => ({ ...v, accent: e.target.value }))
                  }
                />
              </label>
            </div>
            <div className="guided-recommendation">
              <span>{preset.emoji}</span>
              <div>
                <strong>{preset.schedule[locale]}</strong>
                <p>{preset.description[locale]}</p>
              </div>
            </div>
            <div className="guided-actions">
              <button
                className="secondary"
                onClick={() => setDraft((v) => ({ ...v, step: 0 }))}
              >
                {es ? "Atrás" : "Back"}
              </button>
              <button
                className="primary"
                disabled={!draft.name.trim()}
                onClick={() => setDraft((v) => ({ ...v, step: 2 }))}
              >
                {es ? "Ver guía rápida" : "See quick tour"} →
              </button>
            </div>
          </>
        )}
        {draft.step === 2 && (
          <>
            <p className="eyebrow">
              {es ? "Consejo " : "Tip "}
              {draft.tour + 1} / 3
            </p>
            <div className="guided-tour-icon" aria-hidden="true">
              {tour[draft.tour][2]}
            </div>
            <h1 id="guided-title">{tour[draft.tour][0]}</h1>
            <p className="guided-tour-copy">{tour[draft.tour][1]}</p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="guided-actions">
              <button
                className="secondary"
                onClick={() =>
                  setDraft((v) => ({
                    ...v,
                    step: v.tour === 0 ? 1 : 2,
                    tour: Math.max(0, v.tour - 1),
                  }))
                }
              >
                {es ? "Atrás" : "Back"}
              </button>
              {draft.tour < 2 ? (
                <button
                  className="primary"
                  onClick={() => setDraft((v) => ({ ...v, tour: v.tour + 1 }))}
                >
                  {es ? "Siguiente" : "Next"} →
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={pending}
                  onClick={() => complete()}
                >
                  {pending
                    ? es
                      ? "Preparando…"
                      : "Preparing…"
                    : es
                      ? "Entrar en Planora"
                      : "Enter Planora"}
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
