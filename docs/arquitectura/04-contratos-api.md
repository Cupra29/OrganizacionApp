# 04 — Contratos de API

Fecha: 2026-07-24
Decisiones de soporte: [ADR-001](./adr/ADR-001-stack-y-monorepo.md), [ADR-007](./adr/ADR-007-entrevista-formulario-progresivo.md), [ADR-008](./adr/ADR-008-sincronizacion-calendarios.md), [ADR-010](./adr/ADR-010-autenticacion.md)

---

## 1. Convenciones

- Base: `/api/v1`. Versión en la ruta; una versión nueva solo ante un cambio incompatible.
- JSON en ambos sentidos. `Content-Type: application/json; charset=utf-8`.
- **Todos los instantes viajan en ISO-8601 con offset explícito** (`2026-08-03T09:00:00-06:00`).
  Nunca epoch, nunca fechas sin zona. Cuando la zona importa semánticamente (no solo el
  instante), viaja además el campo `timezone` con el identificador IANA.
- Duraciones siempre en **minutos enteros**, campo `*_minutes`. Sin ISO durations, sin
  segundos: la unidad de todo el dominio es el minuto.
- Autenticación por cookie de sesión `httpOnly`. Excepción: los feeds `.ics`, que usan un
  token opaco en la URL.
- Errores con forma estable:

```jsonc
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Texto legible",
    "details": [{ "path": "goals[0].rankOrdinal", "issue": "duplicated" }]
  }
}
```

- Los esquemas viven en `packages/contracts` como definiciones Zod, y **son la única fuente
  de verdad**: el API valida con ellas en el borde y la web deriva sus tipos de ellas. No hay
  tipos de API escritos dos veces.

**Un plan imposible no es un error.** Se devuelve `200 OK` con
`feasibility: "INFEASIBLE"`. Modelarlo como 4xx llevaría a cualquier cliente a mostrarlo como
fallo, y el brief exige que declararlo sea un resultado legítimo.

---

## 2. Sesión

```http
POST /api/v1/auth/request-link      { "email": "..." }        -> 202 (siempre 202)
POST /api/v1/auth/consume           { "token": "..." }        -> 200 + Set-Cookie
POST /api/v1/auth/logout                                      -> 204
GET  /api/v1/me                                               -> 200 UserProfile
```

`request-link` devuelve `202` tanto si el email existe como si no, para no filtrar quién
tiene cuenta. Rate limit por IP y por email.

---

## 3. Entrevista

El estado vive en el servidor y la interfaz es un cliente tonto del paso actual.

```http
GET   /api/v1/interview/session
PATCH /api/v1/interview/session
POST  /api/v1/interview/session/commit-section
```

```jsonc
// GET -> 200
{
  "id": "…",
  "status": "IN_PROGRESS",
  "currentStep": "fixed_commitments",
  "steps": [
    { "id": "temporal_profile",   "status": "COMPLETE",     "required": true },
    { "id": "fixed_commitments",  "status": "IN_PROGRESS",  "required": true },
    { "id": "transitions",        "status": "PENDING",      "required": true },
    { "id": "goals_ranking",      "status": "PENDING",      "required": true },
    { "id": "wellbeing",          "status": "PENDING",      "required": true },
    { "id": "tasks_inventory",    "status": "PENDING",      "required": false }
  ],
  "answers": { /* parcial, tal cual lo escrito */ },
  "gates": {
    "readyForDiagnosis": false,
    "readyForPlan": false,
    "missingForDiagnosis": ["fixed_commitments.at_least_one", "temporal_profile.peak_window"],
    "missingForPlan": ["goals_ranking", "wellbeing"]
  }
}
```

