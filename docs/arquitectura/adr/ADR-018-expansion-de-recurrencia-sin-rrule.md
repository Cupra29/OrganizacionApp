# ADR-018: La expansión de recurrencia se implementa sobre `Temporal`; `rrule` no entra en el núcleo temporal

Estado: aceptado (2026-07-29)
Fecha: 2026-07-29
Concreta la implementación de [ADR-005](./ADR-005-recurrencia-y-excepciones.md) y corrige la
línea "Dependencia externa" de la fase 1 del [05](../05-plan-de-implementacion.md).
**No reemplaza ningún ADR**: ADR-005 fija el modelo de recurrencia y no nombra biblioteca alguna.

## Contexto

La fase 1 del plan nombraba `rrule` como dependencia para "el subconjunto RFC 5545", en el mismo
párrafo que rechaza `date-fns` con zonas *"porque la aritmética de zonas necesita una biblioteca
que trate instante, fecha civil y zona como tipos distintos"*. La tensión es real y el propio
párrafo la contiene: **`rrule` devuelve `Date`**, que es exactamente el tipo que no distingue
esas tres cosas.

### Lo que ya estaba decidido y acota el problema

- **El subconjunto es de cinco propiedades**: `FREQ`, `INTERVAL`, `BYDAY`, `COUNT`, `UNTIL`
  ([ADR-005](./ADR-005-recurrencia-y-excepciones.md) §1). Ni `BYSETPOS`, ni `BYMONTHDAY`, ni
  `BYYEARDAY`, ni `BYWEEKNO`, ni `WKST`.
- **La expansión ocurre en la zona horaria de la regla**, no en UTC (ADR-005 §3,
  [ADR-003](./ADR-003-modelo-temporal-y-zonas-horarias.md) regla 2).
- **Las excepciones se anclan al instante de inicio original en UTC** (ADR-005 §4). ADR-005
  descarta explícitamente anclar por fecha local *"porque se rompe con cambios de horario"*, y
  esa es la razón por la que es una puerta de una sola dirección.
- **`CYCLE` es código propio en cualquier escenario.** Un turno rotativo no es expresable en el
  subconjunto, y ADR-005 §1 lo hace generador de primera clase.
- **El anclaje tiene tres valores** (`FIXED_ZONE`, `LOCAL_WHEREVER`, `SUSPEND_WHEN_AWAY`) que
  interactúan con `timezone_overrides`; `SUSPEND_WHEN_AWAY` hace que una ocurrencia
  **desaparezca** de la ventana. Ninguna biblioteca del ecosistema modela esto, así que la
  expansión va envuelta en código propio sí o sí.

### La observación que decide: el problema se parte en dos y no por donde parecía

La expansión no es una función, son dos, y solo una de ellas tiene zonas dentro:

| | Qué hace | Tipos | Riesgo |
|---|---|---|---|
| **Etapa 1 — conjunto de fechas** | Qué **fechas civiles** produce la regla en la ventana | `Temporal.PlainDate` | Aritmética de calendario. Cero zonas, cero instantes, cero horario de verano |
| **Etapa 2 — resolución a instantes** | `(fecha, start_local, zona efectiva, anchor, overrides)` → intervalo absoluto | `ZonedDateTime` → `Instant` | **Aquí vive toda la clase de errores de medianoche** |

`RRULE` y `CYCLE` son **dos implementaciones de la etapa 1** y comparten la etapa 2. De donde
se siguen dos cosas:

1. El coste que ADR-005 admitía —*"dos caminos de código en la expansión, con el riesgo de que
   uno reciba menos pruebas"*— se encoge: los dos caminos son libres de zona, y la parte difícil
   se prueba **una vez**, no dos.
2. **Lo que una biblioteca de `RRULE` aporta está confinado a la etapa 1**, que es justamente la
   etapa sin dificultad horaria. La etapa 2 la resuelve `Temporal` (aritmética de reloj de pared
   sobre `ZonedDateTime`, `disambiguation` explícita), no la biblioteca. Comprar `rrule` para
   reducir riesgo de zonas es comprar la cosa equivocada — y **añade** riesgo de zonas al
   introducir una frontera `Date`↔`Temporal` en el centro de la fase con más densidad de bugs.

