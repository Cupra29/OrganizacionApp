# ADR-017: El `.ics` es función de la versión del plan; `packages/ical` no lee el reloj
Estado: aceptado (2026-07-29)
Fecha: 2026-07-29

## Contexto

Al implementar el guardrail de reloj y aleatoriedad de la fase 1 apareció una pregunta que el
[plan](../05-plan-de-implementacion.md) no había respondido: su alcance es
`packages/{engine,temporal,domain}`, y **`packages/ical` no está ni en esa lista ni en la del
límite nº1 de `CLAUDE.md`** (que nombra solo `engine` y `temporal`). ¿Omisión coherente o
laguna?

Es coherente para lo que esas listas dicen: son listas de **ausencia de I/O**, motivadas por el
determinismo del motor ([ADR-013](./ADR-013-motor-como-funcion-pura.md)), y `ical` no participa
de ese razonamiento — no es entrada del motor ni sale de él. `dependency-cruiser` lo confirma:
su constante `NUCLEO` es `^packages/(engine|temporal|domain)/`, y las dos mitades de la
mecanización coinciden entre sí.

Pero es una laguna para una propiedad distinta, que nadie había escrito. Los hechos:

- **RFC 5545 exige `DTSTAMP` en cada `VEVENT`.** No es opcional. Cualquier serializador tiene
  que producir un valor ahí, y el camino de menor resistencia para producirlo es `new Date()`:
  es lo que hacen casi todas las bibliotecas del ecosistema.
- **En un objeto iCalendar sin propiedad `METHOD`, `DTSTAMP` equivale a `LAST-MODIFIED`**
  (RFC 5545 §3.8.7.2, verificado el 2026-07-29): es *"the date and time that the information
  associated with the calendar component was last revised in the calendar store"*. Solo cuando
  hay `METHOD` significa "instante en que se creó este mensaje". **Nuestros feeds no llevan
  `METHOD`**: son un calendario publicado al que el usuario se suscribe
  ([ADR-008](./ADR-008-sincronizacion-calendarios.md)), no mensajes iTIP.
- **Las versiones de plan son instantáneas inmutables**
  ([ADR-006](./ADR-006-versionado-de-plan-y-diff.md)). Una versión ya escrita no se revisa
  jamás. Es decir: "la última revisión de este componente" **tiene un valor exacto, estable y
  ya guardado**, y no es la hora actual.
- [04 §8](../04-contratos-api.md) promete `ETag` y `Cache-Control: private, max-age=900` en el
  feed, y dice por qué: *"los clientes de calendario sondean con agresividad"*.

De donde: un `DTSTAMP` leído del reloj no sería solo no determinista, sería **el valor
equivocado según el RFC**, y volvería inútil el `ETag` que ya está en el contrato — un `ETag`
derivado de un cuerpo que cambia en cada render nunca casa, así que cada sondeo de cada
suscriptor se convierte en una descarga completa.

**Una corrección al argumento que originó esta decisión**, porque conviene que no quede en el
registro: se propuso que un `DTSTAMP` cambiante rompería el criterio de la fase 8 según el cual
un bloque que se mueve **se actualiza** en vez de duplicarse. Eso es falso. La deduplicación en
un cliente de calendario se decide por `UID` (RFC 5545 §3.8.4.7), que
[ADR-008](./ADR-008-sincronizacion-calendarios.md) ya fija en `lineageId` + dominio. Ese
criterio lo protege el linaje de [ADR-006](./ADR-006-versionado-de-plan-y-diff.md), no este
ADR, y verificarlo mirando `DTSTAMP` sería verificar la cosa equivocada. El daño real de un
`DTSTAMP` con reloj es otro: `ETag` inservible, semántica incorrecta y golden tests imposibles.

## Decisión

**`packages/ical` es determinista: su salida es función únicamente de su entrada. Ningún
instante del `.ics` se lee del reloj del sistema.**

En concreto, `DTSTAMP`, `LAST-MODIFIED` y `CREATED` de cada `VEVENT` se derivan del instante de
creación de la versión del plan a la que pertenece el bloque —dato que
[ADR-006](./ADR-006-versionado-de-plan-y-diff.md) ya guarda y declara inmutable— y **entran
como parámetro**. Si en algún punto hiciera falta el instante real, lo lee `apps/api` y lo pasa
hacia abajo, exactamente como hace con el `now` del motor
([ADR-013](./ADR-013-motor-como-funcion-pura.md)).

Se mecaniza **extendiendo el guardrail de la fase 1 a `packages/ical`**, sin regla nueva: el
plugin GritQL y su verificador de cobertura ya existen y el paquete está vacío hoy, así que el
coste es una cadena en un glob y una entrada en una lista.

**Lo que esta decisión NO hace:** no mete a `ical` en el límite nº1 ni toca la regla de I/O de
`dependency-cruiser`. Son dos propiedades separadas con motivos separados —ausencia de I/O por
el determinismo del motor, ausencia de reloj por la reproducibilidad del artefacto— y `ical`
solo necesita la segunda. Si `ical` debe además estar libre de I/O es una pregunta que la fase
8 responderá con código delante; hoy no hay evidencia en ninguna dirección y decidirlo aquí
sería inventar.

