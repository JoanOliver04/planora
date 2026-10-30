# Refuerzo de seguridad de Planora — 30 de octubre de 2026

Se revisaron las skills instaladas pertinentes, la arquitectura de Planora y sus fronteras de seguridad antes de implementar los cambios. La auditoría Codex Security `d0fc24ac-8c90-4ff8-bb43-e7543da3349e` conserva el estado inicial `31292798602dad317d42caf41d565aa7689c798c`. El informe canónico del plugin permanece separado e inmutable; este documento registra la implementación posterior.

La revisión cubrió autenticación, acciones, rutas HTTP, cachés, almacenamiento offline, migraciones RLS/FK/RPC, restauración, dependencias y CI. Hubo una revisión independiente de código y otra de arquitectura, más investigación SQL. La cobertura estática del informe se declaró parcial: no se leyeron exhaustivamente todos los componentes de presentación ni todas las pruebas. No se probó ni modificó producción, no se usaron sus credenciales y no se examinó el historial Git. No se identificó un bypass entre cuentas en las fronteras revisadas; esto no constituye una garantía de ausencia de vulnerabilidades.

## Hallazgos iniciales y correcciones

| Hallazgo                                                     | Prioridad evaluada | Implementación                                                                                        |
| ------------------------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------- |
| Next.js 16.3.8 afectado por DoS en Server Actions            | Alta               | Next.js y eslint-config-next 16.4.3                                                                   |
| Zod 3 afectado por consumo de memoria al validar colecciones | Alta               | Zod 4.6.7, con verificación de schemas y tipos                                                        |
| Una restauración RPC fallida revertía su contador SQL        | Media              | Contador exterior, restauración en savepoint, errores JSON saneados y comprobación explícita de éxito |

Fuentes de los avisos: [Next.js Server Actions](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) y [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). El inventario npm inicial tenía ocho paquetes afectados, incluyendo avisos críticos del proveedor cuya explotabilidad en Planora no se afirmó. También se actualizaron sharp, undici, Vite y Vitest. El [inventario inicial](security-dependencies-before-2026-10-30.json) conserva la evidencia de dependencias; la instalación actualizada devolvió cero vulnerabilidades conocidas y el gate final no encontró altas ni críticas.

La revisión posterior de persistencia encontró además que los títulos recientes, un borrador de horario y el fallback de sincronización Focus podían sobrevivir al cierre de sesión y aparecer en otra cuenta del mismo perfil de navegador. Se corrigió su limpieza y separación por propietario, incluyendo las escrituras asíncronas pendientes. Es un riesgo local de privacidad, distinto de un acceso remoto entre cuentas; no se modificó retroactivamente el informe inicial sellado.

## Protecciones adicionales implementadas

- CSP con 192 bits aleatorios por solicitud para login y páginas privadas. La política llega a la petición que renderiza Next y `script-src` precede a `script-src-attr`, evitando que el extractor de nonce elija la directiva equivocada. Los enlaces desde landing/demo a login abren un documento nuevo: una navegación SPA conserva la CSP del documento anterior.
- Cookies de sesión host-only, SameSite=Lax y Secure sobre HTTPS. Guard de configuración para impedir orígenes inseguros y claves privilegiadas en variables públicas.
- Borrado de cuenta exige JWT verificado del mismo usuario y un método de autenticación de los últimos diez minutos. Un refresh de JWT no cuenta como reautenticación. Se conserva la confirmación explícita, protección de origen y límite distribuido; se limpian cookies, almacenamiento y caché.
- Guard central de sesión para cerrar la interfaz privada y desmontar sus efectos al salir o cambiar de cuenta. Difusión entre pestañas y generaciones de sesión invalidan operaciones asíncronas anteriores.
- Cachés y colas Focus con límites antes de JSON.parse, validación de identidad/configuración/intervalos/transiciones y protección frente a datos futuros o de otra cuenta.
- Telemetría limitada a 4 KiB reales de UTF-8, incluso sin Content-Length. Tipo JSON exacto y origen estricto. Solo se registran rutas canónicas y metadatos técnicos permitidos; se omiten mensajes libres y contexto arbitrario. Los fallos de tareas no registran detalles de filas PostgreSQL.
- Solicitudes del limitador y administración con timeout; los límites sensibles fallan cerrados si la red o el almacén fallan.
- Cuotas PostgreSQL y límites JSON aplicables también a clientes PostgREST. Controles de restauración y propiedad siguen derivando exclusivamente de auth.uid().
- CI con timeouts/concurrencia, enmascarado de credenciales locales y archivos temporales privados; E2E administrativos rechazan proyectos no loopback. Gate de npm sin excepciones de avisos, con rechazo de informes fallidos o incoherentes. Dependabot semanal para npm y acciones.

## Límites de datos