### El modo de fallo concreto de `rrule`, y por qué CI no lo vería

`rrule` documenta: *"Returned 'UTC' dates are always meant to be interpreted as dates in your
local timezone"* (README, verificado el 2026-07-29). Es decir, devuelve un `Date` que no es un
instante ni una fecha civil, sino una hora de pared empaquetada en un instante falso. Convertirlo
correctamente exige leer sus campos contra la zona del proceso. Consecuencias, todas
verificables:

- La conversión depende de `process.env.TZ`, un **estado ambiente**. `dependency-cruiser` no lo
  ve (no hay import) y el guardrail de reloj y azar tampoco: sus cuatro patrones son `Date.now`,
  `Math.random`, `new Date()` y `new Date`, y `new Date(argumento)` con `.getHours()` está
  **permitido a propósito** (ver `scripts/biome/sin-reloj-ni-azar-en-nucleo.grit`, líneas 16–21).
- **CI corre en UTC**, donde el error se anula. El fallo aparece en la máquina de la persona que
  vive en `America/Mexico_City` o no aparece nunca hasta que un usuario cambia de zona.
- Es, a nivel de implementación, **la misma familia de fallos que ADR-005 descartó a nivel de
  modelo** al rechazar el anclaje por fecha local. Meterla por la puerta de atrás en la única
  fase que sostiene esa puerta de una sola dirección es el peor sitio posible.

Un guardrail invisible más un CI que enmascara el fallo es la definición de defecto silencioso, y
este repositorio ya tiene dos precedentes de por qué eso no se acepta (`depcruise:cobertura` y
`guardrail:cobertura`).

### Estado real de los candidatos, verificado el 2026-07-29

| | Versión | Publicada | Devuelve | Descargas/semana | Notas |
|---|---|---|---|---|---|
| `rrule` | 2.8.1 (BSD-3) | sin releases nuevos en ≥12 meses (*) | `Date` "interprétalo en tu zona local" | 2,5 M | 183 issues abiertas. Zonas vía `Intl`; `luxon` opcional |
| `rrule-temporal` | 2.0.2 (MIT) | días (mayor 1.x→2.x reciente) | `Temporal.ZonedDateTime` | 218 k | 107 estrellas, 1 issue, un mantenedor. **Importa estáticamente `temporal-polyfill/full`** como respaldo cuando no hay `Temporal` nativo |
| Implementación propia | — | — | `Temporal` de un solo origen | — | Ninguna dependencia salvo el polyfill |

(*) Dato indirecto (análisis de terceros); no pude confirmar la fecha exacta de publicación de
2.8.1 en el registro.

`rrule-temporal` es la biblioteca **mejor ajustada** al diseño: expande en el `tzid` de la regla
y devuelve `ZonedDateTime`. Pero hoy, en Node 24, **trae su propia implementación de `Temporal`**:
`src/temporal-impl.ts` hace `globalThis.Temporal ?? TemporalPolyfill` sobre un import estático de
`temporal-polyfill/full`, y ese paquete es `devDependency`, por tanto empaquetado en `dist`. Con
`packages/temporal` usando su propio polyfill habría **dos implementaciones distintas de
`Temporal` en el mismo proceso**, y los objetos de una no son aceptados por los métodos de la otra
(comprobación de ranura interna). La frontera no desaparece: pasa a ser un ida y vuelta por
cadena ISO por ocurrencia. Es una frontera *segura* —la cadena lleva la anotación de zona, así que
no es ambigua— pero existe, y el argumento de "sin conversiones" que justificaba la biblioteca se
cae. Desaparecerá cuando el runtime traiga `Temporal` nativo (Stage 4 desde marzo de 2026, Node 26),
no antes.

### Un hallazgo colateral: `Temporal.Now` es una puerta de reloj que el guardrail no ve

