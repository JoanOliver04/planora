# Planora Enfoque — Prompts de implementación

Este documento divide el desarrollo de **Planora Enfoque** en entregas pequeñas, verificables y seguras. La idea no es añadir un Pomodoro aislado, sino construir un sistema de concentración flexible conectado con tareas, hábitos, horarios, categorías, historial, estadísticas, notificaciones, PWA, exportación y restauración.

## Visión del producto

**Nombre en español:** Enfoque  
**Nombre en inglés:** Focus

Planora Enfoque debe servir para estudiar programación, inglés, piano, preparar exámenes, leer, trabajar o practicar cualquier habilidad. Debe permitir desde una sesión rápida de 15 minutos hasta una sesión estructurada de 90 minutos con varios bloques.

Principios:

- Flexible, no dogmático: Pomodoro es una opción, no la única forma de trabajar.
- Personalizable sin resultar complicado.
- Integrado con el resto de Planora.
- Útil desde el primer minuto, pero profundo para quien quiera configurarlo.
- Fiable ante recargas, segundo plano, cierres, pérdida de conexión y cambio de dispositivo.
- Privado: nunca enviar contenido personal a analítica ni logs.
- Sin gamificación agresiva, culpa ni puntuaciones opacas de “productividad”.
- Mobile-first, accesible y excelente en tema claro y oscuro.

## Decisiones de producto que no deben cambiarse sin una razón técnica fuerte

1. Habrá tres modos principales:
   - Temporizador con cuenta atrás.
   - Cronómetro libre.
   - Ciclos de enfoque y descanso.

2. Las pausas y descansos serán opcionales. El usuario podrá saltarlos, ampliarlos o desactivar el inicio automático.

3. Una sesión podrá vincularse a una tarea o hábito, pero también iniciarse sin vínculo.

4. Finalizar una sesión no completará automáticamente una tarea o hábito salvo que el usuario lo haya configurado explícitamente y se le muestre claramente.

5. La aplicación no escribirá en la base de datos cada segundo. El tiempo se reconstruirá a partir de marcas temporales y transiciones de estado.

6. Solo podrá existir una sesión activa por usuario. Si otra pestaña o dispositivo intenta iniciar una segunda, deberá resolverse el conflicto de forma explícita.

7. En móvil se mantendrán como máximo cinco destinos en la barra inferior. Enfoque tendrá acceso desde “Más” y accesos rápidos contextuales desde Hoy, Tareas y otras vistas apropiadas.

8. Las notas de sesión y las “distracciones aparcadas” se considerarán contenido privado.

9. Las estadísticas mostrarán datos comprensibles y verificables. No se creará un “score de productividad” arbitrario.

10. No se implementarán todavía tutor de IA, flashcards, cursos, corrección automática de código ni reconocimiento musical.

## Instrucciones comunes para todos los prompts

Estas reglas se aplican a cada entrega:

- Inspecciona el repositorio antes de modificar nada.
- Respeta la arquitectura, convenciones y componentes existentes.
- Next.js App Router y Server Components por defecto.
- Usa Client Components solo donde haya interacción real.
- Mantén TypeScript estricto y no uses `any`.
- No introduzcas textos visibles hardcodeados; usa next-intl en español e inglés.
- Reutiliza Tailwind, Radix UI, Lucide y los tokens de diseño actuales.
- No añadas dependencias salvo necesidad real y justificada.
- Mantén compatibilidad con tema claro, oscuro y sistema.
- Mantén accesibilidad WCAG AA, teclado, foco visible y áreas táctiles mínimas de 44×44 px.
- No rompas PWA, offline queue, autenticación, RLS, exportación, restauración ni rutas existentes.
- No expongas nombres de tareas, notas, correos, UUID, sesiones o datos personales en logs.
- No prometas capacidades que el navegador no puede garantizar en segundo plano.
- Añade pruebas proporcionales a la entrega.
- Ejecuta al menos lint, typecheck y las pruebas relacionadas. Ejecuta build cuando el cambio afecte rutas, layouts, Supabase, configuración o dependencias.
- Al terminar, no empieces el siguiente prompt.
- Informa de archivos modificados, decisiones, riesgos, pruebas ejecutadas y resultados exactos.

---

# FASE 0 — Auditoría y contrato de producto

## Prompt 00 — Auditoría técnica y plan definitivo de Enfoque

> **HECHO** — `docs/focus-implementation-plan.md` creado (auditoría + arquitectura + modelo de datos + orden de hitos). Sin migraciones ni UI.

```text
Quiero preparar la implementación de una nueva función llamada “Enfoque” en Planora, pero en esta entrega no debes programar todavía la funcionalidad final.

OBJETIVO

Realiza una auditoría profunda del repositorio y crea un plan técnico ejecutable para integrar Enfoque sin duplicar sistemas existentes ni romper la arquitectura.

CONTEXTO FUNCIONAL

Enfoque será un sistema de sesiones de concentración para programación, inglés, piano, lectura, estudio y trabajo. Tendrá cuenta atrás, cronómetro libre, ciclos de enfoque/descanso, presets, vínculo opcional con tareas o hábitos, historial, objetivos, estadísticas, notificaciones, recuperación tras recarga, sincronización y exportación.

AUDITORÍA OBLIGATORIA

Inspecciona y documenta:

1. Estructura de rutas localizadas y layouts.
2. Navegación de escritorio, móvil y pantalla “Más”.
3. Componentes de botones, cards, dialogs, selects, sheets, formularios y toasts.
4. Sistema de temas y tokens visuales.
5. Gestión de estado actual.
6. Server Actions, route handlers y capa de acceso a Supabase.
7. Esquema de base de datos, migraciones, RLS, claves foráneas e invariantes.
8. Modelo de tareas, hábitos, ocurrencias, historial, categorías, horarios y eventos.
9. Sistema de recordatorios, alarmas, notificaciones, service worker y PWA.
10. Cola offline y estrategia de reconciliación.
11. Exportación JSON/CSV/ICS y restauración por reemplazo.
12. Estadísticas actuales y motores de progreso.
13. Traducciones español/inglés.
14. Pruebas unitarias, componentes y E2E.
15. Convenciones de nombres, carpetas y validación con Zod.

ENTREGABLE

Crea `docs/focus-implementation-plan.md` con:

- Resumen del estado actual relevante.
- Riesgos y dependencias.
- Decisiones de arquitectura recomendadas.
- Ruta o rutas propuestas sin romper URLs actuales.
- Integración de navegación en desktop y móvil.
- Modelo de datos propuesto.
- Estados de sesión y diagrama de transiciones.
- Estrategia de timer sin deriva.
- Estrategia de una sola sesión activa por usuario.
- Estrategia offline y cross-device.
- Integración con tareas y hábitos.
- Integración con notificaciones.
- Integración con exportación/restauración.
- Plan de pruebas.
- Orden recomendado de implementación.
- Lista exacta de archivos que probablemente se modificarán en cada fase.

MODELO DE ESTADOS

Propón estados claros, como mínimo:

- draft o configuración;
- running;
- paused;
- on_break;
- completed;
- cancelled;
- interrupted o recovery_pending, solo si aporta valor real.

No añadas estados redundantes. Explica las transiciones permitidas y las invariantes.

MODELO DE DATOS

Evalúa si conviene utilizar tablas equivalentes a:

- focus_presets;
- focus_sessions;
- focus_intervals o focus_phases;
- focus_goals.

No asumas esos nombres si el proyecto tiene convenciones diferentes. Decide si los planes estructurados deben almacenarse como tabla relacionada o JSONB validado. Justifica la opción más sencilla y mantenible.

RESTRICCIONES IMPORTANTES

- No implementes UI final.
- No crees todavía migraciones.
- No instales dependencias.
- No inventes APIs del navegador.
- No conviertas el layout raíz en Client Component.
- No diseñes un sistema que escriba cada segundo en Supabase.

VALIDACIÓN

Ejecuta las comprobaciones necesarias para entender el proyecto, pero evita modificar código salvo el documento de planificación.

AL FINAL

Indícame:

1. Hallazgos principales.
2. Arquitectura recomendada.
3. Riesgos críticos.
4. Qué decisiones quedan abiertas.
5. Archivo creado.
6. Orden exacto de los siguientes hitos.
```

---

# FASE 1 — Fundamentos de datos y dominio

## Prompt 01 — Esquema de base de datos, migraciones y RLS

