# CLAUDE.md — OrganizacionApp

Instrucciones específicas de este proyecto. Se fusionan con las guías genéricas de
`~/.claude/CLAUDE.md`, que siguen aplicando.

Aplicado desde [`docs/arquitectura/07-convenciones-propuestas.md`](docs/arquitectura/07-convenciones-propuestas.md).

> **Estado del repo:** fase 0 cerrada el 2026-07-29. El andamiaje existe y funciona: monorepo
> pnpm con los 7 paquetes, TypeScript, Biome, Vitest, `dependency-cruiser` y CI en GitHub
> Actions, con la frontera del motor verificada en las dos mitades (paquetes npm y built-ins de
> Node). Los paquetes están **vacíos a propósito**: solo una constante `PACKAGE_ID` de
> andamiaje y su test de humo, que se borran en la fase que dé contenido a cada uno.

---

## Stack y estructura

Monorepo pnpm. TypeScript en modo `strict` en todo el stack.

- `packages/temporal` — jornadas, recurrencia, zonas horarias, álgebra de intervalos. Puro.
- `packages/domain` — tipos y value objects del dominio. Puro.
- `packages/engine` — **el motor de planificación**. Función pura `(EngineInput) => EngineOutput`.
- `packages/ical` — RFC 5545.
- `packages/contracts` — esquemas Zod, única fuente de verdad de los tipos de la API.
- `apps/api` — Fastify + Drizzle + PostgreSQL 16.
- `apps/web` — React + Vite.

## Comandos

Estos son los que existen. **Un comando que no está en esta tabla no existe todavía**: no lo
improvises ni lo sustituyas por otro. Si crees que falta uno, dilo.

| Comando | Qué hace |
|---|---|
| `pnpm verify` | La puerta: `typecheck` + `lint` + `test` + `depcruise` + `depcruise:cobertura` + `guardrail:cobertura`. Pasa antes de cualquier commit |
| `pnpm typecheck` | `tsc` en cada paquete, sin cortar en el primer fallo |
| `pnpm lint` / `pnpm format` | Biome. `format` escribe los cambios |
| `pnpm test` | Vitest sobre todos los proyectos |
| `pnpm test:engine` | Solo `@oa/engine`. Rápido, sin base de datos |
| `pnpm depcruise` | Grafo de dependencias: **¿hay aristas prohibidas?** |
| `pnpm depcruise:cobertura` | **¿El análisis está mirando lo que debe?** Falla si un paquete desaparece del grafo — un ruleset que no ve nada pasaría en verde sin esto |
| `pnpm guardrail:cobertura` | **¿El guardrail de reloj sigue viendo los paquetes que dice?** Inyecta un canario y exige que señale las 3 formas prohibidas y ninguna legítima. Un `overrides` que deja de casar sale en verde sin esto |

Llegan en su fase y **no antes**: `test:integration` y `db:generate`/`db:migrate` (fase 2),
`test:golden` (fase 3), `dev` (fase 6).

## Versiones y convenciones de compilación

Todas las versiones viven en el `catalog:` de `pnpm-workspace.yaml`. No las cambies sin decirlo.

Node **24** · pnpm **11.17.0** · TypeScript **6.0.x** · Vitest **4** · Biome **2.5.6** ·
dependency-cruiser **18** · temporal-polyfill **1.0.2**

- **No instales `typescript@latest`.** Hoy resuelve a 7.x, que no publica API programática y
  con el que `dependency-cruiser` no funciona: se perdería la frontera del motor entera. Ver
  ADR-016.
- **Los imports llevan extensión explícita y real**: `./foo.ts`, no `./foo` ni `./foo.js`
  (`moduleResolution: nodenext` + `allowImportingTsExtensions`). Biome lo verifica; si lo
  olvidas, `pnpm lint` falla.
