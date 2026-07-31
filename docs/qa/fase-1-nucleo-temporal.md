# QA — Fase 1: Núcleo temporal (`packages/temporal`)

Fecha: 2026-07-29. **Actualizado 2026-07-30**: T-1, T-2, T-4, T-5, T-6 (dos lecturas), T-11,
T-12, T-16, T-17, T-18 y T-19 implementados y verificados contra los valores exactos de este
documento, commit `c718e06` — 47 tests, 100 % de ramas. Apareció un segundo error de fecha
(T-2, misma familia que T-4) y una nota sobre la técnica de generación de T-3 (§3.1). Además,
un hallazgo sin resolver de `arquitecto` sobre la propiedad de embaldosado con viajes hacia el
este (§3.1, T-3): se deja anotado, sin casos nuevos hasta que se decida.

**Actualizado 2026-07-31**: T-8, T-9, T-10 y los rechazos del validador T-21–T-31 implementados
y verificados, commit `1dfb408` — 196 tests, 100 % de ramas, tablas de fechas reproducidas
literalmente. Aparecieron dos paréntesis explicativos incorrectos (T-8, T-9 — las tablas y
conjuntos de fechas en sí estaban bien, la explicación de *por qué* no); corregidos en §3.4,
con nota en el Hallazgo 1 como tercera y cuarta instancia del mismo patrón. Se añadió también
el alcance real del oráculo diferencial (§3.4).

Estado: escrito antes de que exista código de la fase 1 (solo el guardrail está entregado).
Cubre: [`05-plan-de-implementacion.md`, fase 1](../arquitectura/05-plan-de-implementacion.md),
[ADR-003](../arquitectura/adr/ADR-003-modelo-temporal-y-zonas-horarias.md),
[ADR-005](../arquitectura/adr/ADR-005-recurrencia-y-excepciones.md),
[ADR-018](../arquitectura/adr/ADR-018-expansion-de-recurrencia-sin-rrule.md),
[03 §3.1 y §10.3](../arquitectura/03-motor-de-planificacion.md).
Ejecutor esperado: `test-runner`, una vez exista código en `packages/temporal`. Este documento
es un guion de diseño, no un reporte de ejecución — la excepción es la nota de implementación
que se añade donde corresponda, con fecha y commit.

> **Nota de corrección (2026-07-29).** Los cuatro criterios defectuosos y las dos brechas de
> cobertura de este documento se verificaron y ya están corregidos en `docs/arquitectura/`.
> Escribir el criterio correcto destapó además un bug real en el pseudocódigo de `03 §3.1`
> (`wakeSig` se calculaba con la zona del día `d` en vez de la del día `d+1`, así que un viaje
> rompía el encaje entre jornadas consecutivas). Al aplicar esa corrección aparecieron **tres
> errores en este mismo documento** (T-4, T-20, T-10), ya arreglados donde aparecen abajo, con
> nota explicando cada uno porque dos de los tres son instructivos por sí mismos. La laguna que
> T-20 destapó sobre cómo se casan `energy_windows` con huecos (enrutada a `arquitecto`) ya
> está resuelta también — ver el caso actualizado en §3.8.
>
> **Nota de corrección (2026-07-30).** Al implementar T-1–T-19 apareció un **cuarto** error de
> fecha, en T-2, de la misma familia que el de T-4: cadena ISO mal derivada con las duraciones
> correctas. Corregido con nota en §3.1, y referenciado desde el Hallazgo 1 como segunda
> instancia del mismo patrón — dos casos con el mismo síntoma en el mismo documento son un
> argumento más fuerte que uno solo.
>
> **Nota de corrección (2026-07-31).** Al implementar T-8–T-10 y T-21–T-31 aparecieron dos
> paréntesis explicativos falsos — no en las tablas de fechas, que se reprodujeron literales,
> sino en el razonamiento que las acompañaba. T-9 decía "rotación" donde era un desplazamiento
> con reparto distinto (`[4,4,4,4,3,3,3,3]`, no constante); T-8 describía una discrepancia
> concreta (incluir el 3-ago y excluir el 7-ago) que ninguna implementación plausible produce.
> Corregidas en §3.4, con nota en el Hallazgo 1 como tercera y cuarta instancia.

---

## 0. Relación con lo existente — qué reutiliza, qué añade

Este proyecto ya tiene una taxonomía de propiedades para el **motor** (P1–P13,
[03 §10.2](../arquitectura/03-motor-de-planificacion.md)) y una lista de fixtures golden por
variante del brief (§10.1, fixtures 01–20). Ninguna de las dos pertenece a esta fase: las P
son del colocador (`packages/engine`, fase 4) y los fixtures 01–20 son escenarios de producto
completos, no aritmética temporal aislada.

**`packages/temporal` no tenía, hasta hoy, ninguna numeración propia.** La sección 10.3 de 03
enumera casos ("día de cambio de horario de 23h y 25h", "sueño que cruza medianoche"...) pero
sin IDs ni valores exactos. Este documento los convierte en casos verificables y les asigna el
prefijo **T** (Temporal), que no colisiona con P1–P13 ni con los fixtures 01–20. No se
inventa una estructura paralela a la del motor: se llena el hueco que la fase 1 dejó abierto
en su propio nivel.

---

## 1. Zona horaria de referencia — decisión explícita, con un hallazgo

El encargo pide fijar una zona de referencia o proponer una si no hay ninguna fijada. **No
hay una zona de referencia fijada para pruebas de cambio de horario en ningún documento**, y
hay que decirlo con una advertencia concreta:

> **Hallazgo previo, antes de cualquier caso de prueba: `America/Mexico_City` —la única zona
> que aparece como ejemplo en el modelo de datos y en `temporal_profiles.base_timezone`— **no
> sirve como zona de cambio de horario para fixtures fechadas en 2026**. México eliminó el
> horario de verano a nivel nacional por decreto en 2022 (excepto una franja fronteriza
> alineada con EE. UU.). El tzdata de IANA para `America/Mexico_City` no tiene transiciones
> DST futuras. Cualquier fixture de "jornada que cruza cambio de horario" o "02:30 en día de
> adelanto/atraso" escrita ingenuamente con esta zona **no cruzará nada** — el test pasaría en
> verde con un motor que ni siquiera implementa `disambiguation`, porque nunca hay ambigüedad
> que resolver. Es exactamente la clase de "criterio satisfacible por accidente" que se pide
> auditar, solo que en la elección de la fixture y no en el texto del criterio.

**Zonas propuestas, cada una para un propósito distinto:**

| Zona | Para qué se usa aquí | Por qué esta y no otra |
|---|---|---|
| `America/Mexico_City` (UTC−6, sin DST) | Aritmética de medianoche aislada de DST (§3.1) | Aísla el caso "sleep cruza medianoche" del caso "hay un cambio de horario", que son dos bugs distintos y conviene no mezclarlos en un mismo fixture |
| `America/Chicago` (CST UTC−6 / CDT UTC−5) | Jornadas de 23h/25h, turno de 720 min que cruza el cambio (§3.2) | Regla de EE. UU. vigente y verificable a mano: 2026 tiene transición el **2026-03-08** (adelanto, 02:00→03:00 local) y el **2026-11-01** (atraso, 02:00→01:00 local) |
| `Europe/Madrid` (CET UTC+1 / CEST UTC+2) | El caso "02:30 local, adelanto y atraso" (§3.5) | En la regla de la UE, adelanto y atraso caen **en la misma hora de pared nominal** (02:00–02:59), porque la transición ocurre a la 01:00 UTC en ambos sentidos. En EE. UU. no: el hueco cae en 02:00–02:59 pero el pliegue cae en 01:00–01:59. El criterio del plan usa "02:30" para los dos casos sin decir de qué zona — con una zona de regla estadounidense, la mitad del test estaría comprobando la hora equivocada. Ver Hallazgo 3 (§2). Transiciones 2026: adelanto **2026-03-29** 02:00→03:00; atraso **2026-10-25** 03:00→02:00 |
| `Asia/Kolkata` (UTC+05:30, sin DST) | Offset no entero (§4, "qué falta") | Nombrada en 03 §10.3 sin fixture concreta |

Todas las fechas de transición anteriores están verificadas a mano en este documento (día de
la semana calculado desde 2026-01-01 = jueves) y deberían recalcularse contra el tzdata
instalado antes de fijarlas en código, no solo confiar en esta aritmética manual.

> **Actualización (2026-07-29).** Estas zonas de referencia, incluida la advertencia sobre
> `America/Mexico_City`, quedaron fijadas en `07 §4.E`. Se mantienen aquí sin cambios porque
> este documento sigue siendo la fuente de los cálculos a mano que las sostienen — si alguno
> de ellos resulta erróneo (como ocurrió con T-4 y T-2, más abajo), la corrección vive aquí,
> no allí.

---

## 2. Auditoría de los criterios de aceptación existentes

Se revisaron los 12 bullets de "Criterio de aceptación" de la fase 1. **Se encontraron seis
problemas**, del mismo tipo que el 4×3 insatisfacible que ya se corrigió. Ninguno invalida el
diseño (ADR-018 sigue siendo correcto); todos están en la redacción del criterio o en la
elección implícita de fixture. **Los seis ya están corregidos en `docs/arquitectura/`** — lo
que sigue es el registro de la auditoría, no una lista de pendientes.

### Hallazgo 1 — la property test de sueño+vigilia es **tautológica**

> Cita literal: *"Property test: `∀ jornada: sueño + vigilia == nextWake − wake`, exacto al
> minuto."*

Por construcción (03 §3.1): `vigilia := sleep − wake` y `sueño := nextWake − sleep`. Sumando:

```
vigilia + sueño = (sleep − wake) + (nextWake − sleep) = nextWake − wake
```

Esto es **álgebra pura sobre tres instantes cualesquiera**, no una propiedad del dominio. Es
verdadero para *cualquier* valor que `wake`, `sleep` y `nextWake` tomen, incluidos valores
completamente erróneos: un motor que ignora la zona, que aplica mal `disambiguation`, o que
calcula `sleep` con un desfase de una hora por un bug de DST, sigue satisfaciendo esta
identidad exactamente igual que uno correcto, **porque la propiedad no depende de si los tres
instantes son los correctos, solo de que estén relacionados por resta**. Un motor que
devolviera `wake = sleep = nextWake` (jornada de longitud cero, claramente roto) también la
satisface: `0 + 0 == 0`.

Es el mismo defecto de forma que el criterio del 4×3 insatisfacible, en la dirección opuesta:
aquel pedía algo que ningún código podía cumplir; este lo cumple cualquier código, incluido
uno vacío.

