# Planora Enfoque — Plan de implementación

Documento de auditoría técnica y contrato de producto para integrar **Enfoque / Focus** sin duplicar sistemas ni romper la arquitectura actual.  
Entrega de **Prompt 00** (sin UI final, sin migraciones, sin dependencias nuevas).

---

## 1. Resumen del estado actual relevante

### 1.1 Stack y arquitectura

| Capa       | Realidad actual                                                                       |
| ---------- | ------------------------------------------------------------------------------------- |
| Framework  | Next.js 16 App Router, React 19, TypeScript estricto                                  |
| UI         | Tailwind 4 + CSS tokens en `globals.css`, Lucide, Radix Dialog/AlertDialog, Sonner    |
| i18n       | `next-intl` con locales `es` / `en`, prefix always (`/es/...`, `/en/...`)             |
| Auth       | Google OAuth vía Supabase SSR (`createClient` server/client)                          |
| Datos      | PostgreSQL + RLS en Supabase; Server Actions en `src/app/actions/domain.ts`           |
| Validación | Zod en límites de confianza (`lib/validation/*`, backup, domain actions)              |
| Estado     | Server Components por defecto; client islands (`useWorkspace`, forms, timers futuros) |
| Offline    | Cola local solo para completions (`lib/offline/queue.ts`) + caché de workspace        |
| PWA        | Manifest + `public/sw.js` (shell público; nunca cachea rutas privadas)                |
| Tests      | Vitest (unit/component/SQL-as-text) + Playwright (E2E)                                |

Principio dominante: **PostgreSQL es la autoridad**. La UI deriva estado; no hay “source of truth” en memoria de contadores.

### 1.2 Rutas localizadas y layouts

```
src/app/
  [locale]/
    layout.tsx                 # locale + messages
    page.tsx                   # landing pública
    login/, privacy/, terms/, demo/
    (app)/
      layout.tsx               # auth gate + AppShell + onboarding
      today|week|tasks|events|history|statistics|
      reminders|schedules|categories|templates|
      settings|data|more/
```

- Rutas de producto en **inglés** (`/today`, `/tasks`, …), textos en ES/EN.
- `(app)/layout.tsx` redirige a login si no hay sesión; envuelve con `AppShell`.
- Rutas privadas listadas en `src/lib/security/routes.ts` (`privateSegments`).

### 1.3 Navegación desktop / móvil / Más

Config central: `src/config/navigation.ts`.

| Superficie        | Contenido                                                                          |
| ----------------- | ---------------------------------------------------------------------------------- |
| Desktop sidebar   | 12 destinos ordenados (`desktopOrder` 1–12)                                        |
| Mobile bottom bar | **Exactamente 5**: Today, Week, Tasks, Events, More                                |
| Más               | History, Statistics, Reminders · Schedules, Categories, Templates · Settings, Data |

`isNavigationItemActive("more", …)` marca activo “Más” si la ruta pertenece a `moreNavigationItems`.  
Tests de arquitectura: `tests/navigation-architecture.test.ts`.

### 1.4 Componentes y tokens visuales