El guardrail entregado hoy casa cuatro formas sintácticas y ninguna es `Temporal.Now.instant()`,
`Temporal.Now.zonedDateTimeISO()` ni `Temporal.Now.timeZoneId()`. Las dos últimas leen **el reloj
y la zona ambiente a la vez**, que es el peor de los dos mundos, y son el camino de menor
resistencia para cualquiera que escriba aritmética temporal. La puerta se abre en el momento en
que `packages/temporal` importa `Temporal`, es decir en el commit siguiente a este ADR.

## Decisión

**La expansión de recurrencia se implementa en `packages/temporal` sobre `Temporal`. Ninguna
biblioteca de recurrencia entra en el código de producción.**

**1. Una sola dependencia temporal externa: `temporal-polyfill@1.0.2`** (MIT), importada en
**un único módulo** (`packages/temporal/src/temporal.ts`) que reexporta `Temporal`. Ningún otro
archivo del monorepo importa el polyfill. Razones para preferirlo a `@js-temporal/polyfill@0.5.1`,
que era el que nombraba el plan: publicó su 1.0 **después** de que Temporal alcanzara Stage 4
(marzo de 2026), mientras que `@js-temporal/polyfill` sigue en `0.5.1` publicada el 2025-03-31;
no arrastra `jsbi`; y es la implementación que usa `rrule-temporal`, que será nuestro oráculo de
pruebas. El módulo único hace que cambiar de polyfill —o pasar a `Temporal` nativo cuando llegue
al LTS— sea **una línea**.

**2. La expansión son dos etapas separadas**, con la etapa 1 libre de zonas y de instantes, y la
etapa 2 como **único** lugar del paquete donde existe una zona horaria. `RRULE` y `CYCLE`
implementan la misma firma de etapa 1.

**3. El subconjunto queda enumerado.** "El subconjunto RFC 5545" no era una especificación; esto
sí lo es. Se acepta exactamente:

| Propiedad | Valores aceptados | Rechazado, con error explícito |
|---|---|---|
| `FREQ` | `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY` | `HOURLY`, `MINUTELY`, `SECONDLY` |
| `INTERVAL` | entero ≥ 1 (ausente = 1) | — |
| `BYDAY` | lista de `MO`…`SU` **sin prefijo numérico**, y **solo con `FREQ=WEEKLY`** | `3TU`, `-1FR`; y `BYDAY` con `MONTHLY`/`YEARLY` |
| `COUNT` | entero ≥ 1 | `COUNT` y `UNTIL` juntos (RFC 5545 los declara mutuamente excluyentes) |
| `UNTIL` | instante UTC | fecha civil sin zona |
| cualquier otra | — | todas: `BYSETPOS`, `BYMONTHDAY`, `BYYEARDAY`, `BYWEEKNO`, `BYHOUR`, `WKST`, `RSCALE` |

Por qué esas dos exclusiones concretas:
- **`BYDAY` con prefijo numérico** ("el tercer martes") es el único caso del subconjunto que
  exige selección posicional dentro de un periodo, y es la mitad del coste de implementar
  `RRULE`. No hay ningún caso del brief que lo pida.
- **`BYDAY` sin prefijo con `MONTHLY`** significa "todos los lunes de cada mes", que es
  `FREQ=WEEKLY;BYDAY=MO`. Rechazarlo deja **una sola forma canónica** por patrón, lo que hace la
  validación decidible y elimina el camino de expansión más caro.

`MONTHLY` y `YEARLY` toman el día del mes de `anchor_date` y aplican la regla del RFC 5545
§3.3.10 para fechas inexistentes (31 de febrero, 29 de febrero en año común): **la instancia se
omite**, no se recorta. En `Temporal` es `PlainDate.from(..., { overflow: 'reject' })` y saltar el
fallo. El RFC decide esto, así que no es una elección nuestra.

**4. Políticas horarias explícitas, porque ninguna tiene un defecto obvio.**

- **`disambiguation: 'compatible'`** para horas de pared inexistentes (adelanto: 02:30 → 03:30) y
  ambiguas (atraso: se toma la primera). Entra como constante nombrada de la etapa 2, no
  esparcida por las llamadas. Ni RFC 5545 ni ninguna de las dos bibliotecas documenta qué hacen
  aquí; nosotros lo documentamos y lo probamos.