- **`target`/`lib` es `es2024`, no `es2025`.** Es deliberado: `es2025` traería los tipos de
  `Temporal` al ámbito global y Node 24 no lo implementa sin flag, así que compilaría y
  reventaría en ejecución. Si necesitas `Temporal`, impórtalo explícitamente del polyfill.
- **`Temporal` se importa desde `@oa/temporal`**, que lo reexporta desde su único módulo
  `src/temporal.ts`. **Ningún otro archivo importa el polyfill.** Es lo que hace que cambiar de
  polyfill sea una línea, y `temporal-polyfill` se eligió sabiendo que no es el de los
  champions. Ver ADR-018.

## Dónde vive la documentación

- Diseño: `docs/arquitectura/00..07-*.md`
- Decisiones: `docs/arquitectura/adr/` — formato estándar, numeración correlativa.
- **Toda decisión que contradiga un ADR vigente exige un ADR nuevo que lo reemplace.**
  Un ADR aceptado **no cambia de decisión**: se supera con otro.
- **Sí admite notas fechadas**, y son la práctica de la casa (ADR-003, ADR-005, ADR-018): que una
  pregunta abierta confirmó lo ya decidido, que la justificación pasó de hipotética a empírica, o
  que un ejemplo del propio ADR resultó engañoso. Son aditivas y dicen explícitamente que ninguna
  decisión cambia. **Si la nota tendría que alterar la decisión, no es una nota: es el ADR que
  falta.**
- Preguntas abiertas pendientes de respuesta: `docs/arquitectura/06-preguntas-abiertas.md`.

## Límites que no se cruzan sin un ADR nuevo

1. `packages/engine`, `packages/temporal` y `packages/domain` **no tienen dependencias de
   I/O**: ni base de datos, ni HTTP, ni sistema de archivos, ni reloj. `now` siempre es un
   parámetro. Son **dos mecanizaciones distintas y las dos están demostradas**:
   `dependency-cruiser` cubre el I/O **importado**, y el plugin GritQL
   `scripts/biome/sin-reloj-ni-azar-en-nucleo.grit` cubre `Date.now()`, `new Date()` sin
   argumentos y `Math.random()`, que son globales y no imports. `new Date(argumento)`,
   `Math.max` y `Math.floor` **sí** están permitidos. El plugin alcanza además a
   `packages/ical`, que no es I/O-libre por la misma razón sino porque su salida debe ser
   reproducible byte a byte (ADR-017). Que cada guardrail siga mirando lo que debe lo
   verifican `depcruise:cobertura` y `guardrail:cobertura`.
   **Falta una tercera puerta, y hoy la sostienes tú:** adoptar `Temporal` (ADR-018) trae
   `Temporal.Now`, que lee reloj y zona ambiente a la vez, y el plugin todavía no lo ve.
   Tampoco ve `Intl.DateTimeFormat().resolvedOptions().timeZone` ni `performance.now`.
   Mecanizarlo es entrega de la fase 1, dueño `engine-dev`.
2. El validador del motor **no importa nada del módulo de colocación**. La duplicación es
   deliberada: si compartieran utilidades, la validación sería una tautología.
3. **Ningún campo que registre, insinúe o permita inferir información médica.** Las
   limitaciones se expresan solo como tiempo y energía (`capacity_modifiers` **no tiene ni
   tendrá** campo de motivo). Ver ADR-011.
4. **Ninguna regla de planificación en el cliente**, ni siquiera una validación de
   conveniencia. Si la interfaz necesita saber si algo cabe, lo pregunta al API.
5. **Ninguna constante mágica en el motor.** Todo número calibrable va en `EngineInput.params`.
6. **Ningún plan se activa sin diff reconocido** (`acknowledgedDiffId`). No se añade un atajo.
7. **El pasado es inmutable**: nada anterior a `regeneratedFrom` se modifica jamás.
8. **Un bloque, un objetivo.** Está garantizado por constraint en la base de datos.
9. Aleatoriedad prohibida en el motor, incluso con semilla. Los desempates son un orden total
   explícito.
