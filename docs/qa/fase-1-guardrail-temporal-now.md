# QA — Ampliación del guardrail de reloj: `Temporal.Now`, zona ambiente, `performance.now`

Fecha: 2026-07-29
Estado: escrito antes de que exista la ampliación. El guardrail actual (cuatro patrones:
`Date.now`, `Math.random`, `new Date()`, `new Date`) está entregado y verificado por
`pnpm guardrail:cobertura`. Esta ampliación es entrega pendiente de la fase 1, dueño
`engine-dev`, según
[`05-plan-de-implementacion.md`](../arquitectura/05-plan-de-implementacion.md) y
[ADR-018 §9](../arquitectura/adr/ADR-018-expansion-de-recurrencia-sin-rrule.md).

Relación con lo existente: este documento **no** repite
[`fase-0-frontera.md`](./fase-0-frontera.md) (esa es sobre `dependency-cruiser` y aristas de
import) ni el guion de `verificar-guardrail-nucleo.mjs` (ese ya existe y ya se comprobó que
falla en silencio si el `overrides.includes` de `biome.json` deja de apuntar a los paquetes
correctos). Lo que aporta es lo que falta hoy: **casos concretos, positivos y negativos, para
las tres formas nuevas que el propio plan nombra sin fijar**.

---

## 0. Por qué esto no es opcional

El propio plan lo dice: *"`Temporal.Now.zonedDateTimeISO()` / `Temporal.Now.timeZoneId()` leen
el reloj y la zona ambiente a la vez — el peor de los dos mundos, y el camino de menor
resistencia para cualquiera que escriba aritmética temporal."* Y ADR-018 §9 fija el alcance:
`Temporal.Now` (cualquier miembro), `Intl.DateTimeFormat().resolvedOptions().timeZone`,
`performance.now`.

Lo que ninguno de los dos documentos hace es fijar **qué patrón GritQL exacto** cubre "cualquier
miembro" sin, a la vez, producir falsos positivos sobre código legítimo que use la palabra
`Now` en otro contexto, ni decidir si `Intl.DateTimeFormat().resolvedOptions()` se bloquea
entero o solo su propiedad `.timeZone`. Eso es lo que este documento fija con casos concretos,
siguiendo el mismo patrón de `verificar-guardrail-nucleo.mjs`: un canario con líneas
prohibidas y líneas legítimas, y la aserción es "las señaladas son EXACTAMENTE las
prohibidas" — en las dos direcciones.

---

## 1. Índice de casos

| # | Forma | Debe señalarse | Por qué es el caso interesante |
|---|---|---|---|
| G1 | `Temporal.Now.instant()` | Sí | La forma más directa: lee el reloj |
| G2 | `Temporal.Now.zonedDateTimeISO()` | Sí | Lee reloj **y** zona ambiente a la vez |
| G3 | `Temporal.Now.timeZoneId()` | Sí | Solo zona, sin reloj — confirma que el patrón no exige la parte de "instant" |
| G4 | `Intl.DateTimeFormat().resolvedOptions().timeZone` | Sí | Zona ambiente sin pasar por `Temporal` en absoluto |
| G5 | `performance.now()` | Sí | Reloj de alta resolución, forma sintáctica distinta a las cuatro ya cubiertas |
| G6 | `Temporal.PlainDate.from('2026-08-03')` | No | Control negativo: uso legítimo y frecuente de `Temporal`, no debe rozar el patrón |
| G7 | `Temporal.Instant.fromEpochMilliseconds(0)` | No | Control negativo: instancia un instante a partir de un argumento explícito, exactamente la forma permitida por analogía con `new Date(argumento)` |
| G8 | `new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City' })` | No | Control negativo: zona **explícita**, no ambiente — la forma legítima que corresponde a G4 |
| G9 | `const reloj = { Now: () => 1 }; reloj.Now();` | No | Trampa de falso positivo: un objeto local con una propiedad llamada `Now` que no tiene relación con `Temporal`. Si el patrón casa por nombre de miembro sin anclar al identificador `Temporal`, este caso lo delata |
| G10 | `Intl.DateTimeFormat().resolvedOptions().calendar` | Decisión pendiente | Lee `resolvedOptions()` pero una propiedad distinta de `.timeZone`. Ver §3 |
| G11 | `Temporal.Now` (referencia suelta, sin llamar a ningún miembro, p. ej. pasada como argumento: `algo(Temporal.Now)`) | Sí, si es sintácticamente posible | Análogo a por qué `new Date` (sin paréntesis) hace falta además de `new Date()` en el guardrail actual — una referencia suelta al espacio de nombres completo es tan peligrosa como cualquier miembro suyo |

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

