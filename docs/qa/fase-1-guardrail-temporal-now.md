# QA — Ampliación del guardrail de reloj: `Temporal.Now`, zona ambiente, `performance.now`

Fecha: 2026-07-29. **Actualizado 2026-07-30**: los 11 casos se implementaron y se verificaron
uno a uno en el commit `eaf92f2`. Ver §2 (resultados por caso), §2.bis (`globalThis`, no
anticipado cuando se escribió la primera versión) y §5 (registro).

Estado: **entregado**. El guardrail (ahora 17 formas prohibidas y 11 legítimas en el
canario, según lo verificado por `engine-dev`) está en `scripts/biome/sin-reloj-ni-azar-en-nucleo.grit`
y `scripts/verificar-guardrail-nucleo.mjs`, alcance `packages/{engine,temporal,domain,ical}`.
Referencia histórica:
[`05-plan-de-implementacion.md`](../arquitectura/05-plan-de-implementacion.md) y
[ADR-018 §9](../arquitectura/adr/ADR-018-expansion-de-recurrencia-sin-rrule.md), que fijaban
el alcance sin fijar el patrón exacto — este documento es lo que lo hizo verificable.

Relación con lo existente: este documento **no** repite
[`fase-0-frontera.md`](./fase-0-frontera.md) (esa es sobre `dependency-cruiser` y aristas de
import) ni el guion de `verificar-guardrail-nucleo.mjs` (ese ya existe y ya se comprobó que
falla en silencio si el `overrides.includes` de `biome.json` deja de apuntar a los paquetes
correctos). Lo que aporta es lo que faltaba cuando se escribió: **casos concretos, positivos y
negativos, para las formas nuevas que el plan y ADR-018 §9 nombraban sin fijar** — y, desde la
actualización de hoy, el registro de que se implementaron y de lo que apareció por el camino
que nadie había anticipado.

---

## 0. Por qué esto no era opcional

El propio plan lo dice: *"`Temporal.Now.zonedDateTimeISO()` / `Temporal.Now.timeZoneId()` leen
el reloj y la zona ambiente a la vez — el peor de los dos mundos, y el camino de menor
resistencia para cualquiera que escriba aritmética temporal."* Y ADR-018 §9 fija el alcance:
`Temporal.Now` (cualquier miembro), `Intl.DateTimeFormat().resolvedOptions().timeZone`,
`performance.now`.

Lo que ninguno de los dos documentos hacía era fijar **qué patrón GritQL exacto** cubre
"cualquier miembro" sin, a la vez, producir falsos positivos sobre código legítimo, ni decidir
si `Intl.DateTimeFormat().resolvedOptions()` se bloquea entero o solo su propiedad
`.timeZone`. Eso es lo que este documento fijó con casos concretos, siguiendo el mismo patrón
de `verificar-guardrail-nucleo.mjs`: un canario con líneas prohibidas y líneas legítimas, y la
aserción es "las señaladas son EXACTAMENTE las prohibidas" — en las dos direcciones. Los tres
huecos reales que dejaba abierto — el patrón de "cualquier miembro", el ancla de `Intl` y la
decisión de `.resolvedOptions()` — se cerraron en la implementación de `eaf92f2`, y dos cosas
más aparecieron que nadie había anticipado (§2.bis).

---

## 1. Índice de casos