> **HECHO** — Migración `20260807160000_focus_schema.sql`, tipos en `src/types/database.ts`, tests `tests/focus-schema.test.ts`. RLS, una sesión activa, snapshots y revision.

```text
Implementa la base de datos de Planora Enfoque siguiendo `docs/focus-implementation-plan.md` y el esquema real del repositorio.

OBJETIVO

Crear un modelo de datos seguro, simple y preparado para:

- presets personalizados;
- sesiones de cuenta atrás, cronómetro y ciclos;
- fases de enfoque, descanso y pausa;
- vínculo opcional con tareas, hábitos, categorías y horarios;
- sesiones activas recuperables;
- historial inmutable;
- objetivos semanales;
- notas y distracciones privadas;
- sincronización entre pestañas y dispositivos;
- exportación y restauración futuras.

REQUISITOS DE MODELO

Diseña las tablas necesarias siguiendo las convenciones del proyecto. Como orientación, evalúa:

1. Presets de enfoque.
2. Sesiones de enfoque.
3. Intervalos o fases de una sesión.
4. Objetivos de enfoque.

Cada entidad propiedad del usuario debe incluir `user_id`, timestamps coherentes y RLS completa.

SESIONES

Una sesión debe poder conservar, como mínimo:

- modo utilizado;
- estado;
- intención o título opcional;
- preset de origen opcional;
- tarea o hábito vinculado opcional;
- occurrence date cuando corresponda;
- categoría y horario opcionales;
- duración prevista opcional;
- tiempo real de enfoque;
- tiempo pausado;
- tiempo de descanso;
- fase actual;
- ciclo actual;
- inicio y final;
- notas de cierre opcionales;
- valoración subjetiva opcional de concentración o energía;
- comportamiento elegido respecto a completar la tarea;
- versión o mecanismo de concurrencia;
- snapshot mínimo de los elementos vinculados para preservar el historial aunque luego se editen o borren.

No almacenes una fila nueva cada segundo.

INTERVALOS O FASES

Si el plan aprobado utiliza una tabla de intervalos, debe representar transiciones reales:

- focus;
- short_break;
- long_break;
- pause;
- segmento estructurado, si aplica.

Cada intervalo debe tener orden, inicio, final y duración derivable. Evita datos inconsistentes entre sesión e intervalos mediante constraints o funciones de dominio cuando sea razonable.

UNA SOLA SESIÓN ACTIVA

Impón a nivel de base de datos que un usuario no pueda tener dos sesiones activas simultáneamente.

Usa una restricción o índice parcial adecuado según PostgreSQL y los estados reales. No confíes solo en la UI.

CONCURRENCIA

Incluye un mecanismo simple de optimistic concurrency, por ejemplo una revisión incremental o `updated_at` validado, para evitar que dos pestañas sobrescriban silenciosamente la sesión.

RLS Y SEGURIDAD

Implementa políticas para SELECT, INSERT, UPDATE y DELETE:

- siempre limitadas a `auth.uid()`;
- sin aceptar `user_id` arbitrario desde cliente;
- sin acceso cruzado a presets, sesiones, intervalos u objetivos;
- con relaciones que impidan enlazar una sesión del usuario A con una tarea del usuario B.

Usa claves foráneas compuestas o invariantes equivalentes si el esquema actual sigue ese patrón.

BORRADO Y RETENCIÓN

Decide el comportamiento al borrar una tarea, categoría, horario o preset vinculado:

- el historial de sesiones debe seguir siendo interpretable;
- evita cascadas que destruyan el historial accidentalmente;
- utiliza snapshots y `ON DELETE SET NULL` cuando sea lo correcto.

MIGRACIONES

Crea migraciones reversibles dentro de las convenciones del proyecto. Incluye:

- tipos o checks;
- índices por usuario, estado, fecha y relaciones;
- unique constraints;
- comentarios SQL cuando aclaren invariantes;
- actualización de tipos generados de Supabase.

No introduzcas enums PostgreSQL si el proyecto evita utilizarlos; sigue el estilo actual.

PRUEBAS

Añade pruebas de base de datos o de integración para:

1. Usuario A no puede leer datos del usuario B.
2. Usuario A no puede vincular una sesión con una tarea del usuario B.
3. No pueden existir dos sesiones activas del mismo usuario.
4. Sí pueden existir múltiples sesiones completadas.
5. Borrar una tarea no elimina el historial de enfoque.
6. Estados inválidos son rechazados.
7. Duraciones negativas son rechazadas.
8. Un objetivo no puede tener valor cero o negativo.
9. La revisión de concurrencia se comporta correctamente.

VALIDACIÓN FINAL

Ejecuta:

- generación de tipos de Supabase;
- lint;
- typecheck;
- pruebas relacionadas;
- build si el proceso de tipos o migraciones lo requiere.

AL FINAL

Explica:

1. Tablas y campos creados.
2. Invariantes.
3. RLS.
4. Estrategia de una sesión activa.
5. Estrategia de snapshots.
6. Archivos modificados.
7. Resultado exacto de comandos y pruebas.
```

## Prompt 02 — Capa de dominio, tipos, validación y cálculo temporal

> **HECHO** — `src/features/focus/*` (tipos, Zod, time, state-machine, goals, mappers, repository, actions). Tests en `tests/focus-domain.test.ts` (17).

```text
Implementa la capa de dominio de Planora Enfoque sobre el esquema ya creado.

OBJETIVO

Centralizar toda la lógica de sesiones para que la UI no contenga reglas de negocio dispersas.

CREA O ADAPTA

- Tipos TypeScript estrictos.
- Esquemas Zod de entrada y salida.
- Repositorios o servicios de acceso a datos siguiendo la arquitectura actual.
- Funciones puras para cálculo de tiempo.
- Server Actions o route handlers mínimos y seguros.
- Mapeadores entre filas de Supabase y modelos de dominio.

MODOS

Soporta:

1. `countdown`: duración planificada y final esperado.
2. `stopwatch`: sin duración obligatoria.
3. `cycles`: bloques de enfoque y descanso configurables.

REGLA ANTI-DERIVA

Nunca calcules el tiempo real decrementando una variable cada segundo.

El valor mostrado debe derivarse de:

- timestamps persistidos;
- tiempo acumulado de intervalos cerrados;
- timestamp de inicio del intervalo abierto;
- `Date.now()` en cliente para representación visual.

La UI puede actualizarse cada segundo, pero la verdad de dominio debe ser temporal, no un contador mutable.

FUNCIONES PURAS OBLIGATORIAS

Crea funciones testeables para:

- tiempo de enfoque transcurrido;
- tiempo pausado;
- tiempo de descanso;
- tiempo restante;
- progreso de una fase;
- siguiente fase en ciclos;
- detección de final de fase;
- recuperación después de una recarga;
- normalización de sesiones antiguas o incompletas;
- resumen final de sesión;
- cálculo de objetivo semanal según timezone e inicio de semana del usuario.

TRANSICIONES

Implementa una máquina de estados simple o un reducer de dominio con transiciones validadas:

- start;
- pause;
- resume;
- begin_break;
- skip_break;
- extend_break;
- finish_phase;
- complete;
- cancel;
- recover;
- takeover, si forma parte del plan.

Una transición inválida debe fallar de forma controlada y no dejar datos parciales.

PERSISTENCIA

Persistir solo en eventos relevantes:

- inicio;
- pausa;
- reanudación;
- cambio de fase;
- finalización;
- cancelación;
- edición de metadatos permitidos.

No escribas cada segundo.

VALIDACIÓN

Valida:

- duraciones mínimas y máximas razonables;
- número de ciclos;
- nombres y notas;
- IDs relacionados;
- occurrence date;
- objetivos;
- estructura de segmentos personalizados;
- límites de tamaño para notas y distracciones.

ERRORES

Crea errores de dominio comprensibles y localizables, sin filtrar contenido privado ni detalles internos de SQL.

PRUEBAS UNITARIAS OBLIGATORIAS

Incluye:

1. Countdown normal.
2. Cronómetro sin duración.
3. Pausa y reanudación múltiples.
4. Recarga tras varios minutos en segundo plano.
5. Ciclo corto y ciclo largo.
6. Salto de descanso.
7. Extensión de descanso.
8. Finalización manual antes de tiempo.
9. Sesión que cruza medianoche.
10. Cambio horario DST.
11. Zona horaria distinta de UTC.
12. Transición inválida.
13. Recuperación de sesión activa.
14. No deriva aunque el intervalo de render se retrase.
15. Revisión de concurrencia obsoleta.

AL FINAL

Informa de:

- arquitectura de dominio;
- funciones creadas;
- transiciones permitidas;
- estrategia anti-deriva;
- archivos modificados;
- cobertura añadida;
- resultados exactos.
```