- Shell: `app-shell.tsx`, `navigation.tsx`, `workspace-page.tsx`, `workspace-skeleton.tsx`.
- Diálogos: `confirm-dialog.tsx` (Radix AlertDialog).
- Listas ordenables: `sortable-resource-list.tsx` (dnd-kit).
- Tema: `theme-provider.tsx` + preferencias (`accent`, density, radius, reduceMotion).
- Tokens: `--primary` (#4f6b45 por defecto), superficies, shadows, safe-area en CSS.
- Toasts: Sonner vía providers.
- **No hay design-system de botones/cards como librería**; se reutilizan clases CSS globales (`.task`, `.section`, `.dialog-content`, etc.).

### 1.5 Gestión de estado

- Workspace cargado en cliente con `useWorkspace(mode)` → Supabase select + caché offline.
- Mutaciones de dominio vía Server Actions (`domain.ts`) + `revalidatePath("/", "layout")`.
- Demo pública: `features/demo/demo-store.ts` (local, sin auth).
- Completions offline en `localStorage` con flush al recuperar red.
- **No hay store global tipo Redux/Zustand** para el workspace autenticado.

### 1.6 Server Actions, API routes y Supabase

| Mecanismo                   | Uso                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/app/actions/domain.ts` | CRUD schedules/categories/tasks/events, onboarding, templates, reminders, backup restore            |
| `api/account`               | borrado de cuenta (rate-limited, same-origin)                                                       |
| `api/health`                | healthcheck                                                                                         |
| `api/telemetry`             | errores sanitizados, sin contenido de usuario                                                       |
| `auth/callback`             | OAuth                                                                                               |
| RPCs SQL                    | `restore_planora_backup`, `delete_schedule`, `delete_archived_task`, onboarding, templates, reorder |

Patrón de seguridad de mutaciones: `auth()` → Zod parse → ownership vía RLS/FKs compuestas → refresh.

### 1.7 Esquema de base de datos (resumen)

Tablas principales: `profiles`, `schedules`, `categories`, `tasks`, `task_completions`, `events`, `schedule_templates`, `template_imports`, `reminders`.

Patrones de integridad:

- `user_id` + RLS `to authenticated` con `(select auth.uid()) = user_id`.
- `unique(id, user_id)` + **FK compuestas** `(resource_id, user_id)` anti cross-account.
- Snapshots JSONB en completions (inmutables; UPDATE de completions deshabilitado).
- `set_updated_at()` trigger.
- Enums PG en el esquema inicial; columnas posteriores a veces `text` + `CHECK` (p. ej. `tasks.scope`).
- Índice parcial único de ejemplo: un solo `daily_summary` por usuario en reminders.
- Restore atómico: `restore_planora_backup(jsonb)` con advisory lock y límites de cardinalidad.

### 1.8 Modelo de tareas, hábitos e historial

- `task_kind`: `one_time` | `habit`.
- Recurrencia en JSON + tipo; ocurrencias **derivadas** (sin filas futuras).
- Completions por `(task_id, occurrence_date)` con snapshot.
- Scope `schedule` | `global`.
- Archive vs hard-delete (`delete_archived_task` RPC).

### 1.9 Recordatorios, notificaciones, SW y PWA

- Tabla `reminders` (relative, daily_summary, alarm).
- Cliente: `reminder-scheduler.tsx` + preferencias de entrega en `features/reminders/`.
- SW: cache de shell público; notificaciones con navegación restringida a `/es|en/reminders`.
- Limitación honesta del producto: en segundo plano el SO puede suspender la web app; no se promete delivery garantizado.

### 1.10 Offline y reconciliación

- Solo **completions** en cola offline.
- Caché por usuario/modo de workspace.
- Flush con detección de conflictos por `completed_at` más reciente.
- **Enfoque no puede reutilizar ciegamente** esa cola: las transiciones de sesión son multi-paso y con concurrencia.

### 1.11 Exportación / restauración

- Backup schema version 2 (`features/backup/format.ts`): profile, schedules, categories, tasks, events, completions, templates, reminders.
- Export JSON/CSV/ICS en data tools.
- Restore replace-all vía RPC.
- **Enfoque exigirá ampliar schema de backup y la RPC** en una fase posterior (no en Prompt 00/01 UI).

### 1.12 Estadísticas

- Motor puro: `features/statistics/analytics.ts` sobre completions.
- Semana/mes, rachas, categorías, day parts, heatmap.
- Timezone + `week_starts_on` del perfil.
- Enfoque añadirá métricas de **minutos de focus**, no “score de productividad”.

### 1.13 Traducciones

- `src/messages/es.json` y `en.json` con namespaces por área (`Nav`, `More`, `Today`, …).
- Sin textos de producto hardcodeados en UI de features nuevas.

### 1.14 Pruebas

- Unitarias de dominio (recurrence, timezone, validation, security, backup).
- Component tests (RTL).
- Tests de migraciones como **contratos de SQL** (lectura de archivos `.sql`).
- E2E: a11y, app, backup-restore, mobile-navigation.

### 1.15 Convenciones

| Área              | Convención                                               |
| ----------------- | -------------------------------------------------------- |
| Carpetas features | `src/features/<area>/`                                   |
| Validación        | Zod en `lib/validation` o colocalizada                   |
| Rutas app         | `src/app/[locale]/(app)/<route>/page.tsx`                |
| Migraciones       | `supabase/migrations/YYYYMMDDHHMMSS_name.sql`            |
| Tipos             | `src/types/database.ts` (generados / mantenidos en sync) |
| Naming SQL        | snake_case; FKs compuestas; policies por operación       |
| Naming TS         | camelCase en dominio; snake_case al mapear filas         |

---

## 2. Riesgos y dependencias

| Riesgo                                          | Impacto                                      | Mitigación                                                         |
| ----------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| Deriva del timer (setInterval como verdad)      | Tiempos incorrectos tras throttle/suspensión | Solo timestamps + intervalos; ticker UI cosmético                  |
| Doble sesión activa multi-pestaña/dispositivo   | Datos corruptos / UX confusa                 | Índice parcial único + flujo takeover explícito + `revision`       |
| Escritura cada segundo a Supabase               | Coste, race conditions, batería              | Persistir solo transiciones                                        |
| Romper barra móvil (6 tabs)                     | Regresión UX y tests de nav                  | Enfoque en desktop sidebar + Más en móvil                          |
| Cross-user links tarea/sesión                   | Fuga de datos                                | FK compuestas `(task_id, user_id)` etc.                            |
| Borrar tarea y perder historial de focus        | Historial ilegible                           | Snapshots + `ON DELETE SET NULL` en FKs de vínculo                 |
| Backup/restore incompleto                       | Pérdida de datos al restaurar                | Fase dedicada ampliando `BACKUP_SCHEMA_VERSION` y RPC              |
| Offline de transiciones complejas               | Estados divergentes                          | MVP online-first para mutaciones de sesión; cola acotada más tarde |
| Notificaciones de fin de fase en background     | Expectativa falsa                            | Progressive enhancement; documentar límites del navegador          |
| Ampliar `privateSegments` / nav / i18n a medias | Rutas 404 o no protegidas                    | Checklist por fase (routes, nav, messages, tests)                  |
| Enums PG rígidos para estados futuros           | Migraciones dolorosas                        | Preferir `text` + CHECK (como `tasks.scope`) para mode/status/kind |

**Dependencias de producto (ya decididas en `prompts.md`):** tres modos, pausas opcionales, vínculo opcional, no auto-completar tarea por defecto, una sesión activa, sin gamificación, privacidad estricta.

---

## 3. Decisiones de arquitectura recomendadas

1. **Feature module** `src/features/focus/` con dominio puro, validación, mappers y hooks de UI; Server Actions nuevas (o sección en `domain.ts` si se mantiene el monofile — preferible **acciones colocalizadas** `features/focus/actions.ts` con `"use server"` para no hinchar más el archivo actual).
2. **PostgreSQL como autoridad de sesión activa**; cliente reconstruye el reloj.
3. **Tabla de intervalos** para fases reales (focus/break/pause), no un tick por segundo.
4. **Presets y goals como tablas propias**; planes estructurados opcionales como **JSONB validado** en el preset/sesión (sin tabla de segmentos genéricos en v1).
5. **Optimistic concurrency** con columna `revision` (entero monotónico) en `focus_sessions`.
6. **Snapshots JSONB** de tarea/hábito/categoría/horario al iniciar o vincular.
7. **Una sesión activa** = estados `running | paused | on_break` (y opcionalmente `recovery_pending` solo si se demuestra necesario; ver §6).
8. **No Client Component en layout raíz**; solo islas en la feature Focus.
9. **Ruta** `/[locale]/focus` (inglés de path, copy i18n “Enfoque”/“Focus”).
10. **Estadísticas de focus** como funciones puras nuevas; integrar en vista Statistics en fase posterior sin mezclar con completions de tareas.

---

## 4. Rutas propuestas

| Ruta                                  | Propósito                 | Notas                                                                  |
| ------------------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| `/[locale]/focus`                     | Home de Enfoque           | Shell principal                                                        |
| `/[locale]/focus/session/[sessionId]` | Sesión activa / resumen   | Opcional en v1; puede ser query `?session=` o panel en la misma página |
| Deep links internos                   | `?taskId=` / `?presetId=` | Arranque preconfigurado sin rutas nuevas                               |

**No se renombran ni se rompen** URLs existentes.  
Añadir `focus` a `privateSegments` en `lib/security/routes.ts`.

Recomendación v1: **una sola página** `/focus` con estados (empty / active / history partial) y sheets/dialogs para configurar; subrutas solo si la UX lo exige.

---

## 5. Integración de navegación

### Desktop

- Nuevo item `id: "focus"`, `href: "/focus"`, icono Lucide (p. ej. `Timer` o `Focus`).
- `desktopOrder` entre **Tasks (3) y Events (4)** → Focus = 4, y desplazar el resto (+1), **o** insertar como order 3.5 efectivo reordenando a:
  - today 1, week 2, tasks 3, **focus 4**, events 5, …
- Coherente con “actividad diaria”.

### Móvil

- **No** añadir a `mobileOrder` (mantener 5 tabs).
- Añadir a `moreOrder` en grupo **`activity`** (junto a history, statistics, reminders).
- `isNavigationItemActive("more")` ya cubrirá `/focus` si está en `moreNavigationItems`.

### Accesos contextuales (fases posteriores)

- Hoy / Tareas: acción secundaria “Iniciar enfoque” sin saturar cards.

### i18n

- `Nav.focus`, `More.items.focus`, `Page.focus`, namespace `Focus.*`.

---

## 6. Modelo de estados de sesión

### Estados (mínimos, no redundantes)

| Estado      | Significado                                                                         |
| ----------- | ----------------------------------------------------------------------------------- |
| `draft`     | Configurando; **no** cuenta como activa; puede no persistirse o persistirse efímero |
| `running`   | Fase de focus (o stopwatch/countdown) en marcha                                     |
| `paused`    | Tiempo de focus detenido; intervalo de pausa abierto                                |
| `on_break`  | Descanso corto/largo en marcha                                                      |
| `completed` | Cerrada con éxito; historial                                                        |
| `cancelled` | Abortada por el usuario; historial                                                  |

**No se incluye `interrupted` / `recovery_pending` en el modelo persistido v1.**  
La recuperación es un **proceso de lectura** (`recover(session, now)`): si al cargar hay fase vencida, se aplican transiciones deterministas hasta el estado coherente y se persisten. Un estado extra solo añade complejidad sin valor si la recuperación es síncrona al abrir la app.

`draft` en DB es opcional: si el configurador es 100% cliente hasta “Empezar”, el primer insert puede ser ya `running`. Recomendación: **no persistir drafts** en v1 (menos basura y menos índices activos).

### Diagrama de transiciones

```
                    start
        (cliente) ---------> running
                               |  ^
                         pause |  | resume
                               v  |
                             paused
                               |
                    resume / begin_break (según modo)
                               |
        running ----finish_phase----> on_break ----finish_phase----> running
           |              |              |  ^                         |
           |         skip_break          |  | extend_break            |
           |              |              |  |                         |
           +--------------+--------------+--+---- complete/cancel ---> completed
                                                                  \-> cancelled
```

### Transiciones permitidas

| Acción         | Desde                               | Hacia                  | Persistencia                                  |
| -------------- | ----------------------------------- | ---------------------- | --------------------------------------------- |
| `start`        | (ninguna activa)                    | `running`              | insert session + interval focus               |
| `pause`        | `running`                           | `paused`               | cierra interval focus; abre pause             |
| `resume`       | `paused`                            | `running`              | cierra pause; reabre focus                    |
| `begin_break`  | `running` (fin de fase o manual)    | `on_break`             | cierra focus; abre break                      |
| `skip_break`   | `on_break`                          | `running`              | cierra break; abre focus                      |
| `extend_break` | `on_break`                          | `on_break`             | actualiza `planned_end_at` / duración         |
| `finish_phase` | `running` / `on_break`              | siguiente              | cierra interval; abre siguiente o complete    |
| `complete`     | `running` \| `paused` \| `on_break` | `completed`            | cierra abiertos; totales                      |
| `cancel`       | `running` \| `paused` \| `on_break` | `cancelled`            | cierra abiertos                               |
| `recover`      | cualquiera activa                   | recalculado            | 0..n transiciones idempotentes                |
| `takeover`     | conflicto otra pestaña              | activa en este cliente | bump `revision` + metadata de ownership de UI |

Inválidas → error de dominio controlado, sin writes parciales (transacción o single RPC).

### Invariantes

1. Como máximo **una** sesión con estado ∈ {`running`,`paused`,`on_break`} por `user_id`.
2. A lo sumo **un** intervalo abierto (`ended_at is null`) por sesión.
3. Totales de sesión = suma derivable de intervalos cerrados + tramo abierto (no contador mutable independiente sin validación).
4. `revision` incrementa en cada mutación de sesión; update con `where revision = $expected`.
5. Notas / distracciones: privadas; nunca en telemetry.
6. Completar tarea vinculada solo si flag explícito y confirmación de producto.

---

## 7. Modelo de datos propuesto

### 7.1 Tablas

#### `focus_presets`

Presets reutilizables del usuario (incl. “rápidos” 25/50/90/cronómetro como filas seed o defaults de app no necesariamente en DB).

| Columna                        | Tipo               | Notas                                      |
| ------------------------------ | ------------------ | ------------------------------------------ |
| `id`                           | uuid PK            |                                            |
| `user_id`                      | uuid → profiles    | cascade                                    |
| `name`                         | text 1..80         |                                            |
| `mode`                         | text check         | `countdown` \| `stopwatch` \| `cycles`     |
| `focus_duration_sec`           | int null           | obligatorio en countdown/cycles            |
| `short_break_sec`              | int null           |                                            |
| `long_break_sec`               | int null           |                                            |
| `cycles_before_long_break`     | int null           |                                            |
| `target_cycles`                | int null           | null = indefinido                          |
| `auto_start_breaks`            | bool               |                                            |
| `auto_start_focus`             | bool               |                                            |
| `sound_enabled`                | bool               |                                            |
| `vibration_enabled`            | bool               |                                            |
| `notify_on_phase_end`          | bool               |                                            |
| `complete_task_on_session_end` | bool default false |                                            |
| `keep_screen_awake`            | bool               |                                            |
| `prefer_fullscreen`            | bool               |                                            |
| `segments`                     | jsonb default `[]` | plan estructurado opcional validado en app |
| `is_favorite`                  | bool               |                                            |
| `sort_order`                   | int                |                                            |
| `created_at` / `updated_at`    | timestamptz        |                                            |

`unique(id, user_id)`.

#### `focus_sessions`

| Columna                     | Tipo                   | Notas                                                             |
| --------------------------- | ---------------------- | ----------------------------------------------------------------- |
| `id`                        | uuid PK                |                                                                   |
| `user_id`                   | uuid                   |                                                                   |
| `status`                    | text check             | `running` \| `paused` \| `on_break` \| `completed` \| `cancelled` |
| `mode`                      | text check             | `countdown` \| `stopwatch` \| `cycles`                            |
| `title`                     | text null              | intención                                                         |
| `preset_id`                 | uuid null              | SET NULL on delete                                                |
| `task_id`                   | uuid null              | SET NULL; FK compuesta                                            |
| `category_id`               | uuid null              | SET NULL; FK compuesta                                            |
| `schedule_id`               | uuid null              | SET NULL; FK compuesta                                            |
| `occurrence_date`           | date null              | para hábitos                                                      |
| `planned_focus_sec`         | int null               |                                                                   |
| `focus_sec`                 | int not null default 0 | acumulado cerrado (+ se recalcula en app)                         |
| `paused_sec`                | int not null default 0 |                                                                   |
| `break_sec`                 | int not null default 0 |                                                                   |
| `current_phase_kind`        | text null              | `focus` \| `short_break` \| `long_break` \| `pause`               |
| `current_cycle`             | int not null default 1 |                                                                   |
| `config`                    | jsonb                  | snapshot de reglas de la sesión (duraciones, flags)               |
| `link_snapshot`             | jsonb                  | título tarea, emoji, categoría, etc.                              |
| `started_at`                | timestamptz            |                                                                   |
| `ended_at`                  | timestamptz null       |                                                                   |
| `notes`                     | text null              | max length check                                                  |
| `distractions`              | jsonb default `[]`     | notas aparcadas privadas                                          |
| `subjective_focus`          | smallint null          | 1..5 opcional                                                     |
| `subjective_energy`         | smallint null          | 1..5 opcional                                                     |
| `complete_task_on_end`      | bool default false     |                                                                   |
| `task_completion_applied`   | bool default false     |                                                                   |
| `revision`                  | int not null default 1 | optimistic concurrency                                            |
| `created_at` / `updated_at` | timestamptz            |                                                                   |
| `unique(id, user_id)`       |                        |                                                                   |

**Una sesión activa:**

```sql
create unique index focus_sessions_one_active_per_user
  on public.focus_sessions (user_id)
  where status in ('running', 'paused', 'on_break');
```

#### `focus_intervals`

Transiciones reales, no ticks.

| Columna                        | Tipo             | Notas                                               |
| ------------------------------ | ---------------- | --------------------------------------------------- |
| `id`                           | uuid PK          |                                                     |
| `user_id`                      | uuid             |                                                     |
| `session_id`                   | uuid             | FK compuesta cascade                                |
| `kind`                         | text check       | `focus` \| `short_break` \| `long_break` \| `pause` |
| `sequence`                     | int              | orden 0..n                                          |
| `cycle_index`                  | int null         |                                                     |
| `started_at`                   | timestamptz      |                                                     |
| `ended_at`                     | timestamptz null | abierto = en curso                                  |
| `planned_duration_sec`         | int null         |                                                     |
| `unique(session_id, sequence)` |                  |                                                     |

Constraint: `ended_at is null or ended_at >= started_at`.  
Índice parcial: un abierto por sesión:

```sql
create unique index focus_intervals_one_open_per_session
  on public.focus_intervals (session_id)
  where ended_at is null;
```

Duración derivada: `extract(epoch from (coalesce(ended_at, now()) - started_at))` en app; no hace falta columna `duration_sec` mutable (opcional materializar al cerrar para reporting).

#### `focus_goals`

| Columna                     | Tipo          | Notas                                        |
| --------------------------- | ------------- | -------------------------------------------- |
| `id`                        | uuid PK       |                                              |
| `user_id`                   | uuid          |                                              |
| `period`                    | text check    | v1: `weekly`                                 |
| `target_focus_sec`          | int check > 0 |                                              |
| `timezone`                  | text          | ancla de cálculo (o heredar profile al leer) |
| `week_starts_on`            | smallint 0..6 | snapshot de preferencia                      |
| `active`                    | bool          |                                              |
| `created_at` / `updated_at` |               |                                              |

Índice: un goal weekly activo por usuario (parcial unique) si se desea un solo objetivo simultáneo.

### 7.2 Planes estructurados: ¿tabla o JSONB?

**Decisión: JSONB validado (`segments` en preset / `config` en sesión), no tabla de segmentos genéricos en v1.**

Justificación:

- El producto prioriza countdown, stopwatch y cycles clásicos.
- Una tabla de “segmentos plantilla” duplica presets + intervalos de ejecución.
- Zod ya valida JSON en templates, recurrence y backup.
- Si más adelante hay builders complejos, se puede normalizar sin romper historial (los intervalos reales ya están normalizados).

### 7.3 Borrado y retención

| Entidad borrada     | Comportamiento                                    |
| ------------------- | ------------------------------------------------- |
| Task                | `task_id` SET NULL; `link_snapshot` permanece     |
| Category / Schedule | SET NULL en FKs; snapshot preserva nombres        |
| Preset              | SET NULL en `preset_id`; sesión conserva `config` |
| Session             | CASCADE intervals                                 |
| User                | CASCADE todo                                      |

No borrar sesiones al archivar tareas.

### 7.4 Concurrencia

```text
UPDATE focus_sessions
SET status = $new, revision = revision + 1, ...
WHERE id = $id AND user_id = $uid AND revision = $expected
```

0 filas → error `FOCUS_REVISION_CONFLICT` → UI ofrece recargar / takeover.

---

## 8. Estrategia de timer sin deriva

```
elapsed_focus =
  sum(closed intervals where kind=focus) +
  (if open interval kind=focus then now - open.started_at else 0)

remaining_countdown =
  max(0, planned_focus_sec - elapsed_focus)   // por fase o sesión según modo

display = pureFunction(session, intervals, now)
ticker = setInterval(() => setNow(Date.now()), 1000)  // solo re-render
```

- Al `visibilitychange` / `pageshow`: `now = Date.now()` y `recover` si hace falta.
- Nunca `remaining--` como fuente de verdad.
- Persistencia solo en start/pause/resume/phase/complete/cancel/metadata.

---

## 9. Una sola sesión activa

| Capa         | Mecanismo                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------- |
| DB           | unique partial index por user en estados activos                                             |
| App start    | si existe activa → card “Continuar” / conflicto; no insert silencioso                        |
| Multi-device | segundo dispositivo ve la activa al fetch; `takeover` es UX + bump revision, no segunda fila |
| Multi-tab    | misma fila; revision evita lost updates                                                      |

---

## 10. Offline y cross-device

### v1 (recomendado)

- Mutaciones de sesión **online-first** (Server Action / cliente Supabase autenticado).
- Lectura: si offline y hay caché de sesión activa en `localStorage` (clave versionada), mostrar modo solo lectura + “sin conexión”.
- No encolar pause/resume arbitrarios sin reconciliación (riesgo alto).

### v2

- Cola de **comandos de dominio** con `command_id` idempotente y `base_revision`.
- Rechazo de comandos stale; merge solo si el servidor confirma.

Cross-device: Realtime opcional más adelante; v1 con refetch al focus de ventana es suficiente.

---

## 11. Integración con tareas y hábitos

- Vínculo opcional `task_id` + `occurrence_date` + snapshots.
- Al iniciar desde tarea: prefill categoría/horario/emoji.
- Al completar sesión: **no** completar tarea salvo `complete_task_on_end` (preset/sesión) y UI clara.
- Respetar reglas de occurrence existentes (no crear completions inválidas sin confirmación).
- Historial de focus legible si la tarea se archiva o borra.

---

## 12. Integración con notificaciones

- Reutilizar permisos y preferencias de reminders cuando sea posible (flags de sesión: sonido, vibración, notify).
- Fin de fase: Notification API + fallback in-app (Sonner) si la app está visible.
- No inventar push server-side en v1.
- SW: solo ampliar navegación permitida a `/focus` si se envían notifications con click action (fase notificaciones).

---

## 13. Integración con exportación / restauración

Fase dedicada posterior a datos + dominio:

1. Subir `BACKUP_SCHEMA_VERSION` (p. ej. 3).
2. Añadir `focus_presets`, `focus_sessions`, `focus_intervals`, `focus_goals` a Zod backup + límites.
3. Extender `restore_planora_backup`: delete + insert en orden FK-safe (presets → sessions → intervals → goals; o goals independientes).
4. Export CSV opcional de historial de sesiones (minutos, modo, fechas) **sin** forzar notas privadas en exports “compartibles” — o incluirlas solo en JSON completo privado.
5. Tests de parse/restore como los actuales de backup.

**Prompt 01** crea tablas preparadas para esto; no implementa aún el restore.

---

## 14. Plan de pruebas

| Capa               | Qué                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| SQL contract tests | RLS auth.uid pattern, partial unique active session, checks de status/duración, ON DELETE SET NULL, revision |
| Domain unit        | anti-deriva, pause/resume, cycles, skip/extend break, recover, DST/timezone, concurrency conflict            |
| Component          | shell focus, empty state, active card, configurador                                                          |
| Nav architecture   | desktop item, more item, 5 mobile tabs, private route                                                        |
| E2E                | ruta ES/EN, iniciar sesión, recarga, mobile more                                                             |
| Manual             | throttle tab, PWA background, theme light/dark, 320px                                                        |

---

## 15. Orden recomendado de implementación (hitos)

Alineado con `prompts.md`:

| #   | Hito                                            | Prompt              |
| --- | ----------------------------------------------- | ------------------- |
| 0   | Auditoría + este plan                           | 00 ✓                |
| 1   | Migraciones + RLS + tipos                       | 01                  |
| 2   | Dominio TS, Zod, cálculos, actions              | 02                  |
| 3   | Ruta, nav, pantalla principal shell             | 03                  |
| 4   | Configurador e inicio rápido                    | 04                  |
| 5   | Motor timer + recovery                          | 05                  |
| 6   | UI sesión activa + compacta + fullscreen        | 06                  |
| 7   | Descansos y ciclos flexibles                    | 07                  |
| 8   | Vínculo tareas/hábitos                          | 08+                 |
| 9   | Historial, goals, stats, notificaciones, backup | prompts posteriores |

---

## 16. Archivos que probablemente se modificarán por fase

### Fase 0 (este documento)

- `docs/focus-implementation-plan.md` (nuevo)
- `prompts.md` (marcar HECHO cuando se valide)

### Fase 1 — DB

- `supabase/migrations/20XXXXXXXXXXXX_focus_schema.sql` (nuevo)
- `src/types/database.ts`
- `tests/focus-schema.test.ts` (nuevo)

### Fase 2 — Dominio

- `src/features/focus/**` (types, state-machine, time, mappers, errors, actions)
- `src/lib/validation/focus.ts` (o colocalizado)
- `tests/focus-*.test.ts`

### Fase 3 — Nav + shell

- `src/config/navigation.ts`
- `src/lib/security/routes.ts`
- `src/app/[locale]/(app)/focus/page.tsx`
- `src/messages/es.json`, `en.json`
- `src/components/navigation.tsx` (si hay copy/icon edge cases)
- `tests/navigation-architecture.test.ts`, `tests/navigation.test.tsx`

### Fase 4 — Configurador / motor / UI activa

- `src/features/focus/components/**`
- `src/app/globals.css` (tokens focus si hacen falta)
- `src/components/app-shell.tsx` (card compacta global, fase 06)
- E2E bajo `e2e/`

### Fase integración Planora

- `src/features/workspace/task-views.tsx`, Today/Week cards
- `src/features/statistics/**`
- `src/features/backup/format.ts`
- `supabase/migrations/*_focus_backup_restore.sql`
- `src/app/actions/domain.ts` o RPC restore
- `public/sw.js` (si click de notification → focus)

---

## 17. Decisiones abiertas (no bloquean Prompt 01)

1. **¿Persistir `draft` en DB o solo cliente?** → Recomendación: solo cliente.
2. **¿Subruta `/focus/session/[id]` o SPA en `/focus`?** → Recomendación: una página + dialogs en v1.
3. **¿Realtime Supabase para multi-device?** → Diferir; refetch on focus.
4. **¿Goals por categoría o un solo weekly global?** → v1: un weekly global de minutos de focus.
5. **¿Seed de presets del sistema en DB o defaults en código?** → Defaults en código + presets de usuario en DB (menos filas y restore simple).
6. **¿Incluir focus en backup en la misma migración que el schema?** → No; schema primero, backup en fase de datos portables.
7. **Icono exacto Lucide** → decidir en UI (`Timer` vs `CircleDot` vs similar).

---

## 18. Hallazgos principales (auditoría)

1. La arquitectura actual es **ownership-safe** (RLS + FK compuestas) y debe copiarse en Enfoque.
2. La navegación móvil está **fuertemente testada a 5 tabs**; Enfoque entra por Más.
3. Completions offline **no son un patrón genérico** reutilizable tal cual para timers.
4. Backup/restore es un **cuello de botella de feature flags de datos**: toda tabla nueva debe planearse para la RPC.
5. No existe design system de componentes aislados: hay que **reusar CSS/patterns** del workspace.
6. El historial de tareas usa **snapshots** — mismo patrón para vínculos de focus.
7. Hay precedente de **índice parcial único** (daily_summary) para “uno por usuario”.
8. Estadísticas actuales miden completions, no tiempo; Enfoque es una dimensión nueva.
9. Privacidad/telemetry ya exige sanitización; notas de sesión son contenido sensible.
10. Next.js de este repo puede diferir de docs genéricas — leer `node_modules/next/dist/docs/` antes de APIs nuevas.

---

## 19. Arquitectura recomendada (síntesis)

```
UI (RSC page + client islands)
        │
        ▼
Domain (pure time + state machine + Zod)
        │
        ▼
Persistence (Server Actions / Supabase client)
        │
        ▼
PostgreSQL: presets | sessions | intervals | goals
            RLS + partial unique active + revision
```

Timer: **event-sourced por intervalos**, proyección en lectura.  
Producto: flexible (no solo Pomodoro), integrado, privado, una sesión activa.

---

## 20. Riesgos críticos (top)

1. Implementar el reloj con contador mutable.
2. Confiar solo en la UI para unicidad de sesión activa.
3. Romper mobile nav o rutas privadas.
4. Olvidar backup/restore y provocar pérdida en “restaurar”.
5. Auto-completar tareas al terminar focus.
6. Loguear títulos/notas de sesión.

---

_Fin del plan Prompt 00. Siguiente hito ejecutable: Prompt 01 — esquema, migraciones y RLS._
