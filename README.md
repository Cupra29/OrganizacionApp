# OrganizacionApp

**Planificación de agenda que diagnostica antes de agendar.**

> **Estado: diseño terminado, sin una línea de código todavía.** Este repositorio contiene
> la arquitectura, 15 ADRs aceptados y el plan de implementación por fases. La fase 0 aún no
> arranca.

---

## El problema

El síntoma es siempre el mismo: *"hago un poco de todo y no termino nada"*. La causa casi
nunca es falta de disciplina. Suele ser una de estas cuatro:

1. **Las mejores horas mentales están ocupadas** por compromisos fijos, y el trabajo
   importante cae en las horas de agotamiento.
2. **Hay más objetivos activos que capacidad**, así que cada uno recibe fragmentos inútiles.
3. **Nunca se calculó la capacidad real**: se planifica contra las horas que se cree tener,
   no contra las que quedan tras lo fijo y los traslados.
4. **Los intercambios son invisibles**: cada compromiso nuevo entra sin que nada salga,
   hasta que el plan colapsa.

Calendarios ya hay. Lo que falta es algo que diga **qué está chocando con qué**.

## Las reglas que lo definen

- **La capacidad se calcula, nunca se pregunta.** Sale de restar compromisos fijos,
  transiciones, mantenimiento personal y colchón de fricción a los límites del día.
- **El diagnóstico precede al calendario.** Primero ves por qué tu semana no funcionaba;
  el plan viene después.
- **Ningún intercambio es silencioso.** Toda replanificación muestra qué se sacrificó y por
  qué. A nivel de protocolo: ningún plan se activa sin que su diff haya sido reconocido.
- **El sacrificio sigue el ranking ordinal**, recortando desde la prioridad más baja.
- **Un plan imposible se declara imposible.** Si los deadlines no caben en la capacidad, el
  sistema lo dice en vez de generar un calendario que va a fracasar.
- **El bienestar es bloque protegido, no relleno.**

## Lo que deliberadamente no hace

Llenar cada minuto disponible · rachas y gamificación culpabilizante · notificaciones por
bloque · porcentaje de cumplimiento como métrica de portada · lenguaje de coach motivacional
· obligarte a migrar del calendario que ya usas.

Tampoco solicita, registra ni infiere información médica: las limitaciones se expresan solo
como tiempo y energía.

## Documentación

Todo el diseño vive en [`docs/arquitectura/`](docs/arquitectura/).

| Documento | Contenido |
|---|---|
| [00 — Visión y alcance](docs/arquitectura/00-vision-y-alcance.md) | El problema y qué entra en el primer entregable |
| [01 — Arquitectura](docs/arquitectura/01-arquitectura.md) | Contexto, contenedores y componentes |
| [02 — Modelo de datos](docs/arquitectura/02-modelo-de-datos.md) | Esquema, recurrencia, versionado y diffs |
| [03 — Motor de planificación](docs/arquitectura/03-motor-de-planificacion.md) | El corazón: capacidad, colocación, validación |
| [04 — Contratos de API](docs/arquitectura/04-contratos-api.md) | Entrevista, plan, diagnóstico, seguimiento, exportación |
| [05 — Plan de implementación](docs/arquitectura/05-plan-de-implementacion.md) | Fases con criterios de aceptación y estrategia de test |
| [06 — Preguntas abiertas](docs/arquitectura/06-preguntas-abiertas.md) | Las 12 ambigüedades del brief, todas resueltas |
| [ADRs](docs/arquitectura/adr/) | 15 decisiones con contexto, alternativas y consecuencias |

## Cinco decisiones irreversibles

Son puertas de una sola dirección: cambiarlas después implica migración destructiva o
reescribir el núcleo.

| ADR | Decisión | Por qué importa |
|---|---|---|
| [003](docs/arquitectura/adr/ADR-003-modelo-temporal-y-zonas-horarias.md) | La **jornada** `[despertar, siguiente despertar)` es la unidad, no el día calendario | El cronotipo nocturno deja de ser un caso especial y la aritmética del sueño es una resta |
| [005](docs/arquitectura/adr/ADR-005-recurrencia-y-excepciones.md) | RRULE + generador `CYCLE`, excepciones ancladas al instante original | RRULE expresa mal un turno rotativo 4×3; el anclaje sobrevive a los cambios de horario |
| [006](docs/arquitectura/adr/ADR-006-versionado-de-plan-y-diff.md) | Instantáneas inmutables; el linaje se asigna al colocar, no emparejando después | "Ningún intercambio silencioso" es una promesa de negocio y no puede depender de una heurística |
| [011](docs/arquitectura/adr/ADR-011-privacidad-por-diseno.md) | Sin ningún campo de salud | Verificado por introspección del esquema en la suite de tests |
| [013](docs/arquitectura/adr/ADR-013-motor-como-funcion-pura.md) | El motor no conoce base de datos, red ni reloj | Es lo que hace testeable de forma determinista la variedad de situaciones reales |

El motor es **100 % determinista**. Un modelo de lenguaje no puede *garantizar* cero solapes
ni hacer demostrable la regla del sacrificio ordinal.

## Stack previsto

Monorepo pnpm con TypeScript `strict` de extremo a extremo. Fastify + Drizzle + PostgreSQL 16
en el API; React + Vite en la interfaz. El motor y las utilidades temporales son paquetes
puros, sin I/O. Detalle y alternativas descartadas en
[ADR-001](docs/arquitectura/adr/ADR-001-stack-y-monorepo.md) y
[ADR-002](docs/arquitectura/adr/ADR-002-persistencia-postgresql.md).

## Licencia

Sin licencia declarada todavía, lo que por defecto significa *todos los derechos reservados*.