---

# FASE 2 — Navegación y primera experiencia

## Prompt 03 — Ruta, navegación y pantalla principal de Enfoque

> **HECHO** — Ruta `/focus`, nav desktop + Más, shell `FocusHome`, i18n ES/EN, tests de navegación y home.

```text
Crea la integración visual y de navegación de Planora Enfoque, sin implementar todavía el timer completo.

OBJETIVO

Hacer que Enfoque sea fácil de descubrir sin romper la navegación móvil existente ni añadir una sexta pestaña inferior.

NAVEGACIÓN

En escritorio:

- Añade “Enfoque” al sidebar como destino directo.
- Colócalo en una posición coherente con Hoy, Semana y Tareas.
- Reutiliza la configuración centralizada de navegación.

En móvil:

- Mantén exactamente cinco destinos en la barra inferior.
- Añade “Enfoque” a la pantalla “Más”.
- Haz que “Más” permanezca activo cuando la ruta de Enfoque esté abierta.
- No elimines accesos actuales.

RUTA

Añade una ruta localizada siguiendo la estructura real del proyecto. No cambies URLs existentes.

PANTALLA PRINCIPAL

Construye un shell premium y mobile-first con estos bloques:

1. Encabezado “Enfoque”.
2. Acción principal “Iniciar sesión”.
3. Si existe sesión activa, card prioritaria “Continuar sesión”.
4. Presets favoritos o recientes.
5. Progreso del objetivo semanal, solo si existe.
6. Resumen muy breve de esta semana.
7. Últimas sesiones.
8. Empty state útil para primera visita.

En esta entrega los botones pueden abrir placeholders funcionales o rutas preparadas, pero no simules un timer falso.

DISEÑO

Debe transmitir concentración y calma:

- jerarquía clara;
- poco ruido;
- superficies coherentes con Planora;
- verde de marca;
- excelente tema oscuro;
- sin gradientes exagerados;
- sin dashboards saturados.

ESTADO VACÍO

Cuando no haya sesiones:

- explica en dos o tres frases qué aporta Enfoque;
- ofrece iniciar una sesión rápida;
- ofrece crear un preset;
- no muestres gráficos vacíos.

SESIÓN ACTIVA

Si existe una sesión activa en base de datos:

- muéstrala por encima de todo;
- incluye modo, intención o tarea, fase y tiempo reconstruido;
- ofrece continuar;
- no permita iniciar otra sesión sin resolver el conflicto.

INTERNACIONALIZACIÓN

Añade todas las claves en español e inglés.

PRUEBAS

Comprueba:

1. Sidebar desktop.
2. Pantalla Más móvil.
3. Estado activo correcto.
4. Ruta ES y EN.
5. Empty state.
6. Estado con sesión activa.
7. Responsive 320, 375, 390, 412, tablet y escritorio.
8. Tema claro y oscuro.
9. Navegación con teclado.

AL FINAL

Indica rutas, navegación, componentes reutilizados, archivos modificados y resultados exactos.
```

## Prompt 04 — Configurador de sesión y arranque rápido

> **HECHO** — `SessionStartDialog` con modos, avanzadas, conflicto de sesión activa, validación y arranque vía server action. Tests en `tests/focus-session-start.test.tsx`.

```text
Implementa el flujo para configurar e iniciar una sesión de Enfoque.

OBJETIVO

Permitir empezar en pocos segundos, pero ofrecer personalización avanzada sin abrumar.

ENTRADAS AL FLUJO

Debe poder abrirse desde:

- botón principal de Enfoque;
- preset;
- sesión rápida;
- tarea o hábito, en una entrega posterior;
- deep link interno si la arquitectura lo permite.

ESTRUCTURA UX

Usa un dialog, sheet móvil o página según los patrones existentes.

Nivel básico visible inicialmente:

1. Modo:
   - cuenta atrás;
   - cronómetro;
   - ciclos.
2. Duración o configuración de ciclos.
3. Intención opcional.
4. Tarea o hábito opcional.
5. Preset opcional.
6. Botón “Empezar”.

Opciones avanzadas plegables:

- descanso corto;
- descanso largo;
- ciclos antes del descanso largo;
- auto-iniciar descansos;
- auto-iniciar siguiente enfoque;
- sonido;
- vibración;
- notificación;
- comportamiento al finalizar;
- completar tarea al terminar, desactivado por defecto;
- pantalla completa al comenzar;
- mantener pantalla activa cuando sea compatible.

INICIO RÁPIDO

Incluye presets rápidos editables, no hardcodeados de forma rígida:

- 25 min;
- 50 min;
- 90 min;
- cronómetro.

El usuario puede ocultarlos o cambiarlos más adelante.

VALIDACIONES

- Cuenta atrás: duración obligatoria dentro de límites razonables.
- Cronómetro: duración opcional.
- Ciclos: foco y descanso válidos; número de ciclos razonable.
- No permitir iniciar si ya existe una sesión activa sin resolverla.
- No permitir doble envío.
- Manejar error de red sin crear dos sesiones.

CONFLICTO DE SESIÓN ACTIVA

Si ya existe una sesión activa:

- mostrar “Continuar sesión”;
- permitir cancelar la creación;
- ofrecer finalizar o cancelar la anterior solo con confirmación;
- no sobrescribirla silenciosamente.

ACCESIBILIDAD

- labels reales;
- focus management;
- teclado;
- lectores de pantalla;
- inputs numéricos cómodos en móvil;
- botones de incremento no obligatorios.

PRUEBAS

1. Iniciar countdown.
2. Iniciar cronómetro.
3. Iniciar ciclos.
4. Duraciones inválidas.
5. Doble clic.
6. Sesión activa existente.
7. Error de red.
8. Español e inglés.
9. Móvil y escritorio.

AL FINAL

Explica cómo se crea la sesión, validaciones, tratamiento de conflictos, archivos y resultados.
```

---

# FASE 3 — Motor de sesión y experiencia activa

## Prompt 05 — Motor de timer robusto y recuperación tras recarga

> **HECHO** — `engine.ts` + `useFocusSession` (anti-deriva, visibility/pageshow, auto phase end, recover, gate idempotente). Controles en home. Tests `tests/focus-engine.test.ts`.

```text
Implementa el motor de ejecución de una sesión activa de Planora Enfoque.

OBJETIVO

El timer debe ser fiable ante retrasos de render, bloqueo de pestaña, recarga, navegación interna y retorno después de varios minutos.

REGLAS TÉCNICAS

- No decrementar un contador como fuente de verdad.
- Derivar el tiempo desde timestamps e intervalos persistidos.
- El `setInterval` solo refresca la UI.
- No escribir cada segundo en Supabase.
- Persistir transiciones relevantes.
- Usar `visibilitychange`, `pageshow` y eventos adecuados para recalcular al recuperar foco.
- No depender de que el navegador ejecute JavaScript exactamente en segundo plano.

ESTADOS Y CONTROLES

Implementa:

- empezar;
- pausar;
- reanudar;
- terminar;
- cancelar;
- recuperar tras recarga;
- detectar final automático de fase;
- resolver transición pendiente cuando el navegador estuvo suspendido.

RECARGA

Al recargar:

1. Consultar la sesión activa.
2. Reconstruir fase y tiempo.
3. Si una fase terminó mientras la app estaba suspendida, avanzar de manera determinista.
4. Si han terminado varias fases, resolverlas sin crear intervalos absurdos ni duplicados.
5. Mostrar un aviso breve de recuperación cuando sea útil.

IDEMPOTENCIA

Las acciones deben tener protección contra reintentos y dobles clics. Dos llamadas de “pausar” o “completar” no pueden duplicar intervalos.

CRONÓMETRO

El cronómetro debe continuar hasta que el usuario lo finalice. Permite mostrar un aviso suave al alcanzar una duración objetivo opcional, sin terminar obligatoriamente.

COUNTDOWN

Al llegar a cero:

- no mostrar negativos;
- registrar el final una sola vez;
- ejecutar el comportamiento configurado;
- notificar si está permitido;
- permitir añadir tiempo o cerrar.

CICLOS

Debe calcular correctamente:

- enfoque;
- descanso corto;
- descanso largo;
- número de ciclo;
- siguiente fase;
- auto-inicio o espera manual.

PRUEBAS

Añade pruebas con reloj falso y pruebas reales de dominio para:

- tab throttling;
- recarga;
- suspensión de 30 minutos;
- múltiples fases vencidas;
- pausa en el momento exacto del final;
- acciones duplicadas;
- fin manual;
- timezone y DST;
- cronómetro largo;
- pérdida temporal de red.

RENDIMIENTO

Verifica que no haya renders innecesarios de toda la aplicación cada segundo. Aísla el ticker visual.

AL FINAL

Describe el algoritmo temporal, recuperación, idempotencia, rendimiento, archivos y pruebas.
```