- **`duration_minutes` son minutos reales sobre la línea de instantes**, no hora de pared. Un
  turno de 720 min que empieza a las 19:00 el día del cambio de horario **termina a otra hora
  local** ese día. Se sigue de ADR-003 (la capacidad se mide en instantes absolutos y una jornada
  con cambio mide 23 h o 25 h). En `Temporal` es `zdt.add({ minutes })`; la trampa a evitar es
  `zdt.toPlainDateTime().add(...).toZonedDateTime(...)`, que da la otra respuesta.
- **`UNTIL` se compara como instante**, nunca como fecha local.
- **`effective_from` / `effective_until`** son columnas `date` sin zona, y ADR-003 prohíbe una
  fecha civil sin zona: se interpretan en `recurrence_rules.timezone`, que está en la misma fila.
  `effective_until` es **inclusiva hasta el fin de esa jornada civil en esa zona**. Cuando la
  regla además trae `UNTIL`, la expansión aplica **la intersección** de ambos: una intersección
  nunca inventa una instancia que ninguno de los dos límites permitía.
- **`WKST` queda fijado en `MO`** para toda expansión, y **`week_starts_on` del perfil no llega
  nunca al expansor**. Es una preferencia de presentación (ADR-003 regla 3), y dejarla entrar
  haría que *qué instancias existen* dependiera de un ajuste de visualización: cambiar "la semana
  empieza en domingo" movería las instancias de toda regla `WEEKLY;INTERVAL>1` y dejaría
  huérfanas las excepciones ancladas por instante. Es un daño irreversible sobre datos, en la
  puerta de una sola dirección de ADR-005.

**5. El intervalo de `WEEKLY` se ancla a la semana, no a la ocurrencia.** Con `INTERVAL>1` las
semanas activas son las que distan un múltiplo de `INTERVAL` semanas de la semana que contiene
`anchor_date` (con `WKST=MO`); dentro de una semana activa se emiten los días de `BYDAY`
posteriores o iguales al ancla. `COUNT` cuenta el conjunto **fusionado en orden cronológico**, no
por día de la semana. Son los dos errores clásicos de una implementación ingenua y quedan
escritos aquí porque son los dos que `rrule` acierta y nosotros tenemos que acertar a mano.

**6. El ancla tiene que satisfacer la regla, y se valida al escribir.** `anchor_date` +
`start_local` deben pertenecer al conjunto que la regla genera; si no, se rechaza en el esquema
Zod de `contracts`. Esto elimina de raíz la ambigüedad del `DTSTART` no sincronizado, sobre la
que RFC 5545 solo dice "*should*" y en la que las bibliotecas del ecosistema **no coinciden entre
sí**: una biblioteca nos daría una convención silenciosa, no una respuesta.

**7. Una excepción que no casa con ninguna instancia se reporta; no se descarta en silencio.** Es
la única defensa práctica contra el modo de fallo residual del anclaje por instante: si un país
cambia sus reglas de horario de verano, el instante recalculado de una ocurrencia futura se mueve
y la excepción queda huérfana. No podemos evitarlo —lo tiene cualquier regla expresada en hora de
pared— pero podemos hacerlo **ruidoso** en vez de silencioso, y cuesta un campo en la salida del
expansor.

**8. `rrule-temporal@2.0.2` entra como `devDependency`, de oráculo diferencial.** Los tests
comparan nuestro conjunto de fechas contra el suyo para las cinco propiedades del subconjunto,
sobre un corpus de anclas que incluye semanas de cambio de horario, comparando por cadena ISO.
Así compramos los veinte años de parches del ecosistema donde su valor es máximo —una
implementación independiente con la que discrepar— y no donde su coste es máximo, dentro del
camino de producción. No es una tautología en el sentido del límite nº 2 de `CLAUDE.md`: es
precisamente lo contrario, dos implementaciones sin código compartido.