**Las dos puertas (`gates`) son el elemento de diseño importante de este contrato.** El
anti-requisito nº4 prohíbe exigir estimaciones detalladas antes de dar valor, y la regla nº5
exige que el diagnóstico preceda al calendario. Las puertas hacen ambas cosas explícitas y
verificables: `readyForDiagnosis` se alcanza con **perfil temporal + al menos un compromiso
fijo + franja pico** — sin ranking, sin tareas, sin estimaciones. `readyForPlan` exige el
resto. La interfaz puede ofrecer "ver diagnóstico" en cuanto la primera puerta se abre.

`PATCH` es aditivo y tolerante: guarda respuestas parciales sin validación global. Es lo que
permite pausar en cualquier punto.

`commit-section` valida una sección completa y **normaliza sus respuestas a las tablas
definitivas**. Es la operación transaccional que convierte JSONB en entidades reales.

```jsonc
// POST /interview/session/commit-section  { "sectionId": "fixed_commitments" }
// -> 200
{ "committed": true, "created": { "fixedCommitments": 4, "recurrenceRules": 4, "transitions": 6 },
  "gates": { "readyForDiagnosis": true, "readyForPlan": false, ... } }
// -> 422 si la sección no valida, con details por campo
```

### Captura en lenguaje natural (diferida, contrato reservado)

```http
POST /api/v1/interview/parse      { "text": "los martes y jueves doy clase de 9 a 13" }
```

Devuelve **una propuesta tipada que el usuario debe confirmar**, jamás una escritura directa:

```jsonc
{
  "proposals": [{
    "type": "FIXED_COMMITMENT",
    "confidence": 0.86,
    "value": { "title": "Clase", "recurrence": { "kind": "RRULE",
               "rruleText": "FREQ=WEEKLY;BYDAY=TU,TH" },
               "startLocal": "09:00", "durationMinutes": 240 }
  }],
  "discarded": ["texto no reducible a una restricción temporal"]
}
```

`discarded` no incluye el texto original. Es donde se materializa el compromiso de privacidad
del [ADR-011](./adr/ADR-011-privacidad-por-diseno.md): si el usuario escribió *"los martes
tengo quimioterapia"*, la propuesta es un compromiso fijo martes 9–13 y la etiqueta clínica
no se persiste ni se devuelve.

---

## 4. Entidades de dominio

CRUD convencional; se documenta solo lo que tiene forma no obvia.

```http
GET|PUT   /api/v1/profile/temporal
GET|POST  /api/v1/energy-windows          DELETE /api/v1/energy-windows/{id}
GET|POST  /api/v1/commitments             PATCH|DELETE /api/v1/commitments/{id}
GET|POST  /api/v1/goals                   PATCH|DELETE /api/v1/goals/{id}
PUT       /api/v1/goals/ranking
GET|POST  /api/v1/tasks                   PATCH|DELETE /api/v1/tasks/{id}
GET|POST  /api/v1/wellbeing               PATCH|DELETE /api/v1/wellbeing/{id}
GET|POST  /api/v1/capacity-modifiers      DELETE /api/v1/capacity-modifiers/{id}
GET|POST  /api/v1/day-exceptions
```

**Compromiso fijo con recurrencia cíclica** (turno rotativo):

```jsonc
// POST /api/v1/commitments
{
  "title": "Turno hospital",
  "sourceLabel": "Empleo A",
  "modality": "IN_PERSON",
  "negotiable": false,
  "energyCost": "HIGH",
  "drainsAfterMinutes": 90,
  "anchor": "LOCAL_WHEREVER",
  "recurrence": {
    "kind": "CYCLE",
    "timezone": "America/Mexico_City",
    "anchorDate": "2026-08-03",
    "cyclePattern": {
      "cycleLengthDays": 7,
      "shifts": [
        { "dayOffsets": [0,1], "startLocal": "07:00", "durationMinutes": 720 },
        { "dayOffsets": [2,3], "startLocal": "19:00", "durationMinutes": 720 }
      ]
    },
    "effectiveUntil": null
  },
  "transitions": [
    { "kind": "TRAVEL_TO",   "minutes": 45, "appliesWhenModality": "IN_PERSON" },
    { "kind": "TRAVEL_FROM", "minutes": 45, "appliesWhenModality": "IN_PERSON" },
    { "kind": "RECOVERY",    "minutes": 30 }
  ]
}
```