| # | Forma | Debe señalarse | Resultado (2026-07-30) | Por qué es el caso interesante |
|---|---|---|---|---|
| G1 | `Temporal.Now.instant()` | Sí | ✅ señalada | La forma más directa: lee el reloj |
| G2 | `Temporal.Now.zonedDateTimeISO()` | Sí | ✅ señalada | Lee reloj **y** zona ambiente a la vez |
| G3 | `Temporal.Now.timeZoneId()` | Sí | ✅ señalada | Solo zona, sin reloj — confirma que el patrón no exige la parte de "instant" |
| G4 | `Intl.DateTimeFormat().resolvedOptions().timeZone` | Sí | ✅ señalada | Zona ambiente sin pasar por `Temporal` en absoluto |
| G5 | `performance.now()` | Sí | ✅ señalada | Reloj de alta resolución, forma sintáctica distinta a las cuatro ya cubiertas |
| G6 | `Temporal.PlainDate.from('2026-08-03')` | No | ✅ limpia | Control negativo: uso legítimo y frecuente de `Temporal`, no debe rozar el patrón |
| G7 | `Temporal.Instant.fromEpochMilliseconds(0)` | No | ✅ limpia | Control negativo: instancia un instante a partir de un argumento explícito, exactamente la forma permitida por analogía con `new Date(argumento)` |
| G8 | `new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City' })` | No | ✅ limpia | Control negativo: zona **explícita**, no ambiente. No llama a `.resolvedOptions()` en absoluto, así que sigue limpia incluso con la lectura amplia de G10 |
| G9 | `const reloj = { Now: () => 1 }; reloj.Now();` | No | ✅ limpia | Trampa de falso positivo: un objeto local con una propiedad llamada `Now` que no tiene relación con `Temporal`. Verificado también por `engine-dev` de forma independiente |
| G10 | `Intl.DateTimeFormat().resolvedOptions().calendar` | **Sí — decidido: lectura amplia** | ✅ señalada | Ya no es una decisión pendiente. Ver §2, Caso G10, reescrito |
| G11 | `Temporal.Now` (referencia suelta) | Sí | ✅ señalada | Análogo a por qué `new Date` sin paréntesis hace falta además de `new Date()` |

---

## 2. Casos, en el formato de la casa

Mismo formato que `fase-0-frontera.md`: **Precondición · Acción · Resultado esperado · Regla
que debe dispararse · Por qué otra regla sería falso positivo · Modo · Automatizar**.

**Modo, aquí solo hay uno**: análogo al de `verificar-guardrail-nucleo.mjs` — escribir un
canario en cada paquete del alcance (`packages/{engine,temporal,domain,ical}`), correr
`biome lint --reporter=json` sobre él, leer los diagnósticos `category: "plugin"`, comparar
por número de línea, borrar el canario. No hace falta un "Modo A/B" como en `depcruise`
porque no hay ningún paso de CI-vs-local que discrepar: Biome se comporta igual en ambos
sitios.

### Caso G1–G3 — los tres miembros de `Temporal.Now` probados por separado

- **Precondición**: plugin ampliado con un patrón para `Temporal.Now.$miembro(...)` (o
  equivalente GritQL), aplicado al mismo `overrides` de `biome.json`.
- **Acción**: canario con tres líneas, una por miembro:
  ```ts
  export const a = Temporal.Now.instant();
  export const b = Temporal.Now.zonedDateTimeISO("America/Mexico_City");
  export const c = Temporal.Now.timeZoneId();
  ```
- **Resultado esperado**: las tres líneas señaladas.
- **Regla que debe dispararse**: la extensión del plugin `sin-reloj-ni-azar-en-nucleo.grit`.
- **Por qué probar los tres y no solo `instant()`**: si el patrón se escribiera
  hardcodeado a `Temporal.Now.instant` (el ejemplo más obvio) en vez de a "cualquier
  miembro de `Temporal.Now`" como pide ADR-018 §9 literalmente, G2 y G3 pasarían
  desapercibidos. Es el mismo tipo de comprobación que el Caso 4 de `fase-0-frontera.md`
  hace para builtins de Node: la señal debe ser genérica, no una lista cerrada de
  ejemplos.
- **Automatizar**: sí, prioridad alta — extender `LINEAS_PROHIBIDAS` y el array `CANARIO` de
  `scripts/verificar-guardrail-nucleo.mjs` con estas tres líneas.
- **Resultado verificado (2026-07-30)**: las tres se señalan, una por una, en `eaf92f2`.

### Caso G4 — zona ambiente vía `Intl`, sin pasar por `Temporal`

- **Acción**: canario con
  ```ts
  export const zonaAmbiente = Intl.DateTimeFormat().resolvedOptions().timeZone;
  ```