## Prompt 06 — Pantalla activa premium, compacta y de pantalla completa

> **HECHO** — `ActiveSessionView`, `FocusCompactBar`, `FocusRuntime` en shell, immersive/fullscreen progresivo, notas, +tiempo, a11y. Tests `tests/focus-active-view.test.tsx`.

```text
Diseña e implementa la experiencia visual de una sesión activa de Enfoque.

OBJETIVO

Crear una pantalla calmada, clara y premium que funcione en móvil, escritorio y PWA, sin distracciones innecesarias.

VISTA PRINCIPAL

Debe mostrar:

- fase actual;
- tiempo restante o transcurrido;
- intención o tarea vinculada;
- categoría opcional;
- ciclo actual;
- progreso de fase;
- siguiente fase;
- controles principales.

CONTROLES

- Pausar / reanudar.
- Finalizar.
- Cancelar, dentro de menú secundario y con confirmación.
- Saltar descanso.
- Añadir tiempo.
- Extender descanso.
- Añadir nota rápida.
- Entrar o salir de vista de concentración.

JERARQUÍA

El tiempo debe ser protagonista, pero no gigantesco hasta romper pantallas pequeñas. Evita animaciones continuas costosas.

MODOS VISUALES

1. Vista completa de Enfoque.
2. Card compacta persistente al navegar por Planora durante una sesión.
3. Mini indicador en la navegación o shell, si encaja sin ruido.

El usuario debe poder navegar por la app sin perder la sesión. La card compacta debe permitir volver y pausar.

PANTALLA COMPLETA

Usa Fullscreen API solo como mejora progresiva y tras interacción del usuario. Si no está disponible, usa una vista inmersiva dentro del layout. No fuerces fullscreen.

RESPONSIVE

Prueba:

- 320×568;
- 375×667;
- 390×844;
- 412×915;
- tablet;
- escritorio ancho;
- landscape móvil.

SAFE AREAS

Respeta notch y barra inferior con `env(safe-area-inset-*)`.

ACCESIBILIDAD

- Anunciar cambios de fase sin anunciar cada segundo.
- No saturar lectores de pantalla.
- Contraste AA.
- Soporte reduced motion.
- Controles de 44×44.
- Shortcuts documentados en desktop.

ESTADOS ESPECIALES

- sin conexión;
- sincronizando;
- conflicto de otra pestaña;
- sesión recuperada;
- fase terminada esperando acción;
- error al persistir;
- sesión finalizada.

PRUEBAS

Incluye tests visuales o de componentes útiles y un E2E de sesión completa en móvil y escritorio.

AL FINAL

Resume decisiones de UX, componentes, responsive, accesibilidad y resultados.
```

## Prompt 07 — Descansos, ciclos y control flexible

> **HECHO** — Auto-start configurable, descanso 0, ampliar custom, fin de ciclo con resumen + bloque extra, cues progresivos, tests `tests/focus-cycles.test.ts`.

```text
Completa la experiencia de ciclos y descansos de Planora Enfoque.

OBJETIVO

Ofrecer Pomodoro y otros ciclos sin imponer una metodología rígida.

CONFIGURACIÓN

Permite personalizar:

- minutos de enfoque;
- descanso corto;
- descanso largo;
- ciclos antes del descanso largo;
- número total de ciclos o modo indefinido;
- auto-inicio de descansos;
- auto-inicio del siguiente bloque;
- sonido al cambiar de fase;
- notificación;
- vibración cuando sea compatible.

DURANTE UN DESCANSO

Mostrar:

- tipo de descanso;
- tiempo;
- siguiente bloque;
- saltar;
- ampliar 1, 5 o cantidad personalizada;
- terminar sesión;
- empezar antes.

LENGUAJE

No usar mensajes culpabilizadores. Evita frases como “Has fallado” o “Rompiste tu racha”. Usa lenguaje neutral y útil.

FIN DE CICLO

Al finalizar todos los ciclos:

- mostrar resumen;
- permitir añadir un bloque extra;
- permitir terminar;
- no marcar automáticamente una tarea sin la preferencia correspondiente.

CASOS LÍMITE

- descanso cero;
- ciclo de una sola fase;
- cierre durante descanso;
- cambio de configuración a mitad de sesión: define qué puede cambiar y qué queda bloqueado;
- varios finales de fase durante suspensión;
- notificación bloqueada;
- audio no autorizado por autoplay.

PRUEBAS

Cubre ciclos 1, 4 y personalizados, descanso largo, saltos, extensiones, suspensión y reanudación.

AL FINAL

Explica las reglas de ciclos, flexibilidad, casos límite y resultados.
```

---

# FASE 4 — Integración real con Planora

## Prompt 08 — Vincular sesiones con tareas y hábitos

> **HECHO** — Entrada desde Hoy/Semana/Tareas, deep link `/focus?taskId=&date=`, snapshots, completar ocurrencia al final con confirmación de hábitos, stats helpers. Tests `focus-task-link` + task-card.

```text
Integra Enfoque con las tareas y hábitos existentes de Planora.

OBJETIVO

Permitir iniciar una sesión desde una tarea o hábito y reflejar el tiempo dedicado sin introducir comportamientos sorprendentes.

PUNTOS DE ENTRADA

Añade “Iniciar enfoque” de forma coherente en:

- cards de tarea en Hoy;
- detalle o menú de tarea;
- gestión de tareas;
- vista Semana cuando sea apropiado;
- historial o estadísticas solo como enlace de consulta, no de edición.

No recargues visualmente todas las cards. Usa menú contextual o acción secundaria cuando sea mejor.

VÍNCULO

Al iniciar desde una tarea o hábito:

- preselecciona el elemento;
- hereda categoría, horario y emoji cuando corresponda;
- conserva snapshots para historial;
- registra occurrence date correcta;
- permite cambiar o eliminar el vínculo antes de empezar.

FINALIZACIÓN

Al terminar una sesión vinculada, ofrece opciones claras:

- Guardar sesión sin completar la tarea.
- Marcar la ocurrencia de hoy como completada.
- Mantener la tarea abierta.

La opción automática debe estar desactivada por defecto y ser configurable por preset o por sesión.

HÁBITOS RECURRENTES

Respeta todas las reglas existentes:

- días seleccionados;
- objetivo semanal;
- intervalos personalizados;
- fechas de inicio/fin;
- timezone;
- occurrence date.

Una sesión no debe crear una ocurrencia inválida ni completar un día en el que el hábito no corresponda sin confirmación explícita.

TAREAS ARCHIVADAS O BORRADAS

El historial de enfoque debe seguir mostrando un snapshot legible, sin enlaces rotos.

TIEMPO ACUMULADO

Añade al detalle de tarea o historial, cuando aporte valor:

- tiempo total de enfoque;
- número de sesiones;
- última sesión.

No sobrecargues las listas principales.

PRUEBAS

1. Tarea única.
2. Hábito diario.
3. Hábito ciertos días.
4. Objetivo semanal.
5. Tarea archivada.
6. Tarea eliminada.
7. Completar al finalizar activado y desactivado.
8. Sesión cancelada no completa tarea.
9. Zona horaria y cambio de día.

AL FINAL

Describe puntos de entrada, vínculo, completion semantics, snapshots y pruebas.
```

## Prompt 09 — Accesos rápidos desde Hoy, Semana y acción global

> **HECHO** — Accesos compactos en Hoy (continuar / rápida / próxima tarea / último preset), acción secundaria en Semana y Tareas, deep links `start=quick` y `presetId`, recents locales. El orbe “+” móvil se deja como acceso a Tareas (no se convirtió en menú global).

