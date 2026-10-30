# Verificación de seguridad en producción — 30 de octubre de 2026

Aplicación: https://planora-lake-one.vercel.app. Proyecto Supabase: `cilfuieycxgmufiuymxa`. Despliegue principal: commit `2d4d520d45eeaa042bd52b68b2e42216fb7e562e`.

## Datos y alcance de las pruebas

- La cuenta principal se utilizó exclusivamente para consultas de integridad: 14 tablas se compararon mediante recuentos y huellas calculadas dentro de PostgreSQL, sin mostrar sus contenidos. La comprobación posterior a las migraciones coincidió exactamente.
- Las pruebas de escritura utilizaron únicamente la identidad de la cuenta secundaria indicada por el propietario y transacciones terminadas en `ROLLBACK`. No se borraron cuentas ni se conservaron tareas de prueba.
- Con la identidad secundaria se verificaron aislamiento RLS de la cuenta principal, creación de horario/tarea/completado, deshacer completado y rechazo de JSON sobredimensionado. Se verificó también una restauración válida, cuatro fallos contados y el rechazo del sexto intento; la transacción exterior revirtió todo, incluido su presupuesto de prueba.
- Las peticiones públicas de comprobación se hicieron sin cookies de usuario: salud 200, login 200 con nonce, respuestas privadas no-store, frame denial, HSTS y rechazo 403 de borrado desde otro origen.

## Cambios aplicados

Se aplicaron estas cuatro migraciones mediante Supabase CLI, sin seed ni cambios de secretos de Vault:

1. `20261030165630_restrict_auth_bootstrap_rpc.sql`
2. `20261030170000_restore_attempt_accounting.sql`
3. `20261030171000_database_resource_bounds.sql`
4. `20261030172000_security_lock_order.sql`

El permiso de restauración se retiró durante la transición y se devolvió al rol authenticated después de que Vercel confirmara el despliegue y pasaran las comprobaciones públicas. Anon y authenticated siguen sin acceso al core de restauración. La función de bootstrap de perfiles ya no admite ejecución directa desde roles cliente; el trigger continúa creando perfiles en la prueba aislada.

Se activó la exigencia SSL para conexiones directas a PostgreSQL. El control de Supabase devolvió `database:true` y `appliedSuccessfully:true`. Esta operación puede reiniciar brevemente la base de datos; las API HTTP de Supabase ya exigían TLS. [Documentación de SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement).

## Configuración observada

- Google habilitado; Email, Phone, proveedores restantes y acceso anónimo deshabilitados, según `/auth/v1/settings`.
- Timeout PostgreSQL: anon 3 segundos; authenticated 8 segundos.
- La consulta de copias físicas devolvió una lista vacía y PITR desactivado. Esto no acredita disponibilidad de una restauración gestionada por el proveedor.
- Se creó y verificó una copia local cifrada de ambas cuentas, con backups portables de esquema v5. El script valida el esquema, cifra con Windows DPAPI CurrentUser y descifra el archivo leído de disco para comparar su hash. No escribe exportaciones en claro ni las sube al repositorio. Los archivos se guardan en `%LOCALAPPDATA%/Planora/EncryptedBackups`.

La copia DPAPI requiere el mismo perfil de Windows y sus claves; no sustituye un backup externo ni una política automatizada de recuperación. El archivo contiene un bundle con `accounts[].backup`, importable mediante la herramienta de Planora después de descifrarlo. El identificador de cuenta solo selecciona el backup; la restauración de la app vuelve a imponer la propiedad autenticada.

Para generar otra copia local, usar `scripts/backup-account-data.ps1` con la ruta de Supabase CLI y los UUID de las cuentas autorizadas. No publicar los archivos descifrados ni añadirlos al repositorio.

## Advisors y comprobaciones

Tras retirar el permiso innecesario de bootstrap quedaron dos avisos WARN, sin errores:

- Restauración ejecutable por usuarios autenticados como SECURITY DEFINER: es el wrapper intencional, con auth.uid, ownership, presupuesto y helpers privados. No debe convertirse a INVOKER sin rediseñar la llamada a helpers revocados. [Aviso y criterios](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Protección de contraseñas filtradas desactivada: Email/password está deshabilitado y la app solo ofrece Google. Si se habilita contraseña en el futuro, debe revisarse este control. [Protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

La suite local anterior pasó 552 pruebas con cobertura, 38 pruebas de navegador y pruebas SQL aisladas. CI pasó quality, CodeQL y Lighthouse. Su E2E detectó una aserción del contrato antiguo de restauración; se actualizó para comprobar el resultado JSON de fallo y el sexto intento rechazado. La ejecución CI correspondiente debe consultarse para el resultado final.

## Pendientes y límites

El control de Chrome se detuvo porque no pudo verificar con confianza la URL activa de Windows. No se extrajeron cookies, tokens de la sesión abierta ni credenciales de Chrome. Las pruebas SQL con identidad secundaria no equivalen a una interacción visual ni a repetir el OAuth real dentro de esa pestaña.

No se verificaron ni modificaron en paneles: MFA de los operadores, rotación/caducidad de sesiones, allowlists OAuth, reglas WAF de Vercel, retención de logs y política externa de backups. El acceso directo de CLI a Vercel no estaba autenticado; el despliegue se completó mediante la integración existente de GitHub. Estos puntos requieren recuperar el acceso de navegador o una conexión administrativa autorizada; no deben declararse resueltos por las pruebas del código.
