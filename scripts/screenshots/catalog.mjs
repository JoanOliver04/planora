const make = (number, key, route, title, options = {}) => ({
  id: String(number).padStart(2, "0"),
  key,
  route,
  title,
  locale: "es",
  theme: "light",
  device: "desktop",
  width: 1440,
  height: 1024,
  scale: 2,
  action: "none",
  reason:
    "Tema claro y español para una lectura cercana y consistente del producto.",
  ...options,
});
const en = {
  locale: "en",
  reason:
    "Inglés para presentar el proyecto a una audiencia profesional internacional.",
};
const dark = {
  theme: "dark",
  reason:
    "El tema oscuro refuerza la concentración y permite mostrar el contraste real de la interfaz.",
};
const mobile = {
  device: "mobile",
  width: 390,
  height: 844,
  scale: 3,
  reason:
    "Vista móvil de 390 px, con navegación inferior y controles táctiles reales.",
};

export const scenes = [
  make(1, "landing", "", "Presentación pública, propuesta de valor y CTA", {
    ...en,
    endAt: ".landing-hero",
    height: 960,
    readme: "hero",
    portfolio: true,
    linkedin: true,
  }),
  make(2, "landing", "", "Portada pública en móvil", {
    ...mobile,
    ...en,
    endAt: ".landing-hero",
  }),
  make(3, "landing-cta", "", "CTA final, privacidad y autoría JVOR Studios", {
    action: "landing-cta",
    height: 600,
  }),
  make(4, "today", "today", "Hoy: progreso, horario activo y grupos del día", {
    height: 1120,
    endAt: ".task-group",
    readme: "main",
    portfolio: true,
    linkedin: true,
  }),
  make(
    5,
    "today-global",
    "today",
    "Tareas globales y del horario en una misma jornada",
    {
      action: "today-global",
      crop: ":nth-match(.task-group, 2)",
      height: 1100,
    },
  ),
  make(6, "today-progress", "today", "Progreso semanal en tema oscuro", {
    ...en,
    ...dark,
    height: 1120,
    endAt: ".task-group",
  }),
  make(7, "today", "today", "Hoy móvil: progreso y tareas de la mañana", {
    ...mobile,
    action: "today-mobile",
    height: 920,
    endAt: ".task-group",
    readme: "mobile",
    portfolio: true,
    linkedin: true,
  }),
  make(8, "week", "week", "Semana completa con tareas, hábitos y eventos", {
    width: 1680,
    height: 1100,
    readme: "main",
    portfolio: true,
    linkedin: true,
  }),
  make(9, "week-planner", "week", "Agenda semanal panorámica", {
    ...en,
    width: 1680,
    height: 1120,
  }),
  make(10, "week-dates", "week", "Navegación de fechas en la agenda", {
    action: "week-date",
    height: 1100,
  }),
  make(11, "week", "week", "Selector de días y agenda semanal móvil", {
    ...mobile,
    ...dark,
    height: 920,
    trimUnits: ".week-mobile .mini-task",
    readme: "mobile",
  }),
  make(12, "month", "month", "Calendario mensual con actividad y eventos", {
    height: 1100,
    endAt: ".month-page",
    readme: "extra",
    portfolio: true,
  }),
  make(13, "month", "month", "Mes poblado en tema oscuro e inglés", {
    ...en,
    ...dark,
    height: 1100,
    endAt: ".month-page",
  }),
  make(14, "month", "month", "Calendario mensual en móvil", {
    ...mobile,
    width: 420,
    height: 940,
  }),
  make(
    15,
    "tasks",
    "tasks",
    "Gestión de tareas, búsqueda, filtros y recurrencias",
    {
      height: 1120,
      trimUnits: ".management-list > .sortable-resource",
      readme: "main",
      portfolio: true,
      linkedin: true,
    },
  ),
  make(16, "tasks-recurrence", "tasks", "Variedad de hábitos y recurrencias", {
    ...en,
    action: "tasks-habits",
    height: 1100,
    trimUnits: ".management-list > .sortable-resource",
  }),
  make(
    17,
    "tasks-global",
    "tasks",
    "Hábitos globales independientes del horario",
    { ...dark, action: "tasks-global", height: 1100 },
  ),
  make(
    18,
    "task-editor",
    "tasks",
    "Edición de una tarea con contexto y Enfoque",
    { action: "task-edit", height: 1200, overlay: 1 },
  ),
  make(19, "task-create", "tasks", "Formulario de creación de una tarea", {
    action: "task-create",
    height: 1200,
    overlay: 1,
  }),
  make(20, "tasks", "tasks", "Tareas y filtros en móvil", {
    ...mobile,
    action: "tasks-mobile",
    height: 920,
    trimUnits: ".management-list > .sortable-resource",
  }),
  make(21, "events", "events", "Eventos del proyecto y de la vida personal", {
    height: 1100,
    readme: "extra",
  }),
  make(
    22,
    "event-editor",
    "events",
    "Formulario de un evento con fecha y horario",
    { ...en, action: "event-create", overlay: 1 },
  ),
  make(23, "events", "events", "Eventos en móvil", {
    ...mobile,
    height: 920,
    trimUnits: ".task-list > .task",
  }),
  make(
    24,
    "history",
    "history",
    "Historial con instantáneas y fechas anteriores",
    { height: 1100, trimUnits: ".history-day", readme: "extra" },
  ),
  make(25, "history-detail", "history", "Completados de jornadas anteriores", {
    ...en,
    action: "history-detail",
    height: 1100,
    crop: ":nth-match(.history-day, 3)",
  }),
  make(26, "history", "history", "Historial y categorías en móvil", {
    ...mobile,
    ...dark,
    action: "history-mobile",
    height: 920,
    endAt: ":nth-match(.history-day, 2)",
  }),
  make(
    27,
    "statistics",
    "statistics",
    "Estadísticas de hábitos y progreso real",
    {
      ...en,
      height: 1120,
      endAt: ".statistics > .statistics-split",
      endPadding: 0,
      readme: "main",
      portfolio: true,
      linkedin: true,
    },
  ),
  make(
    28,
    "statistics-detail",
    "statistics",
    "Gráficas, distribución y actividad reciente",
    { ...dark, action: "statistics-detail", height: 1120 },
  ),
  make(29, "statistics", "statistics", "Resumen de estadísticas en móvil", {
    ...mobile,
    height: 920,
    endAt: ".statistics-kpis",
  }),
  make(
    30,
    "schedules",
    "schedules",
    "Horarios para trabajo, aprendizaje y fin de semana",
    { readme: "extra" },
  ),
  make(
    31,
    "categories",
    "categories",
    "Categorías y colores de la biblioteca demo",
    { readme: "extra" },
  ),
  make(32, "schedule-editor", "schedules", "Configuración de un horario", {
    ...en,
    action: "schedule-edit",
    overlay: 1,
  }),
  make(
    33,
    "reminders",
    "reminders",
    "Centro de notificaciones, recordatorios y alarmas",
    {
      action: "reminders-configured",
      height: 1120,
      readme: "main",
      portfolio: true,
    },
  ),
  make(
    34,
    "reminder-editor",
    "reminders",
    "Configuración de un recordatorio relativo",
    { action: "reminder-create", height: 1100 },
  ),
  make(35, "alarms", "reminders", "Alarmas y avisos personalizados", {
    ...en,
    ...dark,
    action: "alarms",
    height: 1100,
  }),
  make(
    36,
    "notification-preferences",
    "reminders",
    "Preferencias y canales de notificación del dispositivo",
    { ...en, action: "notification-preferences", height: 1100 },
  ),
  make(
    37,
    "alarm-editor",
    "reminders",
    "Creación de una alarma con nombre y recurrencia",
    { action: "alarm-create", height: 1100 },
  ),
  make(
    38,
    "settings",
    "settings",
    "Ajustes de apariencia, idioma y personalización",
    { height: 1100, endAt: ".personalization", portfolio: true },
  ),
  make(39, "settings", "settings", "Ajustes y preferencias en modo oscuro", {
    ...en,
    ...dark,
    height: 1100,
    endAt: ".personalization",
  }),
  make(40, "data", "data", "Tus datos: copias, exportación y restauración", {
    ...en,
    height: 1100,
    readme: "extra",
    linkedin: true,
  }),
  make(41, "settings", "settings", "Personalización y ajustes en móvil", {
    ...mobile,
    ...dark,
    action: "settings-mobile",
    height: 920,
    endAt: ".personalization",
    readme: "mobile",
  }),
  make(
    42,
    "focus-intro",
    "focus",
    "Primeros pasos de Enfoque y planes sugeridos",
    {
      emptyFocus: true,
      action: "none",
      crop: ".focus-onboarding",
      height: 1100,
    },
  ),
  make(
    43,
    "focus-home",
    "focus",
    "Enfoque: presets, inicio rápido y resumen semanal",
    {
      ...en,
      height: 1120,
      endAt: ".focus-goal-card",
      endPadding: 4,
      readme: "main",
      portfolio: true,
      linkedin: true,
    },
  ),
  make(
    44,
    "focus-start",
    "focus",
    "Configurador de inicio de una sesión de Enfoque",
    { action: "focus-start", hideGoalHistory: true, height: 1150, overlay: 1 },
  ),
  make(
    45,
    "focus-preset",
    "focus",
    "Configuración de un preset de trabajo profundo",
    {
      ...en,
      action: "focus-preset",
      hideGoalHistory: true,
      height: 1250,
      overlay: 1,
      readme: "extra",
    },
  ),
  make(46, "focus-presets", "focus", "Biblioteca de presets personalizados", {
    ...en,
    ...dark,
    hideGoalHistory: true,
    crop: ".focus-preset-manage",
    action: "focus-presets",
    height: 1100,
  }),
  make(47, "focus-countdown", "focus", "Sesión activa de trabajo profundo", {
    focusMode: "countdown",
    height: 1100,
    readme: "main",
    portfolio: true,
  }),
  make(
    48,
    "focus-stopwatch",
    "focus",
    "Práctica de inglés con cronómetro libre",
    { ...en, ...dark, focusMode: "stopwatch", height: 1100 },
  ),
  make(49, "focus-cycles", "focus", "Ciclos de concentración y descanso", {
    focusMode: "cycles",
    height: 1120,
  }),
  make(
    50,
    "focus-plan",
    "focus",
    "Plan estructurado: bloque actual y siguiente",
    {
      ...en,
      ...dark,
      focusMode: "structured_plan",
      height: 1200,
      readme: "main",
      portfolio: true,
    },
  ),
  make(
    51,
    "focus-blocks",
    "focus",
    "Bloques de programación y avance del plan",
    {
      focusMode: "structured_plan",
      action: "focus-blocks",
      height: 1200,
      linkedin: true,
    },
  ),
  make(
    52,
    "focus-summary",
    "focus",
    "Resumen final y comparación de lo previsto con lo realizado",
    {
      action: "focus-summary",
      focusMode: "summary",
      height: 1200,
      readme: "extra",
      portfolio: true,
    },
  ),
  make(
    53,
    "focus-goals",
    "focus",
    "Objetivos semanales: tiempo, sesiones y días activos",
    { ...en, action: "focus-goals", height: 1120, readme: "extra" },
  ),
  make(
    54,
    "focus-statistics",
    "statistics",
    "Estadísticas de Enfoque con historial suficiente",
    {
      ...en,
      ...dark,
      action: "focus-statistics",
      height: 1120,
      readme: "extra",
    },
  ),
  make(55, "focus-home", "focus", "Inicio de Enfoque en móvil", {
    ...mobile,
    hideGoalHistory: true,
    endAt: ":nth-match(.focus-preset-card, 2)",
    height: 940,
  }),
  make(
    56,
    "focus-active",
    "focus",
    "Sesión activa de Enfoque en móvil oscuro",
    {
      ...mobile,
      ...dark,
      focusMode: "countdown",
      height: 920,
      readme: "mobile",
      portfolio: true,
      linkedin: true,
    },
  ),
  make(57, "focus-summary", "focus", "Resumen de una sesión en móvil", {
    ...mobile,
    focusMode: "summary",
    action: "focus-summary",
    height: 1000,
  }),
  make(58, "summary", "summary", "Resumen de planificación en móvil", {
    ...mobile,
    height: 920,
    endAt: ".summary-section",
  }),
  make(
    59,
    "quick-capture",
    "today",
    "Captura rápida en lenguaje natural con vista previa",
    { action: "quick-capture", height: 1100, endAt: ".task-group" },
  ),
  make(60, "quick-capture", "tasks", "Captura rápida bilingüe en móvil", {
    ...mobile,
    ...en,
    action: "quick-capture",
    crop: ".quick-task",
    height: 920,
  }),
  make(
    61,
    "templates",
    "templates",
    "Plantillas reutilizables para empezar un horario",
    { height: 1100, readme: "extra" },
  ),
  make(62, "search", "search", "Búsqueda global con resultados del workspace", {
    ...en,
    action: "search",
    height: 1100,
    readme: "extra",
  }),
  make(
    63,
    "focus-plan-editor",
    "focus",
    "Editor de un bloque del plan: tipo, duración y transición",
    {
      ...en,
      action: "focus-plan-editor",
      hideGoalHistory: true,
      height: 1200,
      overlay: 1,
    },
  ),
  make(
    64,
    "focus-reflection",
    "focus",
    "Reflexión opcional: nota, energía y siguiente paso",
    {
      ...en,
      action: "focus-summary-review",
      focusMode: "summary",
      height: 1200,
    },
  ),
  make(65, "focus-goals", "focus", "Editor de objetivos semanales en móvil", {
    ...mobile,
    action: "focus-goals",
    height: 1000,
  }),
].map((scene) => ({
  ...scene,
  filename:
    [scene.id, scene.key, scene.device, scene.theme, scene.locale].join("-") +
    ".png",
}));

export function selectScenes(options = {}) {
  const wanted = options.only
    ? options.only.split(",").map((item) => item.trim())
    : [];
  const selected = scenes.filter(
    (scene) =>
      (!wanted.length ||
        wanted.some(
          (item) =>
            scene.id === item.padStart(2, "0") ||
            scene.key === item ||
            scene.filename === item,
        )) &&
      (!options.group ||
        scene.key.startsWith(options.group) ||
        scene.route === options.group) &&
      (!options.device || scene.device === options.device) &&
      (!options.locale || scene.locale === options.locale) &&
      (!options.theme || scene.theme === options.theme),
  );
  if (!selected.length)
    throw new Error(
      "The capture selection is empty. Run --list to inspect the catalog.",
    );
  return selected;
}
