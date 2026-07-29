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
