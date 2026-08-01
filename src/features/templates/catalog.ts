export type TemplateCategory = {
  key: string;
  name: { es: string; en: string };
  colour: string;
  emoji: string;
};
export type TemplateTask = {
  title: { es: string; en: string };
  emoji: string;
  categoryKey: string;
  recurrence: "daily" | "weekdays" | "times_per_week";
  target?: number;
};
export type ScheduleTemplate = {
  id: string;
  emoji: string;
  name: { es: string; en: string };
  description: { es: string; en: string };
  categories: TemplateCategory[];
  tasks: TemplateTask[];
};
const category = (
  key: string,
  es: string,
  en: string,
  colour: string,
  emoji: string,
): TemplateCategory => ({ key, name: { es, en }, colour, emoji });
const task = (
  es: string,
  en: string,
  emoji: string,
  categoryKey: string,
  recurrence: TemplateTask["recurrence"],
  target?: number,
): TemplateTask => ({
  title: { es, en },
  emoji,
  categoryKey,
  recurrence,
  target,
});
export const templateCatalog: ScheduleTemplate[] = [
  {
    id: "studies",
    emoji: "📚",
    name: { es: "Estudios", en: "Studies" },
    description: {
      es: "Clases, repaso y entregas",
      en: "Classes, review and assignments",
    },
    categories: [
      category("class", "Clases", "Classes", "#6B5CA5", "🎓"),
      category("study", "Estudio", "Study", "#4F6B45", "📝"),
    ],
    tasks: [
      task("Revisar apuntes", "Review notes", "📝", "study", "weekdays"),
      task(
        "Planificar entregas",
        "Plan assignments",
        "🗓️",
        "class",
        "times_per_week",
        1,
      ),
    ],
  },
  {
    id: "exercise",
    emoji: "🏃",
    name: { es: "Ejercicio", en: "Exercise" },
    description: {
      es: "Fuerza, cardio y recuperación",
      en: "Strength, cardio and recovery",
    },
    categories: [
      category("training", "Entrenamiento", "Training", "#3F7D58", "💪"),
      category("recovery", "Recuperación", "Recovery", "#54849A", "🧘"),
    ],
    tasks: [
      task("Entrenamiento", "Workout", "🏋️", "training", "times_per_week", 3),
      task("Movilidad", "Mobility", "🧘", "recovery", "daily"),
    ],
  },
  {
    id: "shifts",
    emoji: "🔄",
    name: { es: "Trabajo a turnos", en: "Shift work" },
    description: {
      es: "Energía y rutinas entre turnos",
      en: "Energy and routines around shifts",
    },
    categories: [
      category("work", "Turno", "Shift", "#315F78", "💼"),
      category("rest", "Descanso", "Rest", "#7967A8", "🌙"),
    ],
    tasks: [
      task("Preparar el turno", "Prepare shift", "🎒", "work", "weekdays"),
      task("Desconexión", "Wind down", "🌙", "rest", "daily"),
    ],
  },
  {
    id: "exams",
    emoji: "🎯",
    name: { es: "Exámenes", en: "Exams" },
    description: {
      es: "Repaso progresivo y simulacros",
      en: "Progressive review and mock exams",
    },
    categories: [
      category("review", "Repaso", "Review", "#A17322", "📖"),
      category("practice", "Práctica", "Practice", "#A44F55", "✍️"),
    ],
    tasks: [
      task("Repaso activo", "Active recall", "🧠", "review", "daily"),
      task("Simulacro", "Mock exam", "⏱️", "practice", "times_per_week", 1),
    ],
  },
  {
    id: "wellbeing",
    emoji: "🌿",
    name: { es: "Bienestar", en: "Wellbeing" },
    description: {
      es: "Sueño, calma y autocuidado",
      en: "Sleep, calm and self-care",
    },
    categories: [
      category("mind", "Mente", "Mind", "#7967A8", "🧠"),
      category("care", "Autocuidado", "Self-care", "#B15D7C", "💛"),
    ],
    tasks: [
      task("Pausa consciente", "Mindful pause", "🌬️", "mind", "daily"),
      task("Rutina de sueño", "Sleep routine", "🌙", "care", "daily"),
    ],
  },
  {
    id: "holidays",
    emoji: "🌴",
    name: { es: "Vacaciones", en: "Holidays" },
    description: {
      es: "Preparativos y planes sin estrés",
      en: "Stress-free preparation and plans",
    },
    categories: [
      category("prep", "Preparativos", "Preparation", "#A06448", "🧳"),
      category("plans", "Planes", "Plans", "#3E7F88", "🗺️"),
    ],
    tasks: [
      task(
        "Revisar reservas",
        "Check bookings",
        "🎟️",
        "prep",
        "times_per_week",
        1,
      ),
      task("Plan del día", "Plan the day", "🗺️", "plans", "daily"),
    ],
  },
];
export const getTemplate = (id: string) =>
  templateCatalog.find((item) => item.id === id);
