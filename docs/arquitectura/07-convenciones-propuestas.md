# 07 — Convenciones propuestas para `CLAUDE.md`

Fecha: 2026-07-24
Estado: **aplicada el 2026-07-28** en `CLAUDE.md` en la raíz del proyecto (no en el global
`~/.claude/CLAUDE.md`, que rige todos los proyectos del usuario). Al aplicarla se añadió una
subsección de correcciones a los agentes globales, que asumen NestJS/Prisma y rutas de ADR
distintas a las de este proyecto.

---

Abajo va el bloque que se propuso. **Ya está aplicado** en `CLAUDE.md` en la raíz del
proyecto. Se descartó ponerlo en el `~/.claude/CLAUDE.md` global —cuya sección de proyecto
sigue vacía— porque ese archivo rige todas las sesiones del usuario y estas convenciones son
específicas de este codebase: aplicarlas allí daría instrucciones equivocadas en cualquier
otro repositorio.

Al aplicarlo se añadió una subsección que este bloque no traía, **"Correcciones obligatorias
a los agentes globales"**: los agentes de `~/.claude/agents/` asumen NestJS + Prisma y buscan
los ADRs en `docs/adr/`, rutas y stack que no corresponden a este proyecto.

**Nota, resuelta el 2026-07-29:** el bloque original mencionaba versiones y comandos que no
existían. Al cerrar la fase 0 se confirmaron unos y se descubrió que otros **no debían
crearse**. La actualización que corrige eso está en la §3 de este documento, al final: es lo
que hay que aplicar a `CLAUDE.md` ahora.

---

## Bloque propuesto

````markdown
### Stack y estructura

Monorepo pnpm. TypeScript en modo `strict` en todo el stack.

- `packages/temporal` — jornadas, recurrencia, zonas horarias, álgebra de intervalos. Puro.
- `packages/domain` — tipos y value objects del dominio. Puro.
- `packages/engine` — **el motor de planificación**. Función pura `(EngineInput) => EngineOutput`.
- `packages/ical` — RFC 5545.
- `packages/contracts` — esquemas Zod, única fuente de verdad de los tipos de la API.
- `apps/api` — Fastify + Drizzle + PostgreSQL 16.
- `apps/web` — React + Vite.

### Comandos

```
pnpm verify          # typecheck + lint + tests + grafo de dependencias. Debe pasar antes de cualquier PR
pnpm test            # todos los tests
pnpm test:engine     # solo el motor (rápido, sin base de datos)
pnpm test:golden     # fixtures de las variantes del brief
pnpm test:integration# requiere Docker: levanta PostgreSQL con Testcontainers
pnpm db:migrate      # aplica migraciones
pnpm db:generate     # genera migración desde el esquema Drizzle
pnpm dev             # api + web en modo desarrollo
```

### Dónde vive la documentación

- Diseño: `docs/arquitectura/00..07-*.md`
- Decisiones: `docs/arquitectura/adr/` — formato estándar, numeración correlativa.
- **Toda decisión que contradiga un ADR vigente exige un ADR nuevo que lo reemplace.**
  No se edita un ADR aceptado: se supera con otro.
- Preguntas abiertas pendientes de respuesta: `docs/arquitectura/06-preguntas-abiertas.md`.

### Límites que no se cruzan sin un ADR nuevo

1. `packages/engine` y `packages/temporal` **no tienen dependencias de I/O**: ni base de
   datos, ni HTTP, ni sistema de archivos, ni reloj. `now` siempre es un parámetro.
   `dependency-cruiser` lo verifica en CI.
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

### Anti-requisitos del producto (no son funcionalidades pendientes)

No implementar nunca, aunque se pidan de pasada: notificaciones por bloque, rachas,
gamificación, porcentaje de cumplimiento como métrica de portada, lenguaje de coach
motivacional, ni rellenar cada minuto disponible del día.

### Convenciones de dominio

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

### Git

- Ramas: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
- Commits en formato convencional.
- Un PR por fase del plan de implementación, o menos si la fase es grande.
- **Si un PR cambia una decisión documentada, actualiza el documento o el ADR en el mismo
  PR.** No se acepta "lo documento después".

### Enrutamiento de agentes

- Diseño, ADRs y planes: agente `arquitecto`. Escribe solo en `docs/`, nunca código de
  producción.
- Implementación: sesión principal o agente de desarrollo, guiada por
  `docs/arquitectura/05-plan-de-implementacion.md`.
- Ante una decisión no cubierta por un ADR: parar y consultar, no improvisar.
````

---

## Por qué estas y no otras

Cada línea del bloque protege una decisión concreta de este diseño que la presión de las
fechas erosionaría primero:

