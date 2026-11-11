# Biblioteca visual de Planora

Capturas reales del producto, preparadas localmente a partir del README. No hay imágenes generadas, respuestas simuladas ni cambios en la política CSP.

- Fuente de producto: README, sección Features.
- Commit base de la app: 396a93f51b55badd77ff7a2beaa018f1884916e7; los cambios locales se identifican mediante appDiffSha256 en el manifiesto.
- Fixture: planora-editorial-v4; referencia 2026-11-11, Europe/Madrid.
- Resolución: masters PNG a 2x en escritorio y 3x en móvil. Los detalles de panel conservan su viewport de renderizado y se identifican en el inventario.
- Selecciones listas para revisar: [README](images/readme/), [portfolio](images/portfolio/) y [LinkedIn](images/linkedin/).
- Datos completamente sintéticos. Notificaciones y alarmas muestran configuración real, sin afirmar recepción física.

## Criterio editorial

La historia combina un proyecto de producto, aprendizaje de inglés, programación, piano y bienestar. El horario principal reúne trabajo y hábitos globales; los otros horarios muestran contextos alternativos. El historial, los objetivos y las estadísticas se calculan desde los mismos registros.

Predomina el tema claro en español para planificación y gestión. Inglés en las vistas de presentación y Focus amplía la utilidad profesional. El oscuro se reserva para concentración, preferencias y algunas vistas móviles. Las razones concretas constan en manifest.json.
Los límites de captura se alinean con grupos, tarjetas o paneles completos. Semana usa un formato panorámico; Mes adapta la altura para conservar todas las filas. Las vistas móviles mantienen la barra inferior, excepto el modo de concentración nativo y los detalles de panel identificados como tales.

## Selecciones recomendadas

README: una portada, ocho vistas principales, doce adicionales en un desplegable y cuatro móviles. Las imágenes enlazan al master PNG. Las variantes WebP reducen el peso de lectura en GitHub.

### Portfolio — 14 imágenes

Orden sugerido: producto, planificación, gestión, profundidad de Focus, progreso y experiencia móvil. WebP de hasta 2400 px de ancho; las vistas móviles conservan 1170 px.

1. [01-landing-desktop-light-en.webp](images/portfolio/01-landing-desktop-light-en.webp) — Presentación pública, propuesta de valor y CTA.
2. [04-today-desktop-light-es.webp](images/portfolio/04-today-desktop-light-es.webp) — Hoy: progreso, horario activo y grupos del día.
3. [08-week-desktop-light-es.webp](images/portfolio/08-week-desktop-light-es.webp) — Semana completa con tareas, hábitos y eventos.
4. [15-tasks-desktop-light-es.webp](images/portfolio/15-tasks-desktop-light-es.webp) — Gestión de tareas, búsqueda, filtros y recurrencias.
5. [43-focus-home-desktop-light-en.webp](images/portfolio/43-focus-home-desktop-light-en.webp) — Enfoque: presets, inicio rápido y resumen semanal.
6. [47-focus-countdown-desktop-light-es.webp](images/portfolio/47-focus-countdown-desktop-light-es.webp) — Sesión activa de trabajo profundo.
7. [50-focus-plan-desktop-dark-en.webp](images/portfolio/50-focus-plan-desktop-dark-en.webp) — Plan estructurado: bloque actual y siguiente.
8. [52-focus-summary-desktop-light-es.webp](images/portfolio/52-focus-summary-desktop-light-es.webp) — Resumen final y comparación de lo previsto con lo realizado.
9. [27-statistics-desktop-light-en.webp](images/portfolio/27-statistics-desktop-light-en.webp) — Estadísticas de hábitos y progreso real.
10. [12-month-desktop-light-es.webp](images/portfolio/12-month-desktop-light-es.webp) — Calendario mensual con actividad y eventos.
11. [33-reminders-desktop-light-es.webp](images/portfolio/33-reminders-desktop-light-es.webp) — Centro de notificaciones, recordatorios y alarmas.
12. [07-today-mobile-light-es.webp](images/portfolio/07-today-mobile-light-es.webp) — Hoy móvil: progreso y tareas de la mañana.
13. [56-focus-active-mobile-dark-es.webp](images/portfolio/56-focus-active-mobile-dark-es.webp) — Sesión activa de Enfoque en móvil oscuro.
14. [38-settings-desktop-light-es.webp](images/portfolio/38-settings-desktop-light-es.webp) — Ajustes de apariencia, idioma y personalización.