**9. El guardrail se extiende a las puertas que abre `Temporal`**, sin cambiar su alcance de
paquetes: `Temporal.Now` (cualquier miembro) e
`Intl.DateTimeFormat().resolvedOptions().timeZone`, más `performance.now`. La zona ambiente entra
en la prohibición con el mismo argumento que el reloj: en el núcleo, la zona es siempre un
parámetro. La implementación es de `engine-dev` sobre el plugin y el verificador de cobertura que
ya existen.

## Alternativas consideradas

**`rrule` en producción, como decía el plan, aislando la frontera de conversión.**
A favor: es el estándar de facto, 2,5 M de descargas semanales, veinte años de casos límite
resueltos, y una frontera bien aislada en una sola función es una técnica legítima. En contra:
esa función tendría por contrato *"convierte un `Date` cuyo significado depende de la zona del
proceso"*, y nadie —ni `dependency-cruiser`, ni el guardrail, ni un CI en UTC— puede vigilar que
no se filtre. Además el ahorro es pequeño: solo cubre la etapa 1, que es la mitad sin zonas, y no
cubre `CYCLE`, ni el anclaje de tres valores, ni `timezone_overrides`, ni la aplicación de
excepciones. Se descarta: paga con la única propiedad que esta fase existe para garantizar.

**`rrule-temporal` en producción.**
A favor: la mejor biblioteca del ecosistema para este diseño; devuelve `ZonedDateTime` y expande
en el `tzid` de la regla, que es literalmente lo que ADR-005 §3 pide; MIT; su autor lo escribió
para resolver este problema. En contra, y en este orden: (a) hoy introduce una **segunda
implementación de `Temporal`** en el proceso, cuyos objetos no interoperan con los nuestros, así
que la frontera que venía a eliminar reaparece como serialización por ocurrencia; (b) acepta un
superconjunto enorme (`BYSETPOS`, `BYWEEKNO`, `RSCALE`, calendarios no gregorianos) que hemos
decidido no soportar, y no ayuda a **rechazar** —el validador del punto 3 hay que escribirlo
igual—; (c) `2.0.2` tiene días y un solo mantenedor: adoptar un mayor recién publicado en el
paquete con umbral de cobertura obligatorio es riesgo sin contrapartida. Se descarta **para
producción y se adopta como oráculo de pruebas**, que es donde (b) y (c) no duelen y su valor
sigue intacto. Si Node trae `Temporal` nativo en el LTS y (a) desaparece, esto merece reexaminarse
con un ADR nuevo.

**Parchear `globalThis.Temporal` con nuestro polyfill para que `rrule-temporal` lo adopte.**
Es la única forma de que la frontera desaparezca de verdad hoy: su `globalThis.Temporal ?? …`
tomaría el nuestro. A favor: una sola implementación, interoperabilidad total, cero conversiones.
En contra: un paquete puro cuyo import muta el objeto global, con comportamiento dependiente del
orden de importación, dentro del paquete donde la pureza es la propiedad que se está construyendo.
Es exactamente la clase de estado ambiente que el guardrail persigue. Se descarta.

**Implementación propia sin oráculo diferencial.**
A favor: menos dependencias todavía, y el umbral de cobertura del 95 % ya es exigente. En contra:
la cobertura mide ramas ejecutadas, no correctitud del calendario. Los dos errores del punto 5 se
cometen con cobertura del 100 %, porque el test los escribe la misma cabeza que escribió el bug.
Un oráculo independiente es lo único que rompe esa correlación, y cuesta una `devDependency`. Se
descarta ahorrárselo.

**Aplazar la decisión y empezar por `PlainDay` y el álgebra de intervalos.**
A favor: la fase tiene otras entregas que no dependen de esto. En contra: la etapa 2 es
compartida por todo el paquete y su firma depende de esta decisión; escribirla primero y elegir
después es rehacerla. Se descarta por el mismo argumento que puso el guardrail antes de
`PlanningDay`: la valla antes que las ovejas.

## Consecuencias