10. Mocks de base de datos prohibidos en tests de integración: las constraints viven en el
    esquema y un mock las oculta.
11. **Ningún campo de texto persistido contiene un título copiado de otra entidad.** Las
    narrativas de sacrificio y los titulares de diff se guardan como plantilla + parámetros
    con referencias por id, y se redactan al leer. Un título copiado sobrevive al borrado de
    su entidad y rompe el derecho de supresión. Ver ADR-014.

## Anti-requisitos del producto (no son funcionalidades pendientes)

No implementar nunca, aunque se pidan de pasada: notificaciones por bloque, rachas,
gamificación, porcentaje de cumplimiento como métrica de portada, lenguaje de coach
motivacional, ni rellenar cada minuto disponible del día.

## Convenciones de dominio

- Todas las duraciones en **minutos enteros**, campos `*_minutes`.
- Parámetros de calibración por defecto (ADR-015): fricción **15 % + 7 min por transición**,
  bloque mínimo de foco **60 min**, bloque largo para prioridades bajas **90 min**, contacto
  diario de la #1 **30 min**, ventana de planificación **14 días**. Viven en
  `EngineInput.params`, nunca en el código.
- Todos los instantes en `timestamptz` (UTC) **más** la zona IANA cuando la intención horaria
  importa. Nunca una fecha civil sin zona.
- La unidad de planificación es la **jornada** (`[wake, nextWake)`), no el día calendario.
  La semana es una ventana de consulta, nunca una entidad. **No existe tabla `weeks`.**
- Un plan imposible **no es un error**: es `200 OK` con `feasibility: "INFEASIBLE"`.
- Los instantes del `.ics` (`DTSTAMP`, `CREATED`, `LAST-MODIFIED`) salen de la versión del
  plan, **nunca del reloj**. Ver ADR-017.
- Políticas de expansión de recurrencia, elegidas y no heredadas (ADR-018): `disambiguation:
  'compatible'` ante horas de pared inexistentes o ambiguas; las duraciones son minutos
  **reales** sobre la línea de instantes, no hora de pared, así que un bloque que contiene un
  cambio de horario dura lo que dura; `WKST=MO` en toda expansión, y `week_starts_on` es
  **pura presentación** — no llega nunca al expansor, porque haría que *qué instancias existen*
  dependiera de un ajuste de visualización.

## Git

- Ramas: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
- Commits en formato convencional.
- Un PR por fase del plan de implementación, o menos si la fase es grande.
- **Si un PR cambia una decisión documentada, actualiza el documento o el ADR en el mismo
  PR.** No se acepta "lo documento después".

## Enrutamiento de agentes

Este proyecto define sus agentes en `.claude/agents/`, que **tienen precedencia sobre los
globales de `~/.claude/agents/`**. Usa siempre los locales: los globales asumen NestJS +
Prisma y rutas de documentación que aquí no existen.

| Agente | Carril | Modelo |
|---|---|---|
| `arquitecto` | Diseño, ADRs y planes. Escribe solo en `docs/` | opus |
| `engine-dev` | `packages/*` — motor, temporal, dominio, ical, contracts. Funciones puras | opus |
| `backend-dev` | `apps/api` — Fastify + Drizzle | sonnet |
| `frontend-dev` | `apps/web` — React + Vite | sonnet |
| `db-architect` | Esquema y migraciones Drizzle. **El único que toca el esquema** | sonnet |
| `qa-engineer` | Criterios de aceptación y casos de prueba en `docs/qa/` | sonnet |
| `test-runner` | Ejecuta verificaciones y reporta. No corrige | sonnet |
| `security-reviewer` | Revisa y reporta. No modifica nada | sonnet |

- **Ningún agente de implementación cruza a otro carril.** Si necesita un cambio fuera del
  suyo, lo describe y lo pasa a quien corresponde.
- La implementación se guía por `docs/arquitectura/05-plan-de-implementacion.md`.
- Ante una decisión no cubierta por un ADR: parar y consultar, no improvisar.