> **Corrección aplicada (2026-07-29).** `docs/arquitectura` sustituyó este criterio por tres
> propiedades; la más fuerte no es la que este documento proponía originalmente (comparar
> contra instantes exactos más "vigilia/sueño no negativas") sino que **las jornadas
> embaldosan la línea de tiempo**: `∀ i: jornada[i].wakeSig == jornada[i+1].wake`, con
> `wake < sleep < wakeSig` estricto — lo que ADR-003 regla 1 afirma de verdad. Ver el Caso T-3
> revisado en §3.1.
>
> **Esta corrección deja además la mejor evidencia posible a favor del propio Hallazgo 1,
> dentro de este mismo documento — y no una vez, sino cuatro.** Al aplicar el fixture del Caso
> T-4 con el pseudocódigo corregido, se detectó que T-4 tenía un error aritmético de 30
> minutos: `sueño` y `vigilia` estaban mal individualmente, pero su suma (`sueño + vigilia =
> 1380 min`) daba el resultado correcto de todos modos. **Al implementar T-2 (2026-07-30)
> apareció el mismo patrón por segunda vez**: la cadena ISO de `sleep` tenía la fecha civil
> equivocada (un día de menos), pero las duraciones `vigilia = 990 min` y `sueño = 450 min`
> eran correctas de todos modos. **Al implementar T-8 y T-9 (2026-07-31) apareció una tercera
> y una cuarta vez, en una variante distinta del mismo patrón**: esta vez el dato principal
> —el conjunto de fechas y la tabla de ocho semanas— era exactamente correcto, y lo que estaba
> mal era el **paréntesis que explicaba por qué**. T-9 llamaba "rotación" a un desplazamiento
> que en realidad cambia el número de días de trabajo por semana (`[4,4,4,4,3,3,3,3]`, no
> constante — una rotación de verdad conserva el conteo). T-8 describía una discrepancia
> concreta entre implementaciones (incluir el 3-ago, excluir el 7-ago) que ninguna
> implementación plausible produce en realidad. **Cuatro instancias del mismo patrón en el
> mismo documento —el dato principal correcto, la cifra derivada o la explicación mal— dicen
> algo sobre cómo se escriben estos casos, no sobre despistes sueltos**: es fácil verificar el
> resultado final (la tabla, el conjunto, el total) y no recalcular la justificación que lo
> acompaña. Ver las notas de corrección en T-2, T-4, T-8 y T-9.

### Hallazgo 2 — "`FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR` anclada en miércoles" **no es
verificable como está escrito**

> Cita literal: *"...produce el conjunto correcto: las semanas activas se cuentan desde la
> semana del ancla con `WKST=MO`... y `COUNT` cuenta el conjunto fusionado en orden."*

El criterio describe el **mecanismo** correctamente pero no fija ni el `anchor_date`, ni
`COUNT`/`UNTIL`, ni el conjunto de fechas esperado. Tal como está escrito, cualquier salida
"pasa" el criterio porque no hay nada concreto contra lo que compararla — es la misma familia
de defecto que el 4×3 (una aserción sin poder discriminante), solo que aquí por omisión de
datos y no por imposibilidad matemática. Ver el Caso T-8 (§3.4) para una versión con ancla,
`COUNT` y conjunto esperado fijados y verificados a mano.

### Hallazgo 3 — "02:30 local... adelanto... atraso" asume una forma de transición que no
nombra

> Cita literal: *"Una regla a las 02:30 local en un día de adelanto de reloj resuelve a 03:30
> ...; en un día de atraso toma la primera de las dos."*

El criterio usa **la misma hora de pared nominal** (02:30) para el caso de adelanto (hueco) y
el de atraso (pliegue), sin decir en qué zona. Eso solo es coherente en zonas cuya transición
ocurre a la 01:00 UTC en ambos sentidos, como las de la UE (`Europe/Madrid`): ahí el hueco y
el pliegue caen los dos en la franja local 02:00–02:59. **En una zona con la regla de EE. UU.
(como `America/Chicago`), el hueco cae en 02:00–02:59 pero el pliegue cae en 01:00–01:59** —
"02:30 en el día de atraso" en esa zona no es ambiguo, es una hora normal de invierno, y un
test que lo usara "pasaría" sin haber ejercitado nunca la rama de desambiguación de pliegue.
Es un criterio que, con la zona equivocada, es **satisfacible por accidente** en su segunda
mitad. Ver Caso T-11 (§3.5), resuelto con `Europe/Madrid` y las dos fechas de transición de
2026 calculadas a mano.

### Hallazgo 4 — el turno de 720 min "el día del cambio de horario" es satisfacible por
accidente bajo la lectura obvia

> Cita literal (idéntica en el plan y en ADR-018 §4): *"Un turno de 720 min que empieza a las
> 19:00 el día del cambio de horario termina a otra hora local ese día."*

Este es el hallazgo más parecido en espíritu al 4×3. La lectura literal — el turno **empieza
el mismo día civil en que ocurre la transición** — no ejercita nada. Con `America/Chicago` y
el adelanto del 2026-03-08 (02:00→03:00 local):

- Un turno que **empieza el 2026-03-08 a las 19:00** empieza **después** de que la transición
  ya ocurrió ese mismo día (las 02:00 son antes que las 19:00). No hay ninguna transición entre
  las 19:00 del 8 y las 07:00 del 9. Resultado: inicio 2026-03-09T00:00:00Z, fin (+720 min)
  2026-03-09T12:00:00Z → hora local de fin **07:00**, exactamente lo que un motor ingenuo que
  sumara "19:00 + 12 h = 07:00 del día siguiente" en aritmética de pared también obtendría. **El
  criterio, leído así, no distingue una implementación correcta de una que ignora el DST por
  completo.**
- Un turno que **empieza la noche anterior**, 2026-03-07 a las 19:00, sí atraviesa la
  transición (que cae a las 02:00 del día 8, dentro del intervalo). Inicio
  2026-03-08T01:00:00Z (19:00 CST, UTC−6), fin (+720 min reales) 2026-03-08T13:00:00Z → hora
  local de fin **08:00** (CDT, UTC−5), no las 07:00 que daría la aritmética de pared ingenua.
  Esta es la versión que sí ejercita la regla "minutos reales sobre la línea de instantes"
  (ADR-018 §4) y distingue las dos implementaciones.

**El criterio necesita decir explícitamente "la noche anterior a la transición", no "el día
del cambio de horario".** Ver Caso T-6 (§3.2) con ambas lecturas documentadas lado a lado,
precisamente para que quien lo implemente no elija por accidente la versión que no prueba
nada.

### Hallazgo 5 — brecha de cobertura, no de redacción: el álgebra de intervalos no tiene
**ningún** criterio de aceptación

La entrega de la fase 1 incluye explícitamente "Álgebra de intervalos: unión, resta, solape,
huecos", pero **ninguno de los 12 bullets del criterio de aceptación la menciona**. Tal como
queda escrita la fase, se podría entregar `packages/temporal` sin una sola prueba de unión,
resta, solape o huecos y aun así satisfacer el criterio completo — no porque el criterio sea
tautológico, sino porque simplemente no existe para esta pieza. Ver §3.3 y el punto 1 de "qué
falta" (§4).

### Hallazgo 6 — brecha de cobertura: resolución de zona con `timezone_overrides` y `anchor`
no tiene ningún criterio de aceptación

La entrega dice explícitamente: "Resolución de zona horaria con `timezone_overrides` y
`anchor` (los tres valores)." Ninguno de los 12 bullets prueba `FIXED_ZONE`,
`LOCAL_WHEREVER` ni `SUSPEND_WHEN_AWAY`, ni una ventana de `timezone_overrides` activa. Es la
misma clase de brecha que el Hallazgo 5, sobre una pieza que ADR-003 trata como decisión de
diseño central ("puerta de una sola dirección"). Ver §3.7 y "qué falta" (§4).

**Conclusión de la auditoría:** no se encontró ningún criterio insatisfacible de la clase 4×3
(ADR-018 ya corrigió el único que había). Sí hay una tautología (Hallazgo 1), dos casos no
verificables tal como están escritos por infra-especificación (Hallazgos 2 y 3), un caso
satisfacible por accidente bajo su lectura más natural (Hallazgo 4), y dos entregas completas
sin ningún criterio que las cubra (Hallazgos 5 y 6).

---

## 3. Casos de prueba propuestos

Formato por caso: **Precondición · Acción · Resultado esperado · Nivel · Automatizar**.
"Nivel" reemplaza aquí a "Automatizar: a qué nivel" del encargo: para `packages/temporal`
(paquete puro, sin DB, sin HTTP) los niveles posibles son únicamente **unitario determinista**
(Vitest, valores exactos) o **property-based** (`fast-check`, o su equivalente por rejilla
exhaustiva — ver la nota de T-3). Testcontainers y e2e no aplican a esta fase — el paquete no
tiene I/O por diseño (CLAUDE.md, límite nº1) — y decirlo es parte de la auditoría: ningún caso
de este documento debería aparecer marcado con esos niveles.

### 3.1 `PlanningDay` y aritmética del sueño cruzando medianoche

#### Caso T-1 — jornada con sueño que cruza medianoche, sin DST de por medio

- **Precondición**: perfil con `base_timezone = America/Mexico_City`, `default_wake_local =
  07:00`, `default_sleep_local = 00:30` (menor que `wake`: cruza medianoche, caso normal según
  02 §3), `sleep_need_minutes = 480`. Fecha `d = 2026-08-03` (lunes), sin excepciones de día.
- **Acción**: `construirJornadas` para la jornada de `d`.
- **Resultado esperado, valores exactos**:
  - `wake = 2026-08-03T13:00:00Z` (07:00 UTC−6)
  - `sleep = 2026-08-04T06:30:00Z` (00:30 del día siguiente, UTC−6 — la línea `si sleep <=
    wake: sleep += 1 día` de 03 §3.1 se disparó)
  - `nextWake = 2026-08-04T13:00:00Z`
  - `vigilia = 1050 min` (17 h 30 min), `sueño = 390 min` (6 h 30 min)
  - `déficitSueño = max(0, 480 − 390) = 90 min > 0` ⇒ `prohibeFocoNocturno = true`,
    `techoEnergía = NEUTRAL`, se emite `Finding SLEEP_DEBT` con
    `evidence = { requerido: 480, real: 390, déficit: 90 }`
- **Nivel**: unitario determinista. **Automatizar**: sí, prioridad alta — es el caso base de
  toda la fase.