| Convención | Qué protege |
|---|---|
| Sin I/O en `engine` / `temporal` | El determinismo, y con él toda la estrategia de testing |
| Validador independiente | Que "cero solapes" sea una garantía y no una tautología |
| Sin campos de salud | La prohibición explícita del brief, en el punto donde se erosiona por comodidad |
| Sin reglas en el cliente | Que exista una sola implementación de la planificación |
| Sin constantes mágicas | Que los parámetros se puedan calibrar con datos |
| Diff reconocido | La regla de negocio nº2, la más fácil de saltarse "solo esta vez" |
| Pasado inmutable | La evidencia de cumplimiento, insumo de la recalibración |
| Sin títulos copiados | Que el derecho de supresión siga siendo ejecutable a granularidad fina |
| Anti-requisitos listados | Que no vuelvan disfrazados de "mejora rápida" |

---

## 3. Actualización tras cerrar la fase 0 (2026-07-29) — bloques a aplicar en `CLAUDE.md`

El bloque de arriba se escribió antes de que existiera una línea de código y **hoy miente en
dos sitios**: anuncia cinco comandos que se decidió deliberadamente **no** crear
([`fase-0-ejecucion.md §4.4`](./fase-0-ejecucion.md)) y omite los dos que sí existen. Un
`CLAUDE.md` que enumera comandos inexistentes es peor que uno incompleto: un agente que
encuentra `pnpm db:migrate` documentado y ausente asume que el entorno está roto y se pone a
"arreglarlo".

Cuatro sustituciones quirúrgicas. Nada más cambia.

### A. Sustituye el bloque de estado del repo (el `>` bajo el título)

```markdown
> **Estado del repo:** fase 0 cerrada el 2026-07-29. El andamiaje existe y funciona: monorepo
> pnpm con los 7 paquetes, TypeScript, Biome, Vitest, `dependency-cruiser` y CI en GitHub
> Actions, con la frontera del motor verificada en las dos mitades (paquetes npm y built-ins de
> Node). Los paquetes están **vacíos a propósito**: solo una constante `PACKAGE_ID` de
> andamiaje y su test de humo, que se borran en la fase que dé contenido a cada uno.
```

### B. Sustituye la sección `## Comandos` entera

```markdown
## Comandos

Estos son los que existen. **Un comando que no está en esta tabla no existe todavía**: no lo
improvises ni lo sustituyas por otro. Si crees que falta uno, dilo.

| Comando | Qué hace |
|---|---|
| `pnpm verify` | La puerta: `typecheck` + `lint` + `test` + `depcruise` + `depcruise:cobertura`. Pasa antes de cualquier commit |
| `pnpm typecheck` | `tsc` en cada paquete, sin cortar en el primer fallo |
| `pnpm lint` / `pnpm format` | Biome. `format` escribe los cambios |
| `pnpm test` | Vitest sobre todos los proyectos |
| `pnpm test:engine` | Solo `@oa/engine`. Rápido, sin base de datos |
| `pnpm depcruise` | Grafo de dependencias: **¿hay aristas prohibidas?** |
| `pnpm depcruise:cobertura` | **¿El análisis está mirando lo que debe?** Falla si un paquete desaparece del grafo — un ruleset que no ve nada pasaría en verde sin esto |

Llegan en su fase y **no antes**: `test:integration` y `db:generate`/`db:migrate` (fase 2),
`test:golden` (fase 3), `dev` (fase 6).
```

### C. Añade después de `## Comandos`

```markdown
## Versiones y convenciones de compilación

Todas las versiones viven en el `catalog:` de `pnpm-workspace.yaml`. No las cambies sin decirlo.

Node **24** · pnpm **11.17.0** · TypeScript **6.0.x** · Vitest **4** · Biome **2.5.6** ·
dependency-cruiser **18**

- **No instales `typescript@latest`.** Hoy resuelve a 7.x, que no publica API programática y
  con el que `dependency-cruiser` no funciona: se perdería la frontera del motor entera. Ver
  ADR-016.
- **Los imports llevan extensión explícita y real**: `./foo.ts`, no `./foo` ni `./foo.js`
  (`moduleResolution: nodenext` + `allowImportingTsExtensions`). Biome lo verifica; si lo
  olvidas, `pnpm lint` falla.
- **`target`/`lib` es `es2024`, no `es2025`.** Es deliberado: `es2025` traería los tipos de
  `Temporal` al ámbito global y Node 24 no lo implementa sin flag, así que compilaría y
  reventaría en ejecución. Si necesitas `Temporal`, impórtalo explícitamente del polyfill.
```

### D. Sustituye el límite nº 1 de "Límites que no se cruzan"

Es el cambio más importante de los cuatro: sin él, `engine-dev` empieza la fase 1 creyendo que
el reloj está cubierto mecánicamente, y no lo está.

```markdown
1. `packages/engine` y `packages/temporal` **no tienen dependencias de I/O**: ni base de
   datos, ni HTTP, ni sistema de archivos, ni reloj. `now` siempre es un parámetro.
   `dependency-cruiser` lo verifica en CI **y está demostrado que salta** — pero solo ve
   **imports**. `Date.now()`, `new Date()` y `Math.random()` son globales, no módulos: **hoy no
   los detecta nadie.** Mecanizarlo es entrega de la fase 1, dueño `engine-dev`. Hasta
   entonces, esa mitad de la regla la sostienes tú, no la herramienta.
```
