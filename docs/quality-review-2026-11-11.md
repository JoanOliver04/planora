# Revisión de calidad de Planora — 11 de noviembre de 2026

## Criterio de cierre

Revisar la versión como producto completo: flujos con una cuenta temporal,
accesibilidad de vistas y formularios, teclado y alternativas táctiles, texto
ampliado, ambos idiomas y temas, seguridad, dependencias, recuperación de errores,
rendimiento y publicación. Cerrar los defectos reproducibles encontrados y
verificar el resultado en producción. La valoración es editorial y está limitada
a las plataformas y escenarios comprobados; no implica ausencia universal de bugs.

Las mutaciones de prueba usan exclusivamente una instancia Supabase local de
Planora en puertos 56320–56329, separada de otros proyectos y de producción.

## Hallazgos de la revisión

| Área                       | Evidencia inicial                                                                                               | Trabajo                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Dependencias               | 14 avisos moderados en el árbol completo; Next 16.4.3                                                           | Next 16.4.6, minimatch 11.0.1; auditoría estricta sin vulnerabilidades conocidas                                             |
| Calendarios                | Roles de grid incompletos; fechas externas con contraste insuficiente; scroll de la demo sin acceso por teclado | Corregir semántica, contraste y navegación                                                                                   |
| Indicador de progreso      | Barra de progreso sin nombre accesible                                                                          | Añadir nombre contextual                                                                                                     |
| Ajustes                    | 17 controles sin etiqueta; opciones en inglés en la interfaz española                                           | Asociar etiquetas y traducir opciones                                                                                        |
| Colores                    | Contraste insuficiente con el acento de cuenta en modo oscuro y cálculo aproximado para colores personalizados  | Separar colores de relleno y texto; usar luminancia WCAG                                                                     |
| Texto secundario           | Contraste insuficiente en estados vacíos, ayudas y navegación                                                   | Unificar en colores secundarios legibles                                                                                     |
| Acceso                     | Redirección de usuario identificado atrapada por catch; error OAuth sin explicación; botón sin estado pendiente | Recuperación localizada y protección frente a envíos repetidos                                                               |
| Ordenación                 | Alternativas de arrastre y teclado, sin controles para mover con clics                                          | Añadir alternativa de puntero y proteger la persistencia concurrente                                                         |
| Autoría                    | La política indicaba abrir una incidencia privada en un repositorio público                                     | Eliminar la referencia incorrecta; el usuario ha excluido soporte, correos, dominios y contratación de servicios             |
| Herramientas               | El chequeo de formato recorre artefactos locales y depende de finales de línea                                  | Excluir artefactos y admitir los finales de línea de cada plataforma                                                         |
| Estadísticas con historial | Los días del mapa tenían etiquetas ARIA no válidas; indicadores positivos poco legibles en oscuro               | Lista accesible de días y color de éxito dependiente del tema                                                                |
| Eliminación de cuenta      | El servicio Auth no podía borrar una cuenta con tareas completadas, al ejecutarse el trigger sin privilegios    | Trigger interno no invocable por clientes, con comprobación de padres supervivientes; regresión SQL bajo el rol real de Auth |
| Exportación                | El contenido JSON era v5 pero el nombre del archivo anunciaba v4                                                | Versión del nombre derivada del contrato de backup                                                                           |
| Carga pública              | Traducciones privadas y precarga de la demo en la portada; instalación PWA compitiendo con recursos iniciales   | Catálogo de traducciones en los límites privados y de acceso, enlaces sin precarga y registro PWA aplazado                   |

La ordenación de Hoy incluye ahora las tareas globales al guardar el orden
combinado. La regresión reproduce el fallo anterior y verifica ambas posiciones
en la base de datos y después de recargar.

La auditoría inicial recorrió 80 pantallas públicas (20 rutas, dos idiomas y dos
temas) y 32 vistas privadas (16 rutas y dos temas). Se midió también el diseño a
320 px/125 %, 390 px/200 % y 1440 px/100 %. Los informes detallados se conservan
como artefactos locales ignorados en `.vercel/quality-*-baseline.json`.

## Seguridad de la base de datos

La revisión remota fue de solo lectura: proyecto activo, 18 tablas con RLS y
`db lint` sin errores. Las cinco funciones privilegiadas expuestas a cuentas
identificadas coincidían con las migraciones locales, con `search_path` vacío,
acceso anónimo revocado y controles de sesión y propiedad. La nueva migración
`20261111160000_completion_account_cascade.sql` corrige exclusivamente el trigger
de historial; no amplía los permisos de las tablas para el servicio Auth.

Los avisos del asesor se evaluaron según el modelo de acceso: tablas internas
sin políticas de cliente, funciones privilegiadas necesarias, índices y una
comprobación de contraseñas inaplicable con el acceso por contraseña desactivado
y Google como único proveedor. No se han contratado servicios ni activado
funciones de pago para cambiar la puntuación del asesor. Véase la
[documentación de asesores de Supabase](https://supabase.com/docs/guides/observability/advisors).

La batería SQL comprueba límites de datos, cuotas, aislamiento entre cuentas,
restauración atómica y eliminación de una cuenta con historial bajo
`supabase_auth_admin`. Todas las pruebas terminan con `ROLLBACK` y pasan tras
la corrección. Esta batería pasa a ejecutarse también en CI.

## Validación

La batería unitaria pasa con 665 pruebas en 88 archivos. Cobertura: 60,79 % de
sentencias, 53,76 % de ramas, 53,83 % de funciones y 62,76 % de líneas. También
pasan compilación de producción, tipos, lint, formato y auditoría estricta del
árbol completo de dependencias.

Las regresiones nuevas cubren errores y envíos repetidos de OAuth, redirección de
sesión, contraste de colores personalizados, actualización del orden, fallo de
guardado y cuenta con historial. Se han inspeccionado capturas actuales del
escritorio, calendario móvil, menú de orden y autoría en Ajustes oscuro.

La CI exige tres mediciones móviles de Lighthouse por ruta: mediana de
rendimiento mínima 90; accesibilidad y buenas prácticas 100 en todas las
mediciones. SEO de la portada debe permanecer en 100; la demo conserva su
exclusión intencional de indexación. Las mediciones locales de Lighthouse en
Windows fallaron al capturar la traza (`NO_NAVSTART`); no se utilizan como prueba
de mejora de rendimiento. La referencia y el candidato de CI se conservan por
separado.

La validación completa de navegadores y la publicación se registran junto a
esta revisión en el pull request de la entrega 0.1.2.