```text
Añade accesos rápidos inteligentes a Enfoque sin saturar la interfaz.

OBJETIVO

Reducir el número de pasos para empezar una sesión desde el contexto diario.

HOY

Añade un bloque compacto o acción contextual que permita:

- continuar sesión activa;
- iniciar una sesión rápida;
- empezar desde la próxima tarea;
- usar el preset más reciente.

No debe desplazar ni competir con el progreso semanal de forma desproporcionada.

SEMANA

Permite iniciar enfoque desde una tarea concreta mediante menú o acción secundaria. No añadas un botón grande en cada elemento si empeora la densidad.

ACCIÓN GLOBAL

Revisa el botón central o menú global “Añadir”. Integra “Iniciar enfoque” solo si encaja con el patrón actual. No conviertas el botón de crear tarea en un menú confuso sin analizar el comportamiento existente.

RECIENTES

Ofrece como máximo tres accesos relevantes:

- último preset;
- tarea reciente;
- sesión rápida favorita.

No uses recomendaciones opacas. Explica por qué aparece cada acceso solo si es necesario.

ACTIVE SESSION

Mientras haya sesión activa, cualquier acceso “Iniciar enfoque” debe convertirse en “Continuar enfoque” o abrir el conflicto correspondiente.

PRUEBAS

- Hoy con y sin sesión.
- Semana.
- Tarea sin categoría.
- Preset eliminado.
- Móvil y desktop.
- Estado activo y navegación atrás.

AL FINAL

Resume decisiones de discoverability y densidad visual.
```

## Prompt 10 — Cierre de sesión, reflexión y notas privadas

> **HECHO** — Revisión opcional post-sesión (tiempos, plan vs real, meta semanal, nota, ratings, resultado, próximo paso), distracciones aparcadas mid-sesión convertibles a tarea, y distinción finalizar / cancelar (conserva tiempo) / descartar (borra con confirmación). Notas y distracciones privadas.

```text
Implementa el flujo de cierre y revisión de una sesión de Enfoque.

OBJETIVO

Convertir el final en una revisión útil de pocos segundos, sin obligar a rellenar formularios.

RESUMEN

Mostrar:

- tiempo de enfoque real;
- tiempo de descanso;
- pausas;
- bloques completados;
- tarea o intención;
- comparación entre planificado y real, si existe;
- objetivo semanal actualizado.

ENTRADAS OPCIONALES

- Nota final.
- Valoración de concentración de 1 a 5 o escala equivalente.
- Nivel de energía opcional.
- Resultado: completado, avancé, bloqueado, otro.
- Próximo paso breve.

Todo debe ser opcional y fácil de omitir.

DISTRACCIONES APARCADAS

Durante una sesión, el usuario puede guardar notas rápidas sin abandonar el timer, por ejemplo “responder correo” o “buscar concepto”.

Requisitos:

- añadir en uno o dos toques;
- no pausar automáticamente;
- mostrar lista al finalizar;
- permitir convertir una distracción en tarea de Planora;
- permitir descartarla;
- mantener privacidad;
- límite razonable de longitud y cantidad;
- no enviarla a analítica ni logs.

CREAR TAREA DESDE DISTRACCIÓN

Reutiliza el flujo de creación de tareas. Prellena el título, pero deja al usuario elegir horario, categoría y recurrencia. No crees tareas silenciosamente.

COMPLETAR TAREA VINCULADA

Incluye la decisión final según el prompt de integración con tareas.

CANCELACIÓN

Distingue:

- finalizar y guardar;
- cancelar y conservar tiempo parcial;
- descartar sesión.

No elimines datos sin confirmación.

PRUEBAS

- Cierre normal.
- Cierre anticipado.
- Cancelación.
- Nota vacía y máxima.
- Distracciones múltiples.
- Convertir en tarea.
- Error al guardar.
- Doble envío.

AL FINAL

Explica el modelo de revisión y la privacidad de notas.
```

---

# FASE 5 — Personalización profunda

## Prompt 11 — Presets completamente personalizables

> **HECHO** — CRUD de presets (crear/editar/duplicar/archivar/restaurar/eliminar/reordenar), plantillas sugeridas localizadas (no insertadas), favoritos primero + badge reciente sin alterar orden, emoji/intención/categoría/plan estructurado, snapshot en sesiones al usar preset.

```text
Implementa la gestión completa de presets de Enfoque.

OBJETIVO

Permitir que cada usuario adapte Enfoque a programación, inglés, piano, lectura o cualquier otra actividad.

PRESET

Un preset puede definir:

- nombre;
- emoji o icono;
- modo;
- duración;
- ciclos;
- descansos;
- auto-inicio;
- sonido;
- vibración;
- notificaciones;
- pantalla inmersiva;
- Wake Lock preferido;
- comportamiento al completar tarea;
- categoría por defecto;
- intención sugerida;
- plan estructurado opcional;
- favorito;
- orden.

CRUD

- crear;
- editar;
- duplicar;
- archivar;
- restaurar;
- eliminar permanentemente con confirmación;
- reordenar con teclado y pointer si el proyecto ya tiene patrón accesible.

PRESETS INICIALES

No insertes datos personales ni obligatorios. Ofrece plantillas sugeridas que el usuario pueda crear con un toque:

- Pomodoro 25/5;
- Concentración 50/10;
- Deep work 90/15;
- Cronómetro libre.

Estas sugerencias deben estar localizadas, ser editables y poder ignorarse.

FAVORITOS Y RECIENTES

- favoritos visibles primero;
- máximo razonable en home;
- “usado recientemente” calculado sin duplicar datos;
- no alterar el orden personalizado por uso reciente.

VALIDACIÓN

- nombres únicos solo si aporta valor; no impidas nombres iguales sin razón;
- duraciones y ciclos válidos;
- compatibilidad del preset con modo;
- snapshots en sesiones para preservar cómo estaba configurado al usarlo.

PRUEBAS

CRUD, duplicar, archivar, restaurar, reordenar, preset eliminado con sesiones históricas y traducciones.

AL FINAL

Resume modelo, UX y pruebas.
```

## Prompt 12 — Preferencias personales y comportamiento por dispositivo

> **HECHO** — Preferencias de cuenta en `profiles.preferences.focus` (sincronizadas) y preferencias de dispositivo en `localStorage` (sonido/volumen, vibración, notificaciones, Wake Lock, fullscreen, barra compacta, pausa al ocultar). UI en Ajustes, permisos solo bajo acción explícita, restablecer sin borrar historial/presets.

```text
Añade una sección de preferencias de Enfoque dentro de Ajustes o del propio módulo, siguiendo la arquitectura de settings actual.

OBJETIVO

Separar preferencias sincronizadas de cuenta y preferencias específicas del dispositivo.

PREFERENCIAS DE CUENTA

Evalúa e implementa:

- preset predeterminado;
- modo predeterminado;
- preguntar por intención al iniciar;
- preguntar por revisión al terminar;
- auto-completar tarea, desactivado por defecto;
- mostrar tiempo en formato grande o compacto;
- primera vista de Enfoque;
- objetivo semanal visible;
- semana laboral o todos los días para objetivos, si se aprueba.

PREFERENCIAS POR DISPOSITIVO

- sonido y volumen;
- vibración;
- notificación del sistema;
- Wake Lock;
- pantalla completa;
- mostrar card compacta;
- comportamiento al bloquear pantalla.

No prometas notificaciones si el permiso está bloqueado.

PERMISOS

Los permisos deben solicitarse por acción explícita y contextual, nunca automáticamente al entrar.

RESTABLECER

Incluye “Restablecer preferencias de Enfoque” con confirmación y sin borrar historial ni presets salvo que se indique.

PRIVACIDAD

No sincronices configuraciones que deban permanecer por dispositivo si el sistema actual ya distingue ese alcance.

PRUEBAS

- cuenta vs dispositivo;
- varios dispositivos simulados;
- permisos denegados;
- restablecer;
- español/inglés;
- tema claro/oscuro.

AL FINAL

Explica qué se sincroniza y qué no.
```

## Prompt 13 — Planes estructurados para programación, inglés, piano y otras prácticas