- **Implementado (2026-07-30, `c718e06`)**: valores confirmados tal cual.

#### Caso T-2 — jornada sin cruce de medianoche, para contraste

- **Precondición**: mismo perfil que T-1 pero `default_sleep_local = 23:30` (mayor que
  `wake`, no cruza).
- **Acción**: igual.
- **Resultado esperado**: `sleep = 2026-08-04T05:30:00Z` (23:30 del mismo día `d`, es decir
  23:30 + 6 h = 05:30Z del **día siguiente** — la resta de zona cruza medianoche en UTC aunque
  no cruce en hora local; **sin** que se dispare la rama `si sleep <= wake` de 03 §3.1, que
  es la que suma un día civil completo por cruce de medianoche *local*). `vigilia = 990 min`,
  `sueño(usando nextWake del día siguiente con wake por defecto 07:00) = 450 min`.
- **Por qué importa como caso separado**: si T-1 pasara pero este fallara (o viceversa), señala
  que la rama condicional de cruce de medianoche está invertida o que falta el `else`
  implícito. Ningún caso aislado prueba la rama contraria.
- **Nivel**: unitario determinista. **Automatizar**: sí, prioridad alta.
- **Implementado (2026-07-30, `c718e06`)**: `vigilia = 990 min` y `sueño = 450 min`
  confirmados. Ver nota de corrección abajo sobre la cadena ISO.

> **Nota de corrección (2026-07-30).** La primera versión de este caso decía `sleep =
> 2026-08-03T05:30:00Z` — la fecha civil equivocada: 23:30 del 3 de agosto en
> `America/Mexico_City` (UTC−6, sin DST) son las `2026-08-04T05:30:00Z`, un día después, no el
> mismo. **Las duraciones (`vigilia = 990 min`, `sueño = 450 min`) eran correctas de todos
> modos** — se derivan por resta contra el mismo par de instantes, así que un desplazamiento
> consistente de la cadena ISO no las altera. Es la misma familia de error que T-4 (§3.2, ver
> su propia nota): una cifra derivada (aquí, la fecha en la cadena ISO; ahí, el reparto de
> minutos entre `sueño` y `vigilia`) estaba mal mientras el valor que de verdad importaba para
> el test daba bien. Ver el Hallazgo 1 (§2), ahora con esta como segunda instancia.

#### Caso T-3 (property-based) — las jornadas embaldosan la línea de tiempo (propiedad
oficial adoptada en `docs/arquitectura`, sustituye a la tautológica del Hallazgo 1)

- **Precondición**: generador de perfiles válidos (horas locales arbitrarias, incluidos los
  que cruzan medianoche) y ventanas arbitrarias de al menos 3 días, incluyendo generaciones
  con un `timezone_override` que empieza o termina a mitad de la ventana — deliberado: es
  exactamente el borde donde vivía el bug real de `wakeSig` calculado con la zona del día `d`
  en vez de la del día `d+1` (corregido en `03 §3.1` al escribir este criterio).
- **Acción**: `construirJornadas` para toda la ventana. Tomar cada par de jornadas
  consecutivas `(jornada[i], jornada[i+1])`.
- **Resultado esperado**:
  - `∀ i: jornada[i].wakeSig == jornada[i+1].wake` — **embaldosado**: el fin de vigilia-más-
    sueño de una jornada es exactamente el inicio de la siguiente, sin huecos ni solapes entre
    jornadas consecutivas.
  - `∀ jornada: wake < sleep < wakeSig`, estrictamente (ninguna jornada de duración cero ni
    invertida). **Ver el aviso de 2026-07-30 más abajo: esta mitad está bajo revisión.**
- **Por qué esta propiedad sí tiene contenido, a diferencia de la tautológica**: el bug real
  que apareció al corregir `03 §3.1` (zona equivocada para `wakeSig`) rompe el embaldosado
  justo en el borde de un cambio de zona — con la zona equivocada, `jornada[i].wakeSig` se
  calcula en la zona de `d` y `jornada[i+1].wake` en la zona de `d+1`; si ambas zonas
  coinciden (el caso común, sin viaje) los dos valores siguen coincidiendo por casualidad, pero
  en cuanto hay un `timezone_override` que cambia de zona exactamente ahí, dejan de coincidir y
  la propiedad lo detecta. La identidad `sueño + vigilia == nextWake − wake` de la versión
  original **no** lo habría detectado nunca, porque es verdadera para cualquier trío de
  instantes sin importar si están bien calculados — ver las notas de T-2, T-4, T-8 y T-9 para
  cuatro instancias reales de ese mismo tipo de problema (por constantes, fechas o
  explicaciones mal derivadas, no por una zona, pero con idéntico síntoma: el dato principal
  correcto esconde un componente o una justificación incorrectos).
- **Nivel**: property-based (ver nota de técnica abajo). **Automatizar**: sí, prioridad
  máxima — es ahora la propiedad oficial del criterio de aceptación corregido.
