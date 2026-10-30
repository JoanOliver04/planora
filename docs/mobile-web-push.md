# Avisos móviles con Planora cerrada

El motor anterior consultaba recordatorios cada 30 segundos desde la página. Una PWA cerrada o suspendida no mantiene ese temporizador. El permiso Notification y mostrar un aviso desde un service worker no programan su ejecución futura.

La nueva ruta usa Web Push estándar con VAPID. La base de datos conserva suscripciones de dispositivos y una cola de entregas. Supabase Cron llama cada minuto al dispatcher privado de Next.js; este cifra el contenido con `web-push` y lo entrega al proveedor del navegador. El evento `push` despierta el service worker sin páginas abiertas y muestra la notificación.

## Activación y expectativas

En Android, abrir la PWA instalada desde Chrome → Notificaciones y alarmas → Avisos con Planora cerrada → Activar en este dispositivo. El permiso debe aceptarlo el usuario en ese móvil. No puede habilitarse remotamente desde el servidor.

«Probar con la app cerrada» programa una entrega tras 60 segundos. Cerrar Planora y esperar 1–2 minutos con conexión. La respuesta del proveedor confirma aceptación, no que Android haya mostrado físicamente el aviso. El botón de prueba permite comprobar ese último tramo.

En iPhone, requiere una app añadida a la pantalla de inicio y iOS/iPadOS 16.4 o posterior. Una pestaña normal muestra instrucciones de instalación. [WebKit](https://webkit.org/blog/13878/).

Android controla sonido, No molestar, permisos de Chrome y restricciones de batería. Web Push puede retrasarse y necesita conexión; no es un despertador nativo con garantías de ejecución exacta o sonido continuo.

## Seguridad y consistencia

- Suscripciones ligadas al usuario autenticado y a su sesión real, con claves externas al backup portable, caducidad de 90 días y máximo de ocho dispositivos por usuario. Se renuevan al visitar los ajustes con el dispositivo registrado.
- RLS permite consultar solo las propias suscripciones. Las escrituras pasan por RPC con identidad derivada de JWT, sin aceptar un user ID suministrado por el cliente. Las funciones de cola y configuración privada solo son ejecutables por `service_role`.
- Endpoint HTTPS restringido a proveedores push conocidos en SQL y de nuevo en el dispatcher. Sin redirecciones a direcciones arbitrarias. API de configuración privada con no-store, escrituras del mismo origen, JSON acotado y límite de peticiones.
- Clave VAPID privada y token de cron en esquema privado sin acceso de anon/authenticated. No están en Git, bundles del navegador ni comandos de cron. El script inicial conserva las claves existentes al repetirse y elimina el SQL temporal con ACL del usuario.
- Outbox por dispositivo y ocurrencia con restricción única, leases, reintentos acotados y backoff. Un timeout después de aceptar la entrega puede ocasionar un reenvío: la etiqueta estable sustituye el aviso visible de esa ocurrencia; no se promete transporte exactamente una vez.
- Respuestas 404/410 retiran la suscripción. Cambiar o posponer una alarma invalida trabajos antiguos por comparación de su configuración. Al borrar una alarma se eliminan sus trabajos. Los recordatorios de más de 24 horas no generan una ráfaga al activar el dispositivo.
- El motor de página deja al servidor las ocurrencias de cuentas con push activo. Las actualizaciones de entrega no invalidan reintentos de otros dispositivos. Desactivar tipos/canal sincroniza sus preferencias; salir de la cuenta retira la suscripción local y cierra los avisos existentes.
- No se activa push silenciosamente en cuentas existentes ni se editan sus tareas. El backup portable excluye suscripciones y secretos; restaurar alarmas mantiene el comportamiento previo de dejarlas desactivadas.

## Operación

1. Pasar CI, incluidas migraciones y recorridos sobre Supabase aislado.
2. Aplicar la migración `20261030220000_web_push.sql` al proyecto Planora mediante Supabase CLI. Es aditiva y no actualiza recordatorios existentes.
3. Desplegar la app mediante la integración existente GitHub/Vercel.
4. Ejecutar `scripts/configure-web-push.ps1 -SupabaseCli <ruta>` en Windows desde el repositorio. Comprueba el project ref exacto, genera claves una sola vez y activa `planora-web-push` cada minuto. Este paso es deliberadamente externo a las migraciones para que CI nunca configure un cron contra producción.
5. Verificar `configuration.last_dispatch_at`, `cron.job_run_details` y las respuestas de pg_net; no mostrar tokens, endpoints ni contenido en los informes. `push_configuration.ready` refleja actividad reciente del dispatcher, no recepción en el teléfono.

Rollback: desactivar el job `planora-web-push` y revertir la app. No borrar datos personales ni rotar VAPID automáticamente: rotar claves requiere registrar de nuevo los dispositivos. Las tablas aditivas pueden permanecer inactivas. No usar Vercel Hobby Cron para esta frecuencia: su cron está limitado a una ejecución diaria. [Vercel](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Supabase Cron](https://supabase.com/docs/guides/cron).

## Pruebas y límite físico

Las pruebas unitarias ejecutan el service worker real en un contexto sin `window`, `localStorage` ni clientes abiertos. También cubren payload inválido, navegación segura, SSRF, resultados del proveedor, fallo al persistir, permiso explícito, instalación iPhone y fallo de configuración. La integración crea únicamente cuentas sintéticas en loopback y comprueba la cola, leases, avance, permisos y aislamiento entre usuarios.

La recepción en el móvil físico del usuario requiere su activación y la prueba de 60 segundos. No debe darse por acreditada únicamente con mocks, CI o un HTTP 201 del proveedor push.