> **HECHO** — Planes de sesión con segmentos (nombre, emoji, focus/break, duración opcional/abierta, descripción, auto-avance), editor con plantillas Programación/Inglés/Piano, reordenar/duplicar, ejecución en sesión (actual/siguiente, avanzar/saltar), resumen planificado vs real. No se permite volver atrás (historial append-only). Snapshot en `config.segments` al iniciar.

```text
Implementa “Planes de sesión” dentro de los presets de Enfoque.

OBJETIVO

Permitir dividir una sesión en bloques con propósito, no solo en un único temporizador.

EJEMPLOS DE USO

Programación:

- Definir objetivo.
- Construir.
- Probar.
- Revisar y anotar siguiente paso.

Inglés:

- Vocabulario.
- Listening.
- Speaking.
- Repaso.

Piano:

- Calentamiento.
- Técnica.
- Escalas.
- Repertorio.
- Repaso final.

Estos ejemplos deben ser sugerencias editables, no categorías rígidas del sistema.

MODELO

Un plan contiene segmentos ordenados. Cada segmento puede tener:

- nombre;
- emoji opcional;
- duración opcional;
- tipo focus o break;
- descripción breve opcional;
- avance automático o manual.

Permite segmentos sin duración para práctica abierta, que se avanzan manualmente.

EDITOR

- añadir segmento;
- editar;
- duplicar;
- eliminar;
- reordenar;
- duración total calculada;
- validación de máximo razonable;
- soporte completo de teclado.

EJECUCIÓN

Durante la sesión:

- mostrar segmento actual y siguiente;
- permitir avanzar;
- permitir volver solo si no rompe historial o, en su defecto, documentar la regla;
- registrar tiempo real por segmento;
- no perder datos al recargar;
- permitir saltar un segmento con registro explícito.

RESUMEN

Mostrar tiempo planificado y real por segmento, sin gráficos innecesarios.

PRUEBAS

- segmentos temporizados;
- abiertos;
- mixtos;
- reordenar;
- saltar;
- recargar;
- finalizar antes;
- preset editado después de sesiones históricas.

AL FINAL

Describe modelo, editor, ejecución y resultados.
```

---

# FASE 6 — Objetivos y estadísticas útiles

## Prompt 14 — Objetivos semanales flexibles

> **HECHO** — Objetivos semanales: métricas (minutos / sesiones / días activos), alcance (global / categoría / preset), días considerados, varios activos (máx. 10) con uno principal, progreso + ritmo neutral + historial de semanas. Sesiones canceladas no cuentan. Edición a mitad de semana: se relee con la config actual (sin reescribir sesiones ni snapshots de versión).

```text
Implementa objetivos de Enfoque personalizables.

OBJETIVO

Ayudar a crear constancia sin castigar ni convertir el sistema en gamificación agresiva.

TIPOS DE OBJETIVO

Soporta:

- minutos por semana;
- sesiones por semana;
- días activos por semana.

ALCANCE

- global;
- por categoría;
- opcionalmente por preset si el modelo lo permite sin complicación.

No añadas objetivos por tarea individual en esta fase salvo que exista una necesidad clara.

CONFIGURACIÓN

- tipo;
- valor;
- alcance;
- fecha de inicio;
- activo/inactivo;
- días considerados;
- timezone e inicio de semana del usuario.

PROGRESO

Mostrar:

- progreso actual;
- restante;
- ritmo orientativo neutral;
- historial de semanas recientes;
- estado completado.

No uses mensajes culpabilizadores ni predicciones falsas.

CAMBIOS A MITAD DE SEMANA

Define una regla comprensible:

- el objetivo actualizado aplica desde el momento de edición;
- el historial debe preservar el objetivo que estaba vigente o explicar la nueva lectura.

Decide la estrategia más simple y documentada.

MÚLTIPLES OBJETIVOS

Permite varios objetivos con límite razonable. Evita saturar la home; muestra el principal y acceso al resto.

PRUEBAS

- semana de lunes y domingo;
- timezone;
- DST;
- objetivo global y categoría;
- cambio a mitad de semana;
- sesiones canceladas no cuentan;
- sesiones parciales según regla explícita;
- categoría borrada.

AL FINAL

Explica reglas de conteo e historial.
```

## Prompt 15 — Estadísticas e insights comprensibles

> **HECHO** — `focus-analytics.ts` (agregados puros, umbral de insights = 5), UI `FocusStatisticsPanel` en Enfoque (compacto) y Estadísticas, filtros 7d/30d/custom + categoría/preset/modo, barras CSS, batch de intervalos sin N+1. Tests `tests/focus-analytics.test.ts`. Migraciones Focus ya en remoto.

```text
Integra estadísticas de Enfoque en el módulo y en la sección general de Estadísticas.

OBJETIVO

Mostrar información accionable sin crear un dashboard excesivo ni un score opaco.

MÉTRICAS PRINCIPALES

- minutos de enfoque por día y semana;
- sesiones completadas;
- duración media y mediana;
- distribución por categoría;
- progreso de objetivos;
- tiempo por tarea o hábito;
- bloques completados;
- tiempo pausado;
- tasa de sesiones finalizadas frente a canceladas, con lenguaje neutral.

INSIGHTS OPCIONALES

Solo con muestra mínima suficiente:

- franja del día en la que más tiempo se completa;
- duración habitual de sesiones completadas;
- categorías con mayor constancia;
- comparación con la semana anterior.

No afirmes causalidad ni “tu mejor hora” con dos sesiones. Define umbrales mínimos y muestra “datos insuficientes” cuando corresponda.

FILTROS

- 7 días;
- 30 días;
- rango personalizado razonable;
- categoría;
- preset;
- modo.

VISUALIZACIÓN

Reutiliza el sistema gráfico existente. Si no existe, añade gráficos accesibles y simples:

- barras diarias;
- donut o lista de categorías solo si es legible;
- tabla o lista como alternativa accesible.

No añadas una dependencia pesada solo por gráficos si puede evitarse.

PRIVACIDAD

Las estadísticas se calculan sobre datos del propio usuario. No enviar nombres o notas a Vercel Analytics.

RENDIMIENTO

Evita consultas N+1. Usa agregaciones seguras, índices y paginación para historial largo.

PRUEBAS

- dataset vacío;
- una sesión;
- muestra insuficiente;
- rango amplio;
- timezone;
- categorías eliminadas;
- sesiones largas;
- filtros combinados.

AL FINAL

Explica métricas, umbrales, consultas y rendimiento.
```

---

# FASE 7 — Notificaciones, PWA y continuidad

## Prompt 16 — Notificaciones, sonidos, vibración y Wake Lock

> **HECHO** — Alertas de fase programadas (`focus-phase-alerts`), cues SW + toast in-app (`phase-cues`), Screen Wake Lock real (`focus-wake-lock`), preview sonido/notificación en Ajustes, click de notificación a `/focus`, límites de PWA explicados. Tests `tests/focus-phase-alerts.test.ts`.

```text
Integra Enfoque con el sistema de notificaciones y alarmas de Planora.

OBJETIVO

Avisar del final de una fase de la forma más fiable posible dentro de las limitaciones reales de una PWA.

CANALES

- alerta dentro de la app;
- notificación del sistema;
- sonido;
- vibración;
- badge o indicador interno si existe.

PERMISOS

- solicitar permiso solo por acción explícita;
- explicar para qué se necesita;
- manejar granted, denied y default;
- permitir probar notificación y sonido;
- no bloquear Enfoque si se deniega.

PROGRAMACIÓN

Reutiliza el scheduler y service worker actuales. No crees un segundo sistema paralelo.

Al iniciar o cambiar de fase:

- programar el aviso adecuado;
- cancelar el aviso anterior;
- evitar duplicados;
- reprogramar tras pausa, reanudación o extensión;
- limpiar al completar o cancelar.

LIMITACIONES

La interfaz debe explicar de forma breve que algunos sistemas suspenden PWAs cerradas y que la entrega depende del navegador y del sistema operativo.

SONIDO

- usa recursos propios y ligeros;
- respeta autoplay;
- volumen configurable;
- opción sin sonido;
- preview controlada.

VIBRACIÓN

Usa Vibration API como mejora progresiva, con feature detection.

WAKE LOCK

Usa Screen Wake Lock API solo durante una sesión activa y si el usuario lo ha activado.

- solicitar tras interacción;
- liberar al pausar, terminar o ocultar según la política aprobada;
- recuperar al volver si sigue siendo apropiado;
- manejar navegadores no compatibles sin error.

PRUEBAS

- permiso concedido/denegado;
- pausa y reprogramación;
- extensión;
- múltiples fases;
- app abierta;
- notificación bloqueada;
- API no compatible;
- limpieza al finalizar.

AL FINAL

Explica qué puede garantizar Planora y qué depende de plataforma.
```