**Lo que ganamos**
- **Un solo sistema de tipos temporal en todo el núcleo.** Instante (`Instant`), fecha civil
  (`PlainDate`), hora de pared (`PlainTime`/`PlainDateTime`) y zona son tipos distintos que el
  compilador no deja mezclar. Es lo que el párrafo original del plan pedía; `Date` en cualquier
  forma lo rompía.
- Ningún error de medianoche puede esconderse en una conversión: **no hay conversión**. Y la
  aritmética de horario de verano vive en una sola función, compartida por los dos generadores,
  probada una vez.
- El subconjunto es **decidible**: hay una tabla que dice qué se acepta y qué se rechaza con
  error, en lugar de "el subconjunto RFC 5545". La interfaz de la fase 7 y el validador de
  `contracts` pueden apoyarse en ella.
- Todas las políticas sin defecto obvio (`disambiguation`, duración real vs. de pared, `WKST`,
  inclusividad de `effective_until`) quedan **elegidas y escritas**, no heredadas del criterio
  de un mantenedor ajeno.
- Cero dependencias de recurrencia en producción: la superficie de suministro del núcleo es un
  polyfill de un API que ya es estándar y que el runtime absorberá.

**Lo que cuesta**
- **La correctitud del conjunto de fechas es nuestra, para siempre.** Es el coste real y no se
  puede maquillar. Mitigaciones concretas: el subconjunto enumerado del punto 3 (que es pequeño
  *porque* lo enumeramos), el umbral de cobertura de ramas ≥ 95 % que este paquete ya tenía, y el
  oráculo diferencial del punto 8.
- **El parseo y la serialización de `RRULE` también son nuestros.** Para cinco propiedades es un
  `split` y un esquema Zod, pero es código que antes era gratis. Y **si algún día el nivel 2 de
  [ADR-008](./ADR-008-sincronizacion-calendarios.md) importa `.ics` ajenos con `RRULE`
  arbitrarias, este ADR no lo cubre**: eso es interpretar datos de terceros, ocurre en
  `packages/ical`, y ahí una biblioteca completa sería la elección correcta porque la frontera
  está en el borde del sistema y no en su centro. Se decide entonces, con el caso delante.
- Una `devDependency` más y un test que puede romperse por un cambio de comportamiento del
  oráculo. Cuando eso pase, la pregunta *"¿quién de los dos tiene razón?"* hay que contestarla
  leyendo el RFC, no cediendo. Está anotado aquí para que no se resuelva silenciando el test.
- Un guardrail más ancho (punto 9) es más superficie de falsos positivos. `Temporal.Now` no tiene
  ningún uso legítimo en el núcleo, así que el riesgo es bajo; si aparece uno, la respuesta es un
  ADR que reemplace a este, no un `biome-ignore`.

**Lo que queda condicionado**
- La fase 1 del [05](../05-plan-de-implementacion.md) cambia su línea de dependencia externa, su
  entrega (aparece la separación en dos etapas) y su criterio de aceptación del turno rotativo,
  que era **insatisfacible**: un 4×3 es un ciclo de 7 días y por tanto produce semanas civiles
  **idénticas**, no distintas. Corregido allí el 2026-07-29 con una segunda fixture de ciclo de 8
  días, que sí es el caso que el criterio quería probar.
- `packages/temporal/src/temporal.ts` es el único punto de import del polyfill. Verificar que
  sigue siéndolo es barato con `dependency-cruiser` y le corresponde a `engine-dev` decidir si
  merece una regla.
- **Cuando `Temporal` nativo llegue a un LTS de Node**, el polyfill sale (una línea) y el
  argumento (a) contra `rrule-temporal` caduca. Es el mismo tipo de disparador que ADR-016 dejó
  como workflow mensual; conviene engancharlo ahí en vez de crear otro.
- La conformidad de `temporal-polyfill@1.0.2` con la especificación final no la verifiqué contra
  test262. No hace falta un paso aparte: las tres fixtures de horario de verano del criterio de
  aceptación de la fase 1 la comprueban donde nos importa, y si fallan, el módulo único hace que
  cambiar de polyfill sea una línea.