- **Implementado (2026-07-30, `c718e06`)**, con dos notas:

  > **Nota de técnica (2026-07-30).** Este documento proponía `fast-check` para generar los
  > 1000 casos. `engine-dev` implementó en su lugar un **producto cartesiano exhaustivo**: 5
  > zonas × 5 horarios × 8 anclas × 9 configuraciones de viaje = 9000 jornadas, más 365 días
  > consecutivos en cuatro zonas. El argumento — una rejilla exhaustiva no depende del día en
  > que corre la suite (a diferencia de un generador con semilla implícita en la fecha o el
  > entorno) y evita añadir `fast-check` como dependencia — se acepta. La exigencia de número
  > de casos no cambia (se cumple de sobra: 9000+ contra los 1000 propuestos); lo que cambia es
  > la **etiqueta de nivel**, que pasa de "property-based con generador aleatorio" a
  > "exhaustivo por rejilla" — la garantía que importa (cobertura sistemática de combinaciones,
  > no aleatoriedad con semilla) se mantiene igual o mejor, y es coherente con el límite nº9 de
  > `CLAUDE.md` ("aleatoriedad prohibida en el motor... los desempates son un orden total
  > explícito") aunque ese límite hable del motor y no de los tests: una rejilla determinista
  > es, si acaso, más alineada con el espíritu del proyecto que un generador con semilla.

  > **Hallazgo sin resolver (2026-07-30), de `arquitecto`, no decidido por este documento.** La
  > mitad estricta de esta propiedad — `sleep < wakeSig` (equivalente a `sueñoMinutes > 0`) —
  > **es falsa** con un `timezone_override` hacia el este suficientemente grande: México→Madrid
  > con una necesidad de sueño de 8 h da `sueñoMinutes === 0`; México→Lord Howe lo da
  > **negativo**. **No es un bug de la implementación**: los instantes de `wake`/`sleep`/
  > `wakeSig` son correctos y el embaldosado (`wakeSig[i] == wake[i+1]`) se mantiene — lo que
  > ocurre es que la persona cruza husos horarios y su noche, medida en instantes absolutos, se
  > comprime o se invierte. Es una pregunta de **qué significa un sueño negativo** (¿se trunca
  > a cero? ¿es un `INFEASIBLE` de jornada? ¿es un `Finding` nuevo, distinto de `SLEEP_DEBT`,
  > porque el mecanismo es geográfico y no de duración insuficiente por elección?), no de
  > aritmética. **Este documento no escribe casos para esto todavía, a propósito**: esperar a
  > que `arquitecto` decida qué significa, y entonces añadir los casos T-3x que correspondan
  > (como mínimo: México→Madrid con `sueñoMinutes == 0` como caso límite exacto, y
  > México→Lord Howe con `sueñoMinutes < 0` como el caso que fuerza la decisión). Ver ítem
  > nuevo en "qué falta" (§4).

---

### 3.2 Jornadas que cruzan cambio de horario

#### Caso T-4 — jornada de 23 h (adelanto de reloj)

- **Precondición**: perfil con `base_timezone = America/Chicago`, `default_wake_local =
  07:00`, `default_sleep_local = 23:00` (no cruza medianoche). `d = 2026-03-07` (sábado,
  víspera del adelanto del 2026-03-08 02:00→03:00 local).
- **Acción**: `construirJornadas` para la jornada de `d`.
- **Resultado esperado, valores exactos**:
  - `wake = 2026-03-07T13:00:00Z` (07:00 CST, UTC−6)
  - `sleep = 2026-03-08T05:00:00Z` (23:00 CST del día `d`: 23:00 + 6 h = 05:00Z del día
    siguiente)
  - `nextWake = 2026-03-08T12:00:00Z` (07:00 **CDT**, UTC−5 — ya pasó la transición)
  - `vigilia = 960 min`, `sueño = 420 min`, **total = 1380 min = 23 h exactas**, no 24 h.
- **Nivel**: unitario determinista. **Automatizar**: sí, prioridad máxima — es el criterio
  textual de la fase, con cifras.
- **Implementado (2026-07-30, `c718e06`)**: valores confirmados tal cual (ya con la
  corrección de 2026-07-29 aplicada).

> **Nota de corrección (2026-07-29).** La primera versión de este caso decía `sleep =
> 2026-03-08T05:30:00Z`, `vigilia = 990 min`, `sueño = 390 min` — un error de 30 minutos,
> arrastrado por copiar el `:30` del `default_sleep_local` de T-1 (Ciudad de México, 00:30) en
> vez de usar los `23:00` en punto de este perfil. **El total (`vigilia + sueño = 1380 min`)
> daba el resultado correcto de todos modos**, porque los 30 minutos se movieron de `sueño` a
> `vigilia` sin alterar la suma. Es, dentro del propio documento que denuncia el Hallazgo 1,
> una instancia real de exactamente la clase de error que la property test tautológica
> `sueño + vigilia == nextWake − wake` no puede detectar: los componentes estaban mal y la
> identidad se cumplía igual. Se deja esta nota en vez de solo corregir el número, porque el
> caso vale más como evidencia que como cifra correcta. **Actualización 2026-07-30: T-2
> (§3.1) resultó tener el mismo patrón, esta vez en la fecha de la cadena ISO en lugar de en
> el reparto de minutos — ver su nota.**

#### Caso T-5 — jornada de 25 h (atraso de reloj)

- **Precondición**: mismo perfil, `d = 2026-10-31` (sábado, víspera del atraso del
  2026-11-01 02:00→01:00 local).
- **Acción**: igual.
- **Resultado esperado**: `wake = 2026-10-31T12:00:00Z` (07:00 CDT), `nextWake =
  2026-11-01T13:00:00Z` (07:00 **CST**). Diferencia total = **1500 min = 25 h exactas**.
- **Nivel**: unitario determinista. **Automatizar**: sí, prioridad máxima.
- **Implementado (2026-07-30, `c718e06`)**: confirmado tal cual.

#### Caso T-6 — turno de 720 min que cruza el adelanto: las dos lecturas del criterio, lado a
lado (cierra el Hallazgo 4)

- **Precondición**: compromiso fijo, `America/Chicago`, `duration_minutes = 720`.
- **Acción / Resultado esperado — Lectura A (empieza el día de la transición, 2026-03-08
  19:00)**: inicio `2026-03-09T00:00:00Z`, fin `2026-03-09T12:00:00Z` → hora local de fin
  **07:00**. **Idéntico al resultado de sumar 12 h en hora de pared.** Registrar
  explícitamente que esta lectura **no** discrimina una implementación con el bug de la
  trampa de ADR-018 §4 (`zdt.toPlainDateTime().add(...).toZonedDateTime(...)`).
- **Acción / Resultado esperado — Lectura B (empieza la noche anterior, 2026-03-07 19:00)**:
  inicio `2026-03-08T01:00:00Z`, fin `2026-03-08T13:00:00Z` → hora local de fin **08:00**,
  **no** 07:00. Esta es la que sí falla si el motor usa la trampa de conversión.
- **Qué hacer con esto**: el fixture real de la fase debe usar la Lectura B. Si el criterio de
  aceptación de `05-plan-de-implementacion.md` se corrige, debería decir "la noche anterior a
  la transición" y no "el día del cambio de horario".
- **Nivel**: unitario determinista. **Automatizar**: sí, prioridad máxima — sin la Lectura B
  explícita, es fácil implementar (o revisar) el fixture equivocado y no darse cuenta.
- **Implementado (2026-07-30, `c718e06`)**: las dos lecturas confirmadas tal cual.

---

### 3.3 Álgebra de intervalos (cierra el Hallazgo 5 — sin cobertura en el plan)

Todos los intervalos son semiabiertos `[inicio, fin)`, instantes UTC, sin zona involucrada
(el álgebra de intervalos opera sobre la línea de instantes, es agnóstica a zona horaria por
diseño).

Conjunto base:
- `A = [2026-08-03T09:00Z, 2026-08-03T10:00Z)`
- `B = [2026-08-03T09:30Z, 2026-08-03T10:30Z)` (solapa con A, 30 min)
- `C = [2026-08-03T10:00Z, 2026-08-03T11:00Z)` (empieza justo donde A termina: contiguo, no
  solapado)
- `D = [2026-08-03T12:00Z, 2026-08-03T12:00Z)` (duración cero, degenerado)
- `Jornada = [2026-08-03T07:00Z, 2026-08-03T23:00Z)` (16 h)

#### Caso T-7.1 — solape: contigüidad no es solape

- **Acción**: `solapan(A, C)`.
- **Resultado esperado**: `false`. Un bloque que termina exactamente cuando otro empieza
  **no** se solapa — es el caso legítimo de "compromiso fijo seguido inmediatamente por su
  transición" o "dos bloques consecutivos sin hueco entre medias". Si esto diera `true`, la
  constraint de exclusión de PostgreSQL (`&&` sobre `tstzrange`) también lo trataría como
  solape con rangos semiabiertos correctamente construidos, así que este test debe usar la
  misma semántica que la constraint del esquema (02 §6.2) o el validador del motor y la base
  de datos discreparán en qué es un solape.
- **Nivel**: unitario determinista. **Automatizar**: sí, prioridad máxima — es la propiedad
  que sostiene "cero solapes" en cualquier lugar del sistema que reimplemente esta lógica en
  memoria antes de tocar la base de datos.

#### Caso T-7.2 — solape: solape parcial y contención total

- **Acción**: `solapan(A, B)` y `solapan([08:00Z,12:00Z), A)`.
- **Resultado esperado**: ambos `true`.
- **Nivel**: unitario determinista. **Automatizar**: sí.

#### Caso T-7.3 — unión de intervalos solapados y contiguos

- **Acción**: `unir([A, B, C])`.
- **Resultado esperado**: un único intervalo `[09:00Z, 11:00Z)` (120 min). Tres intervalos
  de entrada, uno de salida.
- **Nivel**: unitario determinista. **Automatizar**: sí.

#### Caso T-7.4 — resta / huecos, incluida la comprobación de recorte a los límites de la
jornada

- **Acción**: `restar(Jornada, unir([A, B, C]))`.
- **Resultado esperado**: dos huecos, `[07:00Z, 09:00Z)` (120 min) y `[11:00Z, 23:00Z)` (720
  min). **Ningún hueco de duración cero** debe aparecer aunque el conjunto ocupado toque
  exactamente los límites de la jornada (comprobar por separado con un compromiso que empieza
  exactamente en `wake` o termina exactamente en `sleep`: el hueco resultante en ese extremo
  debe tener longitud 0 y **no** debe emitirse como entrada de la lista de huecos).
- **Nivel**: unitario determinista. **Automatizar**: sí, prioridad alta.

#### Caso T-7.5 — intervalo degenerado

- **Acción**: `unir([A, D])` y `restar(Jornada, [D])`.
- **Resultado esperado**: `D` (duración cero) no aporta nada a la unión (`unir([A, D]) ==
  unir([A])`) y no genera un "hueco" espurio en la resta (`restar(Jornada, [D]) ==
  restar(Jornada, [])`, un único hueco igual a la jornada completa).
- **Por qué importa**: un intervalo de duración cero puede aparecer legítimamente si una
  excepción `OVERRIDE` fija `new_duration_minutes = 0` (cancelación efectiva). El álgebra no
  debe tratarlo como si ocupara tiempo.
- **Nivel**: unitario determinista. **Automatizar**: sí.

---

### 3.4 Expansión — etapa 1 (conjunto de fechas, sin zona)

#### Caso T-8 — `RRULE` `FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR`, con ancla, `COUNT` y
conjunto exacto (cierra el Hallazgo 2)

- **Precondición**: `anchor_date = 2026-08-05` (miércoles), regla
  `FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=8`, `WKST=MO` (fijo, nunca configurable).
- **Acción**: etapa 1, `(regla, ventana amplia) => PlainDate[]`.
- **Resultado esperado, derivado a mano y verificable por cualquiera que lo recalcule**:
  semana que contiene el ancla = `[2026-08-03 (lun), 2026-08-09 (dom)]`, índice de semana 0
  (activa). `INTERVAL=2` activa las semanas de índice par: 0, 2, 4, ... Dentro de cada
  semana activa se emiten los días `BYDAY` que caen en o después del ancla:
  - Semana 0 (Aug3–9): `BYDAY` da lunes 3, miércoles 5, viernes 7 → se descarta el lunes 3
    (anterior al ancla) → quedan **5-ago, 7-ago**.
  - Semana 2 (Aug17–23): lunes 17, miércoles 19, viernes 21 → los tres son posteriores al
    ancla → **17-ago, 19-ago, 21-ago**.
  - Semana 4 (Aug31–Sep6): lunes 31, miércoles 2-sep, viernes 4-sep → **31-ago, 2-sep,
    4-sep**.
  - Total acumulado: 2 + 3 + 3 = **8**, que es `COUNT`. El conjunto se corta exactamente ahí.
  - **Conjunto esperado, en orden**: `2026-08-05, 2026-08-07, 2026-08-17, 2026-08-19,
    2026-08-21, 2026-08-31, 2026-09-02, 2026-09-04`.
- **Los dos errores clásicos que este caso detecta** (ADR-018 §5): **(a) anclar por
  ocurrencia individual en vez de por bloques de semana.** La forma que ADR-018 §5 nombra
  literalmente — sumar `INTERVAL × 7` días a cada ocurrencia en vez de agrupar por semana —
  produce un conjunto que **no contiene ningún lunes en ningún momento**: el candidato natural
  para el primer lunes, 2026-08-03, precede al ancla (miércoles 2026-08-05) y se descarta; y
  como la cadena de lunes se construye sumando 14 días **a partir de una ocurrencia ya
  descartada**, ningún lunes posterior se recupera nunca. A ese conjunto **se le escapa el
  2026-08-17**, que sí pertenece al conjunto correcto (semana 2, activa). **(b) contar
  `COUNT` sobre el conjunto sin fusionar cronológicamente antes de cortar.**
- **Verificación cruzada obligatoria**: comparar contra `rrule-temporal@2.0.2` como oráculo
  diferencial (ADR-018 punto 8), no solo contra este cálculo manual — con el alcance exacto
  descrito en la nota de alcance del oráculo, más abajo.
- **Nivel**: unitario determinista (con oráculo diferencial). **Automatizar**: sí, prioridad
  máxima.
- **Implementado (2026-07-31, `1dfb408`)**: el conjunto de fechas se reprodujo literal. Ver
  nota de corrección abajo sobre el paréntesis (a).

> **Nota de corrección (2026-07-31).** La primera versión de este caso decía, para el error
> (a): *"una implementación de ese tipo, partiendo de la secuencia semanal simple y tomando
> 'una de cada dos' en la lista plana, incluiría el 3-ago y excluiría el 7-ago, entre otras
> discrepancias"*. **Ese paréntesis no corresponde a ninguna implementación concreta**,
> verificado al implementar el caso:
> - Tomar "una ocurrencia de cada dos" de la lista plana semanal simple **desde el lunes de la
>   semana del ancla** incluye **los dos** (3-ago y 7-ago), no incluye uno y excluye el otro.
> - Hacerlo **desde el propio ancla** los excluye **a los dos**.
> - La forma que ADR-018 §5 nombra literalmente — sumar `INTERVAL × 7` a cada ocurrencia — es
>   la que sí diverge del conjunto correcto, pero no en el par (3-ago, 7-ago): pierde **todos**
>   los lunes, incluido específicamente el 2026-08-17, según se explica en el cuerpo del caso
>   arriba.
>
> **La conclusión del caso se sostiene** — existen implementaciones plausibles que fallan y el
> caso las distingue del conjunto correcto — pero el detalle de qué fechas concretas difieren
> estaba inventado. Corregido sustituyéndolo por la implementación equivocada real (sumar
> `INTERVAL × 7` por ocurrencia) y su divergencia real (ningún lunes, incluido el 17-ago). Es
> la tercera instancia del patrón del Hallazgo 1: el conjunto principal (las ocho fechas) era
> correcto; el paréntesis que lo explicaba, no.

> **Nota sobre el alcance real del oráculo diferencial (2026-07-31, tras la implementación).**
> `rrule-temporal@2.0.2` cubre, verificado en `1dfb408`: las cuatro `FREQ`, `INTERVAL` de 1 a
> 40, `BYDAY` de 1 a 7 días, `COUNT` cortando tanto en el borde de una semana activa como a
> mitad de semana, y `WKST=MO` con el ancla cayendo en domingo (el caso límite de "semana del
> ancla" cuando el ancla es el último día de la semana civil).
>
> **No cubre `CYCLE`** — ninguna biblioteca del ecosistema expresa turnos rotativos, así que no
> hay nada con qué diferenciar; el falsificador de `CYCLE` es el propio periodo del ciclo (ver
> T-9, la novena semana repitiendo la primera), no un oráculo externo. **Tampoco cubre el
> validador de rechazos** (T-21–T-31): el oráculo acepta un superconjunto de RFC 5545 mucho más
> amplio que nuestro subconjunto, así que nunca ayuda a decidir qué **rechazar** — eso hay que
> escribirlo y probarlo sin ayuda externa, exactamente como ya decía ADR-018 alternativa
> "`rrule-temporal` en producción", punto (b).
>
> **Dos divergencias del oráculo quedaron fijadas por test, a propósito, no por error nuestro**:
> `rrule-temporal` incumple RFC 5545 §3.3.10 en `MONTHLY`/`YEARLY` con día de ancla inexistente
> — **recorta** al último día del mes en vez de **omitir** la ocurrencia, y además **arrastra
> el día recortado** a las ocurrencias siguientes en vez de recalcular desde el día de ancla
> original en cada mes. Y acepta un `DTSTART` no sincronizado con la regla (lo que ADR-018
> punto 6 exige rechazar en nuestro validador). Ninguna de las dos es un fallo del oráculo que
> haya que reportar — son precisamente el tipo de discrepancia documentada por la que se eligió
> un oráculo *diferencial* y no una biblioteca de producción (ADR-018, alternativa
> `rrule-temporal` en producción, contra (b)): cuando el oráculo y el RFC no coinciden, gana el
> RFC, nunca el oráculo, y aquí quedó registrado con un test que lo fija en vez de dejarlo como
> sorpresa la próxima vez que alguien corra la comparación.

#### Caso T-9 — `CYCLE` de 8 días desalineado, el mismo fixture representativo del criterio
de la fase, con las 8 semanas escritas explícitamente

- **Precondición**: `cycleLengthDays = 8`, turno de trabajo en offsets `[0,1,2,3]`
  (`startLocal: 07:00`, `durationMinutes: 720`), descanso en `[4,5,6,7]`. Ancla `2026-08-03`
  (lunes). Ventana de 9 semanas civiles (63 días) desde el ancla.
- **Acción**: etapa 1 del generador `CYCLE`, agrupando los días de trabajo por semana civil
  (`WKST=MO`).
- **Resultado esperado — las 8 semanas escritas como patrón W(work)/R(rest) lunes→domingo,
  verificado a mano día por día**:

  | Semana (lun–dom) | Patrón |
  |---|---|
  | 1 (03–09 ago) | W W W W R R R |
  | 2 (10–16 ago) | R W W W W R R |
  | 3 (17–23 ago) | R R W W W W R |
  | 4 (24–30 ago) | R R R W W W W |
  | 5 (31 ago–06 sep) | R R R R W W W |
  | 6 (07–13 sep) | W R R R R W W |
  | 7 (14–20 sep) | W W R R R R W |
  | 8 (21–27 sep) | W W W R R R R |
  | 9 (28 sep–04 oct) | W W W W R R R — **idéntica a la semana 1** |

  La novena repite exactamente la primera, que es el falsificador que el propio criterio de la
  fase exige. **La relación entre semanas consecutivas es un desplazamiento a la derecha, no
  una rotación** (ver nota de corrección abajo): `semana[s+1][d] == semana[s][d−1]` para
  `d` = martes…domingo, con un valor **nuevo** entrando cada semana por el lunes. El reparto
  de días de trabajo por semana es `[4,4,4,4,3,3,3,3]` — no es constante, así que no puede ser
  una rotación (una rotación conserva el número de elementos "activos").
- **Nivel**: unitario determinista (con oráculo diferencial para el conjunto de fechas
  subyacente — ver nota de alcance en T-8: `CYCLE` queda fuera de ese oráculo). **Automatizar**:
  sí, prioridad máxima — es el criterio textual de la fase, con la tabla completa en vez de la
  afirmación sin cifras.
- **Implementado (2026-07-31, `1dfb408`)**: la tabla de ocho semanas se reprodujo literal. Ver
  nota de corrección abajo sobre la explicación de la relación entre semanas.

> **Nota de corrección (2026-07-31).** La primera versión de este caso decía *"cada una es la
> rotación de la anterior un puesto a la izquierda"*. **Es falso**: una rotación conserva el
> número de elementos, y aquí las semanas 1–4 tienen 4 días de trabajo mientras que las 5–8
> tienen 3 — el reparto real es `[4,4,4,4,3,3,3,3]`, no constante. La relación verdadera es un
> **desplazamiento a la derecha** con un valor nuevo entrando por el lunes:
> `semana[s+1][d] == semana[s][d−1]`. La razón de fondo: avanzar 7 días dentro de un ciclo de
> 8 **retrocede una fase** (7 = 8 − 1), así que cada semana civil "ve" el patrón un día más
> tarde que la anterior, no rotado. **La tabla de ocho semanas en sí es correcta y la
> implementación la reproduce literal** — corregida solo la frase que explicaba por qué,
> cuarta instancia del patrón del Hallazgo 1 (ver ahí).

#### Caso T-10 — `FREQ=MONTHLY` con día de ancla inexistente en algunos meses (omitir, no
recortar)

- **Precondición**: `anchor_date = 2026-01-31`, `FREQ=MONTHLY;INTERVAL=1;COUNT=4` (sin
  `BYDAY`, prohibido con `MONTHLY`).
- **Acción**: etapa 1.
- **Resultado esperado**: `2026-01-31, 2026-03-31, 2026-05-31, 2026-07-31`. **Febrero, abril
  y junio se omiten** (ninguno tiene día 31: febrero tiene 28/29, abril y junio tienen 30) —
  no se recorta a "el último día del mes" (eso sería otra regla, la del RFC 5545 §3.3.10 que
  ADR-018 adopta es "se omite"). Confirmar con
  `Temporal.PlainDate.from({ ..., day: 31 }, { overflow: 'reject' })` capturando el fallo por
  mes y saltando, no silenciando el resto de la regla.
- **Nivel**: unitario determinista. **Automatizar**: sí, prioridad alta — cierra un punto
  que el criterio de la fase menciona en la entrega (implícito en ADR-018 §3) pero no en
  ningún bullet de aceptación (ver "qué falta", ítem 6).
- **Implementado (2026-07-31, `1dfb408`)**: confirmado tal cual — este es también el caso que
  fija por test la divergencia intencional del oráculo (ver nota en T-8): `rrule-temporal`
  recortaría al último día del mes y arrastraría el recorte en vez de omitir cada mes por
  separado, así que aquí se compara contra el RFC, no contra el oráculo.

> **Nota de corrección (2026-07-29).** La primera versión de este caso decía "Febrero y abril
> se omiten", dejando fuera junio (30 días, tampoco tiene día 31). El conjunto esperado en sí
> ya era correcto; solo la explicación de qué meses se saltan estaba incompleta, lo que podía
> desconcertar a quien intentara reproducir la cuenta.

---

### 3.5 Expansión — etapa 2 (resolución a instantes, disambiguation)

#### Caso T-11 — 02:30 local en adelanto y en atraso, con zona que hace el criterio verdadero
(cierra el Hallazgo 3)

- **Precondición**: regla con `start_local = 02:30`, `timezone = Europe/Madrid`,
  `disambiguation = 'compatible'` (constante nombrada de la etapa 2, ADR-018 §4).
- **Acción / adelanto**: resolver la ocurrencia de `2026-03-29` (último domingo de marzo,
  transición a la 01:00 UTC: 02:00 CET → 03:00 CEST; el hueco local es **02:00–02:59**, así
  que 02:30 no existe ese día).
- **Resultado esperado**: `2026-03-29T01:30:00Z` (03:30 CEST, UTC+2 — se desplazó adelante
  exactamente el tamaño del hueco, 60 min).
- **Acción / atraso**: resolver la ocurrencia de `2026-10-25` (último domingo de octubre,
  transición a la 01:00 UTC: 03:00 CEST → 02:00 CET; el pliegue local es **02:00–02:59**,
  ocurre dos veces).
- **Resultado esperado**: `2026-10-25T00:30:00Z` (02:30 **CEST**, UTC+2 — la primera
  cronológicamente de las dos, no `2026-10-25T01:30:00Z` que sería la segunda, en CET).
- **Por qué esta zona y no `America/Chicago`**: en la regla de EE. UU. el hueco cae en
  02:00–02:59 pero el pliegue cae en 01:00–01:59 (transición también a las 02:00 local, pero
  el reloj retrocede una hora hacia atrás en vez de mantenerse en la misma franja nominal). Un
  mismo valor de "02:30" no sirve para ejercitar ambas ramas en esa familia de reglas. Ver
  Hallazgo 3.
- **Nivel**: unitario determinista. **Automatizar**: sí, prioridad máxima.
- **Implementado (2026-07-30, `c718e06`)**: las dos ocurrencias confirmadas tal cual.

#### Caso T-12 — la trampa de conversión explícita (control negativo)

- **Precondición**: mismo escenario que T-6, Lectura B.
- **Acción**: implementar deliberadamente la trampa que ADR-018 §4 nombra
  (`zdt.toPlainDateTime().add({minutes}).toZonedDateTime(zona)` en vez de `zdt.add({minutes})`)
  y comparar contra el resultado correcto.
- **Resultado esperado**: la versión con la trampa produce `2026-03-08T07:00` local (aritmética
  de pared, ignora que se perdió una hora); la versión correcta produce `2026-03-08T08:00`
  local. Este caso existe para que quien escriba la suite tenga, en el propio documento de QA,
  el valor exacto que **debería** fallar si alguien reintroduce la trampa, sin tener que
  reconstruirlo bajo presión durante una revisión de código.
- **Nivel**: unitario determinista. **Automatizar**: opcional — es más una nota de
  implementación que una regresión que vigilar en producción, pero barato de incluir como test
  negativo explícito.
- **Implementado (2026-07-30, `c718e06`)**: confirmado tal cual.

---

### 3.6 Excepciones ancladas por instante original

#### Caso T-13 — excepción anclada correctamente sobrevive a un cambio de horario posterior
a su creación

- **Precondición**: regla `FREQ=WEEKLY;BYDAY=MO`, `start_local = 09:00`, `timezone =
  Europe/Madrid`, `anchor_date = 2026-03-02` (lunes, antes del adelanto del 29 de marzo). La
  ocurrencia del **2026-03-30** (primer lunes tras el adelanto) se resuelve, correctamente, a
  `2026-03-30T07:00:00Z` (09:00 CEST, UTC+2 — ya en horario de verano).
- **Acción**: crear una excepción `SKIP` con `recurrence_id = 2026-03-30T07:00:00Z` (el
  instante correcto, calculado usando el offset que aplica *en la fecha de la ocurrencia*, no
  el que aplicaba cuando se creó la excepción). Expandir la regla en una ventana que incluya
  esa fecha.
- **Resultado esperado**: la ocurrencia del 30 de marzo se omite (`SKIP` aplicado); ninguna
  otra ocurrencia se ve afectada.
- **Nivel**: unitario determinista. **Automatizar**: sí, prioridad alta.

#### Caso T-14 — excepción anclada con el offset equivocado queda huérfana y se reporta, no
se descarta en silencio (cierra parcialmente el Hallazgo 6 y cubre ADR-018 §7, sin criterio
propio en el plan)

- **Precondición**: mismo escenario que T-13, pero la excepción se creó (por un bug ajeno a
  este paquete, o por un cambio retroactivo de reglas de DST de un país) con
  `recurrence_id = 2026-03-30T08:00:00Z` (usando el offset CET, +1, que ya no aplica esa
  fecha).
- **Acción**: expandir la regla y aplicar excepciones en la misma ventana.
- **Resultado esperado**: la ocurrencia real del 30 de marzo (`07:00:00Z`) se genera
  **normalmente, sin omitir**, porque la excepción no coincide con ningún instante producido.
  El expansor reporta la excepción como **no coincidente** en un campo explícito de la salida
  (p. ej. `unmatchedExceptions: [{ recurrenceId: '2026-03-30T08:00:00Z', ruleId }]`). **No**
  debe: (a) lanzar una excepción no controlada, (b) aplicarse igual por proximidad temporal,
  ni (c) desaparecer sin dejar rastro. Esta es la garantía textual de ADR-018 §7 ("nunca
  descarte silencioso") y no tiene ningún caso de aceptación propio en la fase 1 — solo el T-13
  (que prueba la supervivencia, no el fallo del anclaje).
- **Nivel**: unitario determinista. **Automatizar**: sí, prioridad alta — es la contraparte
  necesaria de T-13; sin este caso, "nunca descarte silencioso" no está verificado, solo
  enunciado.

#### Caso T-15 — excepción cuyo instante nunca correspondió a ninguna ocurrencia (ninguna
relación con DST)

- **Precondición**: regla `FREQ=WEEKLY;BYDAY=MO`, `anchor_date = 2026-08-03`, `start_local =
  09:00`, `America/Mexico_City` (ocurrencias: lunes 15:00Z). Excepción con
  `recurrence_id = 2026-08-04T15:00:00Z` (un **martes**, nunca generado por esta regla).
- **Acción**: aplicar excepciones.
- **Resultado esperado**: igual que T-14 — se reporta como no coincidente, no se aplica, no
  se descarta en silencio. Este caso aísla el "reporte de huérfanas" del ruido de DST, igual
  que T-1/T-2 aíslan la medianoche del DST.
- **Nivel**: unitario determinista. **Automatizar**: sí.

---

### 3.7 Resolución de zona: `timezone_overrides` y `anchor` (cierra el Hallazgo 6)

#### Caso T-16 — `SUSPEND_WHEN_AWAY`: la ocurrencia desaparece de la ventana durante el viaje

- **Precondición**: compromiso presencial (`anchor = SUSPEND_WHEN_AWAY`), regla semanal
  martes y jueves 09:00 `America/Mexico_City`. `timezone_overrides` con `during =
  [2026-08-10T00:00:00Z, 2026-08-17T00:00:00Z)`, `timezone = Europe/Madrid` (viaje).
- **Acción**: expandir en la ventana `2026-08-03`–`2026-08-24`.
- **Resultado esperado**: las ocurrencias del martes 11 y jueves 13 de agosto **no aparecen**
  en la salida — ni movidas de hora, ni marcadas como canceladas: ausentes, como si la
  disponibilidad de esos huecos existiera. Las ocurrencias del 4/6 (antes del viaje) y del
  18/20 (después) sí aparecen, ancladas a `America/Mexico_City` sin cambios.
- **Nivel**: unitario determinista. **Automatizar**: sí, prioridad alta.
- **Implementado (2026-07-30, `c718e06`)**: confirmado tal cual.

#### Caso T-17 — `FIXED_ZONE`: la hora sigue la zona de origen aunque el usuario viaje

- **Precondición**: mismo viaje que T-16, pero el compromiso es una clase en línea
  (`anchor = FIXED_ZONE`), regla martes 09:00 `America/Mexico_City`.
- **Acción**: expandir la ocurrencia del martes 11 de agosto (dentro del viaje).
- **Resultado esperado**: la ocurrencia se genera **a la misma hora UTC que si no hubiera
  viaje** (09:00 `America/Mexico_City` = 15:00Z), **ignorando** que `timezone_overrides` dice
  que el usuario está en `Europe/Madrid` esos días. `timezone_overrides` no se consulta en
  absoluto para este compromiso.
- **Nivel**: unitario determinista. **Automatizar**: sí, prioridad alta.
- **Implementado (2026-07-30, `c718e06`)**: confirmado tal cual.

#### Caso T-18 — `LOCAL_WHEREVER`: la hora sigue la zona del override durante el viaje

- **Precondición**: mismo viaje, compromiso de rutina propia (`anchor = LOCAL_WHEREVER`),
  regla martes 07:00 (ejercicio).
- **Acción**: expandir la ocurrencia del martes 11 de agosto.
- **Resultado esperado**: la ocurrencia se genera a las 07:00 **hora de Madrid**
  (`2026-08-11T05:00:00Z`, CEST +2), no a las 07:00 de Ciudad de México. Las ocurrencias
  fuera de la ventana del override usan `America/Mexico_City` normalmente.
- **Nivel**: unitario determinista. **Automatizar**: sí, prioridad alta.
- **Implementado (2026-07-30, `c718e06`)**: confirmado tal cual.

#### Caso T-19 (property-based) — exactamente un `anchor` determina el comportamiento, nunca
una combinación

- **Precondición**: generador de compromisos con los tres valores de `anchor` y ventanas de
  `timezone_overrides` arbitrarias (solapadas y no solapadas con las ocurrencias).
- **Acción**: expandir las combinaciones generadas.
- **Resultado esperado**: `∀` ocurrencia dentro de un override activo: si `anchor =
  SUSPEND_WHEN_AWAY` ⇒ ausente; si `anchor = FIXED_ZONE` ⇒ mismo instante UTC que sin
  override; si `anchor = LOCAL_WHEREVER` ⇒ mismo instante de pared que el override declara.
  Ninguna combinación produce un resultado fuera de estos tres.
- **Nivel**: property-based (ver la nota de técnica de T-3: la implementación real usó rejilla
  exhaustiva de zonas × horarios × anclas × configuraciones de viaje, no un generador con
  semilla, y aplica igual aquí). **Automatizar**: sí, prioridad alta — sin este test, los tres
  casos T-16/17/18 solo prueban que *existe* un camino correcto para cada valor, no que no hay
  un cuarto camino accidental cuando se combinan overrides solapados.
- **Implementado (2026-07-30, `c718e06`)**: confirmado dentro de la rejilla de 9000 jornadas
  descrita en T-3.

---

### 3.8 Cronotipo con pico 22:00–01:00 (no debe partirse)

#### Caso T-20 — franja `PEAK` contigua a través de medianoche

- **Precondición**: `energy_windows` con `tier = PEAK`, `start_local = 22:00`, `end_local =
  01:00` (cruza medianoche, 180 min), `days_mask = 127`. Perfil con `default_wake_local =
  07:00`, `default_sleep_local = 02:00` (también cruza medianoche, coherente con un cronotipo
  nocturno), `America/Mexico_City`. `d = 2026-08-03`.
- **Acción**: calcular el hueco libre de la vigilia de `d` y su `perfilEnergía` (sin
  compromisos que la interrumpan).
- **Resultado esperado — con el modelo resuelto por `arquitecto` (2026-07-29): un hueco se
  segmenta por perfil de energía, no por un `tier` escalar.** La regla, en una frase: *lo que
  quita disponibilidad corta el hueco; lo que solo cambia la calidad del tiempo segmenta el
  perfil.* `h.tier` como campo escalar y `franjaQueContiene(hueco)` desaparecen del diseño: un
  hueco sigue siendo tiempo libre contiguo (solo el tiempo *ocupado* lo corta) y lleva un
  `perfilEnergía` que lo particiona en segmentos de tier uniforme.
  - **Un único hueco**, contiguo: `[2026-08-04T04:00:00Z, 2026-08-04T08:00:00Z)` — **240 min**
    (07:00 a 02:00 local, toda la vigilia, sin nada que la corte).
  - Con **`perfilEnergía` de dos segmentos**:
    - `PEAK [2026-08-04T04:00:00Z, 2026-08-04T07:00:00Z)` — **180 min** (22:00–01:00 local).
    - `NEUTRAL [2026-08-04T07:00:00Z, 2026-08-04T08:00:00Z)` — **60 min** (01:00–02:00 local,
      resto de la vigilia hasta `sleep`).
  - **La aserción de medianoche, con las dos negaciones**: el instante
    `2026-08-04T06:00:00Z` (medianoche local) **no** aparece como frontera de **hueco** (el
    hueco es uno solo, de `04:00Z` a `08:00Z`, y `06:00Z` cae estrictamente dentro) **ni**
    como frontera de **segmento** (el segmento que contiene `06:00Z` es el `PEAK`, que va de
    `04:00Z` a `07:00Z`; las únicas fronteras de segmento son `04:00Z` y `07:00Z`). Con este
    diseño la doble negación se cumple **por construcción**: 22:00–01:00 es una sola franja
    declarada en `energy_windows` (02 §3 ya admite `start_local`/`end_local` cruzando
    medianoche en una sola fila) y la medianoche no es frontera de nada en ningún nivel — ni
    del hueco, porque nada ocupa tiempo ahí, ni del perfil, porque la franja se declaró como
    una sola unidad.
- **Nivel**: unitario determinista. **Automatizar**: sí, prioridad máxima — las tres cifras
  (240 / 180 / 60) y las dos negaciones de medianoche son verificables tal cual, sin ninguna
  aclaración pendiente.

> **Historial de correcciones (2026-07-29).** Este caso pasó por tres versiones, y vale la
> pena dejarlas escritas porque ninguna era del todo errónea:
> 1. La original esperaba un único hueco `PEAK` de 240 min — conflaba "hueco" y "segmento":
>    trataba los 240 min enteros de vigilia como si fueran todos `PEAK`, cuando solo 180 lo
>    son.
> 2. La corrección intermedia fijó el tramo `PEAK` en 180 min, pero sin dar cabida al resto de
>    la vigilia (900 min antes de las 22:00 + 60 min después de la 01:00) dentro de la misma
>    estructura — dejaba pendiente de `arquitecto` cómo convivían huecos y tiers, y se enrutó
>    como tal.
> 3. La decisión de `arquitecto` resuelve que ninguna de las dos estaba completa ni estaba del
>    todo equivocada: **el hueco sí es de 240 min (como decía la versión 1) y el tramo `PEAK`
>    sí es de 180 min (como decía la versión 2)**. Lo que faltaba era el concepto que hace
>    ambas cifras compatibles a la vez: el hueco es la unidad de *disponibilidad* (contigua,
>    cortada solo por tiempo ocupado) y el `perfilEnergía` es la partición interna por
>    *calidad* del tiempo. Ninguna cifra resta a la otra.

#### Caso T-20.1 — `SIN_FOCO` no vive en el esquema persistido de `energy_windows`

- **Precondición**: esquema de `energy_windows.tier` (02, enum `energy_tier` de 3 valores:
  `PEAK | NEUTRAL | LOW`, verificado contra el DDL).
- **Acción**: validar `{ tier: 'SIN_FOCO' }` (o cualquier valor fuera de los tres) contra el
  esquema Zod que valida `energy_windows` antes de persistir.
- **Resultado esperado**: rechazo. `SIN_FOCO` es un **nivel calculado**, el cuarto valor que
  puede tomar un segmento del `perfilEnergía` de un hueco cuando un `capacity_modifier` de
  tipo `NONE` lo cubre por completo — nunca un valor que el usuario declare ni que se
  persista en `energy_windows`. El tipo del segmento calculado (4 valores) y el tipo de la
  franja declarada (3 valores) son dos tipos Zod **distintos** en `packages/contracts`,
  aunque compartan tres nombres: si compartieran un único esquema, sería posible declarar (o
  peor, persistir) una franja `SIN_FOCO`, que no tiene sentido como preferencia de usuario —
  nadie declara "esta franja es sin foco"; es una consecuencia de un modificador o de la
  colocación, no una intención capturable en la entrevista.
- **Nivel**: unitario determinista (validación de esquema; en rigor toca a
  `packages/contracts` más que a `packages/temporal`, pero se deja junto a T-20 porque es la
  misma confusión de fondo — tier declarado vs. tier calculado — que T-20 acaba de resolver).
  **Automatizar**: sí, prioridad media — no protege ninguna decisión de ADR por sí solo, pero
  previene que una fusión de esquemas futura reintroduzca la ambigüedad que T-20 acaba de
  cerrar.

---

### 3.9 Validador del subconjunto `RRULE` — rechazos

El criterio de la fase cubre `BYSETPOS`, `BYMONTHDAY`, `WKST`, `BYDAY` con prefijo numérico y
`FREQ=MONTHLY;BYDAY=MO`. La tabla completa de ADR-018 §3 tiene más entradas que no aparecen en
ningún bullet de aceptación. Casos T-21 a T-29, uno por propiedad, mismo formato:

| # | Entrada | Resultado esperado |
|---|---|---|
| T-21 | `FREQ=HOURLY` | rechazo, error nombra `FREQ` |
| T-22 | `FREQ=MINUTELY` | rechazo, error nombra `FREQ` |
| T-23 | `FREQ=SECONDLY` | rechazo, error nombra `FREQ` |
| T-24 | `FREQ=YEARLY;BYDAY=MO` | rechazo, error nombra `BYDAY` (no solo `MONTHLY` está prohibido con `BYDAY`, `YEARLY` también) |
| T-25 | `FREQ=WEEKLY;BYDAY=3TU` | rechazo, error nombra `BYDAY` (prefijo numérico) |
| T-26 | `FREQ=WEEKLY;BYDAY=-1FR` | rechazo, error nombra `BYDAY` (prefijo numérico negativo — distinto de T-25, confirma que el signo no es una vía de escape) |
| T-27 | `FREQ=WEEKLY;COUNT=5;UNTIL=2026-12-31T00:00:00Z` | rechazo, error nombra la combinación `COUNT`/`UNTIL` (RFC 5545: mutuamente excluyentes) |
| T-28 | `FREQ=WEEKLY;UNTIL=2026-12-31` (fecha civil sin zona, no instante) | rechazo, error nombra `UNTIL` |
| T-29 | `FREQ=WEEKLY;BYYEARDAY=1` / `BYWEEKNO=1` / `BYHOUR=9` / `RSCALE=hebrew` (cuatro subcasos) | rechazo en cada uno, error nombra la propiedad exacta |

- **Nivel**: unitario determinista, todos. **Automatizar**: sí, prioridad alta el conjunto
  completo — T-24, T-27 y T-28 son los que el criterio actual no cubre y que más fácilmente
  se olvidan porque no están en ningún bullet existente.
- **Implementado (2026-07-31, `1dfb408`)**: T-21 a T-29 confirmados tal cual, sin
  correcciones.

#### Caso T-30 — límites de `INTERVAL`

- **Acción**: validar `INTERVAL=0`, `INTERVAL=-1`, `INTERVAL=1.5`, `INTERVAL` ausente.
- **Resultado esperado**: los tres primeros se rechazan (el ADR exige "entero ≥ 1"); el
  ausente se acepta con valor implícito 1.
- **Nivel**: unitario determinista. **Automatizar**: sí.
- **Implementado (2026-07-31, `1dfb408`)**: confirmado tal cual.

#### Caso T-31 — el ancla debe pertenecer al conjunto que la regla genera (ADR-018 punto 6)

- **Precondición**: `anchor_date = 2026-08-04` (martes), regla `FREQ=WEEKLY;BYDAY=MO`
  (nunca genera un martes).
- **Acción**: validar al escribir.
- **Resultado esperado**: rechazo explícito señalando que `anchor_date` no pertenece al
  conjunto de la regla — no un rechazo silencioso ni una regla que "se corrige sola" tomando
  el lunes más cercano.
- **Nivel**: unitario determinista. **Automatizar**: sí, prioridad alta — sin este caso, el
  punto 6 de ADR-018 (que existe explícitamente para eliminar la ambigüedad del `DTSTART` no
  sincronizado) no tiene ninguna prueba.
- **Implementado (2026-07-31, `1dfb408`)**: confirmado tal cual. Nota: esta es la propiedad
  que el oráculo diferencial **no** verifica por sí solo — `rrule-temporal` acepta un
  `DTSTART` no sincronizado (ver nota de alcance del oráculo en T-8), así que este rechazo se
  prueba contra el propio validador, no por contraste.

---

### 3.10 `effective_from` / `effective_until`: intersección con `UNTIL`, inclusividad

#### Caso T-32 — `effective_until` inclusivo hasta el fin de la jornada civil en la zona de
la regla

- **Precondición**: regla semanal lunes 09:00, `timezone = America/Mexico_City`,
  `effective_until = 2026-08-17` (un lunes).
- **Acción**: expandir hasta el 2026-08-24.
- **Resultado esperado**: la ocurrencia del **2026-08-17** (el propio día límite) **sí** se
  genera (inclusiva hasta el fin de esa jornada civil); la del 2026-08-24 no.
- **Nivel**: unitario determinista. **Automatizar**: sí, prioridad alta.

#### Caso T-33 — intersección de `effective_until` y `UNTIL` cuando ambos están presentes

- **Precondición**: misma regla, `effective_until = 2026-08-31`, y además
  `UNTIL=2026-08-17T15:00:00Z` dentro del propio `RRULE`.
- **Acción**: expandir.
- **Resultado esperado**: se aplica el límite **más restrictivo de los dos** (aquí, `UNTIL`):
  la última ocurrencia es el 2026-08-17, no el 2026-08-31. Ningún límite "inventa" una
  ocurrencia que el otro no permitiría — probar también el caso simétrico donde
  `effective_until` es el más restrictivo de los dos.
- **Nivel**: unitario determinista. **Automatizar**: sí, prioridad alta — ninguno de los dos
  casos tiene bullet propio en el criterio de la fase pese a estar explícitamente en ADR-018
  §4.

---

### 3.11 `WKST` fijo en `MO`, `week_starts_on` nunca llega al expansor

#### Caso T-34 — cambiar `week_starts_on` del perfil no cambia ni una sola instancia
generada

- **Precondición**: la regla `FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR` de T-8, expandida dos
  veces: una con `temporal_profiles.week_starts_on = 1` (lunes) y otra con `= 0` (domingo).
- **Acción**: comparar los dos conjuntos de fechas resultantes.
- **Resultado esperado**: **idénticos**, instante por instante. `week_starts_on` no es un
  parámetro de la función de expansión — ni siquiera debería ser posible pasarlo por su firma
  de tipos, pero si lo fuera por descuido, este es el test que lo detecta antes de que alguien
  "ayude" conectándolo.
- **Por qué importa tanto**: ADR-018 §4 dedica un párrafo entero a advertir justo este riesgo
  ("dejarla entrar haría que qué instancias existen dependiera de un ajuste de
  visualización... es un daño irreversible sobre datos"), pero ningún bullet del criterio de
  aceptación lo verifica.
- **Nivel**: unitario determinista. **Automatizar**: sí, prioridad alta.

---

## 4. Qué falta — priorizado

No es una lista exhaustiva; son los huecos que, si no se cierran, dejan sin verificar algo
que un ADR trata como decisión central.

1. **Álgebra de intervalos no tiene ningún criterio de aceptación en el plan** (Hallazgo 5).
   Es una entrega explícita de la fase. Propuesto en §3.3 (T-7.1 a T-7.5).
2. **Resuelto (2026-07-29).** Cómo se casan `energy_windows` con `huecos` cuando un hueco
   libre abarca más de una franja de tier no estaba especificado con precisión en `03 §3.2`
   (descubierto al corregir T-20). `arquitecto` resolvió que el hueco es la unidad de
   disponibilidad (contigua, cortada solo por tiempo ocupado) y el `perfilEnergía` es la
   partición interna por calidad de tiempo — `h.tier` escalar y `franjaQueContiene`
   desaparecen. Ver el Caso T-20 actualizado en §3.8. Se deja el ítem en la lista, marcado
   como resuelto, para que el historial de la auditoría quede completo.
3. **Resolución de `timezone_overrides` + `anchor` (los tres valores) no tiene ningún
   criterio de aceptación**, pese a ser "puerta de una sola dirección" en ADR-003 y entrega
   explícita de esta fase (Hallazgo 6). Propuesto en §3.7 (T-16 a T-19). **Implementado
   2026-07-30, `c718e06`.**
4. **El reporte de excepciones huérfanas (ADR-018 §7, "nunca descarte silencioso") no tiene
   ningún criterio propio** — solo hay uno para la supervivencia (que la excepción siga
   apuntando bien), ninguno para el fallo del anclaje. Propuesto en §3.6 (T-14, T-15).
5. **La lista de rechazos del validador cubre 5 de las ~11 formas de ADR-018 §3.** Faltan
   `BYYEARDAY`, `BYWEEKNO`, `BYHOUR`, `RSCALE`, `COUNT`+`UNTIL` juntos, `UNTIL` como fecha
   civil sin zona, y `BYDAY` con `YEARLY` (solo se cubre con `MONTHLY`). Propuesto en §3.9.
   **Implementado 2026-07-31, `1dfb408`** (T-21–T-29, incluidas las formas nuevas de este
   ítem).
6. **La regla de "omitir, no recortar" para `MONTHLY`/`YEARLY` con día de ancla inexistente
   (31 de febrero, 29 de febrero en año común) está en ADR-018 §3 pero en ningún bullet de
   aceptación.** Propuesto en §3.4 (T-10). **Implementado 2026-07-31, `1dfb408`.**
7. **La validación de que `anchor_date` pertenece al conjunto que la regla genera (ADR-018
   punto 6) no tiene caso propio.** Propuesto en §3.9 (T-31). **Implementado 2026-07-31,
   `1dfb408`.**
8. **La intersección de `effective_until` y `UNTIL`, y la inclusividad de `effective_until`,
   están en ADR-018 §4 pero sin caso de aceptación.** Propuesto en §3.10 (T-32, T-33).
9. **Que `week_starts_on` nunca alcance al expansor no se verifica en ningún caso**, pese a
   que ADR-018 §4 lo señala explícitamente como el riesgo de "alguien lo conecta pensando que
   ayuda". Propuesto en §3.11 (T-34).
10. **La ampliación del guardrail a `Temporal.Now`, `Intl.DateTimeFormat().resolvedOptions()
    .timeZone` y `performance.now`** está descrita en el plan como entrega de esta fase, dueño
    `engine-dev`, pero sin casos concretos de canario positivo/negativo — el mismo tipo de
    hueco que causó el fallo silencioso original de `dependency-cruiser` en la fase 0. Ver
    documento separado
    [`fase-1-guardrail-temporal-now.md`](./fase-1-guardrail-temporal-now.md). **Implementado
    y verificado 2026-07-30, `eaf92f2`** — ver ese documento para el resultado y para la
    ampliación no anticipada de `globalThis`.
11. **Offset no entero (`Asia/Kolkata`, +05:30) y cambios históricos de zona**, nombrados en
    03 §10.3 como necesarios para la suite de aritmética temporal, sin ningún fixture
    concreto en ningún documento. Menor prioridad que 1–10 porque no protege una decisión de
    ADR, solo amplía la variedad de zonas probadas.
12. **El esquema Zod del segmento de energía calculado (4 valores, incluye `SIN_FOCO`) y el
    de la franja declarada persistida (3 valores, `PEAK`/`NEUTRAL`/`LOW`) no deben compartir
    tipo**, según la resolución del ítem 2. Es territorio de `packages/contracts`, no de
    `packages/temporal`, pero se descubrió aquí y conviene que quien defina esos esquemas lo
    sepa antes de fusionarlos "para no repetir código". Propuesto en §3.8 (T-20.1). Nota
    adicional para quien cierre la fase 3/4: los tres cambios que `arquitecto` describió junto
    a esta resolución —`brutoAsignable` sumando segmentos en vez de huecos completos,
    `FRAGMENTATION_RISK` contado sobre huecos y nunca sobre segmentos, y el arrastre
    segmentando en vez de degradar el hueco entero— no tienen fixture propio en ningún
    documento de QA todavía; no son de esta fase (viven en `packages/engine`, fases 3–4), así
    que no se proponen aquí, pero quedan anotados para que quien escriba el QA de esa fase no
    los redescubra desde cero.
13. **Qué significa un `sueño` de duración cero o negativa con un `timezone_override` hacia
    el este no está decidido**, y `arquitecto` lo está mirando (descubierto al implementar
    T-3, 2026-07-30): México→Madrid con necesidad de sueño de 8 h da `sueñoMinutes === 0`;
    México→Lord Howe lo da negativo. El embaldosado se mantiene y no es un bug — es que
    cruzar husos hacia el este comprime la noche medida en instantes absolutos. **Sin casos
    propuestos todavía, a propósito**: este documento espera la decisión de `arquitecto` sobre
    qué significa (¿se trunca a cero? ¿es una forma nueva de `INFEASIBLE`? ¿un `Finding`
    distinto de `SLEEP_DEBT`, con causa geográfica y no de elección?) antes de escribir T-3x.
    Cuando se decida, como mínimo hacen falta dos casos: México→Madrid como el límite exacto
    (`sueñoMinutes == 0`) y México→Lord Howe como el caso que fuerza la decisión
    (`sueñoMinutes < 0`). Prioridad alta en cuanto se resuelva — hasta entonces, no se puede
    escribir un resultado esperado sin inventar la decisión de arquitectura que le corresponde
    a `arquitecto`.

---

## 5. Automatización — resumen

| Área | Casos | Nivel | Prioridad | Estado |
|---|---|---|---|---|
| `PlanningDay` y sueño | T-1, T-2 (alta); T-3 (máxima, propiedad oficial) | Unitario + exhaustivo por rejilla | Alta / máxima | ✅ T-1, T-2 implementados (`c718e06`); T-3 implementada salvo la mitad estricta bajo revisión (ver §3.1) |
| Jornadas y DST | T-4, T-5, T-6 | Unitario | Máxima | ✅ implementados (`c718e06`) |
| Álgebra de intervalos | T-7.1–T-7.5 | Unitario | Máxima (T-7.1, T-7.4), alta (resto) | Sin implementar aún |
| Expansión etapa 1 | T-8, T-9, T-10 | Unitario + oráculo diferencial (`CYCLE` fuera de su alcance) | Máxima | ✅ implementados (`1dfb408`) |
| Expansión etapa 2 | T-11, T-12 | Unitario | Máxima (T-11), opcional (T-12) | ✅ implementados (`c718e06`) |
| Excepciones ancladas | T-13, T-14, T-15 | Unitario | Alta | Sin implementar aún |
| Zona / `anchor` | T-16–T-19 | Unitario + exhaustivo por rejilla | Alta | ✅ implementados (`c718e06`) |
| Cronotipo 22–01 | T-20, T-20.1 | Unitario | Máxima (T-20, ya resuelto sin pendientes); media (T-20.1) | Sin implementar aún |
| Validador — rechazos | T-21–T-31 | Unitario (oráculo no aplica al rechazo, ver nota T-8) | Alta | ✅ implementados (`1dfb408`) |
| `effective_*` / `UNTIL` | T-32, T-33 | Unitario | Alta | Sin implementar aún |
| `WKST` / `week_starts_on` | T-34 | Unitario | Alta | Sin implementar aún |
| Guardrail `Temporal.Now` | ver documento separado | Integración de configuración | Alta | ✅ implementado (`eaf92f2`) |

**Fuera de alcance de este documento**: Testcontainers y e2e no aplican — `packages/temporal`
no tiene I/O. Cobertura de ramas ≥95 % (ya en el criterio del plan) se verifica con el
`vitest.config.ts` raíz — los lotes implementados reportan 100 % de ramas (47 tests en
`c718e06`, 196 en `1dfb408`), no es un caso de este documento en sí.

---

## 6. Registro de ejecuciones

| Fecha | Quién / commit | Casos ejecutados | Resultado | Hallazgos |
|---|---|---|---|---|
| 2026-07-30 | `engine-dev`, commit `c718e06` | T-1, T-2, T-4, T-5, T-6 (dos lecturas), T-11, T-12, T-16, T-17, T-18, T-19 | 47 tests, 100 % de ramas. Todos los valores exactos confirmados tras la corrección de T-2 | Segundo error de fecha de la misma familia que T-4, esta vez en T-2 (cadena ISO con un día de menos; duraciones correctas) — corregido, ver Hallazgo 1 y nota en T-2. T-3/T-19 implementados con técnica distinta a la propuesta (rejilla exhaustiva de 9000+ jornadas en vez de `fast-check`), aceptado sin cambiar la exigencia de casos. Hallazgo sin resolver de `arquitecto`: la mitad estricta de T-3 (`sleep < wakeSig`) es falsa con viajes hacia el este suficientemente grandes (México→Madrid da 0, México→Lord Howe da negativo); casos nuevos pendientes de esa decisión (ver "qué falta", ítem 13) |
| 2026-07-31 | `engine-dev`, commit `1dfb408` | T-8, T-9, T-10, T-21–T-31 | 196 tests, 100 % de ramas. Tablas de fechas y conjuntos reproducidos literalmente | Dos paréntesis explicativos falsos, tercera y cuarta instancia del patrón del Hallazgo 1: T-9 llamaba "rotación" a un desplazamiento con reparto no constante (`[4,4,4,4,3,3,3,3]`); T-8 describía una discrepancia concreta (3-ago incluido / 7-ago excluido) que ninguna implementación plausible produce — sustituida por la divergencia real de la forma que ADR-018 §5 nombra (ningún lunes, incluido el 17-ago). Ambos corregidos sin tocar las tablas/conjuntos, que eran correctos. Documentado el alcance real del oráculo diferencial: cubre las 4 `FREQ`, `INTERVAL` 1–40, `BYDAY` 1–7 días, `COUNT` en borde y a mitad de semana, `WKST=MO` con ancla en domingo; no cubre `CYCLE` ni el validador de rechazos; dos divergencias del oráculo (recorte con arrastre en vez de omisión RFC 5545 §3.3.10, y aceptación de `DTSTART` no sincronizado) fijadas por test a propósito |