### LinkedIn — 10 imágenes

Orden sugerido para una publicación o carrusel: visión general, uso diario, Focus, resultados, móvil y control de los datos. PNG de hasta 1600 px de ancho; móviles a 1170 px. No se ha publicado nada.

1. [01-landing-desktop-light-en.png](images/linkedin/01-landing-desktop-light-en.png) — Presentación pública, propuesta de valor y CTA.
2. [04-today-desktop-light-es.png](images/linkedin/04-today-desktop-light-es.png) — Hoy: progreso, horario activo y grupos del día.
3. [08-week-desktop-light-es.png](images/linkedin/08-week-desktop-light-es.png) — Semana completa con tareas, hábitos y eventos.
4. [15-tasks-desktop-light-es.png](images/linkedin/15-tasks-desktop-light-es.png) — Gestión de tareas, búsqueda, filtros y recurrencias.
5. [43-focus-home-desktop-light-en.png](images/linkedin/43-focus-home-desktop-light-en.png) — Enfoque: presets, inicio rápido y resumen semanal.
6. [51-focus-blocks-desktop-light-es.png](images/linkedin/51-focus-blocks-desktop-light-es.png) — Bloques de programación y avance del plan.
7. [27-statistics-desktop-light-en.png](images/linkedin/27-statistics-desktop-light-en.png) — Estadísticas de hábitos y progreso real.
8. [07-today-mobile-light-es.png](images/linkedin/07-today-mobile-light-es.png) — Hoy móvil: progreso y tareas de la mañana.
9. [56-focus-active-mobile-dark-es.png](images/linkedin/56-focus-active-mobile-dark-es.png) — Sesión activa de Enfoque en móvil oscuro.
10. [40-data-desktop-light-en.png](images/linkedin/40-data-desktop-light-en.png) — Tus datos: copias, exportación y restauración.

## Regeneración

Requiere Node.js, Docker, Supabase CLI y Chromium de Playwright. El comando crea un proyecto local exclusivo en puertos 5732x y arranca un build de producción en 3110. No carga credenciales de producción del entorno para sembrar datos.

```powershell
npm run docs:captures -- --list
npm run docs:captures
npm run docs:captures -- --only 04,08,47
npm run docs:captures -- --group focus
npm run docs:captures -- --device mobile
```

SUPABASE_BIN permite indicar la ruta al ejecutable oficial de Supabase. PLAYWRIGHT_BROWSERS_PATH permite reutilizar navegadores instalados. --connect --base-url http://127.0.0.1:3110 reutiliza exclusivamente una instancia local del entorno de captura. --keep-environment conserva sus servicios durante la revisión; --stop-environment cierra únicamente ese entorno. El valor por defecto los cierra al terminar. Un bloqueo de proceso impide reseed simultáneo de las cuentas demo.

El proceso espera hidratación, fuentes, datos, imágenes, ausencia de errores/avisos accidentales y dos frames idénticos. Reintenta cada escena hasta tres veces. Una captura defectuosa no sustituye un master válido. Los diagnósticos quedan fuera de la biblioteca, en .vercel/docs-capture.

```powershell
npm run docs:captures -- --assets-only --update-readme
npm run docs:captures -- --approve all --note 'Revisión visual del set completo'
npm run docs:captures -- --check
```

