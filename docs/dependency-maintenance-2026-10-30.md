# Revisión de PR de Dependabot — 30 de octubre de 2026

Se revisaron las siete PR originales y las cinco que Dependabot abrió al actualizar su configuración y liberarse huecos en la cola. Se comprobaron los diffs completos, versiones resueltas, fechas de publicación y requisitos. Ninguna versión adoptada está dentro del periodo de espera aplicado: tres días para parches, siete para versiones menores y treinta para mayores. No se modifican datos de usuarios ni migraciones.

| PR  | Propuesta                              | Decisión                                                                                                                 |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| #1  | actions/checkout v5 → v7               | Actualizar a v7.0.1, fijado al commit oficial `3d3c42e5aac5ba805825da76410c181273ba90b1`; validar de forma independiente |
| #2  | actions/setup-node v5 → v7             | Actualizar a v7.0.0, fijado al commit oficial `820762786026740c76f36085b0efc47a31fe5020`; validar de forma independiente |
| #3  | react-dom 19.2.8 → 19.3.1 y tipos      | Rechazar esta propuesta: exige React ^19.3.1, pero mantiene React 19.2.8; npm ci falla con ERESOLVE                      |
| #4  | @playwright/test 1.62.1 → 1.64.1       | Integrar en el lote de herramientas de pruebas, fijando la versión exacta                                                |
| #5  | @testing-library/dom 10.4.1 → 10.4.2   | Incluir en el lote de #4                                                                                                 |
| #6  | @vitejs/plugin-react 6.0.5 → 6.1.2     | Incluir en el lote de #4                                                                                                 |
| #7  | @testing-library/react 16.3.2 → 16.3.3 | Incluir en el lote de #4                                                                                                 |

## Propuestas posteriores

| PR  | Propuesta                                   | Resultado                                                                                          |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| #8  | React y ReactDOM 19.3.1, con tipos 19.3.0   | Integrada como pareja compatible, después de revisar las notas oficiales y pasar CI completo       |
| #9  | @testing-library/user-event 14.6.5 → 14.6.8 | Parche revisado e integrado con CI completo aprobado                                               |
| #10 | @vitest/coverage-v8 4.1.12 → 5.0.3          | Cerrada: exige exactamente Vitest 5.0.3, pero conserva el runner 4.1.12; npm ci falla con ERESOLVE |
| #11 | Prettier 3.9.6 → 3.9.10                     | Parche revisado e integrado con CI completo aprobado                                               |
| #12 | next-intl 4.13.7 → 4.14.9                   | Actualización menor revisada e integrada con CI completo aprobado sobre main actualizado           |

Resultado: siete PR integradas (#1, #2, #4, #8, #9, #11 y #12), tres duplicadas cerradas porque sus cambios están en #4, y dos propuestas incompatibles rechazadas (#3 y #10). Se eliminaron sus ramas de bot y las ramas locales creadas para la revisión.

## Compatibilidad y alcance

Checkout tiene cuatro usos. No hay eventos pull_request_target ni workflow_run, por lo que su nueva restricción sobre forks no exige cambiar el flujo. Setup-node tiene tres usos, con Node 24 y caché npm explícitos; no se publica a un registro ni se usa el NODE_AUTH_TOKEN ficticio eliminado. Cada actualización mayor conserva su propia PR y verificación de CI.

El plugin React se usa en Vitest sin las opciones experimentales de compilador afectadas. Playwright actualiza también playwright y playwright-core, y elimina su dependencia opcional fsevents. El primer lote no añade paquetes, registros alternativos ni scripts de instalación. React y react-dom quedaron inicialmente alineados en 19.2.8; #8 actualiza ambos a 19.3.1 y sus tipos a 19.3.0, sin copias adicionales ni conflictos de peers.

Next-intl incorpora tres paquetes de formateo @eloqnt publicados por su mantenedor, dos entradas anidadas de parsers FormatJS y actualizaciones de SWC y sus binarios. Se comprobó la procedencia de las entradas y sus integridades en el registro npm; no se añaden scripts de instalación. Los cambios de formato documentados para useExtracted con catálogos PO no afectan a Planora, que no usa esa función ni experimental.messages. No se activan funciones nuevas ni se cambian los mensajes de la app.

El primer E2E de #12 falló al arrancar el Supabase aislado, antes de ejecutar las pruebas. Tras actualizarse automáticamente la base de la PR y repetirse CI, todos sus checks pasaron; no se desactivaron pruebas ni se interpretó el fallo de infraestructura como éxito.

Los fallos E2E antiguos de las otras seis PR corresponden a la aserción anterior de restauración en e2e/backup-restore.spec.ts. Las ramas revisadas incluyen la corrección ya comprobada en main; no se omite ni se desactiva la prueba.

## Mantenimiento posterior

Dependabot agrupa React, su renderizador y sus tipos para evitar propuestas incompatibles como #3. Esta agrupación permitió revisar y adoptar React 19.3 como una unidad en #8, con las pruebas de Next.js. Las actualizaciones menores y parches de herramientas de prueba también se agrupan. La migración futura a Vitest 5 debe incluir conjuntamente el runner y su proveedor de cobertura; no se fuerza la resolución de peers ni se ignoran avisos de seguridad.

Se mantienen las comprobaciones semanales y las actualizaciones de seguridad. El cooldown configurado solo afecta a actualizaciones de versión, según la [referencia oficial de Dependabot](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#cooldown).

La instalación limpia conserva un aviso preexistente de tsconfck 3.1.6, transitivo de vite-tsconfig-paths 6.1.1. No cambia en este lote; revisar la retirada de ese plugin si sigue sin utilizarse, ya que Vite 8 ofrece resolución de paths en la configuración actual. No se permiten scripts adicionales de instalación para silenciar avisos.

## Verificación

Las comprobaciones locales incluyen instalación desde lockfile, árbol de peers, auditoría npm, TypeScript, compilación y la suite completa con cobertura. Tanto el primer lote como la combinación final con React 19.3 y next-intl 4.14 pasaron 552 pruebas en 77 archivos con sus umbrales de cobertura. La compilación final también pasó en Windows. La instalación final de 536 paquetes auditados devuelve cero vulnerabilidades conocidas y conserva los peers alineados.

Cada PR incorporada tenía todos los checks aprobados. Las acciones mayores se comprobaron independientemente y después combinadas con las herramientas actualizadas. La [última ejecución conjunta](https://github.com/JoanOliver04/planora/actions/runs/41106991689) pasó quality, E2E, CodeQL y Lighthouse. Se comprobó que el árbol integrado en main tras #12 coincidía exactamente con el de esa revisión validada, antes de actualizar este informe.