## Alternativas consideradas

**Dejar `ical` fuera del guardrail hasta la fase 8, con la razón anotada.**
A favor: es el alcance que el plan ya tenía; `ical` no tiene una línea de código y protegerlo
hoy protege el vacío; y el paquete llegará dentro de siete fases, con margen de sobra para
decidirlo entonces. En contra: **es justo el argumento que la fase 1 ya rechazó** al decidir
que el guardrail va antes que `PlanningDay`. La valla se pone antes que las ovejas. Escrito en
la fase 8, el guardrail llega después del serializador y obliga a limpiar un `DTSTAMP` ya
escrito, defendido por quien lo escribió y probablemente ya presente en los golden files.
Escrito hoy, el coste es una cadena en un glob. Se descarta por desproporción.

**Extender el `overrides` sin escribir esta decisión, como simple ajuste de alcance.**
A favor: menos papeleo para un cambio de una línea. En contra: sin la decisión escrita, el
primer `VEVENT` de la fase 8 se topa con un lint rojo **y ninguna explicación de de dónde debe
salir el valor**. La salida más barata en ese momento es un `biome-ignore`, y ahí muere el
guardrail. Lo que hace que esto aguante siete fases no es el glob: es tener escrito que el
valor sale de la versión del plan. Se descarta.

**`DTSTAMP` con el reloj real, aceptando un `.ics` no reproducible.**
A favor: cero fricción, es lo que hace el resto del ecosistema, y sería la lectura correcta del
RFC **si** emitiéramos `METHOD`. En contra: no lo emitimos, así que el valor sería incorrecto;
el `ETag` del contrato quedaría inservible; y los golden tests del serializador —la forma
natural de probar un serializador, y la que ya se eligió para el motor— exigirían congelar el
reloj, es decir mockearlo, que es lo que el proyecto evita por construcción en todas partes.
Se descarta.

**Prohibir el reloj en todos los paquetes salvo `apps/api`.**
A favor: una regla sin excepciones es más fácil de recordar. En contra: sobrealcance sin caso
de uso. `apps/web` necesita legítimamente la hora actual para pintar "ahora" en el calendario,
y `contracts` no tiene razón para llevar guardrail alguno. Ampliar un guardrail hasta donde
estorba es la forma más rápida de que empiecen las excepciones. Se descarta.

## Consecuencias

**Lo que ganamos**
- El `ETag` de [04 §8](../04-contratos-api.md) pasa a ser real: dos solicitudes del mismo feed
  sin replanificación de por medio producen el mismo cuerpo byte a byte, así que el `304`
  ocurre de verdad y el sondeo agresivo de los clientes deja de costar ancho de banda.
- El serializador se prueba con golden files, igual que el motor, sin congelar el reloj.
- El `.ics` de una versión concreta se puede regenerar idéntico seis meses después para depurar
  una queja real. Es la misma propiedad que [01 §1](../01-arquitectura.md) justifica para el
  `EngineInput`, extendida al artefacto que el usuario ve.
- El valor de `DTSTAMP` es el que el RFC pide, no una aproximación.

**Lo que cuesta**
- **La firma de la exportación se ensucia.** No basta con pasarle los bloques al serializador:
  hay que llevarle también el instante de la versión, desde la fila de `plan_versions` hasta el
  `VEVENT`. Es acoplamiento real en el contrato de `packages/ical`, y se paga en la fase 8.
- El paquete pierde la posibilidad de emitir un `.ics` "suelto", sin versión asociada. Hoy no
  hace falta para nada, pero es una puerta que se cierra.
- Un guardrail más ancho es una superficie más ancha de falsos positivos futuros. El riesgo es
  bajo —no se ha identificado ningún uso legítimo del reloj dentro de `ical`, tampoco en el
  parseo del nivel 2 de [ADR-008], donde `new Date(argumento)` está permitido y no dispara—
  pero si aparece uno, la respuesta correcta es un ADR que reemplace a este, **no un
  `biome-ignore`**.

**Lo que queda condicionado**
- **`SEQUENCE` sigue sin decidirse.** Es el otro campo de identidad de versión del `VEVENT`, y
  algunos clientes lo miran para aceptar una actualización. Su valor correcto depende de la
  clasificación por bloque que produce el diff de la fase 5, así que se decide en la fase 8 con
  ese dato delante. Anotado allí para que sea una elección y no un descubrimiento.
- **Si algún día emitimos iTIP con `METHOD`** (invitaciones, nivel 3 de
  [ADR-008](./ADR-008-sincronizacion-calendarios.md)), `DTSTAMP` cambia de significado: pasa a
  ser el instante de creación del mensaje, y ahí el reloj real **sí** sería lo correcto. Ese
  día esto se reabre con un ADR nuevo que reemplace a este. No se edita este.
