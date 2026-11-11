import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { fromZonedTime } from "date-fns-tz";

export const TIMEZONE = "Europe/Madrid";
export const FIXTURE_VERSION = "planora-editorial-v4";
const authOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
};
export function dayOffset(day, offset) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
export function localInstant(day, time = "10:24:00") {
  return fromZonedTime(day + "T" + time, TIMEZONE).toISOString();
}
export function currentMadridDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function mondayOf(day) {
  return dayOffset(day, -((new Date(day + "T12:00:00Z").getUTCDay() + 6) % 7));
}
function checked(result, label) {
  if (result.error)
    throw new Error("Fixture " + label + ": " + result.error.message);
  return result.data;
}
const text = (locale, es, en) => (locale === "es" ? es : en);
const id = () => randomUUID();

export async function createFixture(
  environment,
  locale,
  { emptyFocus = false } = {},
) {
  if (environment.api !== "http://127.0.0.1:57321")
    throw new Error(
      "Fixture is restricted to the isolated documentation instance.",
    );
  const admin = createClient(environment.api, environment.service, authOptions);
  const email = emptyFocus
    ? "alex.intro@example.com"
    : locale === "es"
      ? "alex.rivera@example.com"
      : "alex.rivera.studio@example.com";
  const previous = checked(
    await admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    "existing users",
  ).users.find((user) => user.email === email);
  if (previous) {
    if (
      !previous.user_metadata?.capture_fixture?.startsWith(
        "planora-editorial-v",
      )
    )
      throw new Error(
        "Refusing to replace an account not owned by the capture fixture.",
      );
    checked(
      await admin.auth.admin.deleteUser(previous.id),
      "previous owned account cleanup",
    );
  }
  const user = checked(
    await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: "Alex Rivera",
        capture_fixture: FIXTURE_VERSION,
      },
    }),
    "synthetic account",
  ).user;
  try {
    const client = createClient(environment.api, environment.anon, authOptions);
    const link = checked(
      await admin.auth.admin.generateLink({ type: "magiclink", email }),
      "local auth link",
    );
    const verified = checked(
      await client.auth.verifyOtp({
        token_hash: link.properties.hashed_token,
        type: "email",
      }),
      "local authentication",
    );
    const day = currentMadridDate();
    const monday = mondayOf(day);
    const clock = localInstant(day);
    const t = (es, en) => text(locale, es, en);
    const userId = user.id;
    const owned = (row) => ({ id: id(), user_id: userId, ...row });
    const insert = async (table, rows) => {
      if (!rows.length) return [];
      return checked(await client.from(table).insert(rows).select("*"), table);
    };
    const schedules = await insert("schedules", [
      owned({
        name: t("Semana en equilibrio", "A balanced week"),
        emoji: "💼",
        description: t(
          "Trabajo con espacio para lo importante",
          "Meaningful work, with room for life",
        ),
        sort_order: 0,
      }),
      owned({
        name: t("Aprendizaje personal", "Learning space"),
        emoji: "📚",
        description: t(
          "Inglés, programación y curiosidad",
          "English, programming and curiosity",
        ),
        sort_order: 1,
      }),
      owned({
        name: t("Fin de semana", "Weekend rhythm"),
        emoji: "🌿",
        description: t(
          "Piano, salud y proyectos personales",
          "Piano, wellbeing and personal projects",
        ),
        sort_order: 2,
      }),
      owned({
        name: t("Semana creativa", "Creative week"),
        emoji: "🎨",
        description: t(
          "Explorar ideas y cuidar el portfolio",
          "Explore ideas and care for the portfolio",
        ),
        sort_order: 3,
      }),
    ]);
    const categoryData = [
      ["work", t("Proyectos", "Projects"), "💻", "#4f6b45"],
      ["english", t("Inglés", "English"), "🎧", "#326e9b"],
      ["piano", t("Piano", "Piano"), "🎹", "#7b5da3"],
      ["health", t("Salud", "Wellbeing"), "🌿", "#ad644b"],
      ["personal", t("Vida personal", "Personal"), "✨", "#2e7d79"],
      ["learning", t("Aprendizaje", "Learning"), "📚", "#a37932"],
    ];
    const categoryRows = await insert(
      "categories",
      categoryData.map(([, name, emoji, colour], index) =>
        owned({ name, emoji, colour, sort_order: index }),
      ),
    );
    const categories = Object.fromEntries(
      categoryData.map(([key], index) => [key, categoryRows[index]]),
    );
    const segments = [
      {
        name: t("Definir el objetivo", "Define the outcome"),
        emoji: "🎯",
        kind: "focus",
        durationSec: 5 * 60,
        description: t(
          "Aclarar el cambio antes de empezar.",
          "Decide what this change should achieve.",
        ),
        autoAdvance: false,
      },
      {
        name: t("Construir", "Build"),
        emoji: "💻",
        kind: "focus",
        durationSec: 30 * 60,
        description: t(
          "Una mejora concreta, sin interrupciones.",
          "One meaningful improvement, without interruptions.",
        ),
        autoAdvance: false,
      },
      {
        name: t("Pausa consciente", "A mindful break"),
        emoji: "☕",
        kind: "break",
        durationSec: 5 * 60,
        description: null,
        autoAdvance: false,
      },
      {
        name: t("Probar y revisar", "Test and review"),
        emoji: "✅",
        kind: "focus",
        durationSec: 10 * 60,
        description: t(
          "Comprobar el resultado y anotar el siguiente paso.",
          "Check the result and leave a clear next step.",
        ),
        autoAdvance: false,
      },
    ];
    const presetDefaults = {
      auto_start_breaks: false,
      auto_start_focus: false,
      sound_enabled: false,
      vibration_enabled: false,
      notify_on_phase_end: false,
      complete_task_on_session_end: false,
      keep_screen_awake: false,
      prefer_fullscreen: false,
      segments: [],
      is_favorite: false,
    };
    const presetRows = emptyFocus
      ? []
      : await insert("focus_presets", [
          owned({
            ...presetDefaults,
            name: t("Trabajo profundo", "Deep work"),
            emoji: "🎯",
            intention: t(
              "Avanzar en lo que de verdad importa",
              "Make room for meaningful progress",
            ),
            mode: "countdown",
            focus_duration_sec: 50 * 60,
            is_favorite: true,
            sort_order: 0,
            default_category_id: categories.work.id,
          }),
          owned({
            ...presetDefaults,
            name: t("Programación", "Programming"),
            emoji: "💻",
            intention: t(
              "Del objetivo a una mejora probada",
              "From a clear outcome to a tested improvement",
            ),
            mode: "structured_plan",
            focus_duration_sec: null,
            segments,
            is_favorite: true,
            sort_order: 1,
            default_category_id: categories.work.id,
          }),
          owned({
            ...presetDefaults,
            name: t("Inglés sin prisas", "English practice"),
            emoji: "🎧",
            intention: t(
              "Escuchar, hablar y ganar confianza",
              "Listen, speak and build confidence",
            ),
            mode: "stopwatch",
            focus_duration_sec: null,
            is_favorite: true,
            sort_order: 2,
            default_category_id: categories.english.id,
          }),
          owned({
            ...presetDefaults,
            name: t("Ritmo Pomodoro", "Gentle Pomodoro"),
            emoji: "🍅",
            intention: t(
              "Concentración con descansos de verdad",
              "Focused work, with proper breaks",
            ),
            mode: "cycles",
            focus_duration_sec: 25 * 60,
            short_break_sec: 5 * 60,
            long_break_sec: 15 * 60,
            cycles_before_long_break: 4,
            target_cycles: 4,
            sort_order: 3,
            default_category_id: categories.work.id,
          }),
        ]);
    const presets = {
      deep: presetRows[0],
      plan: presetRows[1],
      english: presetRows[2],
      cycles: presetRows[3],
      piano: emptyFocus
        ? null
        : {
            id: null,
            name: t("Práctica de piano", "Piano practice"),
            mode: "countdown",
          },
    };
    const task = (key, title, emoji, category, extra = {}) =>
      owned({
        key,
        title,
        emoji,
        category_id: categories[category].id,
        scope: "schedule",
        schedule_id: schedules[0].id,
        description: null,
        task_kind: "habit",
        recurrence_type: "weekdays",
        recurrence_config: { type: "weekdays", weekdays: [1, 2, 3, 4, 5] },
        start_date: dayOffset(monday, -56),
        end_date: null,
        time_mode: "anytime",
        day_part: null,
        start_time: null,
        end_time: null,
        is_active: true,
        archived_at: null,
        focus_enabled: false,
        sort_order: 0,
        ...extra,
      });
    const taskSeeds = [
      task(
        "inbox",
        t("Elegir las prioridades del día", "Choose today's priorities"),
        "🧭",
        "work",
        { time_mode: "specific_time", start_time: "08:30", sort_order: 0 },
      ),
      task(
        "build",
        t("Construir el panel del proyecto", "Build the project dashboard"),
        "💻",
        "work",
        {
          description: t(
            "Una vista clara del progreso, las próximas entregas y las decisiones del equipo.",
            "A clear view of progress, upcoming milestones and team decisions.",
          ),
          recurrence_type: "daily",
          recurrence_config: { type: "daily" },
          time_mode: "time_range",
          start_time: "09:00",
          end_time: "10:30",
          focus_enabled: true,
          recommended_focus_preset_id: presets.plan?.id ?? null,
          sort_order: 1,
        },
      ),
      task(
        "review",
        t("Revisar la propuesta de diseño", "Review the design proposal"),
        "🎨",
        "work",
        {
          task_kind: "one_time",
          recurrence_type: "once",
          recurrence_config: { type: "once" },
          start_date: day,
          time_mode: "day_part",
          day_part: "afternoon",
          sort_order: 2,
        },
      ),
      task(
        "water",
        t("Empezar el día con agua", "Start the day with water"),
        "💧",
        "health",
        {
          scope: "global",
          schedule_id: null,
          recurrence_type: "daily",
          recurrence_config: { type: "daily" },
          time_mode: "day_part",
          day_part: "morning",
          sort_order: 3,
        },
      ),
      task(
        "english",
        t(
          "Practicar inglés durante 20 minutos",
          "Practise English for 20 minutes",
        ),
        "🎧",
        "english",
        {
          scope: "global",
          schedule_id: null,
          recurrence_type: "daily",
          recurrence_config: { type: "daily" },
          time_mode: "day_part",
          day_part: "afternoon",
          focus_enabled: true,
          recommended_focus_preset_id: presets.english?.id ?? null,
          sort_order: 4,
        },
      ),
      task(
        "walk",
        t("Salir a caminar y despejarme", "Go for a walk and reset"),
        "🌿",
        "health",
        {
          scope: "global",
          schedule_id: null,
          recurrence_type: "daily",
          recurrence_config: { type: "daily" },
          time_mode: "day_part",
          day_part: "afternoon",
          sort_order: 5,
        },
      ),
      task(
        "piano",
        t("Piano: técnica y repertorio", "Piano: technique and repertoire"),
        "🎹",
        "piano",
        {
          scope: "global",
          schedule_id: null,
          recurrence_type: "daily",
          recurrence_config: { type: "daily" },
          time_mode: "day_part",
          day_part: "night",
          focus_enabled: true,
          recommended_focus_preset_id: presets.piano?.id ?? null,
          sort_order: 6,
        },
      ),
      task(
        "gym",
        t("Entrenamiento de fuerza", "Strength training"),
        "🏋️",
        "health",
        {
          scope: "global",
          schedule_id: null,
          recurrence_type: "times_per_week",
          recurrence_config: { type: "times_per_week", target: 3 },
          time_mode: "specific_time",
          start_time: "18:00",
          sort_order: 7,
        },
      ),
      task(
        "release",
        t(
          "Preparar la presentación del proyecto",
          "Prepare the project showcase",
        ),
        "🚀",
        "work",
        {
          task_kind: "one_time",
          recurrence_type: "once",
          recurrence_config: { type: "once" },
          start_date: dayOffset(day, 2),
          focus_enabled: true,
          time_mode: "specific_time",
          start_time: "11:00",
          sort_order: 8,
        },
      ),
      task(
        "docs",
        t("Actualizar la documentación", "Update the documentation"),
        "📝",
        "work",
        {
          recurrence_type: "interval",
          recurrence_config: { type: "interval", every: 2, unit: "week" },
          start_date: dayOffset(monday, -42),
          sort_order: 9,
        },
      ),
      task(
        "reading",
        t("Leer un capítulo con calma", "Read one chapter, unhurried"),
        "📖",
        "learning",
        {
          schedule_id: schedules[1].id,
          recurrence_type: "daily",
          recurrence_config: { type: "daily" },
          focus_enabled: true,
          time_mode: "day_part",
          day_part: "night",
          sort_order: 10,
        },
      ),
      task(
        "algorithms",
        t("Resolver un reto de programación", "Solve a programming challenge"),
        "🧩",
        "learning",
        {
          schedule_id: schedules[1].id,
          recurrence_type: "weekdays",
          recurrence_config: { type: "weekdays", weekdays: [1, 3, 5] },
          focus_enabled: true,
          sort_order: 11,
        },
      ),
      task(
        "english-review",
        t(
          "Repasar el vocabulario de la semana",
          "Review this week's vocabulary",
        ),
        "📚",
        "english",
        {
          schedule_id: schedules[1].id,
          recurrence_type: "times_per_week",
          recurrence_config: { type: "times_per_week", target: 2 },
          sort_order: 12,
        },
      ),
      task(
        "project",
        t("Dar forma a una idea personal", "Make room for a personal project"),
        "✨",
        "personal",
        {
          schedule_id: schedules[2].id,
          recurrence_type: "weekdays",
          recurrence_config: { type: "weekdays", weekdays: [6, 0] },
          focus_enabled: true,
          sort_order: 13,
        },
      ),
      task(
        "week-review",
        t("Planificar la próxima semana", "Plan the week ahead"),
        "🗓️",
        "personal",
        {
          schedule_id: schedules[2].id,
          recurrence_type: "weekdays",
          recurrence_config: { type: "weekdays", weekdays: [0] },
          sort_order: 14,
        },
      ),
    ];
    const shortNames = {
      inbox: t("Prioridades", "Priorities"),
      build: t("Panel web", "Dashboard"),
      review: t("Diseño", "Design"),
      water: t("Beber agua", "Water break"),
      english: t("Inglés", "English"),
      walk: t("Paseo", "Daily walk"),
      piano: t("Piano", "Piano"),
      gym: t("Fuerza", "Strength"),
      release: t("Preparar la demo", "Prepare the showcase"),
      docs: t("Documentar", "Docs"),
    };
    for (const row of taskSeeds)
      if (shortNames[row.key]) row.title = shortNames[row.key];
    const taskRows = await insert(
      "tasks",
      taskSeeds.map((seed) =>
        Object.fromEntries(
          Object.entries(seed).filter(([field]) => field !== "key"),
        ),
      ),
    );
    const tasks = Object.fromEntries(
      taskSeeds.map((row, index) => [row.key, taskRows[index]]),
    );
    const completionRows = [];
    for (let offset = -55; offset <= 0; offset++) {
      const occurrence = dayOffset(day, offset);
      const weekday = new Date(occurrence + "T12:00:00Z").getUTCDay();
      if (weekday === 0 && offset < 0) continue;
      for (const [index, key] of [
        "inbox",
        "build",
        "water",
        "english",
        "walk",
        "piano",
        "reading",
        "algorithms",
        "gym",
      ].entries()) {
        const row = tasks[key];
        const eligible =
          row.recurrence_type === "daily" ||
          (row.recurrence_type === "weekdays" &&
            row.recurrence_config.weekdays.includes(weekday)) ||
          (key === "gym" && [1, 3, 5].includes(weekday));
        if (
          !eligible ||
          (offset === 0 && !["inbox", "water"].includes(key)) ||
          (offset < 0 && (Math.abs(offset) + index * 3) % 9 === 0)
        )
          continue;
        const category = categoryRows.find(
          (item) => item.id === row.category_id,
        );
        completionRows.push(
          owned({
            task_id: row.id,
            occurrence_date: occurrence,
            completed_at: localInstant(
              occurrence,
              offset === 0
                ? key === "water"
                  ? "07:45:00"
                  : "08:40:00"
                : String(9 + index).padStart(2, "0") + ":20:00",
            ),
            task_snapshot: {
              title: row.title,
              emoji: row.emoji,
              category_name: category.name,
              category_colour: category.colour,
              task_kind: row.task_kind,
              schedule_name:
                schedules.find((item) => item.id === row.schedule_id)?.name ??
                null,
            },
          }),
        );
      }
    }
    await insert("task_completions", completionRows);
    const eventSeeds = [
      [
        0,
        "09:30",
        "10:00",
        t("Preparar la semana con el equipo", "Team planning"),
        "🤝",
        "work",
        false,
      ],
      [
        1,
        "16:00",
        "16:45",
        t("Conversación en inglés", "English conversation"),
        "💬",
        "english",
        true,
      ],
      [
        2,
        "11:30",
        "12:15",
        t("Revisión de diseño", "Design review"),
        "🎨",
        "work",
        false,
      ],
      [
        3,
        "15:00",
        "15:45",
        t("Revisar el prototipo", "Prototype walkthrough"),
        "🧩",
        "work",
        false,
      ],
      [
        4,
        "12:00",
        "12:45",
        t("Demo del proyecto", "Project showcase"),
        "🚀",
        "work",
        false,
      ],
      [
        5,
        "10:30",
        "11:30",
        t("Paseo por el parque", "A walk in the park"),
        "🌿",
        "health",
        true,
      ],
      [
        6,
        "18:00",
        "18:30",
        t("Una mirada a la próxima semana", "A look at the week ahead"),
        "🗓️",
        "personal",
        true,
      ],
      [
        10,
        "17:30",
        "18:15",
        t("Clase de piano", "Piano lesson"),
        "🎹",
        "piano",
        true,
      ],
      [
        14,
        "11:00",
        "12:00",
        t("Revisar el portfolio", "Portfolio review"),
        "✨",
        "work",
        false,
      ],
      [
        18,
        "09:00",
        "10:00",
        t("Taller de interfaces accesibles", "Accessible interface workshop"),
        "📚",
        "learning",
        true,
      ],
      [
        22,
        "16:30",
        "17:00",
        t("Entrega de la nueva versión", "New release milestone"),
        "🚀",
        "work",
        false,
      ],
    ];
    const events = await insert(
      "events",
      eventSeeds.map(([offset, start, end, title, emoji, category, global]) =>
        owned({
          title,
          emoji,
          description: t(
            "Un espacio reservado para avanzar con claridad.",
            "A little room to move forward with clarity.",
          ),
          event_date: dayOffset(monday, offset),
          start_time: start,
          end_time: end,
          all_day: false,
          schedule_id: global ? null : schedules[0].id,
          category_id: categories[category].id,
        }),
      ),
    );
    const tomorrow = dayOffset(day, 1);
    const futureEvent =
      events.find((event) => event.event_date >= tomorrow) || events.at(-1);
    await insert("reminders", [
      owned({
        kind: "daily_summary",
        recurrence: "daily",
        time_of_day: "08:30",
        timezone: TIMEZONE,
        next_trigger_at: localInstant(tomorrow, "08:30:00"),
        enabled: true,
      }),
      owned({
        kind: "relative",
        event_id: futureEvent.id,
        minutes_before: 15,
        recurrence: "once",
        timezone: TIMEZONE,
        next_trigger_at: new Date(
          new Date(
            localInstant(futureEvent.event_date, futureEvent.start_time),
          ).getTime() -
            15 * 60_000,
        ).toISOString(),
        enabled: true,
      }),
      owned({
        kind: "relative",
        task_id: tasks.release.id,
        minutes_before: 30,
        recurrence: "once",
        timezone: TIMEZONE,
        next_trigger_at: localInstant(dayOffset(day, 2), "10:30:00"),
        enabled: true,
      }),
      owned({
        kind: "alarm",
        title: t("Pausa para estirar", "Take a stretching break"),
        recurrence: "daily",
        timezone: TIMEZONE,
        next_trigger_at: localInstant(tomorrow, "13:30:00"),
        enabled: true,
      }),
      owned({
        kind: "alarm",
        title: t("Cerrar el día con calma", "Wind down for the evening"),
        recurrence: "weekly",
        timezone: TIMEZONE,
        next_trigger_at: localInstant(tomorrow, "21:00:00"),
        enabled: true,
      }),
    ]);
    const baseConfig = {
      focusDurationSec: 50 * 60,
      shortBreakSec: 5 * 60,
      longBreakSec: 15 * 60,
      cyclesBeforeLongBreak: 4,
      targetCycles: 4,
      autoStartBreaks: false,
      autoStartFocus: false,
      soundEnabled: false,
      vibrationEnabled: false,
      notifyOnPhaseEnd: false,
      completeTaskOnSessionEnd: false,
      keepScreenAwake: false,
      preferFullscreen: false,
      segments: [],
    };
    let historyCount = 0;
    if (!emptyFocus) {
      const sessions = [];
      const intervals = [];
      for (let offset = -48; offset <= 0; offset++) {
        const sessionDay = dayOffset(day, offset);
        const weekday = new Date(sessionDay + "T12:00:00Z").getUTCDay();
        if (weekday === 0 || (weekday === 6 && offset % 2 === 0)) continue;
        const count = offset === 0 ? 1 : offset % 3 === 0 ? 2 : 1;
        for (let index = 0; index < count; index++) {
          const key =
            offset === 0
              ? "deep"
              : ["deep", "english", "piano"][
                  (Math.abs(offset) * 2 + index) % 3
                ];
          const preset = presets[key];
          const category =
            key === "english"
              ? categories.english
              : key === "piano"
                ? categories.piano
                : categories.work;
          const minutes = key === "deep" ? 45 : key === "english" ? 25 : 30;
          const started = localInstant(
            sessionDay,
            offset === 0 ? "08:45:00" : index === 0 ? "09:00:00" : "16:00:00",
          );
          const ended = new Date(
            new Date(started).getTime() + minutes * 60_000,
          ).toISOString();
          const sessionId = id();
          sessions.push(
            owned({
              id: sessionId,
              status:
                offset < 0 && offset % 17 === 0 ? "cancelled" : "completed",
              mode: preset.mode,
              title:
                key === "deep"
                  ? t(
                      "Una mejora en el panel del proyecto",
                      "A thoughtful dashboard improvement",
                    )
                  : preset.name,
              preset_id: preset.id,
              task_id:
                key === "deep"
                  ? tasks.build.id
                  : key === "english"
                    ? tasks.english.id
                    : tasks.piano.id,
              category_id: category.id,
              schedule_id: key === "deep" ? schedules[0].id : null,
              occurrence_date: sessionDay,
              planned_focus_sec: minutes * 60,
              focus_sec: minutes * 60,
              break_sec: 0,
              paused_sec: 0,
              current_phase_kind: null,
              current_cycle: 1,
              config: { ...baseConfig, focusDurationSec: minutes * 60 },
              link_snapshot: {
                taskTitle: key === "deep" ? tasks.build.title : preset.name,
                categoryName: category.name,
                categoryColour: category.colour,
                scheduleName: schedules[0].name,
                outcome: "progress",
                nextStep: t(
                  "Continuar con una mejora pequeña y concreta.",
                  "Continue with one small, meaningful improvement.",
                ),
              },
              started_at: started,
              ended_at: ended,
              revision: 2,
              distractions: [],
              subjective_focus: 4,
              subjective_energy: 4,
              notes: t(
                "Un bloque tranquilo, con un siguiente paso claro.",
                "A calm session, with a clear next step.",
              ),
            }),
          );
          intervals.push(
            owned({
              session_id: sessionId,
              kind: "focus",
              sequence: 0,
              cycle_index: 1,
              started_at: started,
              ended_at: ended,
              planned_duration_sec: minutes * 60,
            }),
          );
        }
      }
      await insert("focus_sessions", sessions);
      await insert("focus_intervals", intervals);
      historyCount = sessions.length;
      await insert("focus_goals", [
        owned({
          period: "weekly",
          target_focus_sec: 360 * 60,
          metric: "focus_seconds",
          target_value: 360 * 60,
          scope: "global",
          start_date: dayOffset(monday, -56),
          considered_days: [1, 2, 3, 4, 5],
          is_primary: true,
          sort_order: 0,
          timezone: TIMEZONE,
          week_starts_on: 1,
          active: true,
        }),
        owned({
          period: "weekly",
          target_focus_sec: 3,
          metric: "sessions",
          target_value: 3,
          scope: "category",
          category_id: categories.english.id,
          start_date: dayOffset(monday, -56),
          considered_days: [1, 2, 3, 4, 5, 6],
          is_primary: false,
          sort_order: 1,
          timezone: TIMEZONE,
          week_starts_on: 1,
          active: true,
        }),
        owned({
          period: "weekly",
          target_focus_sec: 3,
          metric: "active_days",
          target_value: 3,
          scope: "category",
          category_id: categories.piano.id,
          start_date: dayOffset(monday, -56),
          considered_days: [1, 2, 3, 4, 5, 6],
          is_primary: false,
          sort_order: 2,
          timezone: TIMEZONE,
          week_starts_on: 1,
          active: true,
        }),
      ]);
    }
    const preferences = {
      accent: "#4f6b45",
      density: "comfortable",
      fontScale: 100,
      radius: "soft",
      reduceMotion: true,
      showCompleted: true,
      focus: {
        defaultMode: "countdown",
        defaultPresetId: presets.deep?.id ?? null,
        askIntentionOnStart: false,
        askReviewOnEnd: true,
        completeTaskOnEndDefault: false,
        timerDisplay: "large",
        homeLanding: "start",
        showWeeklyGoal: true,
        goalWeekdaysOnly: false,
      },
    };
    checked(
      await client
        .from("profiles")
        .update({
          display_name: "Alex Rivera",
          avatar_url: null,
          locale,
          timezone: TIMEZONE,
          theme: "light",
          week_starts_on: 1,
          active_schedule_id: schedules[0].id,
          onboarding_completed: true,
          preferences,
        })
        .eq("id", userId),
      "profile",
    );
    const jar = [];
    const ssr = createServerClient(environment.api, environment.anon, {
      cookies: {
        getAll: () => jar,
        setAll(values) {
          for (const value of values) {
            const index = jar.findIndex((item) => item.name === value.name);
            if (index >= 0) jar.splice(index, 1);
            jar.push({ name: value.name, value: value.value });
          }
        },
      },
    });
    checked(await ssr.auth.setSession(verified.session), "SSR session");
    const ephemeral = new Set();
    return {
      locale,
      day,
      monday,
      clock,
      email,
      userId,
      admin,
      client,
      tasks,
      schedules,
      categories,
      presets,
      segments,
      preferences,
      counts: {
        schedules: schedules.length,
        categories: categoryRows.length,
        tasks: taskRows.length,
        events: events.length,
        completions: completionRows.length,
        focusSessions: historyCount,
        focusPresets: presetRows.length,
      },
      cookies: jar.map((item) => ({ ...item, url: environment.base })),
      async configure(theme, scene = {}) {
        const scenePreferences = scene.hideGoalHistory
          ? {
              ...preferences,
              focus: { ...preferences.focus, showWeeklyGoal: false },
            }
          : preferences;
        checked(
          await client
            .from("profiles")
            .update({ theme, locale, preferences: scenePreferences })
            .eq("id", userId),
          "theme",
        );
      },
      async active(mode, timestamp = clock) {
        const structured = mode === "structured_plan" || mode === "summary";
        const preset =
          mode === "stopwatch"
            ? presets.english
            : mode === "cycles"
              ? presets.cycles
              : structured
                ? presets.plan
                : presets.deep;
        const summary = mode === "summary";
        const wall = summary ? Date.now() : new Date(timestamp).getTime();
        const sessionId = id();
        const elapsed = summary
          ? 7 * 60
          : mode === "stopwatch"
            ? 12 * 60 + 40
            : structured
              ? 14 * 60 + 20
              : 18 * 60 + 30;
        const previous = summary
          ? [10 * 60, 18 * 60]
          : structured
            ? [5 * 60]
            : mode === "cycles"
              ? [25 * 60, 5 * 60]
              : [];
        const sum = previous.reduce((a, b) => a + b, 0);
        const start = wall - (sum + elapsed) * 1000;
        let cursor = start;
        const intervals = previous.map((duration, index) => {
          const row = owned({
            session_id: sessionId,
            kind: mode === "cycles" && index === 1 ? "short_break" : "focus",
            sequence: index,
            cycle_index: 1,
            started_at: new Date(cursor).toISOString(),
            ended_at: new Date(cursor + duration * 1000).toISOString(),
            planned_duration_sec: duration,
          });
          cursor += duration * 1000;
          return row;
        });
        const summarySegments = [
          {
            name: t("Definir", "Define"),
            kind: "focus",
            durationSec: 15 * 60,
            autoAdvance: false,
            emoji: "🎯",
            description: null,
          },
          {
            name: t("Construir", "Build"),
            kind: "focus",
            durationSec: 15 * 60,
            autoAdvance: false,
            emoji: "💻",
            description: null,
          },
          {
            name: t("Revisar", "Review"),
            kind: "focus",
            durationSec: 15 * 60,
            autoAdvance: false,
            emoji: "✅",
            description: null,
          },
        ];
        const sessionSegments = summary
          ? summarySegments
          : structured
            ? segments
            : [];
        const plannedPhase = summary
          ? 15 * 60
          : structured
            ? 30 * 60
            : mode === "cycles"
              ? 25 * 60
              : mode === "stopwatch"
                ? null
                : 50 * 60;
        const currentCycle = structured
          ? previous.length + 1
          : mode === "cycles"
            ? 2
            : 1;
        intervals.push(
          owned({
            session_id: sessionId,
            kind: "focus",
            sequence: previous.length,
            cycle_index: currentCycle,
            started_at: new Date(cursor).toISOString(),
            ended_at: null,
            planned_duration_sec: plannedPhase,
          }),
        );
        await insert("focus_sessions", [
          owned({
            id: sessionId,
            status: "running",
            mode: structured ? "structured_plan" : mode,
            title: summary
              ? t(
                  "Dar forma al panel del proyecto",
                  "A clearer project dashboard",
                )
              : preset.name,
            preset_id: preset.id,
            task_id: mode === "stopwatch" ? tasks.english.id : tasks.build.id,
            category_id:
              mode === "stopwatch" ? categories.english.id : categories.work.id,
            schedule_id: schedules[0].id,
            occurrence_date: day,
            planned_focus_sec:
              mode === "stopwatch"
                ? null
                : structured
                  ? 45 * 60
                  : mode === "cycles"
                    ? 100 * 60
                    : 50 * 60,
            focus_sec: mode === "cycles" ? 25 * 60 : sum,
            paused_sec: 0,
            break_sec: mode === "cycles" ? 5 * 60 : 0,
            current_phase_kind: "focus",
            current_cycle: currentCycle,
            config: {
              ...baseConfig,
              focusDurationSec: plannedPhase,
              segments: sessionSegments,
            },
            link_snapshot: {
              taskTitle:
                mode === "stopwatch" ? tasks.english.title : tasks.build.title,
              taskEmoji: mode === "stopwatch" ? "🎧" : "💻",
              categoryName:
                mode === "stopwatch"
                  ? categories.english.name
                  : categories.work.name,
              categoryColour:
                mode === "stopwatch"
                  ? categories.english.colour
                  : categories.work.colour,
              scheduleName: schedules[0].name,
            },
            started_at: new Date(start).toISOString(),
            ended_at: null,
            revision: 1,
            distractions: [],
            notes: summary
              ? t(
                  "Una mejora terminada y un siguiente paso claro.",
                  "A meaningful improvement, and a clear next step.",
                )
              : null,
          }),
        ]);
        await insert("focus_intervals", intervals);
        ephemeral.add(sessionId);
        return { id: sessionId, clock: new Date(wall).toISOString() };
      },
      async clearEphemeral() {
        for (const sessionId of ephemeral)
          checked(
            await client
              .from("focus_sessions")
              .delete()
              .eq("id", sessionId)
              .eq("user_id", userId),
            "scene session cleanup",
          );
        ephemeral.clear();
      },
      async close() {
        checked(
          await admin.auth.admin.deleteUser(userId),
          "synthetic account cleanup",
        );
      },
    };
  } catch (error) {
    checked(
      await admin.auth.admin.deleteUser(user.id),
      "failed fixture cleanup",
    );
    throw error;
  }
}

export async function cleanupFixtureAccounts(environment) {
  if (environment.api !== "http://127.0.0.1:57321")
    throw new Error(
      "Cleanup is restricted to the isolated documentation instance.",
    );
  const admin = createClient(environment.api, environment.service, authOptions);
  const ownedEmails = new Set([
    "alex.morgan@example.com",
    "alex.rivera@example.com",
    "alex.rivera.studio@example.com",
    "alex.intro@example.com",
  ]);
  const users = checked(
    await admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    "fixture cleanup inventory",
  ).users;
  for (const user of users) {
    if (
      ownedEmails.has(user.email) &&
      user.user_metadata?.capture_fixture?.startsWith("planora-editorial-v")
    ) {
      checked(
        await admin.auth.admin.deleteUser(user.id),
        "stale owned fixture cleanup",
      );
    }
  }
}