**Ranking de objetivos: se reordena entero, nunca por partes.**

```jsonc
// PUT /api/v1/goals/ranking
{ "order": ["goal-uuid-a", "goal-uuid-c", "goal-uuid-b"] }
```

Enviar la lista completa evita estados intermedios con rangos duplicados. Como el orden total
sostiene la regla del sacrificio ordinal, un empate transitorio haría el sacrificio no
determinista. El servidor reasigna `rank_ordinal` 1..N en una transacción.

**Modificador de capacidad** — obsérvese la ausencia de motivo:

```jsonc
// POST /api/v1/capacity-modifiers
{ "from": "2026-08-05T00:00:00-06:00", "to": "2026-08-06T00:00:00-06:00",
  "focusCapacity": "REDUCED" }
```

El contrato **no acepta** un campo `reason`, `note` ni `category`. Un cliente que lo envíe
recibe `422`. Es la implementación en el borde de la prohibición de registrar información
médica.

---

## 5. Diagnóstico

```http
POST /api/v1/diagnosis            { "windowStart": "…", "windowEnd": "…" }
GET  /api/v1/diagnosis/latest
```

```jsonc
// 200
{
  "id": "…",
  "computedAt": "2026-07-24T18:00:00-06:00",
  "window": { "start": "…", "end": "…" },
  "capacity": {
    "assignableMinutesPerWeek": 1320,
    "naiveExpectationMinutes": 2400,
    "byDay": [
      { "planningDayId": 0, "localDate": "2026-08-03",
        "awakeMinutes": 960, "committedMinutes": 540, "transitionMinutes": 90,
        "frictionMinutes": 45, "assignableMinutes": 285,
        "sleepMinutes": 420, "sleepDeficitMinutes": 60,
        "slots": [{ "start": "…", "end": "…", "tier": "PEAK", "minutes": 90 }] }
    ]
  },
  "findings": [
    { "code": "PEAK_HOURS_OCCUPIED", "severity": "CRITICAL",
      "evidence": { "peakMinutesTotal": 900, "peakMinutesOccupied": 702, "ratio": 0.78 } },
    { "code": "GOALS_EXCEED_CAPACITY", "severity": "CRITICAL",
      "evidence": { "activeGoals": 6, "viableGoalsAtMinBlock": 3,
                    "requiredMinutes": 2160, "availableMinutes": 1320 } },
    { "code": "SLEEP_DEBT", "severity": "WARNING",
      "evidence": { "daysWithDeficit": 3, "worstDeficitMinutes": 95 } }
  ]
}
```

Los hallazgos viajan como **código + evidencia numérica, sin texto redactado**. La redacción
es responsabilidad de la interfaz. Así el copy se puede reescribir o traducir sin tocar el
servidor, y —más importante— el mismo hallazgo no puede describirse de dos formas distintas
en dos sitios.

**Este mismo principio se aplica desde el 2026-07-27 a las narrativas de sacrificio y a los
titulares de diff**, que hasta entonces se persistían y devolvían como texto ya redactado —una
inconsistencia del diseño original. Ahora viajan como `*Code` + `*Params`, y el campo de texto
que se sigue devolviendo es una **cortesía compuesta por el servidor al leer**, no el dato
almacenado. Un cliente no debe depender de él para nada que no sea mostrarlo. Ver
[ADR-014](./adr/ADR-014-cumplimiento-rgpd.md).

`POST` porque el diagnóstico es un cálculo con efecto de persistencia (se guarda la
instantánea). Los diagnósticos son inmutables y comparables en el tiempo.

---

## 6. Planes y versiones

Este es el contrato donde vive la regla nº2 del brief.