- **Resultado esperado**: señalada.
- **Por qué es un caso aparte de G1–G3**: es la otra mitad del "peor de los dos mundos" que
  ADR-018 §9 nombra — lee la zona del proceso sin que `Temporal` aparezca en la línea, así
  que un patrón que solo mire el identificador `Temporal` no la vería nunca. Tiene que ser un
  patrón independiente en el plugin.
- **Automatizar**: sí, prioridad alta.
- **Resultado verificado (2026-07-30)**: señalada. Con la decisión de G10 (lectura amplia),
  esta forma queda cubierta dos veces — por el patrón específico de `.timeZone` y por el
  patrón general de `.resolvedOptions()` sin ancla — lo cual es redundante pero inofensivo.

### Caso G5 — `performance.now`

- **Acción**: canario con `export const p = performance.now();`.
- **Resultado esperado**: señalada.
- **Por qué es distinta de `Date.now`**: es una forma sintáctica nueva (`performance.now`, no
  `Date.now`), así que necesita su propia entrada en el `or { ... }` del plugin — no basta con
  que el plugin ya cubra `Date.now`.
- **Automatizar**: sí, prioridad alta.
- **Resultado verificado (2026-07-30)**: señalada.

### Caso G6–G8 — controles negativos: usos legítimos que no deben rozarse

- **Acción**: canario con
  ```ts
  export const d = Temporal.PlainDate.from("2026-08-03");
  export const e = Temporal.Instant.fromEpochMilliseconds(0);
  export const f = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City" });
  ```
- **Resultado esperado**: **ninguna** línea señalada.
- **Por qué esto es tan importante como los casos positivos**: es exactamente la lección de
  `new Date(argumento)` en el guardrail actual — si estos tres patrones dispararan falsos
  positivos, la respuesta habitual de un equipo bajo presión es silenciar el plugin entero
  con un `biome-ignore`, y entonces deja de proteger nada. G8 en particular es el análogo
  directo de "zona explícita, no ambiente": si el patrón de G4 se escribe de forma demasiado
  amplia (por ejemplo, casando cualquier `.resolvedOptions()` sin mirar qué propiedad se lee
  después), G8 lo delata.
- **Automatizar**: sí, prioridad alta — sin este caso, G4 podría estar sobre-bloqueando y
  nadie lo notaría hasta que alguien necesite formatear una fecha con zona explícita dentro
  del núcleo y el lint se lo impida sin motivo.
- **Resultado verificado (2026-07-30)**: las tres líneas quedan limpias. **G8 sigue limpia
  incluso con la lectura amplia de G10** decidida por `engine-dev`, porque G8 nunca llama a
  `.resolvedOptions()` — construye el formateador con zona explícita y no la consulta después.
  Es la prueba de que "ancla explícita en el constructor" y "lectura de `.resolvedOptions()`
  sin ancla" son dos cosas distintas y la lectura amplia solo prohíbe la segunda.

### Caso G9 — trampa de falso positivo: un `Now` que no es `Temporal.Now`

- **Acción**: canario con
  ```ts
  const reloj = { Now: () => 1 };
  export const g = reloj.Now();
  ```
- **Resultado esperado**: **no** señalada.
- **Por qué existe este caso**: "cualquier miembro de `Temporal.Now`" podría implementarse,
  por prisa, como un patrón que casa `$obj.Now.$miembro(...)` o incluso `.Now(...)` sin anclar
  al identificador literal `Temporal`. Este canario tiene un objeto local sin ninguna relación
  con el núcleo temporal que usa el mismo nombre de propiedad. Si se señala, el patrón está mal
  anclado y produce falsos positivos sobre cualquier código que use la palabra "Now" para otra
  cosa — plausible en código de dominio (`isNow`, `nowPlaying`, lo que sea).
- **Automatizar**: sí, prioridad alta — es el caso más barato de los diez y el que más
  claramente distingue "el patrón está bien anclado" de "el patrón funciona por casualidad en
  los ejemplos que se probaron".
