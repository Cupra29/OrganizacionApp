# Registro de decisiones de arquitectura (ADR)

Formato: contexto → decisión → alternativas consideradas → consecuencias.
Un ADR aceptado **no se edita**: se reemplaza por otro que lo supere.

| ADR | Decisión | Estado | Reversible |
|---|---|---|---|
| [001](./ADR-001-stack-y-monorepo.md) | TypeScript de extremo a extremo, monorepo pnpm, Fastify + React | aceptado | Sí |
| [002](./ADR-002-persistencia-postgresql.md) | PostgreSQL con `tstzrange` y constraints de exclusión; Drizzle | aceptado | Parcialmente |
| [003](./ADR-003-modelo-temporal-y-zonas-horarias.md) | **Jornada como unidad; UTC + zona IANA contextual** | aceptado | **No** |
| [004](./ADR-004-motor-determinista-vs-llm.md) | Motor determinista; LLM solo en los bordes | aceptado | Sí |
| [005](./ADR-005-recurrencia-y-excepciones.md) | **RRULE + generador CYCLE, excepciones por instante original** | aceptado | **No** |
| [006](./ADR-006-versionado-de-plan-y-diff.md) | **Instantáneas inmutables; linaje asignado al colocar; diff de dos niveles** | aceptado | **No** |
| [007](./ADR-007-entrevista-formulario-progresivo.md) | Formulario progresivo con puertas; JSONB parcial | aceptado | Sí |
| [008](./ADR-008-sincronizacion-calendarios.md) | Publicación en calendario separado de solo lectura | aceptado | Sí |
| [009](./ADR-009-alcance-primer-entregable.md) | Flujo completo sobre un subconjunto de variantes | aceptado | Sí |
| [010](./ADR-010-autenticacion.md) | Acceso sin contraseña por enlace de un solo uso | aceptado | Sí |
| [011](./ADR-011-privacidad-por-diseno.md) | **Sin campos de salud; reducción a restricción temporal** | aceptado | **No** |
| [012](./ADR-012-estrategia-de-despliegue.md) | Contenedor único en PaaS, Postgres gestionado | aceptado | Sí |
| [013](./ADR-013-motor-como-funcion-pura.md) | **El motor no conoce base de datos, red ni reloj** | aceptado | **No** |
| [014](./ADR-014-cumplimiento-rgpd.md) | RGPD como techo; narrativas estructuradas, no texto redactado | aceptado | Parcialmente |
| [015](./ADR-015-parametros-de-calibracion.md) | Fricción conservadora (15 % + 7 min) y corrección del tope emergente | aceptado | Sí |
| [016](./ADR-016-version-de-typescript.md) | TypeScript 6.0, no el compilador nativo 7.0, hasta que exista la API programática | aceptado | Sí |
| [017](./ADR-017-determinismo-del-ics.md) | El `.ics` es función de la versión del plan; `packages/ical` no lee el reloj | aceptado | Sí |
| [018](./ADR-018-expansion-de-recurrencia-sin-rrule.md) | Expansión de recurrencia propia sobre `Temporal`; `rrule` fuera del núcleo, `rrule-temporal` solo de oráculo | aceptado | Sí |

Los cinco marcados como no reversibles (003, 005, 006, 011, 013) son puertas de una sola
dirección: cambiarlos después implica migración destructiva o reescritura del núcleo. Son los
que merecen discusión antes de escribir código. ADR-014 es parcialmente irreversible: el
cambio de narrativas afecta a datos ya escritos, por eso se decidió antes de la fase 0.

## Revisiones registradas

| Fecha | Qué pasó |
|---|---|
| 2026-07-27 | Q1, Q4 y Q5 resueltas confirmando sus supuestos. |
| 2026-07-27 | Q12 (equipo y plazo) resuelta: **una persona, sin plazo**. **ADR-001 reexaminado y confirmado** — ver su §5. |
| 2026-07-27 | Q2 resuelta: marcado explícito del anclaje. Amplió el enum de ADR-003 a **tres** valores. |
| 2026-07-27 | Q8 resuelta: RGPD como techo. Nace **ADR-014** y cambia el esquema de `sacrifices`, `plan_diffs` e `infeasibility_reasons`. |
| 2026-07-28 | Q3, Q7, Q9, Q10 y Q11 resueltas confirmando sus supuestos. Q11 gana un argumento mejor: es consecuencia de la regla nº6, no una preferencia. |
| 2026-07-28 | Q6 resuelta con fricción conservadora. Nace **ADR-015**, que además **corrige una afirmación falsa de Q5** sobre el tope emergente. |
| 2026-07-28 | ✅ **Ninguna pregunta abierta. La fase 0 puede arrancar.** |
| 2026-07-28 | Los 15 ADRs pasan de `propuesto` a **`aceptado`**. A partir de aquí ninguno se edita: se supera con otro. |
| 2026-07-28 | Convenciones de [07](../07-convenciones-propuestas.md) aplicadas al `CLAUDE.md` de la raíz. Repositorio git inicializado. |
| 2026-07-28 | **Disponibilidad confirmada en 10–20 h semanales**, último dato de entrada que quedaba sin confirmar. Cae dentro de la franja para la que el plan está dimensionado: ADR-001 y ADR-009 se mantienen sin cambios. Nota fechada en ADR-001 en vez de ADR de reemplazo, porque ninguna decisión cambia. |
| 2026-07-29 | Nace **ADR-016** al ejecutar la fase 0: TypeScript 7.0 salió estable sin API programática y `dependency-cruiser` no lo soporta. Concreta la versión que ADR-001 dejaba abierta; no lo contradice. |
| 2026-07-29 | Cerrados los cuatro cabos de la fase 0. **Licencia MIT** declarada. `web-solo-contracts` y `apps-no-se-cruzan` **demostradas** (no hacía falta esperar a la fase 7). El disparador de ADR-016 pasa de nota a **workflow mensual** que comprueba sus dos condiciones. **Dependabot** para `github-actions`, que cierra el hueco abierto al anclar las acciones por SHA. Solo queda diferido `pull_request`, condicionado a que haya colaboradores. |
| 2026-07-29 | Entregada la primera parte de la fase 1, el **guardrail de reloj y aleatoriedad**. Nace **ADR-017**: `packages/ical` entra en su alcance porque el `.ics` de una versión debe ser reproducible byte a byte. **Ningún ADR queda reemplazado** — ninguno hablaba de `DTSTAMP`; es una concreción, como lo fue ADR-016. Corrige además la afirmación que motivó la revisión: un `DTSTAMP` cambiante **no** duplica eventos, la deduplicación es por `UID`. El [05](../05-plan-de-implementacion.md) se corrige en el mismo movimiento: nombraba `noRestrictedGlobals`, que es incapaz de la precisión que el propio documento exige. |
| 2026-07-29 | Nace **ADR-018** al evaluar la dependencia de recurrencia de la fase 1: la expansión se implementa sobre `Temporal` y **`rrule` no entra en producción** (devuelve `Date` cuyo significado depende de la zona del proceso — invisible para `dependency-cruiser`, para el guardrail y para un CI en UTC). `rrule-temporal` queda como **oráculo diferencial** en tests. **Ningún ADR queda reemplazado**: ADR-005 no nombraba biblioteca; esto concreta su §1 y §3 y **enumera el subconjunto**, que hasta hoy no era una especificación. Corrige además un **criterio de aceptación insatisfacible** del [05](../05-plan-de-implementacion.md): un 4×3 es un ciclo de 7 días, así que produce semanas civiles idénticas, no distintas. Descubre que el guardrail no ve `Temporal.Now` ni la zona ambiente. Abre **Q13**. |
