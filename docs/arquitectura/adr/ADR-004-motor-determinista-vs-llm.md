# ADR-004: Motor de planificación determinista por reglas; el LLM solo en los bordes
Estado: aceptado (2026-07-28)
Fecha: 2026-07-24
Responde a la decisión §10.1 del brief.

## Contexto

El brief pregunta explícitamente si el motor debe ser determinista por reglas, asistido por
modelo de lenguaje, o híbrido — y dónde conviene cada uno.

Las fuerzas en juego:

- El brief exige una **validación previa a la entrega**: cero solapes, transiciones
  respetadas, ningún día por encima de su capacidad, deadlines alcanzables. Son propiedades
  que deben cumplirse **siempre**, no casi siempre.
- La regla nº3 exige que el sacrificio siga el ranking ordinal "de forma automática y
  explicable".
- La regla nº6 exige declarar imposible un plan imposible, lo que requiere una noción precisa
  y verificable de imposibilidad.
- El brief pide que la §5 (variantes) esté soportada, y la única forma honesta de demostrarlo
  es una suite de tests por variante — imposible si la salida no es reproducible.
- Al mismo tiempo, hay tareas donde un LLM es claramente superior: interpretar *"los martes y
  jueves doy clase de 9 a 1"* y redactar explicaciones que no suenen a máquina.

## Decisión

**Híbrido con una frontera estricta: el motor de colocación es 100 % determinista; el LLM
queda confinado a dos bordes, ninguno de los cuales toca la decisión.**

```
        ENTRADA                    DECISIÓN                    SALIDA
   ┌──────────────────┐    ┌──────────────────────┐    ┌──────────────────┐
   │  LLM opcional:   │    │  DETERMINISTA:       │    │  LLM opcional:   │
   │  texto libre  →  │───>│  capacidad,          │───>│  reescribe la    │
   │  propuesta       │    │  presupuesto,        │    │  plantilla ya    │
   │  TIPADA que el   │    │  colocación,         │    │  rellena, para   │
   │  usuario confirma│    │  sacrificio, diff    │    │  que suene bien  │
   └──────────────────┘    └──────────────────────┘    └──────────────────┘
```

Reglas de la frontera:

1. **El LLM nunca decide** dónde va un bloque, qué objetivo se sacrifica, ni si un plan es
   viable.
2. **El LLM nunca escribe en la base de datos.** Su salida en la entrevista es siempre una
   propuesta tipada que el usuario confirma.
3. **El LLM nunca genera una explicación desde datos crudos.** El motor produce
   `reasonCode` + `evidence`, una plantilla determinista los convierte en texto, y el LLM como
   mucho reescribe ese texto. Así no puede inventar una causa.
4. **El producto funciona entero sin LLM.** Es una mejora, no una dependencia.

## Alternativas consideradas

**Motor íntegramente determinista, sin LLM en ningún punto.**
A favor: cero coste variable, cero latencia externa, cero dependencia. En contra: la
entrevista es larga y tediosa, y el brief la describe como "onboarding conversacional o por
formulario progresivo" — la vía conversacional queda cerrada para siempre. Es la posición de
reserva, y **Q9 se resolvió el 2026-07-28 en esa dirección: coste variable cero en el primer
entregable**, sin cerrar la puerta a añadir el LLM más adelante. **El primer
entregable es de hecho esto**; la diferencia es que la arquitectura deja el hueco preparado.

**LLM como planificador (le paso el contexto y devuelve el calendario).**
A favor: rapidísimo de prototipar, maneja lo ambiguo con naturalidad, produce explicaciones
excelentes. En contra, y es decisivo:
- No puede **garantizar** los invariantes. Se pueden validar sus salidas y reintentar, pero
  entonces se necesita el validador determinista igualmente y se ha añadido un componente
  caro que a veces falla.
- La regla nº3 se vuelve incomprobable: no hay forma de demostrar que el sacrificio siguió el
  ranking, y menos de probarlo con property-based testing.
- Los **golden tests son imposibles**, y con ellos desaparece la única forma honesta de
  afirmar que las variantes de la §5 están soportadas.
- Coste y latencia por replanificación, en un producto donde replanificar es frecuente.
- Riesgo de privacidad: enviar la agenda completa a un tercero en un producto cuya premisa es
  la minimización de datos.

Se descarta con claridad.

**LLM para ajustar los pesos de la función de puntuación.**
A favor: mantiene la garantía de los invariantes (las restricciones duras siguen siendo
código) y podría adaptar el estilo del plan a la persona. En contra: introduce una fuente de
no determinismo justo en la parte que hace que dos ejecuciones idénticas den planes
distintos, lo que rompe P9/P10 y hace inexplicable "por qué esta semana es diferente". Es la
alternativa más interesante y la más peligrosa. **Se pospone**: si en el futuro los pesos
deben personalizarse, se hará con reglas derivadas de datos de cumplimiento
([03 §9](../03-motor-de-planificacion.md)), que son auditables y reversibles.

**Solver de restricciones (OR-Tools, CP-SAT) en lugar de heurística.**
Descartado en [03 §5.4](../03-motor-de-planificacion.md), por resumir: la optimalidad no es el
requisito, la **explicabilidad sí**, y un solver devuelve una solución sin narrativa del
sacrificio. Además añade una dependencia nativa pesada. La diferencia de calidad frente al
greedy es irrelevante comparada con el error de las estimaciones de entrada.

## Consecuencias

**Lo que ganamos**
- Los invariantes del brief son **garantías**, no tendencias. El validador lo comprueba en
  cada ejecución.
- La §5 del brief se convierte en una suite de golden tests ejecutable.
- Coste variable cero y latencia predecible; el motor corre en cientos de milisegundos.
- La agenda completa nunca sale del sistema.
- Reproducibilidad: con `input_hash` y `engine_version` se puede reproducir cualquier plan
  del pasado ante una queja.

**Lo que cuesta**
- **La entrevista del primer entregable es un formulario y se siente menos mágica** que un
  chat. Es un coste real de producto y hay que asumirlo conscientemente ([ADR-007]).
- Las explicaciones por plantilla son más rígidas. Mitigación: plantillas ricas en evidencia
  numérica, que es lo que da credibilidad — el usuario no quiere prosa, quiere el número.
- Toda regla nueva es código. No se puede "pedirle al modelo" que contemple un caso nuevo.
  Esto es un coste de velocidad y a la vez la fuente de la fiabilidad.
- La ambigüedad del lenguaje natural se traslada al usuario en forma de campos de formulario.

**Lo que queda condicionado**
- [ADR-013] (motor como función pura) es la contrapartida técnica de esta decisión.
- [ADR-007]: la entrevista es un formulario progresivo, con captura por LLM como acelerador
  opcional posterior.
- [ADR-011]: si se activa el LLM, el normalizador de entrada es obligatorio, porque el texto
  libre es el punto de fuga de datos de salud.
- Q9 se resolvió el 2026-07-28: **coste variable cero en el primer entregable**. Los dos bordes
  (captura en lenguaje natural y redacción) quedan diseñados pero no implementados. La
  decisión de activarlos se pospone sin fecha y no cierra ninguna puerta: la frontera de este
  ADR es precisamente lo que permite añadirlos después sin tocar el motor.

[ADR-007]: ./ADR-007-entrevista-formulario-progresivo.md
[ADR-011]: ./ADR-011-privacidad-por-diseno.md
[ADR-013]: ./ADR-013-motor-como-funcion-pura.md