| Recurso por usuario                 |                                                            Máximo |
| ----------------------------------- | ----------------------------------------------------------------: |
| Horarios                            |                                                               200 |
| Categorías                          |                                                               500 |
| Tareas / eventos                    |                                                   5.000 por tabla |
| Completados / estados de ocurrencia |                                                  20.000 por tabla |
| Plantillas guardadas                |                                                               500 |
| Registros de importación            |                                                             5.000 |
| Recordatorios                       |                                                             1.000 |
| Presets Focus                       |                                                               200 |
| Sesiones Focus                      |                                                             5.000 |
| Intervalos Focus                    |                                                            50.000 |
| Objetivos Focus                     | 50 (se conserva compatibilidad con backups; el editor permite 10) |

JSON: 16 KiB por preferencias/configuración de franjas, snapshot de tarea y snapshot de enlace Focus; 8 KiB de recurrencia; 256 KiB de contenido de plantilla; 64 KiB de configuración/segmentos/distracciones Focus. Máximo 40 segmentos y 50 distracciones de 280 caracteres. Las claves de importación también están acotadas. Los límites CHECK nuevos usan NOT VALID: no borran ni inspeccionan retroactivamente datos existentes; los nuevos datos y las actualizaciones sí se comprueban. Las cuotas pueden impedir nuevas inserciones hasta liberar capacidad; no se elimina historial automáticamente.

Los INSERT toman un bloqueo por propietario y comprueban el total una vez por sentencia para mantener eficiente la restauración masiva. Restauración, onboarding y borrados usan el mismo orden de bloqueo para evitar interbloqueos. Las cuentas antiguas que superan una cuota pueden liberar capacidad mediante borrados progresivos; un borrado no puede hacer crecer sus tombstones por encima del máximo entre 20.000 y el total previo a ese borrado. El bootstrap privilegiado sin auth.uid() se exceptúa de las cuotas; los clientes anónimos siguen sin permisos de escritura.

## Verificación reproducible

```powershell
npm run lint
npm run typecheck
npm run format:check
npm run test:coverage -- --pool=threads --maxWorkers=3
npm run test:security:e2e -- --project=chromium --workers=1
powershell -NoProfile -File scripts/test-security-db.ps1
node scripts/audit-high.mjs
```

El runner SQL crea un contenedor temporal sin red ni puertos, aplica todas las migraciones y elimina solo su propio contenedor. Requiere la imagen Supabase PostgreSQL ya descargada. Las pruebas verifican rollback exacto, conservación de intentos fallidos, quinto éxito/sexto rechazo, constraints diferidas entre propietarios, permisos de RPC internos, límites directos y restauración Focus/recordatorios. Se reprodujo el wrapper original con cero intentos retenidos tras fallar; el corregido conserva cuatro fallos. Una prueba con dos conexiones confirmó bloqueo y rechazo del horario 201 manteniendo exactamente 200 filas.

La suite completa pasó con 552 pruebas en 77 archivos y cobertura por encima de los umbrales de CI: 58,53 % de sentencias, 51,11 % de ramas, 52,11 % de funciones y 60,45 % de líneas. También pasaron 38 pruebas de navegador en Chromium y WebKit móvil: nonce, bloqueo de scripts inyectados, navegación desde páginas públicas al login, cabeceras privadas, rechazo de origen externo, demo y shell público offline. Lint, comprobación de tipos, formato y build de producción forman parte de la verificación final. No se automatizó un login real con Google ni se hizo una operación administrativa contra producción.

## Despliegue y límites de la protección

Los cambios están implementados localmente. Deben aplicarse las migraciones y desplegarse la aplicación de manera coordinada, con restauración suspendida durante la transición de contrato. Véase [despliegue](deployment.md). No se ejecutó ningún cambio sobre Supabase o Vercel de producción.

- Cancelar una transacción, agotar el timeout o abortar una conexión revierte también el contador exterior SQL. Se requieren límites de tráfico, conexión, tiempo y cuerpo en el gateway de Supabase y del hosting. Las cuotas por cuenta no impiden por sí solas abuso mediante muchas cuentas.
- Las páginas públicas estáticas conservan permiso de scripts inline para mantener su renderizado estático y PWA offline. El código privado usa nonces; los estilos mantienen unsafe-inline por compatibilidad con estilos dinámicos. No se estableció un sink de HTML ejecutable del usuario en la revisión.
- Las cookies siguen siendo legibles por JavaScript porque el cliente Supabase refresca sesiones y consulta REST directamente. Una arquitectura BFF con cookies HttpOnly requiere rediseñar esos flujos. [Guía oficial de Supabase](https://supabase.com/docs/guides/auth/server-side/advanced-guide).
- La información offline permanece accesible al mismo perfil del navegador mientras la sesión está activa. No hay cifrado de extremo a extremo ni una promesa de aislamiento frente a otro script del mismo origen o un dispositivo comprometido.
- Hay que verificar en los paneles reales Google-only, rotación de refresh tokens, caducidad de sesiones, MFA de operadores, allowlists OAuth, RLS desplegado, secretos, retención de logs y backups. La configuración local de Supabase permite autenticación de prueba y no representa el estado del servicio alojado.

Métrica devuelta por el plugin al cerrar la auditoría inicial: 12.731.684 tokens totales, 12.674.700 de entrada y 12.151.040 de entrada en caché; incluye cuatro hilos y no mide el trabajo posterior de implementación. No representa un cálculo de coste.
