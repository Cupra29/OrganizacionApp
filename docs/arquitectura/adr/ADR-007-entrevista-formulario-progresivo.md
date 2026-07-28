# ADR-007: Entrevista como formulario progresivo con puertas de valor; borrador en JSONB
Estado: aceptado (2026-07-28)
Fecha: 2026-07-24
Responde a la decisión §10.4 del brief.

## Contexto

El brief describe la entrevista como "onboarding conversacional o por formulario progresivo",
exige que "debe poder pausarse y retomarse: nadie completa esto de una sentada", y añade dos
restricciones que tiran en direcciones opuestas:

- **Regla nº5**: el diagnóstico precede al calendario. El usuario debe ver por qué su semana
  no funcionaba antes de ver una propuesta.
- **Anti-requisito nº4**: no pedir estimaciones detalladas de duración para cada tarea antes
  de dar cualquier valor.

Juntas implican algo concreto y exigente: **debe existir un punto intermedio, bastante antes
del final, en el que el sistema ya entrega valor.** No basta con permitir pausar; hay que
diseñar dónde está ese punto.

## Decisión

**Formulario progresivo por secciones como fuente de verdad, con dos puertas explícitas de
valor y borrador en JSONB.**

**1. Secciones, no una lista larga:** perfil temporal → compromisos fijos → transiciones →
objetivos y ranking → bienestar → inventario de tareas (opcional).

**2. Dos puertas, expuestas en la API como `gates`:**

| Puerta | Requiere | Habilita |
|---|---|---|
| `readyForDiagnosis` | Perfil temporal + franja pico + al menos un compromiso fijo | **Diagnóstico completo** |
| `readyForPlan` | Lo anterior + objetivos con ranking + bienestar | Generación de plan |

La primera puerta se alcanza en unos pocos minutos y **sin ninguna estimación de duración**.
Es la implementación literal del anti-requisito nº4 y de la regla nº5.

**3. Guardado a medias en `interview_sessions.answers` (JSONB), sin validación global.**
`PATCH` es aditivo y tolerante: acepta respuestas parciales e incoherentes.

**4. La normalización a tablas definitivas ocurre al cerrar una sección**
(`commit-section`), en una transacción, con validación completa de esa sección.

**5. La captura en lenguaje natural, cuando exista, produce propuestas tipadas que el usuario
confirma** — nunca escribe directamente ([ADR-004]).

**6. Regla de ubicación de campos (añadida el 2026-07-27 al resolverse Q2):**

> **Un campo se pregunta en el momento en que su respuesta importa, no en el onboarding.**

Q2 se resolvió a favor del marcado explícito del anclaje temporal por compromiso, lo que
amenazaba con añadir un campo a cada compromiso fijo en una entrevista que ya es larga. **No
se añade a la entrevista.** El anclaje solo tiene efecto durante un viaje, así que:

- El campo **no aparece en ningún paso de la entrevista** y no afecta a ninguna de las dos
  puertas. `readyForDiagnosis` sigue necesitando exactamente lo mismo que antes.
- Al crear cada compromiso, el valor se **precarga** según la modalidad (presencial →
  `SUSPEND_WHEN_AWAY`, remoto → `FIXED_ZONE`) y queda visible y editable en la sección
  avanzada del formulario de edición, plegada por defecto.
- La pregunta real se hace **una sola vez, la primera vez que el usuario declara un viaje**
  (crea un `timezone_override`): una pantalla con sus compromisos agrupados por el valor
  precargado, para revisar en bloque en lugar de responder N preguntas sueltas.
- Si el usuario nunca viaja, **nunca se le pregunta**.

**Precarga no es inferencia.** Q2 descartó que el sistema *dedujera* el comportamiento a
partir de la modalidad en tiempo de expansión, con el dato ausente del modelo. Aquí el dato
existe, es explícito, es visible y es del usuario; lo único que se sugiere es su valor
inicial. Esa distinción es la que permite cumplir la respuesta sin alargar el onboarding.

## Alternativas consideradas

**Entrevista conversacional con LLM como camino principal.**
A favor: es lo que hace que un onboarding largo se sienta ligero, y el brief lo menciona
primero. En contra: dependencia de proveedor, coste variable y latencia en el primer contacto
con el producto; hay que construir igualmente el formulario como respaldo y como superficie de
edición posterior (nadie edita sus compromisos por chat seis meses después); y el estado
conversacional a medias es mucho más difícil de retomar que un formulario a medias. Se
descarta como camino principal y **se conserva como acelerador** encima del formulario. Ver
Q9, resuelta el 2026-07-28: **coste variable cero en el primer entregable**, sin cerrar la
puerta a añadirlo después.

**Formulario largo de una sola página.**
A favor: trivial. En contra: incompatible con "nadie completa esto de una sentada", y hace
imposible el diagnóstico temprano porque no hay noción de progreso parcial. Se descarta.

**Asistente por pasos con normalización inmediata a las tablas definitivas en cada paso.**
A favor: un solo modelo de datos, sin JSONB, sin duplicidad. En contra —y es la razón por la
que se descarta— **obligaría a que cada paso dejara la base en un estado válido**. La entrevista
a medias es un estado intrínsecamente inválido: tres objetivos sin ranking completo, un
compromiso sin transiciones. Para admitirlo habría que relajar las constraints del esquema
definitivo, que son justamente las que sostienen los invariantes del motor (ranking sin
empates, entre otras). El borrador en JSONB **protege la integridad del modelo definitivo** de
la naturaleza desordenada del proceso de captura.

**Guardar el borrador en el cliente (localStorage).**
A favor: cero infraestructura. En contra: se pierde al cambiar de dispositivo, y el brief
insiste en que el proceso es largo. Se descarta.

## Consecuencias

**Lo que ganamos**
- Valor demostrable en minutos: el diagnóstico llega con una fracción de los datos.
- Reanudable de verdad, en cualquier dispositivo, en cualquier punto.
- El modelo definitivo nunca contiene estados intermedios inválidos.
- Coste variable cero y cero dependencias externas en el primer entregable.
- Las puertas son testeables: hay un test que verifica que con solo perfil + un compromiso ya
  se puede diagnosticar.

**Lo que cuesta**
- **El onboarding se siente más laborioso que un chat.** Es un coste real de producto,
  asumido conscientemente y mitigado con las puertas: la recompensa llega antes del final.
- Dos representaciones de los mismos datos (JSONB de borrador y tablas definitivas) con la
  transformación en `commit-section`. Es duplicidad deliberada y acotada.
- El JSONB puede quedar desactualizado respecto a las tablas si el usuario edita una entidad
  después. Decisión: **al cerrar una sección, el JSONB de esa sección deja de ser
  autoritativo**; la edición posterior va contra las tablas.

**Lo que queda condicionado**
- El contrato de `/interview/session` con sus `gates` ([04 §3](../04-contratos-api.md)).
- La regla de ubicación de campos del punto 6 aplica a cualquier campo futuro: antes de
  añadir algo a la entrevista, hay que justificar por qué su respuesta importa **en el
  onboarding** y no en el momento de uso. Es la defensa contra la erosión gradual de las dos
  puertas de valor.
- El normalizador de entrada del [ADR-011] es obligatorio en cuanto haya cualquier texto libre.
- Si Q9 se responde con presupuesto, la captura conversacional se añade **encima** de este
  diseño, sin sustituirlo.

[ADR-004]: ./ADR-004-motor-determinista-vs-llm.md
[ADR-011]: ./ADR-011-privacidad-por-diseno.md