--approve registra una revisión visual ya realizada, vinculada al hash de cada imagen; no debe usarse como sustituto de mirarlas. Una regeneración invalida la aprobación si cambian los píxeles. --check verifica cobertura, hashes, resoluciones, selecciones, enlaces y aceptación visual sin arrancar servicios.

## Inventario

| Archivo                                                                                                     | Qué muestra                                                 | Viewport CSS                     | Tema  | Idioma | README | Portfolio | LinkedIn |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------- | ----- | ------ | ------ | --------- | -------- |
| [01-landing-desktop-light-en.png](images/01-landing-desktop-light-en.png)                                   | Presentación pública, propuesta de valor y CTA              | 1440×768 @2x                     | light | en     | ✓      | ✓         | ✓        |
| [02-landing-mobile-light-en.png](images/02-landing-mobile-light-en.png)                                     | Portada pública en móvil                                    | 390×1105 @3x                     | light | en     | —      | —         | —        |
| [03-landing-cta-desktop-light-es.png](images/03-landing-cta-desktop-light-es.png)                           | CTA final, privacidad y autoría JVOR Studios                | 1440×600 @2x                     | light | es     | —      | —         | —        |
| [04-today-desktop-light-es.png](images/04-today-desktop-light-es.png)                                       | Hoy: progreso, horario activo y grupos del día              | 1440×1038 @2x                    | light | es     | ✓      | ✓         | ✓        |
| [05-today-global-desktop-light-es.png](images/05-today-global-desktop-light-es.png)                         | Tareas globales y del horario en una misma jornada          | 1440×1100 @2x · detalle de panel | light | es     | —      | —         | —        |
| [06-today-progress-desktop-dark-en.png](images/06-today-progress-desktop-dark-en.png)                       | Progreso semanal en tema oscuro                             | 1440×1038 @2x                    | dark  | en     | —      | —         | —        |
| [07-today-mobile-light-es.png](images/07-today-mobile-light-es.png)                                         | Hoy móvil: progreso y tareas de la mañana                   | 390×880 @3x                      | light | es     | ✓      | ✓         | ✓        |
| [08-week-desktop-light-es.png](images/08-week-desktop-light-es.png)                                         | Semana completa con tareas, hábitos y eventos               | 1680×1100 @2x                    | light | es     | ✓      | ✓         | ✓        |
| [09-week-planner-desktop-light-en.png](images/09-week-planner-desktop-light-en.png)                         | Agenda semanal panorámica                                   | 1680×1120 @2x                    | light | en     | —      | —         | —        |
| [10-week-dates-desktop-light-es.png](images/10-week-dates-desktop-light-es.png)                             | Navegación de fechas en la agenda                           | 1440×1100 @2x                    | light | es     | —      | —         | —        |
| [11-week-mobile-dark-es.png](images/11-week-mobile-dark-es.png)                                             | Selector de días y agenda semanal móvil                     | 390×887 @3x                      | dark  | es     | ✓      | —         | —        |
| [12-month-desktop-light-es.png](images/12-month-desktop-light-es.png)                                       | Calendario mensual con actividad y eventos                  | 1440×1419 @2x                    | light | es     | ✓      | ✓         | —        |
| [13-month-desktop-dark-en.png](images/13-month-desktop-dark-en.png)                                         | Mes poblado en tema oscuro e inglés                         | 1440×1419 @2x                    | dark  | en     | —      | —         | —        |
| [14-month-mobile-light-es.png](images/14-month-mobile-light-es.png)                                         | Calendario mensual en móvil                                 | 420×940 @3x                      | light | es     | —      | —         | —        |
| [15-tasks-desktop-light-es.png](images/15-tasks-desktop-light-es.png)                                       | Gestión de tareas, búsqueda, filtros y recurrencias         | 1440×1085 @2x                    | light | es     | ✓      | ✓         | ✓        |
| [16-tasks-recurrence-desktop-light-en.png](images/16-tasks-recurrence-desktop-light-en.png)                 | Variedad de hábitos y recurrencias                          | 1440×1085 @2x                    | light | en     | —      | —         | —        |
| [17-tasks-global-desktop-dark-es.png](images/17-tasks-global-desktop-dark-es.png)                           | Hábitos globales independientes del horario                 | 1440×1100 @2x                    | dark  | es     | —      | —         | —        |
| [18-task-editor-desktop-light-es.png](images/18-task-editor-desktop-light-es.png)                           | Edición de una tarea con contexto y Enfoque                 | 1440×1200 @2x                    | light | es     | —      | —         | —        |
| [19-task-create-desktop-light-es.png](images/19-task-create-desktop-light-es.png)                           | Formulario de creación de una tarea                         | 1440×1200 @2x                    | light | es     | —      | —         | —        |
| [20-tasks-mobile-light-es.png](images/20-tasks-mobile-light-es.png)                                         | Tareas y filtros en móvil                                   | 390×862 @3x                      | light | es     | —      | —         | —        |
| [21-events-desktop-light-es.png](images/21-events-desktop-light-es.png)                                     | Eventos del proyecto y de la vida personal                  | 1440×1100 @2x                    | light | es     | ✓      | —         | —        |
| [22-event-editor-desktop-light-en.png](images/22-event-editor-desktop-light-en.png)                         | Formulario de un evento con fecha y horario                 | 1440×1024 @2x                    | light | en     | —      | —         | —        |
| [23-events-mobile-light-es.png](images/23-events-mobile-light-es.png)                                       | Eventos en móvil                                            | 390×860 @3x                      | light | es     | —      | —         | —        |
| [24-history-desktop-light-es.png](images/24-history-desktop-light-es.png)                                   | Historial con instantáneas y fechas anteriores              | 1440×970 @2x                     | light | es     | ✓      | —         | —        |
| [25-history-detail-desktop-light-en.png](images/25-history-detail-desktop-light-en.png)                     | Completados de jornadas anteriores                          | 1440×1100 @2x · detalle de panel | light | en     | —      | —         | —        |
| [26-history-mobile-dark-es.png](images/26-history-mobile-dark-es.png)                                       | Historial y categorías en móvil                             | 390×868 @3x                      | dark  | es     | —      | —         | —        |
| [27-statistics-desktop-light-en.png](images/27-statistics-desktop-light-en.png)                             | Estadísticas de hábitos y progreso real                     | 1440×1136 @2x                    | light | en     | ✓      | ✓         | ✓        |
| [28-statistics-detail-desktop-dark-es.png](images/28-statistics-detail-desktop-dark-es.png)                 | Gráficas, distribución y actividad reciente                 | 1440×1120 @2x · detalle de panel | dark  | es     | —      | —         | —        |
| [29-statistics-mobile-light-es.png](images/29-statistics-mobile-light-es.png)                               | Resumen de estadísticas en móvil                            | 390×808 @3x                      | light | es     | —      | —         | —        |
| [30-schedules-desktop-light-es.png](images/30-schedules-desktop-light-es.png)                               | Horarios para trabajo, aprendizaje y fin de semana          | 1440×1024 @2x                    | light | es     | ✓      | —         | —        |
| [31-categories-desktop-light-es.png](images/31-categories-desktop-light-es.png)                             | Categorías y colores de la biblioteca demo                  | 1440×1024 @2x                    | light | es     | ✓      | —         | —        |
| [32-schedule-editor-desktop-light-en.png](images/32-schedule-editor-desktop-light-en.png)                   | Configuración de un horario                                 | 1440×1024 @2x                    | light | en     | —      | —         | —        |
| [33-reminders-desktop-light-es.png](images/33-reminders-desktop-light-es.png)                               | Centro de notificaciones, recordatorios y alarmas           | 1440×1120 @2x · detalle de panel | light | es     | ✓      | ✓         | —        |
| [34-reminder-editor-desktop-light-es.png](images/34-reminder-editor-desktop-light-es.png)                   | Configuración de un recordatorio relativo                   | 1440×1100 @2x · detalle de panel | light | es     | —      | —         | —        |
| [35-alarms-desktop-dark-en.png](images/35-alarms-desktop-dark-en.png)                                       | Alarmas y avisos personalizados                             | 1440×1100 @2x · detalle de panel | dark  | en     | —      | —         | —        |
| [36-notification-preferences-desktop-light-en.png](images/36-notification-preferences-desktop-light-en.png) | Preferencias y canales de notificación del dispositivo      | 1440×1100 @2x · detalle de panel | light | en     | —      | —         | —        |
| [37-alarm-editor-desktop-light-es.png](images/37-alarm-editor-desktop-light-es.png)                         | Creación de una alarma con nombre y recurrencia             | 1440×1100 @2x · detalle de panel | light | es     | —      | —         | —        |
| [38-settings-desktop-light-es.png](images/38-settings-desktop-light-es.png)                                 | Ajustes de apariencia, idioma y personalización             | 1440×1017 @2x                    | light | es     | —      | ✓         | —        |
| [39-settings-desktop-dark-en.png](images/39-settings-desktop-dark-en.png)                                   | Ajustes y preferencias en modo oscuro                       | 1440×1017 @2x                    | dark  | en     | —      | —         | —        |
| [40-data-desktop-light-en.png](images/40-data-desktop-light-en.png)                                         | Tus datos: copias, exportación y restauración               | 1440×1100 @2x                    | light | en     | ✓      | —         | ✓        |
| [41-settings-mobile-dark-es.png](images/41-settings-mobile-dark-es.png)                                     | Personalización y ajustes en móvil                          | 390×859 @3x                      | dark  | es     | ✓      | —         | —        |
| [42-focus-intro-desktop-light-es.png](images/42-focus-intro-desktop-light-es.png)                           | Primeros pasos de Enfoque y planes sugeridos                | 1440×1100 @2x · detalle de panel | light | es     | —      | —         | —        |
| [43-focus-home-desktop-light-en.png](images/43-focus-home-desktop-light-en.png)                             | Enfoque: presets, inicio rápido y resumen semanal           | 1440×908 @2x                     | light | en     | ✓      | ✓         | ✓        |
| [44-focus-start-desktop-light-es.png](images/44-focus-start-desktop-light-es.png)                           | Configurador de inicio de una sesión de Enfoque             | 1440×1150 @2x                    | light | es     | —      | —         | —        |
| [45-focus-preset-desktop-light-en.png](images/45-focus-preset-desktop-light-en.png)                         | Configuración de un preset de trabajo profundo              | 1440×1250 @2x                    | light | en     | ✓      | —         | —        |
| [46-focus-presets-desktop-dark-en.png](images/46-focus-presets-desktop-dark-en.png)                         | Biblioteca de presets personalizados                        | 1440×1100 @2x · detalle de panel | dark  | en     | —      | —         | —        |
| [47-focus-countdown-desktop-light-es.png](images/47-focus-countdown-desktop-light-es.png)                   | Sesión activa de trabajo profundo                           | 1440×1100 @2x                    | light | es     | ✓      | ✓         | —        |
| [48-focus-stopwatch-desktop-dark-en.png](images/48-focus-stopwatch-desktop-dark-en.png)                     | Práctica de inglés con cronómetro libre                     | 1440×1100 @2x                    | dark  | en     | —      | —         | —        |
| [49-focus-cycles-desktop-light-es.png](images/49-focus-cycles-desktop-light-es.png)                         | Ciclos de concentración y descanso                          | 1440×1120 @2x                    | light | es     | —      | —         | —        |
| [50-focus-plan-desktop-dark-en.png](images/50-focus-plan-desktop-dark-en.png)                               | Plan estructurado: bloque actual y siguiente                | 1440×1200 @2x                    | dark  | en     | ✓      | ✓         | —        |
| [51-focus-blocks-desktop-light-es.png](images/51-focus-blocks-desktop-light-es.png)                         | Bloques de programación y avance del plan                   | 1440×1200 @2x · detalle de panel | light | es     | —      | —         | ✓        |
| [52-focus-summary-desktop-light-es.png](images/52-focus-summary-desktop-light-es.png)                       | Resumen final y comparación de lo previsto con lo realizado | 1440×1200 @2x · detalle de panel | light | es     | ✓      | ✓         | —        |
| [53-focus-goals-desktop-light-en.png](images/53-focus-goals-desktop-light-en.png)                           | Objetivos semanales: tiempo, sesiones y días activos        | 1440×1120 @2x · detalle de panel | light | en     | ✓      | —         | —        |
| [54-focus-statistics-desktop-dark-en.png](images/54-focus-statistics-desktop-dark-en.png)                   | Estadísticas de Enfoque con historial suficiente            | 1440×1120 @2x · detalle de panel | dark  | en     | ✓      | —         | —        |
| [55-focus-home-mobile-light-es.png](images/55-focus-home-mobile-light-es.png)                               | Inicio de Enfoque en móvil                                  | 390×858 @3x                      | light | es     | —      | —         | —        |
| [56-focus-active-mobile-dark-es.png](images/56-focus-active-mobile-dark-es.png)                             | Sesión activa de Enfoque en móvil oscuro                    | 390×920 @3x                      | dark  | es     | ✓      | ✓         | ✓        |
| [57-focus-summary-mobile-light-es.png](images/57-focus-summary-mobile-light-es.png)                         | Resumen de una sesión en móvil                              | 390×1000 @3x · detalle de panel  | light | es     | —      | —         | —        |
| [58-summary-mobile-light-es.png](images/58-summary-mobile-light-es.png)                                     | Resumen de planificación en móvil                           | 390×850 @3x                      | light | es     | —      | —         | —        |
| [59-quick-capture-desktop-light-es.png](images/59-quick-capture-desktop-light-es.png)                       | Captura rápida en lenguaje natural con vista previa         | 1440×1226 @2x                    | light | es     | —      | —         | —        |
| [60-quick-capture-mobile-light-en.png](images/60-quick-capture-mobile-light-en.png)                         | Captura rápida bilingüe en móvil                            | 390×920 @3x · detalle de panel   | light | en     | —      | —         | —        |
| [61-templates-desktop-light-es.png](images/61-templates-desktop-light-es.png)                               | Plantillas reutilizables para empezar un horario            | 1440×1100 @2x                    | light | es     | ✓      | —         | —        |
| [62-search-desktop-light-en.png](images/62-search-desktop-light-en.png)                                     | Búsqueda global con resultados del workspace                | 1440×1100 @2x                    | light | en     | ✓      | —         | —        |
| [63-focus-plan-editor-desktop-light-en.png](images/63-focus-plan-editor-desktop-light-en.png)               | Editor de un bloque del plan: tipo, duración y transición   | 1440×1200 @2x · detalle de panel | light | en     | —      | —         | —        |
| [64-focus-reflection-desktop-light-en.png](images/64-focus-reflection-desktop-light-en.png)                 | Reflexión opcional: nota, energía y siguiente paso          | 1440×1200 @2x · detalle de panel | light | en     | —      | —         | —        |
| [65-focus-goals-mobile-light-es.png](images/65-focus-goals-mobile-light-es.png)                             | Editor de objetivos semanales en móvil                      | 390×1000 @3x · detalle de panel  | light | es     | —      | —         | —        |

El inventario completo legible por máquina, los hashes y las comprobaciones están en [manifest.json](images/manifest.json). Las recomendaciones son selecciones editoriales; no publican archivos en ninguna plataforma.

## Incidencias y revisión

Véase [el registro de revisión](images/review.json) para la inspección visual y [las incidencias del proceso](screenshots-incidents.md).
