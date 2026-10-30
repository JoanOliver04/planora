# Revisión de las siete PR de Dependabot — 30 de octubre de 2026

Se revisaron los diffs completos, las versiones resueltas, las fechas de publicación y los requisitos de las propuestas. Ninguna versión adoptada está dentro del periodo de espera aplicado: tres días para parches, siete para versiones menores y treinta para mayores. No se modifican datos de usuarios ni migraciones.

| PR  | Propuesta                              | Decisión                                                                                                                 |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| #1  | actions/checkout v5 → v7               | Actualizar a v7.0.1, fijado al commit oficial `3d3c42e5aac5ba805825da76410c181273ba90b1`; validar de forma independiente |
| #2  | actions/setup-node v5 → v7             | Actualizar a v7.0.0, fijado al commit oficial `820762786026740c76f36085b0efc47a31fe5020`; validar de forma independiente |
| #3  | react-dom 19.2.8 → 19.3.1 y tipos      | Rechazar esta propuesta: exige React ^19.3.1, pero mantiene React 19.2.8; npm ci falla con ERESOLVE                      |
| #4  | @playwright/test 1.62.1 → 1.64.1       | Integrar en el lote de herramientas de pruebas, fijando la versión exacta                                                |
| #5  | @testing-library/dom 10.4.1 → 10.4.2   | Incluir en el lote de #4                                                                                                 |
| #6  | @vitejs/plugin-react 6.0.5 → 6.1.2     | Incluir en el lote de #4                                                                                                 |
| #7  | @testing-library/react 16.3.2 → 16.3.3 | Incluir en el lote de #4                                                                                                 |

## Compatibilidad y alcance

Checkout tiene cuatro usos. No hay eventos pull_request_target ni workflow_run, por lo que su nueva restricción sobre forks no exige cambiar el flujo. Setup-node tiene tres usos, con Node 24 y caché npm explícitos; no se publica a un registro ni se usa el NODE_AUTH_TOKEN ficticio eliminado. Cada actualización mayor conserva su propia PR y verificación de CI.

El plugin React se usa en Vitest sin las opciones experimentales de compilador afectadas. Playwright actualiza también playwright y playwright-core, y elimina su dependencia opcional fsevents. No hay paquetes nuevos, registros alternativos ni scripts de instalación añadidos en el lockfile revisado. Las versiones de React y react-dom permanecen alineadas en 19.2.8, sin copias adicionales ni conflictos de peers.

Los fallos E2E antiguos de las otras seis PR corresponden a la aserción anterior de restauración en e2e/backup-restore.spec.ts. Las ramas revisadas incluyen la corrección ya comprobada en main; no se omite ni se desactiva la prueba.

## Mantenimiento posterior

Dependabot agrupa React, su renderizador y sus tipos para evitar propuestas incompatibles como #3. La actualización a React 19.3 debe volver a revisarse como una unidad, con las pruebas de Next.js, antes de adoptarse. Las actualizaciones menores y parches de herramientas de prueba también se agrupan.

Se mantienen las comprobaciones semanales y las actualizaciones de seguridad. El cooldown configurado solo afecta a actualizaciones de versión, según la [referencia oficial de Dependabot](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#cooldown).

La instalación limpia conserva un aviso preexistente de tsconfck 3.1.6, transitivo de vite-tsconfig-paths 6.1.1. No cambia en este lote; revisar la retirada de ese plugin si sigue sin utilizarse, ya que Vite 8 ofrece resolución de paths en la configuración actual. No se permiten scripts adicionales de instalación para silenciar avisos.

## Verificación

Las comprobaciones locales incluyen instalación desde lockfile, árbol de peers, auditoría npm, TypeScript, compilación y la suite completa con cobertura. El resultado de CI, E2E y Vercel queda en los checks de #1, #2 y #4, seguido de la ejecución conjunta en main antes de cerrar la limpieza.
