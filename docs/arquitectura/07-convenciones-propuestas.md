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

**Nota:** varias líneas mencionan versiones y comandos que **todavía no existen** (el repo
tiene documentación, `CLAUDE.md` y control de versiones, pero ni una línea de código). Deben
confirmarse al cerrar la fase 0; hasta entonces son la intención del diseño, no un hecho
verificable.

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