```http
GET  /api/v1/plans/current
POST /api/v1/plans                                        crea plan + versión 1 (DRAFT)
POST /api/v1/plans/{planId}/versions                      genera versión nueva (DRAFT)
POST /api/v1/plans/{planId}/versions/{versionId}/accept   DRAFT -> ACTIVE
POST /api/v1/plans/{planId}/versions/{versionId}/discard   DRAFT -> DISCARDED
POST /api/v1/plans/{planId}/revert-to/{versionId}         vuelve a una versión anterior
GET  /api/v1/plans/{planId}/versions
GET  /api/v1/plans/{planId}/versions/{versionId}
GET  /api/v1/plans/{planId}/versions/{versionId}/diff
POST /api/v1/plans/{planId}/preview                       genera SIN persistir
```

### 6.1 Generar una versión

```jsonc
// POST /plans/{planId}/versions
{
  "reason": "URGENT_TASK",
  "regenerateFrom": "2026-08-05T14:30:00-06:00",   // opcional; por defecto, ahora
  "windowEnd": "2026-08-10T00:00:00-06:00"
}
```

Respuesta viable:

```jsonc
{
  "version": { "id": "…", "versionNumber": 3, "status": "DRAFT",
               "feasibility": "FEASIBLE", "reason": "URGENT_TASK",
               "regeneratedFrom": "2026-08-05T14:30:00-06:00",
               "engineVersion": "1.4.0" },
  "blocks": [
    { "id": "…", "lineageId": "…", "kind": "FOCUS",
      "start": "2026-08-05T16:00:00-06:00", "end": "2026-08-05T17:30:00-06:00",
      "planningDayId": 2, "goalId": "…", "taskId": "…", "energyTier": "PEAK",
      "isShockAbsorber": false,
      "closingCriterion": "Borrador del capítulo 3 terminado",
      "rationale": { "reasonCode": "BEST_ENERGY_MATCH",
                     "runnerUp": { "start": "…", "tier": "NEUTRAL" },
                     "constraints": ["MIN_BLOCK_60", "MAX_TOPICS_3"] } }
  ],
  "budgets": [ { "goalId": "…", "allocatedMinutes": 300,
                 "placedMinutes": 300, "unmetMinutes": 0 } ],
  "sacrifices": [
    { "goalId": "…", "minutesCut": 120, "reasonCode": "ORDINAL_TRIM",
      // Plantilla + parámetros; NO texto redactado. Ver ADR-014.
      // Los objetivos se referencian por id: el título se resuelve al leer y
      // desaparece limpiamente si el objetivo se borra.
      "narrativeCode": "ORDINAL_TRIM",
      "narrativeParams": { "minutes": 120, "goalId": "…", "rank": 4,
                           "competingGoalId": "…", "deadline": "2026-08-20" },
      "narrative": "Se retiró 2 h de «Blog» (prioridad #4) porque «Certificación» tiene examen el 20 de agosto.",
      "evidence": { "attempt": 1, "rank": 4, "competingGoalRank": 1 } }
  ],
  "diff": {
    "headlineCode": "GAIN_LOSS",
    "headlineParams": { "gainedGoalId": "…", "gainedMinutes": 180,
                        "lostGoalId": "…", "lostMinutes": 120 },
    "headline": "Ganas 3 h en «Certificación». Pierdes 2 h en «Blog».",
    "goalDeltas": [
      { "goalId": "…", "title": "Certificación", "minutesBefore": 180,
        "minutesAfter": 360, "deltaMinutes": 180, "verdict": "GAINED" },
      { "goalId": "…", "title": "Blog", "minutesBefore": 120,
        "minutesAfter": 0, "deltaMinutes": -120, "verdict": "DROPPED" }
    ],
    "blockEvents": [
      { "lineageId": "…", "event": "MOVED",
        "before": { "start": "…" }, "after": { "start": "…" } }
    ]
  }
}
```

Respuesta inviable (**también `200`**):

