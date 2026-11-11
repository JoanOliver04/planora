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

Las acciones de recordatorios permanecen deshabilitadas hasta que sus manejadores
están hidratados y mientras se guarda una operación. Evita perder el primer toque
de borrado, edición, activación o posposición sobre el HTML inicial en Safari.

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

La batería unitaria inicial pasa con 665 pruebas en 88 archivos. Cobertura: 60,79 % de
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
esta revisión en el [pull request de la entrega 0.1.2](https://github.com/JoanOliver04/planora/pull/25).

La revisión de WebKit añade una regresión de origen (666 pruebas unitarias en
total): Next exponía `localhost` internamente para peticiones dirigidas a
`127.0.0.1`. La comprobación usa ahora la autoridad `Host` recibida, manteniendo
el rechazo de orígenes externos, autoridades malformadas, protocolos o puertos
distintos y peticiones marcadas como `cross-site`. Los encabezados de proxy
reenviados no autorizan peticiones. Una prueba E2E verifica también una petición
válida, además de los rechazos.

En Safari, los botones del menú de orden evitan perder el foco durante
`mousedown`, de modo que el clic puede guardarse antes de cerrar el menú. La
cabecera de Hoy permite saltos de línea a anchuras intermedias para que Añadir
permanezca dentro de la pantalla. La matriz funcional espera a los datos dentro
del plazo de recuperación de la app; el rendimiento se mide por separado.

La primera medición del candidato en CI obtiene 91/100/100/100 en la portada y
95/100/100/91 en la demo (rendimiento/accesibilidad/buenas prácticas/SEO), con
las seis ejecuciones superando las nuevas condiciones de cierre.

La migración de historial está aplicada en Supabase de producción. Se ha
verificado por metadatos que las seis funciones revisadas coinciden con las
versiones locales y sus permisos. No se han creado ni borrado cuentas de
producción para probarla. El editor de tareas conserva explícitamente el botón
de origen del foco para devolverlo al cerrar también en Safari.

La instalación inicial de navegadores en CI se detuvo por fallos DNS de los
repositorios APT. La batería E2E usa Ubuntu 24.04 y el servicio de navegadores de
la imagen oficial de Playwright, con la versión exacta del cliente instalado.
El servicio escucha solo en loopback y comparte la red del runner para acceder
a la app y a Supabase local; el repositorio está montado en modo de solo lectura.
Se elimina la dependencia de APT durante la ejecución de la batería. Véase la
[configuración Docker de Playwright](https://playwright.dev/docs/docker#remote-connection).

La inspección visual final en producción detectó imágenes rotas al recargar la
portada sin conexión: se guardaban los originales públicos, pero Next solicita
variantes optimizadas. El worker recupera ahora el original únicamente para las
imágenes públicas de su lista de precarga. Las dos capturas añaden 378.104 bytes
a esa caché, instalada tras el registro aplazado del worker; no se precargan como
recursos del HTML inicial. La regresión fuerza URLs nuevas para impedir que la
caché HTTP oculte el fallo: falla con el worker anterior y pasa tras la corrección
en los dos proyectos Chromium. El chequeo de conexión pasa también en WebKit.
El encabezado de privacidad de la portada española queda traducido.

La comprobación geométrica de Más espera ahora la posición final después de
redimensionar y desplazar la pantalla en WebKit. Conserva el límite de cero
solapamiento con la barra inferior y falla si falta cualquiera de los elementos.
Se han ejecutado tres recorridos completos de Safari antes y tres después del
ajuste. La corrección afecta a la sincronización de la prueba, sin cambios en
el diseño de la navegación.