## Prompt 17 — Sincronización entre pestañas, dispositivos y conflictos

> **HECHO** — `focus-sync` (BroadcastChannel + localStorage), poll ligero multi-dispositivo, revisión optimista como autoridad DB, modo follower + takeover «Continuar aquí», rechazo de revisiones obsoletas. Tests `tests/focus-sync.test.ts`.

```text
Implementa continuidad y resolución de conflictos para sesiones de Enfoque.

OBJETIVO

Evitar sesiones duplicadas o estados contradictorios cuando el usuario abre Planora en varias pestañas o dispositivos.

MISMA PESTAÑA Y RECARGA

Ya debe recuperarse desde servidor. Verifica y endurece.

MÚLTIPLES PESTAÑAS

Usa mecanismos apropiados, como BroadcastChannel con fallback, para comunicar:

- sesión iniciada;
- pausa;
- reanudación;
- cambio de fase;
- finalización;
- takeover.

La base de datos sigue siendo la autoridad. BroadcastChannel solo acelera la sincronización.

MÚLTIPLES DISPOSITIVOS

- una sesión activa por usuario a nivel DB;
- al detectar cambios remotos, actualizar la UI;
- no sobrescribir con una revisión antigua;
- mostrar qué ocurrió sin exponer datos técnicos.

TAKEOVER

Si el usuario quiere controlar la sesión desde otro dispositivo:

- mostrar diálogo explícito;
- permitir “Continuar aquí”;
- invalidar de forma segura el control anterior mediante revisión o lease;
- el dispositivo anterior debe pasar a solo lectura o mostrar conflicto;
- no crear una segunda sesión.

LEASE O CONTROL

Evalúa si se necesita un `controller_id`, lease temporal o revisión. Elige la solución más simple que evite escrituras concurrentes y documenta su expiración.

PRESENCIA

No añadas infraestructura de realtime compleja si el polling ligero o suscripción existente es suficiente. Sigue la arquitectura del proyecto.

PRUEBAS

- dos pestañas;
- dos dispositivos simulados;
- pausa simultánea;
- finalización simultánea;
- takeover;
- pestaña antigua vuelve después de horas;
- revisión obsoleta;
- pérdida de conexión durante takeover.

AL FINAL

Explica autoridad, sincronización, takeover y conflictos.
```

## Prompt 18 — Modo offline y reconciliación segura

> **HECHO** — Cola Focus offline idempotente (`focus-offline.ts`), continuar sesión conocida sin conexión (timer + transiciones), sin inicio offline, `clientAt` clamp en servidor, flush ordenado al reconectar, conflicto = autoridad remota. UI offline/pending. Tests `tests/focus-offline.test.ts`.

```text
Integra Enfoque con la cola offline de Planora.

OBJETIVO

Permitir que una sesión continúe sin conexión y se sincronice después sin perder tiempo ni duplicar transiciones.

REGLAS

- El timer visual debe continuar sin conexión.
- Las transiciones se guardan localmente con IDs idempotentes.
- Al recuperar conexión, se envían en orden.
- No se crea una fila por segundo.
- La base de datos valida revisión y unicidad.

INICIO OFFLINE

Decide e implementa una política clara:

Opción preferida si es segura:

- permitir iniciar localmente;
- reservar un ID estable;
- sincronizar al volver;
- si existe una sesión activa remota, mostrar conflicto y no fusionar silenciosamente.

Si la arquitectura actual no permite iniciar offline de forma segura, permite continuar una sesión ya conocida y explica la limitación. No simules soporte completo.

RECONCILIACIÓN

Cada acción offline debe contener:

- actionId idempotente;
- sessionId;
- revisión esperada;
- timestamp local;
- tipo de transición;
- payload validado.

Al sincronizar:

- aceptar acciones válidas;
- ignorar duplicados;
- detectar revisión obsoleta;
- resolver o pedir decisión;
- no inventar tiempos incompatibles.

UI

Mostrar estados:

- sin conexión;
- guardado en el dispositivo;
- pendiente de sincronizar;
- sincronizando;
- conflicto;
- sincronizado.

PRUEBAS

- iniciar o continuar offline según política;
- varias pausas;
- cerrar y reabrir;
- reconectar;
- acción duplicada;
- conflicto con sesión remota;
- cola corrupta;
- almacenamiento local lleno.

AL FINAL

Explica garantías y limitaciones reales.
```

---

# FASE 8 — Accesibilidad, exportación y calidad de producto

## Prompt 19 — Accesibilidad, teclado y responsive exhaustivo

> **HECHO** — Atajos de teclado de escritorio (Space/F/N/D/T/Shift+X/?/Esc) desactivables; ayuda de atajos; anuncios SR de fase/pausa/tiempo bajo demanda (no cada segundo); targets 44px; CSS 320px + landscape + reduced-motion; foco visible reutilizado. Tests `tests/focus-keyboard.test.ts`.
>
> **Incidencias corregidas:** atajos solo en immersive; Escape podía confundirse con cancelar; sin ayuda/desactivación de atajos; reloj visual oculto sin anuncio bajo demanda; gaps responsive en 320px/landscape.
>
> **Pendientes (no bloqueantes):** axe e2e de `/focus` autenticado (requiere sesión); auditoría manual exhaustiva de contraste en todos los temas de acento del usuario.

```text
Realiza una auditoría completa de accesibilidad y responsive de Planora Enfoque.

OBJETIVO

Que toda la función sea usable con teclado, lector de pantalla, zoom, reduced motion y pantallas pequeñas.

TECLADO

Define shortcuts solo en escritorio y sin interferir con inputs:

- espacio: pausar/reanudar;
- F o equivalente: vista inmersiva;
- N: nota rápida;
- Escape: cerrar overlays, no cancelar sesión;
- shortcut de finalizar solo con confirmación.

Muestra una ayuda de shortcuts y permite desactivarlos.

LECTORES DE PANTALLA

- no anunciar cada segundo;
- anunciar cambios de fase, pausa, reanudación y final;
- tiempo accesible bajo demanda;
- labels claros;
- progreso con semántica adecuada;
- dialogs con foco correcto.

RESPONSIVE

Revisa todas las vistas de Enfoque en:

- 320×568;
- 360×640;
- 375×667;
- 390×844;
- 412×915;
- tablet portrait/landscape;
- desktop;
- zoom 200%.

Comprueba safe areas, barra inferior, landscape, teclado virtual y scroll.

CONTRASTE Y MOVIMIENTO

- WCAG AA;
- reduced motion;
- no depender solo del color;
- foco visible;
- evitar pulsaciones accidentales.

FORMULARIOS

- labels visibles;
- errores asociados;
- inputs numéricos accesibles;
- reordenación por teclado;
- drag and drop con alternativa.

PRUEBAS

Añade axe u otra herramienta solo si ya existe o si la dependencia está claramente justificada. Si no, usa pruebas semánticas y auditoría manual documentada.

AL FINAL

Entrega una lista de incidencias encontradas, corregidas y pendientes.
```

## Prompt 20 — Exportación, restauración y privacidad de datos de Enfoque

> **HECHO** — Backup schema **v4**: Focus completo en JSON (presets/sesiones/intervalos/goals/notas/planes en config + preferencias de perfil). CSV de análisis sin notas; archivo `focus_session_notes_PRIVATE.csv` opcional. Restauración atómica: sesiones vivas → `cancelled`, intervalos abiertos cerrados, FKs huérfanas nulificadas, goals flexibles en SQL. Privacidad actualizada. Tests en `tests/backup.test.ts`.
>
> **Política sesiones activas:** al restaurar, `running|paused|on_break` se convierten en `cancelled` con `ended_at` y fase nula; no se reactivan timers ni notificaciones del sistema.