### Caso G5 — `performance.now`

- **Acción**: canario con `export const p = performance.now();`.
- **Resultado esperado**: señalada.
- **Por qué es distinta de `Date.now`**: es una forma sintáctica nueva (`performance.now`, no
  `Date.now`), así que necesita su propia entrada en el `or { ... }` del plugin — no basta con
  que el plugin ya cubra `Date.now`.
- **Automatizar**: sí, prioridad alta.

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

### Caso G10 — decisión pendiente: ¿toda `.resolvedOptions()` o solo `.timeZone`?

- **Acción**: canario con `export const h = Intl.DateTimeFormat().resolvedOptions().calendar;`
  (nótese: **no** es `.timeZone`, es una propiedad distinta que también depende del entorno
  ambiente — locale por defecto — aunque no sea estrictamente una zona horaria).
- **Resultado esperado**: **no está decidido, y hay que decidirlo antes de escribir el
  patrón, no durante la revisión de código.** ADR-018 §9 nombra literalmente
  `Intl.DateTimeFormat().resolvedOptions().timeZone`, no la llamada `.resolvedOptions()` en
  general. Dos lecturas posibles, ambas defendibles:
  - **Estrecha**: solo `.timeZone` es zona ambiente y lo demás (`.calendar`, `.locale`,
    `.numberingSystem`) no es responsabilidad de este guardrail porque no afecta a instantes
    ni a jornadas.
  - **Amplia**: cualquier propiedad leída de `resolvedOptions()` sin pasar un locale/zona
    explícitos como argumento del constructor lee estado ambiente del proceso, y el núcleo no
    debería depender de ninguna de ellas, aunque hoy solo `timeZone` tenga un camino de daño
    obvio.
  Este documento no elige por `engine-dev` — el punto es que **si se implementa la lectura
  estrecha, este caso debe registrarse explícitamente como "no señalada, a propósito"**, para
  que quede constancia de que se decidió y no que se olvidó. Si se elige la lectura amplia,
  el caso pasa a esperar "señalada" y hay que actualizar este documento.
- **Automatizar**: sí, una vez decidido — no antes, porque automatizar una aserción sobre una
  decisión no tomada fija por accidente la respuesta más barata de implementar.

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

---

## 3. Lo que este documento deja abierto, a propósito

- **G10 es una decisión de producto/arquitectura, no de QA.** Se deja registrada para que
  `engine-dev` la resuelva de forma explícita (con nota fechada si no cambia nada de fondo, o
  con un ADR si de verdad importa) en vez de que la resuelva implícitamente quien escriba el
  patrón GritQL primero.
- **Este documento no cubre el mecanismo de "grafo vacío" ni "config rota"** que
  `fase-0-frontera.md` sí cubre para `dependency-cruiser` (Casos 6–8 de ese documento). El
  paralelo existiría (¿qué pasa si el `overrides.includes` de `biome.json` deja de apuntar a
  los cuatro paquetes?), pero **ya está cubierto** por `verificar-guardrail-nucleo.mjs`, que
  no es específico de las cuatro formas originales: vuelve a escribir el canario entero en
  cada paquete del alcance y fallaría igual si el alcance se rompe, sea cual sea el número de
  formas prohibidas que el plugin declare. No hace falta un documento nuevo para eso.

---

## 4. Automatización — resumen

| Caso | Automatizar | Prioridad |
|---|---|---|
| G1–G3 | Sí | Alta |
| G4 | Sí | Alta |
| G5 | Sí | Alta |
| G6–G8 | Sí | Alta — control negativo, mismo peso que los positivos |
| G9 | Sí | Alta — el más barato y el que más claramente detecta un patrón mal anclado |
| G10 | Pendiente de decisión | — |
| G11 | Sí | Alta |

Todo lo automatizable aquí vive como extensión de `LINEAS_PROHIBIDAS`/`CANARIO` en
`scripts/verificar-guardrail-nucleo.mjs`, no como un script nuevo — es el mismo mecanismo,
solo con más líneas.

---

## 5. Registro de ejecuciones

| Fecha | Quién / commit | Casos ejecutados | Resultado | Hallazgos |
|---|---|---|---|---|
| | | | | |