- **Resultado verificado (2026-07-30)**: limpia, confirmado también de forma independiente por
  `engine-dev` al decidir G10 — es precisamente el contraste que justifica que `Now` **sí**
  quede anclado al identificador `Temporal` mientras que `resolvedOptions` **no** quede
  anclado a `Intl.DateTimeFormat` (ver Caso G10 reescrito, penúltimo punto).

### Caso G10 — `Intl.DateTimeFormat().resolvedOptions()`: decidido, lectura amplia

> **Decisión (2026-07-30, `engine-dev`).** Se prohíbe **cualquier acceso al miembro
> `resolvedOptions`, sin anclar el receptor** — no solo `.timeZone`, y no solo cuando el
> receptor es literalmente `Intl.DateTimeFormat()`. Este documento decía que si se elegía la
> lectura amplia había que actualizarlo con la decisión; queda hecho aquí.

- **Argumento de la decisión, tal como lo dio `engine-dev`**:
  - La lectura estrecha (`Intl.DateTimeFormat().resolvedOptions().timeZone` como forma
    literal única) se esquiva con un refactor de dos líneas:
    ```ts
    const o = Intl.DateTimeFormat().resolvedOptions();
    // ... treinta líneas más abajo ...
    export const zona = o.timeZone;
    ```
    Con la lectura amplia, ese bypass dispara en la primera línea, donde se llama a
    `.resolvedOptions()`, sin esperar a que alguien lea `.timeZone` de la variable.
  - Sin anclar el receptor a `Intl.DateTimeFormat()` textual, la regla cubre también
    `new Intl.DateTimeFormat("es-MX").resolvedOptions().timeZone` — un locale explícito, zona
    ambiente igual — que la forma literal de ADR-018 §9 no habría visto nunca, porque esa
    forma no coincide carácter por carácter con la que el ADR escribió como ejemplo.
  - **Falso positivo que esta decisión acepta a propósito**: un objeto propio con un método
    llamado `resolvedOptions` (p. ej. `const cfg = { resolvedOptions: () => ({}) };
    cfg.resolvedOptions();`) también se señala, sin ser `Intl` en absoluto. Se acepta porque
    `resolvedOptions` no es un nombre que alguien elija por casualidad para otra cosa — a
    diferencia de `Now` (Caso G9), que sí es una palabra común en código de dominio y por eso
    ese patrón **sigue anclado** al identificador literal `Temporal`. Son dos decisiones de
    anclaje distintas, cada una calibrada al riesgo real de falso positivo de su propio
    nombre de miembro.
- **Acción — tres líneas de canario, cubriendo las tres formas de la decisión**:
  ```ts
  export const h1 = Intl.DateTimeFormat().resolvedOptions().calendar;
  const o = Intl.DateTimeFormat().resolvedOptions();
  export const h2 = o.timeZone;
  export const h3 = new Intl.DateTimeFormat("es-MX").resolvedOptions().timeZone;
  ```
