# ADR-005: Recurrencia con dos generadores (RRULE + CYCLE) y excepciones ancladas al instante original
Estado: aceptado (2026-07-28)
Fecha: 2026-07-24
Responde a la decisión §10.2 del brief.
**Puerta de una sola dirección.** El anclaje de excepciones no se puede cambiar sin migrar datos.

## Contexto

El brief pide representar la recurrencia y sus excepciones "sin volver inmanejable el
modelo". Los casos que hay que cubrir:

- Recurrencia semanal ordinaria: "los martes y jueves de 9 a 13".
- **Turnos rotativos**: 4 días de trabajo / 3 de descanso, con ciclo desfasado de la semana
  civil; o rotaciones 2-2-3 con ciclo de 14 días.
- **Híbrido con días presenciales variables**: la misma reunión, unos días en oficina y otros
  en casa, con transiciones distintas.
- **Fecha de término conocida**: un curso que acaba, un contrato temporal. Al expirar debe
  liberar el hueco automáticamente.
- Excepciones: una clase cancelada, una movida a otra hora, una semana de exámenes.
- Interoperabilidad: iCalendar como formato de salida mínimo.

La tensión central: **RRULE es el estándar y da interoperabilidad, pero expresa mal los
turnos rotativos.** Un patrón 4×3 anclado a una fecha arbitraria requiere varias reglas
artificiales con `INTERVAL=7` y offsets calculados a mano; es correcto pero ilegible e
imposible de editar en una interfaz.

## Decisión

**Un conjunto de reglas tipadas con tres clases de generador, materialización perezosa en la
ventana consultada, y excepciones ancladas por el instante de inicio original.**

**1. Tres generadores** en `recurrence_rules.kind`:
- `ONE_OFF` — una sola ocurrencia.
- `RRULE` — subconjunto de RFC 5545 (`FREQ`, `INTERVAL`, `BYDAY`, `COUNT`, `UNTIL`). Cubre lo
  ordinario y se exporta a iCal tal cual.
- `CYCLE` — patrón cíclico explícito con ancla, para turnos rotativos:
  ```jsonc
  { "cycleLengthDays": 7,
    "shifts": [ { "dayOffsets": [0,1], "startLocal": "07:00", "durationMinutes": 720 },
                { "dayOffsets": [2,3], "startLocal": "19:00", "durationMinutes": 720 } ] }
  ```

**2. La regla es la fuente de verdad; las instancias se materializan al vuelo** en la ventana
consultada. No se persisten instancias.

**3. La expansión ocurre en la zona horaria de la regla**, no en UTC ([ADR-003]).

**4. Las excepciones se anclan por `recurrence_id`**: el **instante de inicio original en
UTC** de la ocurrencia afectada, exactamente como el `RECURRENCE-ID` de RFC 5545. Dos
acciones: `SKIP` y `OVERRIDE`.

**5. `effective_until` en la regla** cubre la fecha de término conocida.

**6. Al exportar, `CYCLE` se materializa como eventos individuales** en el `.ics`, en lugar
de forzarlo a una RRULE artificial.

## Alternativas consideradas

**Solo RRULE, sin generador `CYCLE`.**
A favor: un único mecanismo, estándar, exportable sin traducción. En contra: los turnos
rotativos exigirían varias reglas coordinadas con offsets calculados, que la interfaz tendría
que generar y el usuario no podría entender ni editar. Un turno 2-2-3 con ciclo de 14 días es
directamente hostil. Dado que los turnos rotativos son una variante nombrada explícitamente
en el brief, se descarta.

**Materializar todas las instancias en una tabla.**
A favor: consultas triviales, excepciones como simples ediciones de fila, índices directos.
En contra:
- Crece sin límite en objetivos continuos (¿hasta cuándo se materializa una clase semanal
  indefinida?).
- "Cambia el horario de la clase a partir de ahora" se convierte en una migración de filas
  con riesgo de dejar datos a medias.
- Alargar el horizonte exige un trabajo de relleno programado.
Es la alternativa más tentadora por su simplicidad aparente y se descarta por el coste de las
ediciones, que es la operación frecuente.

**Excepciones ancladas por fecha local o por índice de ocurrencia.**
En contra, y es la razón de que esto sea una puerta de una sola dirección:
- **Por fecha local**: se rompe con cambios de horario y con cambios de zona del usuario. Una
  excepción sobre "el 25 de octubre" es ambigua el día que hay dos veces las 02:00.
- **Por índice** ("la 5ª ocurrencia"): editar la regla renumera todas las ocurrencias y las
  excepciones apuntan a instancias equivocadas, de forma **silenciosa**.
El instante original en UTC es inmune a ambos. Es lo que RFC 5545 hace desde hace veinte años
y no hay razón para inventar otro mecanismo.

**Motor de recurrencia genérico configurable por el usuario.**
Se descarta por sobreingeniería: tres generadores cubren todos los casos del brief.

