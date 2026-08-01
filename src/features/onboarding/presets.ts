export type OnboardingGoal = "studies" | "work" | "habits" | "personal";
export type OnboardingPreset = {
  goal: OnboardingGoal;
  emoji: string;
  schedule: { es: string; en: string };
  description: { es: string; en: string };
  categories: Array<{ emoji: string; colour: string; es: string; en: string }>;
  accent: string;
};
export const onboardingPresets: Record<OnboardingGoal, OnboardingPreset> = {
  studies: {
    goal: "studies",
    emoji: "📚",
    schedule: { es: "Mi curso", en: "My studies" },
    description: {
      es: "Clases, entregas y sesiones de estudio",
      en: "Classes, deadlines and study sessions",
    },
    categories: [
      { emoji: "📝", colour: "#4F6B45", es: "Estudio", en: "Study" },
      { emoji: "🎓", colour: "#6B5CA5", es: "Clases", en: "Classes" },
    ],
    accent: "#4f6b45",
  },
  work: {
    goal: "work",
    emoji: "💼",
    schedule: { es: "Mi trabajo", en: "My work" },
    description: {
      es: "Prioridades, reuniones y trabajo profundo",
      en: "Priorities, meetings and deep work",
    },
    categories: [
      { emoji: "🎯", colour: "#315F78", es: "Prioridades", en: "Priorities" },
      { emoji: "🤝", colour: "#8A5A44", es: "Reuniones", en: "Meetings" },
    ],
    accent: "#315f78",
  },
  habits: {
    goal: "habits",
    emoji: "🌱",
    schedule: { es: "Mis hábitos", en: "My habits" },
    description: {
      es: "Pequeños pasos que se sostienen en el tiempo",
      en: "Small steps that last over time",
    },
    categories: [
      { emoji: "🏃", colour: "#3F7D58", es: "Movimiento", en: "Movement" },
      { emoji: "🧘", colour: "#7967A8", es: "Bienestar", en: "Wellbeing" },
    ],
    accent: "#3f7d58",
  },
  personal: {
    goal: "personal",
    emoji: "✨",
    schedule: { es: "Mi vida", en: "My life" },
    description: {
      es: "Planes, casa y tiempo para ti",
      en: "Plans, home and time for yourself",
    },
    categories: [
      { emoji: "🏠", colour: "#A06448", es: "Casa", en: "Home" },
      { emoji: "💛", colour: "#A17322", es: "Personal", en: "Personal" },
    ],
    accent: "#a06448",
  },
};
export const getOnboardingPreset = (goal: OnboardingGoal) =>
  onboardingPresets[goal];