- **Resultado esperado**: las tres líneas que llaman a `.resolvedOptions()` se señalan
  (`h1`'s línea, la línea de `const o = ...`, y la línea de `h3`). La línea `export const h2 =
  o.timeZone;` **no** se señala por sí sola — el patrón ancla en la *llamada* a
  `.resolvedOptions()`, no en cada lectura posterior de la variable resultante; eso es
  aceptable porque la llamada ya quedó marcada un renglón antes y es donde ocurre la lectura
  ambiental real.
- **Resultado verificado (2026-07-30)**: confirmado por `engine-dev`, incluido el subcaso
  original de este documento (`...resolvedOptions().calendar`, que ya no es una propiedad
  distinta de `.timeZone` sin cubrir: con la lectura amplia da igual qué propiedad se lea
  después, porque la señal está en la llamada, no en el acceso posterior).
- **Automatizar**: sí, prioridad alta — ya no depende de una decisión pendiente.

### Caso G11 — referencia suelta a `Temporal.Now`, sin invocar ningún miembro

- **Acción**: canario con
  ```ts
  function usaReloj(fn: () => unknown) { return fn(); }
  export const i = usaReloj(Temporal.Now.instant);
  ```
  (pasa la función sin invocarla en el sitio, análogo a `[...].map(Date.now)` que el
  comentario del plugin actual ya nombra como motivo de por qué `Date.now` sin paréntesis
  también hace falta).
- **Resultado esperado**: señalada — la referencia sola es tan peligrosa como la llamada
  directa, exactamente el mismo argumento que ya está escrito en
  `scripts/biome/sin-reloj-ni-azar-en-nucleo.grit` para `Date.now`/`Math.random`.
- **Por qué no se puede dar por sentado que ya funciona por herencia del patrón de G1–G3**:
  un patrón GritQL escrito como `Temporal.Now.$miembro()` (con paréntesis de llamada
  obligatorios) no casaría aquí, igual que `new Date()` no casa con `new Date` suelto. Hace
  falta la forma sin invocar, igual que en el guardrail original.
- **Automatizar**: sí, prioridad alta.
- **Resultado verificado (2026-07-30)**: señalada.

---

## 2.bis Ampliación no anticipada: prohibición de `globalThis` entero

**Esto no estaba en la versión original de este documento porque no estaba decidido cuando se
escribió** (2026-07-29). Apareció en la implementación de `eaf92f2`: `globalThis` se prohíbe
por completo, con un diagnóstico propio y distinto del de reloj/azar (no es "Reloj o azar en
el núcleo" reetiquetado — es una regla nueva del mismo plugin). El razonamiento, según lo
reportado: acceder a través de `globalThis.*` es en sí mismo un indicio de que el código
depende de estado ambiente, sea cual sea el miembro accedido después, así que es más barato
prohibir el receptor que perseguir cada miembro nuevo uno por uno.

Dos formas descubiertas de esta manera **no las había anticipado nadie** — ni el plan, ni
ADR-018 §9, ni este documento en su primera versión: `crypto.getRandomValues` y
`process.env.TZ`. Aparecieron precisamente por atajar el receptor (`globalThis`) en vez de
enumerar miembros, que es la misma lección que este documento ya aplicaba en G1–G3 ("cualquier
miembro", no una lista cerrada) llevada un nivel más arriba. La segunda —`process.env.TZ`— es,
literalmente, el modo de fallo por el que ADR-018 descartó `rrule` en producción (la
conversión de `Date` que documenta `rrule` depende de `process.env.TZ`, un estado ambiente que
ni `dependency-cruiser` ni el guardrail original podían ver). Que aparezca aquí, dentro del
propio guardrail, y no en una revisión de código posterior, es exactamente lo que este
mecanismo existe para lograr.

### Caso GT1–GT7 — formas prohibidas vía `globalThis`

- **Acción**: canario con
  ```ts
  export const gt1 = globalThis.Date.now();
  export const gt2 = globalThis.Math.random();
  export const gt3 = globalThis.performance.now();
  export const gt4 = globalThis.Temporal.Now.instant();
  export const gt5 = globalThis.Intl.DateTimeFormat().resolvedOptions();
  export const gt6 = globalThis.crypto.getRandomValues(new Uint8Array(1));
  export const gt7 = globalThis.process.env.TZ;
  ```
- **Resultado esperado**: las siete líneas señaladas, con un diagnóstico **distinto** del de
  "Reloj o azar en el núcleo" (confirmar el texto exacto del mensaje contra el plugin real;
  no se reproduce aquí porque no se transcribió en el reporte de `eaf92f2`, y es preferible
  decir "verificar" a inventar la cadena).
- **Por qué GT6 y GT7 son los dos casos que más vale marcar**: ninguno de los documentos que
  precedieron a esta ampliación (plan, ADR-018 §9, ni la primera versión de este documento)
  los nombraba. No son una generalización de un patrón ya conocido — son formas de
  aleatoriedad y de estado ambiente que nadie había puesto en la lista hasta que se prohibió
  el receptor en vez de enumerar miembros. Vale la pena registrar esto no como una anécdota
  sino como argumento a favor del propio mecanismo: **enumerar miembros conocidos siempre va
  a ir por detrás de anclar el receptor cuando el receptor mismo es el problema.**
- **Automatizar**: sí, prioridad alta — extender el canario de
  `scripts/verificar-guardrail-nucleo.mjs` con estas siete líneas.
- **Resultado verificado (2026-07-30)**: reportado como señalado por `engine-dev` para las
  siete formas.

### Caso GT8 — referencia suelta a `globalThis`

- **Acción**: canario con `export const gt8 = [globalThis].length;` (referencia sin acceder a
  ningún miembro, análogo a G11 y a `new Date` sin paréntesis).
- **Resultado esperado**: señalada.
- **Por qué**: mismo argumento que G11 — el identificador suelto es tan peligroso como
  cualquier acceso a un miembro suyo, porque de ahí se puede extraer cualquier cosa
  (`const g = [globalThis][0]; g.Date.now()`, por ejemplo).
- **Automatizar**: sí, prioridad alta.
- **Resultado verificado (2026-07-30)**: reportado como señalado.

### Caso GT9–GT11 — controles negativos: la palabra "globalThis" sin ser el objeto global

- **Acción**: canario con
  ```ts
  export const gt9 = "globalThis".length;
  export const gt10 = { esGlobalThis: false };
  const globalThisNoEsEste = 3;
  export const gt11 = globalThisNoEsEste;
  ```
- **Resultado esperado**: **ninguna** línea señalada.
- **Por qué son los controles negativos que más importan de esta ampliación**: `globalThis`
  como palabra es más probable que aparezca dentro de nombres de variables, propiedades o
  cadenas de texto que `Now` o `resolvedOptions` — es una palabra descriptiva común en código
  que habla *sobre* el objeto global sin ser una lectura de él (banderas de configuración,
  literales de test, nombres de utilidades). Si el patrón casara por subcadena en vez de por
  el identificador exacto, estos tres canarios lo delatarían inmediatamente.
- **Automatizar**: sí, prioridad alta — mismo peso que GT1–GT8; sin este control, la
  prohibición de `globalThis` podría estar sobre-bloqueando código de dominio legítimo sin que
  nadie lo note hasta tropezar con él.
- **Resultado verificado (2026-07-30)**: reportado como limpio para los tres.

### Pregunta abierta que esta ampliación deja, no decidida aquí

**¿`crypto.getRandomValues` está prohibido también en su forma *bare*, sin `globalThis.`
delante, como quinta forma independiente junto a `Date.now`/`Math.random`/`new Date`/`new
Date()`?** El reporte de `eaf92f2` confirma la forma `globalThis.crypto.getRandomValues(...)`,
pero no dice si `crypto.getRandomValues(...)` sin el prefijo (que en Node 24 y en navegador
resuelve exactamente al mismo objeto global, igual que `Math.random` resuelve sin necesitar
`globalThis.Math.random`) tiene su propio patrón o si depende enteramente de que alguien
escriba `globalThis.` delante. Si depende de eso, es un hueco: nadie escribe
`globalThis.Math.random()` en la práctica — se escribe `Math.random()` a secas, y por eso el
guardrail original tiene un patrón específico para la forma bare. Si `crypto.getRandomValues`
no tiene el mismo tratamiento, la forma más probable de usarlo en código real queda sin cubrir
pese a que la variante con `globalThis.` sí lo está. Esto no lo decido yo — lo señalo para que
se verifique contra el plugin real antes de darlo por cerrado. Ver ítem nuevo en "qué falta"
del documento hermano
[`fase-1-nucleo-temporal.md`](./fase-1-nucleo-temporal.md#4-qué-falta--priorizado) si procede
añadirlo allí en vez de aquí.

---

## 3. Lo que este documento deja abierto

- **G10 ya no está abierto** (§2, Caso G10 reescrito) — se deja la sección con este título
  para no reescribir el número de sección, pero el punto en sí está resuelto.
- **La forma *bare* de `crypto.getRandomValues`** (ver pregunta abierta de §2.bis) sigue sin
  confirmarse.
- **La regla nueva de `dependency-cruiser`, `polyfill-temporal-solo-en-su-modulo`**, que
  mecaniza que solo `packages/temporal/src/temporal.ts` importe `temporal-polyfill`, **no
  tiene casos en este documento** porque su mecanismo es `dependency-cruiser`, no Biome/GritQL
  — es decir, es del mismo mecanismo que `fase-0-frontera.md`, no del de este documento.
  Propuesta: casos nuevos en un documento propio,
  [`fase-1-frontera-polyfill-temporal.md`](./fase-1-frontera-polyfill-temporal.md), siguiendo
  el mismo formato que `fase-0-frontera.md` en vez de forzarlos aquí. Se escribió ese
  documento junto con esta actualización — ver ahí.
- **Este documento no cubre el mecanismo de "grafo vacío" ni "config rota"** que
  `fase-0-frontera.md` sí cubre para `dependency-cruiser` (Casos 6–8 de ese documento). El
  paralelo existiría (¿qué pasa si el `overrides.includes` de `biome.json` deja de apuntar a
  los cuatro paquetes?), pero **ya está cubierto** por `verificar-guardrail-nucleo.mjs`, que
  no es específico de las formas originales: vuelve a escribir el canario entero en cada
  paquete del alcance y fallaría igual si el alcance se rompe, sea cual sea el número de
  formas prohibidas que el plugin declare (hoy 17). No hace falta un documento nuevo para eso.

---

## 4. Automatización — resumen

| Caso | Automatizar | Prioridad | Estado |
|---|---|---|---|
| G1–G3 | Sí | Alta | ✅ implementado, `eaf92f2` |
| G4 | Sí | Alta | ✅ implementado |
| G5 | Sí | Alta | ✅ implementado |
| G6–G8 | Sí | Alta — control negativo, mismo peso que los positivos | ✅ implementado |
| G9 | Sí | Alta — el más barato y el que más claramente detecta un patrón mal anclado | ✅ implementado |
| G10 | Sí | Alta — decisión tomada (lectura amplia) | ✅ implementado |
| G11 | Sí | Alta | ✅ implementado |
| GT1–GT8 | Sí | Alta | ✅ implementado (`globalThis`, no anticipado en la v1 de este documento) |
| GT9–GT11 | Sí | Alta | ✅ implementado |
| `crypto.getRandomValues` forma *bare* | Pendiente de verificar | — | Abierto, ver §2.bis |
| `polyfill-temporal-solo-en-su-modulo` | Ver documento propio | — | Ver `fase-1-frontera-polyfill-temporal.md` |

Todo lo automatizable aquí vive como extensión de `LINEAS_PROHIBIDAS`/`CANARIO` en
`scripts/verificar-guardrail-nucleo.mjs`, no como un script nuevo — es el mismo mecanismo,
solo con más líneas. Confirmado en `eaf92f2`: el canario ahora cubre 17 formas prohibidas y
11 legítimas.

---

## 5. Registro de ejecuciones

| Fecha | Quién / commit | Casos ejecutados | Resultado | Hallazgos |
|---|---|---|---|---|
| 2026-07-30 | `engine-dev`, commit `eaf92f2` | G1–G11 (los 11 de este documento, uno por uno) | G1, G2, G3, G11, G4, G5 señalados según lo esperado. G6, G7, G8, G9 limpios según lo esperado. G10 señalado bajo la lectura amplia decidida (incluido el subcaso original `...resolvedOptions().calendar`) | G10 resuelto: lectura amplia, sin anclar el receptor de `resolvedOptions`. Descubierta la prohibición completa de `globalThis` (no estaba en este documento, añadida en §2.bis con 11 casos nuevos GT1–GT11, todos verificados en el mismo commit). Dos formas de `globalThis` no anticipadas por ningún documento previo: `crypto.getRandomValues` y `process.env.TZ` — esta última es el mismo modo de fallo que ADR-018 usó para descartar `rrule`. Queda abierto si `crypto.getRandomValues` tiene también forma *bare* prohibida. Nueva regla `dependency-cruiser` `polyfill-temporal-solo-en-su-modulo` identificada, sin casos propios en este documento — movida a `fase-1-frontera-polyfill-temporal.md` |