## Consecuencias

**Lo que ganamos**
- Los turnos rotativos son de primera clase y expresables en una estructura que una interfaz
  puede editar directamente.
- Las excepciones sobreviven a cambios de horario, ediciones de la regla y cambios de zona.
- La fecha de término libera el hueco **sin código específico**: la expansión simplemente deja
  de producir instancias, la capacidad crece y el reparto ordinal reasigna el excedente a la
  prioridad más alta. El único componente necesario es un disparador diario que detecte la
  expiración y sugiera replanificar.
- Editar una regla no toca ningún dato materializado.

**Lo que cuesta**
- **Dos caminos de código en la expansión**, con el riesgo de que uno reciba menos pruebas.
  Mitigación: `CYCLE` tiene fixtures propios y la expansión es el paquete con umbral de
  cobertura obligatorio (≥95 %).
- Expandir en cada consulta tiene coste. Es despreciable para ventanas de 14 días y decenas de
  reglas; si algún día no lo fuera, se cachea la expansión por (regla, ventana) — la regla
  sigue siendo la fuente de verdad, así que es un cambio local.
- La exportación de `CYCLE` produce muchos `VEVENT` en lugar de uno con RRULE: archivos `.ics`
  más grandes. Es la traducción honesta; forzar una RRULE aproximada sería peor porque mentiría
  sobre el patrón.
- Consultar "¿qué compromisos tengo el martes?" exige expandir, no basta un `SELECT`.

**Lo que queda condicionado**
- **Nota fechada (2026-07-30, corrige y sustituye a la del 2026-07-29): el turno real es 2-2-3
  de 14 días, y NO está desfasado de la semana civil.**

  > **Qué decía la nota anterior y por qué era falsa.** Decía que Q13 había confirmado un turno
  > *"desfasado de la semana civil"* y que con ello la justificación de `CYCLE` pasaba "de
  > hipotética a empírica". El dato exacto llegó el 2026-07-30 y **desmiente la primera mitad**: el
  > turno es un **2-2-3 con ciclo de 14 días**, y 14 es múltiplo de 7, así que está **enganchado**
  > a la semana civil con **periodo 2**, no desfasado. Anclado en lunes: semanas impares
  > `{L,M,V,S,D}`, semanas pares `{X,J}`. Dos patrones que alternan, no una deriva. Se reescribe la
  > nota en vez de apilar otra encima porque dejar una afirmación falsa en pie y contradecirla más
  > abajo obliga a cada lector a averiguar cuál gana.

  **La conclusión se sostiene, pero por la cláusula correcta de este ADR.** El descarte de "solo
  RRULE" **no** se apoya en la expresividad: el 2-2-3 **sí** es expresable como dos `RRULE` con
  `INTERVAL=2` ancladas en semanas distintas (`BYDAY=MO,TU,FR,SA,SU` y `BYDAY=WE,TH`). Se apoya en
  la **ergonomía**, que es lo que dice el texto de arriba: *"varias reglas coordinadas con offsets
  calculados, que la interfaz tendría que generar y el usuario no podría entender ni editar"*, y
  **"un turno 2-2-3 con ciclo de 14 días es directamente hostil"**. Ese caso, nombrado aquí por su
  nombre desde el 2026-07-24, **es exactamente el turno real del usuario**. La justificación se
  confirma empíricamente; lo que estaba mal era la cláusula que citó la nota de ayer.

  **Dos imprecisiones de este ADR que el dato deja a la vista**, ninguna con efecto sobre la
  decisión:
  - El contexto describe el 4×3 como *"con ciclo desfasado de la semana civil"*. **No lo está**:
    4 + 3 = 7. Un 4×3 produce semanas civiles idénticas con cualquier ancla.
  - El ejemplo de `cycle_pattern` de más arriba (`cycleLengthDays: 7`) ilustra la **estructura**
    del generador; no demuestra que el modelo no sea una semana plantilla, porque su periodo es 1.

  **El número que importa, y que ninguno de los tres casos hacía evidente:** el periodo en semanas
  de un ciclo de `L` días es `L / mcd(L, 7)`. De ahí, `L=7 → 1`, `L=14 → 2`, `L=8 → 8`, `L=28 → 4`.
  Lo que refuta la semana plantilla ([ADR-003](./ADR-003-modelo-temporal-y-zonas-horarias.md) regla
  3) es **periodo ≥ 2**, no la deriva. El 2-2-3 del usuario, con periodo 2, ya la refuta.
- El motor recibe compromisos **ya materializados** ([ADR-013]). Toda la complejidad del turno
  rotativo vive en la expansión y no contamina las reglas de planificación: ese confinamiento
  es el objetivo de diseño.
- La fase 1 del plan de implementación construye y prueba esto antes que nada.

[ADR-003]: ./ADR-003-modelo-temporal-y-zonas-horarias.md
[ADR-013]: ./ADR-013-motor-como-funcion-pura.md