```text
Integra todos los datos de Enfoque con “Tus datos”.

OBJETIVO

Que la copia JSON por reemplazo conserve Enfoque de forma completa y segura, y que CSV permita analizar sesiones sin exponer información innecesaria.

JSON

Incluye:

- presets;
- objetivos;
- sesiones;
- intervalos o fases;
- planes estructurados;
- preferencias sincronizadas;
- notas y distracciones, porque forman parte de los datos del usuario;
- snapshots necesarios.

Actualiza `schemaVersion` y la capa de migración del backup.

RESTAURACIÓN

- validar antes de borrar;
- operación atómica;
- relaciones reconstruidas;
- una sola sesión activa como máximo;
- sesiones activas del backup deben restaurarse como pausadas o cerradas según una regla segura y documentada;
- no restaurar notificaciones del sistema activas sin permiso explícito;
- no duplicar al restaurar varias veces.

CSV

Añade tablas o archivos útiles:

- focus_sessions.csv;
- focus_intervals.csv si aporta valor;
- focus_goals.csv opcional.

Campos:

- fecha;
- modo;
- duración planificada;
- tiempo de enfoque;
- descanso;
- pausas;
- categoría;
- tarea o snapshot;
- estado;
- valoración opcional.

Evalúa si las notas deben incluirse en CSV. Preferencia: excluirlas por defecto o exportarlas en un archivo separado claramente identificado, para reducir exposición accidental.

ICS

No añadas sesiones de enfoque al calendario por defecto. Si se incluye una opción, debe ser explícita y no formar parte de esta entrega salvo que el producto ya la requiera.

PRIVACIDAD

Actualiza la política o texto de privacidad para explicar que las sesiones y notas se almacenan en la cuenta y forman parte de las exportaciones.

PRUEBAS

- exportar y restaurar cuenta con todos los modos;
- planes estructurados;
- notas;
- preset borrado;
- tarea borrada;
- sesión activa;
- restaurar dos veces;
- backup anterior sin Enfoque;
- backup nuevo en versión incompatible;
- usuario A/B.

AL FINAL

Explica cambios de formato, migración y política para sesiones activas.
```

## Prompt 21 — Onboarding, ayuda contextual y empty states

> **HECHO** — Intro de primera visita (sin carrusel) + rutas 25/50/cronómetro/preset + sugerencias editables programación/inglés/piano/lectura; «Ahora no» y reabrir ayuda; tips contextuales (auto-inicio, Wake Lock, notificaciones, completar tarea, plan, sync) con disclosure (no tooltips móviles); empty states mejorados. Tests `tests/focus-onboarding.test.ts`.
>
> **Activación:** intro → elegir ruta → configurador o preset → primera sesión. Estimación &lt; 1 min si se elige 25 min o cronómetro.

```text
Crea la primera experiencia de Planora Enfoque sin convertirla en un tutorial largo.

OBJETIVO

Que un usuario entienda la función y empiece su primera sesión en menos de un minuto.

PRIMERA VISITA

Mostrar una introducción breve con:

- qué es Enfoque;
- tres modos;
- posibilidad de vincular tareas;
- privacidad y recuperación;
- botón “Iniciar primera sesión”;
- opción “Ahora no”.

No uses un carrusel de muchas pantallas.

CONFIGURACIÓN INICIAL

Permite elegir una de estas rutas:

- sesión rápida 25 min;
- sesión 50 min;
- cronómetro;
- crear preset personalizado.

SUGERENCIAS

Ofrece ejemplos editables para:

- programación;
- inglés;
- piano;
- lectura.

No asumas que todos los usuarios estudian ni crees categorías sin permiso.

AYUDA CONTEXTUAL

Añade explicaciones discretas para:

- auto-inicio;
- Wake Lock;
- notificaciones;
- completar tarea;
- sesiones estructuradas;
- sincronización.

Evita tooltips en móvil para información crítica.

EMPTY STATES

Diseña estados para:

- sin presets;
- sin sesiones;
- sin objetivos;
- sin estadísticas suficientes;
- sin notificaciones permitidas;
- sin conexión.

PRUEBAS

- primera visita;
- omitir;
- volver a abrir ayuda;
- español/inglés;
- móvil pequeño;
- teclado.

AL FINAL

Resume el flujo de activación y tiempo estimado hasta primera sesión.
```

## Prompt 22 — Auditoría final, seguridad, rendimiento y release readiness

```text
Realiza una auditoría final de Planora Enfoque como si fuera una función lista para producción y portfolio.

OBJETIVO

Detectar y corregir errores funcionales, de seguridad, accesibilidad, rendimiento, responsive y consistencia antes de considerarla terminada.

AUDITORÍA FUNCIONAL

Prueba:

- countdown;
- cronómetro;
- ciclos;
- planes estructurados;
- pausa/reanudación;
- recarga;
- segundo plano;
- sesión activa;
- cierre;
- cancelación;
- notas;
- distracciones;
- tarea vinculada;
- objetivos;
- estadísticas;
- presets;
- exportación/restauración;
- offline;
- dos pestañas;
- takeover.

SEGURIDAD

- RLS en todas las tablas;
- ownership de relaciones;
- inputs Zod;
- límites de notas y archivos;
- no XSS;
- no HTML inyectado;
- no datos personales en logs;
- no secretos en cliente;
- rate limiting donde corresponda;
- CSRF/same-origin según patrones actuales;
- una sesión activa garantizada por DB.

RENDIMIENTO

- ninguna escritura por segundo;
- renders del timer aislados;
- consultas agregadas eficientes;
- índices usados;
- paginación de historial;
- bundle sin dependencias innecesarias;
- no bloquear LCP;
- PWA estable;
- no hydration mismatches.

ACCESIBILIDAD

- WCAG AA;
- teclado;
- lector de pantalla;
- zoom 200%;
- reduced motion;
- contraste;
- safe areas.

E2E OBLIGATORIOS

1. Crear preset.
2. Iniciar sesión desde tarea.
3. Pausar.
4. Recargar.
5. Reanudar.
6. Añadir distracción.
7. Completar.
8. Convertir distracción en tarea.
9. Ver estadísticas.
10. Exportar JSON.
11. Restaurar en estado limpio.
12. Confirmar que no hay duplicados.

Añade variantes móvil y desktop.

COMANDOS FINALES

Ejecuta:

- npm run lint
- npm run typecheck
- npm test
- npm run test:coverage
- npm run test:e2e
- npm run build
- npm audit

Corrige los problemas legítimos. No actualices dependencias mayores sin justificación.

DOCUMENTACIÓN

Actualiza:

- README;
- product spec;
- architecture;
- database;
- security;
- testing;
- backup and restore;
- implementation plan;
- screenshots pendientes si el flujo del proyecto lo contempla.

REPORTE FINAL

Entrega:

1. Funciones implementadas.
2. Decisiones de arquitectura.
3. Riesgos conocidos y limitaciones de navegador.
4. Resultados exactos de todos los comandos.
5. Cobertura relevante.
6. Migraciones necesarias.
7. Pasos de despliegue.
8. Checklist manual post-deploy.
9. Posibles mejoras futuras, claramente separadas del alcance actual.

No añadas nuevas funcionalidades durante esta auditoría salvo correcciones necesarias.
```

---

# Backlog posterior, no implementar durante los prompts anteriores

Estas ideas pueden estudiarse después de validar que Enfoque se usa de verdad:

- Sonidos ambientales opcionales con assets propios y descarga bajo demanda.
- Integración con calendario para reservar bloques futuros.
- Objetivos mensuales.
- Informes PDF.
- Widgets del sistema cuando la plataforma lo permita.
- Atajos de instalación PWA.
- Integración con técnicas de repetición espaciada mediante una app educativa separada.
- Tutor de IA o generación de planes, siempre con controles de privacidad y coste.
- Sesiones compartidas o grupos, solo si existe una necesidad real.

No implementar aún:

- bloqueo de aplicaciones externas;
- detección automática de distracciones;
- vigilancia de actividad del usuario;
- puntuación de productividad opaca;
- streaks punitivas;
- rankings sociales;
- IA que lea notas privadas sin consentimiento explícito;
- sincronización en tiempo real compleja sin métricas que la justifiquen.

# Orden recomendado de ejecución

Ejecuta los prompts exactamente en este orden:

`00 → 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22`

Puntos de control recomendados:

- Después del 02: revisar arquitectura de datos y dominio.
- Después del 06: probar el timer real varios días en móvil y escritorio.
- Después del 10: validar que la integración con tareas resulta natural.
- Después del 15: revisar que las estadísticas sean útiles y no excesivas.
- Después del 18: probar pérdida de conexión y dos dispositivos.
- Después del 22: desplegar y usar Enfoque durante una semana antes de ampliar alcance.