```jsonc
{
  "version": { "id": "…", "versionNumber": 4, "status": "DRAFT",
               "feasibility": "INFEASIBLE" },
  "blocks": [],
  "infeasibilityReasons": [
    { "code": "HARD_DEADLINE_UNREACHABLE", "goalId": "…",
      "requiredMinutes": 2400, "availableMinutes": 1560,
      "narrativeCode": "HARD_DEADLINE_UNREACHABLE",
      "narrativeParams": { "goalId": "…", "requiredMinutes": 2400,
                           "availableMinutes": 1560, "deadline": "2026-08-20" },
      "narrative": "«Certificación» necesita 40 h antes del 20 de agosto y solo hay 26 h disponibles tras tus compromisos fijos." }
  ],
  "suggestions": [
    { "code": "DROP_LOWEST_GOALS", "wouldFreeMinutes": 480, "goalIds": ["…","…"] },
    { "code": "EXTEND_DEADLINE",   "neededDays": 9 },
    { "code": "NEGOTIATE_COMMITMENT", "commitmentId": "…", "wouldFreeMinutes": 600 }
  ]
}
```

`suggestions` es lo que evita que "imposible" sea un callejón sin salida. El sistema declara
la imposibilidad **y** cuantifica qué haría falta, sin decidir por el usuario.

### 6.2 Aceptar: donde el protocolo hace cumplir la regla

```jsonc
// POST /plans/{planId}/versions/{versionId}/accept
{ "acknowledgedDiffId": "diff-uuid" }
```

`acknowledgedDiffId` es **obligatorio** cuando existe una versión previa. Si no coincide con
el diff de esa versión, la respuesta es `409 DIFF_NOT_ACKNOWLEDGED`.

Es una decisión deliberada: convierte *"ningún intercambio es silencioso"* en una propiedad
del protocolo en vez de una convención de la interfaz. No existe secuencia de llamadas que
active un plan sin que el cliente haya recibido antes lo que se sacrifica. Cuesta un campo
extra y elimina toda una clase de regresiones futuras.

### 6.3 Previsualizar sin persistir

```http
POST /api/v1/plans/{planId}/preview
{ "hypothetical": { "addGoal": {...}, "removeCommitmentId": "…" } }
```

Devuelve la misma forma que una generación, sin escribir nada. Es la contrapartida directa de
que el motor sea una función pura, y habilita el "¿qué pasaría si...?" que hace útil el
diagnóstico.

---

## 7. Seguimiento y revisión semanal

```http
POST   /api/v1/adherence          { "blockId": "…", "outcome": "OVERRAN",
                                    "actualMinutes": 115 }
POST   /api/v1/overrides          { "versionId": "…", "lineageId": "…",
                                    "kind": "MOVE",
                                    "payload": { "newStart": "…" } }
GET    /api/v1/weekly-review/draft
POST   /api/v1/weekly-review
```

```jsonc
// GET /weekly-review/draft -> 200
{
  "window": { "start": "…", "end": "…" },
  "closedThisWeek": { "tasks": 7, "goals": 1 },        // la métrica de éxito real
  "dispersion":     { "avgGoalsTouchedPerDay": 2.1, "previousWeek": 3.4 },
  "planStability":  { "versionsThisWeek": 2,
                      "reasons": ["URGENT_TASK","WEEKLY_REVIEW"] },
  "byGoal": [ { "goalId": "…", "plannedMinutes": 300,
                "actualMinutes": 190, "blocksDone": 3, "blocksMoved": 2 } ],
  "recalibrationProposals": [
    { "code": "SYSTEMATIC_OVERRUN", "goalId": "…",
      "currentEstimateMinutes": 60, "proposedMinutes": 80,
      "evidence": { "samples": 4, "medianRatio": 1.31 } },
    { "code": "SCHEDULE_REPEATEDLY_MISSED", "lineageId": "…",
      "evidence": { "missed": 4, "of": 5 },
      "proposedAlternative": { "start": "…" } }
  ]
}
```

