# Revisión de las incidencias de Enfoque

Las tres incidencias detectadas durante la preparación de capturas se han corregido por petición del usuario. Los cambios y assets se verifican juntos antes de publicar.

## Histórico semanal de objetivos — corregido

La pantalla solo consultaba la semana actual, aunque el componente mostraba cuatro semanas. Ahora consulta las cuatro semanas con márgenes UTC y entrega ese conjunto a los objetivos. El resumen semanal recibe exclusivamente las sesiones de la semana local actual.

La regresión verifica sesiones de la semana anterior, la separación del resumen actual, el cambio de hora en Madrid y el inicio de semana en domingo. La captura de inicio de Enfoque vuelve a mostrar los objetivos y su histórico real.

## Editor de objetivos — corregido

Las etiquetas y los valores aparecían pegados. El editor ahora separa etiquetas y controles, utiliza los colores del tema y campos de ancho completo con una altura mínima de 44 px. Los selectores de días pueden envolver en pantallas estrechas. Se incluyen capturas reales del editor en escritorio y móvil.

## Bienvenida — corregida

El texto de bienvenida en español e inglés ahora enumera los cuatro modos: cuenta atrás, cronómetro, ciclos y plan estructurado por bloques. La captura inicial muestra de nuevo la bienvenida completa.

## Evidencia y límites

- La biblioteca se regenera con cuentas sintéticas en el proyecto local exclusivo `planora-docs`, conservando la CSP y las políticas RLS reales.
- El manifiesto identifica el commit base y el hash de las diferencias usadas para capturar las imágenes. La publicación se verifica mediante los despliegues de GitHub/Vercel.
- La revisión visual se registra por hash en `images/review.json`; el inventario está en [screenshots.md](screenshots.md).
- Los viewports móviles son emulados con Chromium; no acreditan una aceptación física en iOS/Android.
- Las pantallas de notificaciones muestran configuración, sin acreditar entrega de push o alarmas en un dispositivo físico.
- Las versiones optimizadas solo cambian resolución y compresión de capturas reales, sin contenido añadido.
