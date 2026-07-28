# ADR-013: El motor es una función pura sin acceso a base de datos, red ni reloj
Estado: aceptado (2026-07-28)
Fecha: 2026-07-24
**Puerta de una sola dirección en la práctica.** Recuperar la pureza después de haberla
perdido significa reescribir el motor.

## Contexto

El [ADR-004] decide que el motor es determinista por reglas. Esa decisión no basta por sí
sola: un motor "determinista" que consulta la base de datos a mitad de un cálculo, o que llama
a `Date.now()` para saber si un bloque ya pasó, **no es reproducible** aunque su lógica sea
puramente algorítmica.

Las exigencias que dependen de esto:

- Probar las variantes de la §5 del brief con golden tests reproducibles.
- Probar los invariantes de la §4 con property-based testing sobre miles de entradas
  generadas.
- **Previsualizar un plan sin persistirlo**, que es lo que permite mostrar el intercambio
  antes de aceptarlo (regla nº2).
- Reproducir un plan generado meses atrás ante una queja del usuario.

## Decisión

```ts
function runEngine(input: EngineInput): EngineOutput;
```

**Reglas de la frontera, verificadas mecánicamente:**

1. `packages/engine` y `packages/temporal` **no tienen dependencias de I/O** en su
   `package.json`. `dependency-cruiser` falla el build si aparece `drizzle-orm`, `fastify`,
   `fs`, `node:fs` o cualquier cliente HTTP.
2. **`now` es un parámetro de `EngineInput`.** Ninguna llamada a `Date.now()`, `new Date()`
   sin argumentos ni `performance.now()` dentro de estos paquetes. Test de arquitectura.
3. **Sin aleatoriedad**, ni siquiera con semilla. Los desempates son un orden total explícito.
4. **Toda la entrada está materializada**: las recurrencias llegan ya expandidas, los datos ya
   leídos. El motor no busca nada.
5. **Todos los parámetros calibrables viajan en `input.params`.** Ninguna constante mágica en
   el código.
6. Sin iteración sobre estructuras de orden no garantizado: las claves se ordenan
   explícitamente antes de recorrerlas.
7. **El validador no importa nada del módulo de colocación.** Reimplementa sus comprobaciones.

## Alternativas consideradas

**Motor con acceso a repositorios, mediante interfaces inyectadas.**
A favor: es el patrón habitual (puertos y adaptadores); permite cargar datos bajo demanda y
evita materializar entradas grandes. En contra: la salida deja de ser función solo de la
entrada. Reproducir un plan del pasado exigiría reproducir también el estado de la base de
datos en aquel momento, lo que en la práctica significa que no se puede. Los golden tests
requerirían un doble de repositorio por escenario, que es más frágil y más trabajo que un
`input.json`. Se descarta.

**Motor dentro de `apps/api`, sin paquete propio, con la disciplina como convención.**
A favor: menos ceremonia, sin frontera que mantener. En contra —y esto es lo que decide— **es
la opción que se degrada sola**. Conviviendo con Fastify y Drizzle, tarde o temprano alguien
"solo consulta una cosita" para resolver un caso puntual, y la pureza se pierde de forma
silenciosa e irrecuperable. La separación en paquete con verificación en CI es la única forma
de que la propiedad sobreviva a una fecha de entrega apretada. Se descarta.

**Motor puro salvo el reloj (`now` leído dentro).**
A favor: parece inocuo y ahorra pasar un parámetro por todas partes. En contra: hace
**imposible** probar de forma determinista el caso más importante de la replanificación —"es
miércoles a las 14:30 y hay que replanificar lo que queda"— salvo manipulando el reloj del
sistema en los tests, que es frágil y contamina la suite entera. El coste de pasar `now` es
trivial comparado. Se descarta.

**Motor con caché interna de cálculos entre invocaciones.**
En contra: estado entre llamadas, que es no determinismo con otro nombre. Si hiciera falta
memoización, debe ser interna a una sola invocación y no sobrevivirle.

## Consecuencias

**Lo que ganamos**
- **La §5 del brief se convierte en una suite ejecutable**: un `input.json` y un
  `expected.json` por variante. Es el único mecanismo honesto para afirmar que las variantes
  están soportadas.
- Property-based testing viable: miles de entradas generadas y comprobación de invariantes.
- Los tests del núcleo corren en segundos, sin Docker ni base de datos. Eso cambia el ritmo de
  trabajo en la fase de mayor iteración.
- **Previsualización sin persistir**: se puede responder "¿qué pasaría si añado este
  objetivo?" sin crear una versión. Es lo que hace posible mostrar el intercambio antes de
  aceptarlo.
- Reproducibilidad ante quejas, vía `input_hash` + `engine_version`.
- El motor podría extraerse a un servicio o compilarse a WASM sin cambios, si algún día
  hiciera falta.

**Lo que cuesta**
- **Hay que materializar toda la entrada antes de invocar.** El API hace varias consultas y
  expande recurrencias aunque el motor acabe usando una fracción. Con los volúmenes previstos
  (decenas de compromisos, cientos de huecos) es irrelevante, pero es trabajo real y sería un
  problema con datos mucho mayores.
- Un `EngineInput` grande viaja por memoria en cada generación.
- Duplicación deliberada en el validador.
- Disciplina permanente: sin `dependency-cruiser` y los tests de arquitectura, esto se erosiona
  en meses.

**Lo que queda condicionado**
- La estructura de paquetes y la regla de dependencias de [01 §6](../01-arquitectura.md).
- Toda la estrategia de testing de [05 §6](../05-plan-de-implementacion.md).
- El [ADR-006]: el diff se puede calcular sobre dos salidas del motor sin tocar la base de
  datos, lo que hace testeable el invariante `delta == después − antes`.
- Los guardrails nº1, nº2 y nº5 de [07](../07-convenciones-propuestas.md).

[ADR-004]: ./ADR-004-motor-determinista-vs-llm.md
[ADR-006]: ./ADR-006-versionado-de-plan-y-diff.md