Obsérvese lo que **no** aparece: porcentaje de cumplimiento en portada, rachas, ni ninguna
métrica de vergüenza. Lo que encabeza el resumen es lo que se cerró y la reducción de
dispersión — las métricas del brief. `blocksMoved` existe como insumo de recalibración, no
como reproche.

Las propuestas de recalibración se **aceptan explícitamente** en `POST /weekly-review`; nada
se ajusta solo.

---

## 8. Exportación y sincronización

```http
GET    /api/v1/plans/{planId}/versions/{versionId}/export.ics    descarga puntual
POST   /api/v1/calendar-feeds                                    crea feed suscribible
GET    /api/v1/calendar-feeds
DELETE /api/v1/calendar-feeds/{id}                               revoca
GET    /feeds/{opaqueToken}.ics                                  público por token, sin cookie
```

```jsonc
// POST /calendar-feeds -> 201
{ "id": "…", "url": "https://app.example/feeds/9f3c…c1.ics",
  "webcalUrl": "webcal://app.example/feeds/9f3c…c1.ics",
  "includes": ["FOCUS","WELLBEING","WEEKLY_REVIEW","BUFFER"],
  "createdAt": "…" }
```

Decisiones que este contrato materializa (ver [ADR-008](./adr/ADR-008-sincronizacion-calendarios.md)):

- **Solo lectura y en un calendario aparte.** El usuario se suscribe; nosotros nunca
  escribimos en su calendario. Cumple "no obligar a migrar" y "reversibilidad": darse de baja
  del feed elimina todo rastro sin tocar sus eventos.
- El feed **excluye** los bloques `FIXED` y `TRANSITION`: son eco de eventos que ya están en
  su calendario y duplicarlos es la forma más rápida de que abandone la suscripción.
- `UID` estable = `lineageId` + dominio. Un bloque que se mueve entre versiones **se actualiza**
  en el cliente de calendario en lugar de duplicarse. Esta es la razón práctica por la que el
  linaje del [ADR-006](./adr/ADR-006-versionado-de-plan-y-diff.md) paga su coste dos veces.
- Token opaco de ≥128 bits, revocable, y **revocado automáticamente al borrar la cuenta**.
- `Cache-Control: private, max-age=900` y `ETag`: los clientes de calendario sondean con
  agresividad.

Importación de ocupación (fase 3, solo lectura):

```http
POST /api/v1/calendar-imports/ics        multipart, un .ics
GET  /api/v1/calendar-imports
```

Los eventos importados entran como `busy` opacos: ocupan tiempo y **no** guardan título ni
descripción. Es minimización de datos aplicada al punto donde entraría el mayor volumen de
información ajena al producto.

---

## 9. Portabilidad y borrado

```http
GET    /api/v1/me/export        -> 200 application/json  (todo, en formato reimportable)
DELETE /api/v1/me               -> 204
```

`DELETE /me` borra en cascada y **revoca todos los feeds** en la misma transacción. Un feed
`.ics` que siguiera sirviendo contenido tras el borrado sería una fuga persistente y es el
fallo más probable de esta funcionalidad; hay un test de integración dedicado a ello.

---

## 10. Lo que deliberadamente no está en la API v1

| Ausente | Motivo |
|---|---|
| WebSockets / tiempo real | Un solo usuario por plan; no hay colaboración. Añadiría estado de conexión sin resolver ningún problema. |
| Notificaciones push / recordatorios | Anti-requisito explícito del brief. |
| Endpoints de compartición o multiusuario | Diferido con la variante de compromisos compartidos. |
| GraphQL | Los consumidores son uno y las formas de consulta son fijas. REST con esquemas compartidos da más por menos. |
| Paginación en la mayoría de colecciones | Volúmenes de decenas de filas por usuario. Se añadirá en `tasks` y `plan_versions` si crecen. |
| Webhooks salientes | Nadie los consume todavía. |
