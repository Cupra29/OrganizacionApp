# ADR-003: La jornada como unidad de planificación; instantes en UTC con zona IANA contextual
Estado: aceptado (2026-07-28)
Fecha: 2026-07-24
**Puerta de una sola dirección.** Cambiar esto después implica migrar datos y reescribir el núcleo.

## Contexto

El brief prohíbe explícitamente asumir el caso "empleado de oficina de 9 a 5" y exige
soportar:

- **Cronotipos opuestos**: una franja de máximo rendimiento puede ser 05:00–08:00 o
  22:00–01:00. El motor "no puede favorecer estructuralmente al madrugador".
- **Aritmética del sueño como restricción dura**: hora de cierre contra hora de despertar del
  día siguiente.
- **Turnos rotativos y semanas que no se repiten igual.**
- **Zonas horarias y viajes que las cambian temporalmente.**
- Inicio de semana en lunes o domingo según la región.

Las tres formas habituales de fallar aquí:

1. Usar el **día calendario** como unidad. Un bloque a las 00:30 pertenece "al día
   siguiente" aunque forme parte de la misma sesión de trabajo, y el pico nocturno queda
   partido en dos. Todo el código se llena de casos especiales que solo afectan a los
   nocturnos: eso *es* favorecer estructuralmente al madrugador.
2. Guardar **fechas civiles sin zona** o guardar la zona solo en el perfil. Un cambio de
   horario desplaza los compromisos y no hay información para recuperarse.
3. Modelar una **semana plantilla**. Los turnos rotativos se vuelven irrepresentables.

## Decisión

Tres reglas, en este orden de precedencia:

**1. La unidad de planificación es la jornada, no el día calendario.**
Una jornada es el ciclo de vigilia `[wakeAt, nextWakeAt)`, expresado en instantes absolutos.
El sueño de la jornada es `nextWakeAt − sleepAt`; la vigilia es `sleepAt − wakeAt`.

**2. Todo instante se almacena en UTC (`timestamptz`); toda intención horaria humana guarda
además su zona IANA.** "Los martes a las 9:00" es una regla que se expande **en la zona en
que se pensó**, no en UTC.

**3. La semana no existe como estructura de datos.** Es una ventana de consulta y una
preferencia de presentación (`week_starts_on`). No hay tabla `weeks` ni columna
`day_of_week` como eje del modelo.

Complementos:
- **Viajes**: tabla `timezone_overrides` (intervalo + zona), presente en el esquema desde el
  día uno aunque la lógica se difiera.
- **Anclaje**: cada compromiso declara explícitamente su comportamiento durante un viaje.
  Q2 se resolvió el 2026-07-27 a favor del **marcado explícito por compromiso**, descartando
  la inferencia a partir de la modalidad. Al implementar esa respuesta apareció que dos
  valores no bastan; son **tres**:

  | Valor | Significado | Ejemplo |
  |---|---|---|
  | `FIXED_ZONE` | Sigue la hora de su zona de origen | Clase en línea con gente de tu ciudad |
  | `LOCAL_WHEREVER` | Sigue la hora local de donde estés | Comidas, ejercicio, rutinas propias |
  | `SUSPEND_WHEN_AWAY` | **No ocurre mientras estés fuera** | Oficina presencial, gimnasio del barrio |

  El tercer valor es el caso mayoritario de los compromisos presenciales y no estaba
  contemplado: un turno en el hospital de tu ciudad no se mueve a otra hora cuando viajas,
  desaparece de la ventana. Modelarlo como `LOCAL_WHEREVER` habría producido planes que
  colocan a la persona en un sitio donde no está.
- **Todo el razonamiento sobre horas locales se confina a la construcción de jornadas.** A
  partir de ahí, el motor opera solo con instantes absolutos.

## Alternativas consideradas

**Día calendario local como unidad, con casos especiales para el trabajo nocturno.**
A favor: coincide con cómo la gente habla y con la rejilla de la interfaz. En contra: cada
regla del motor necesitaría una variante nocturna, y la aritmética del sueño exigiría
comparar horas locales con condicionales del tipo `if (sleepHour < wakeHour)` repartidos por
el código. Es la vía por la que el sesgo hacia el madrugador entra sin que nadie lo decida.
Se descarta.

**Guardar hora local + zona, sin UTC.**
A favor: preserva la intención. En contra: ordenar y comparar exige convertir en cada
consulta; no se pueden usar índices de rango ni constraints de exclusión, que es donde vive
la garantía de cero solapes ([ADR-002]). Se descarta.

**Solo UTC, sin guardar la zona.**
A favor: lo más simple. En contra: **pérdida de información irreversible**. Tras un cambio de
horario, una clase de las 09:00 pasa a las 08:00 o a las 10:00 y no hay dato para arreglarlo.
Es el error clásico y se descarta sin dudar.

**Semana plantilla con excepciones por día.**
A favor: modelo pequeño y comprensible; cubre bien el caso mayoritario. En contra: los turnos
rotativos con ciclo de 7 días desfasado, o de 14, o de 28, son irrepresentables salvo
llenando de excepciones. Es la variante que el brief nombra explícitamente. Se descarta.

**Offset numérico en lugar de zona IANA (`-06:00` en vez de `America/Mexico_City`).**
En contra: el offset cambia con el horario de verano, así que no identifica una zona. Se
descarta.

## Consecuencias

**Lo que ganamos**
- El cronotipo nocturno **no es un caso especial en ninguna parte**. Un pico a las 05:00 y uno
  a las 23:00 recorren el mismo camino, y eso es verificable con un test espejo (fixtures
  08/09). La neutralidad ante cronotipos pasa de ser una intención a ser una propiedad
  estructural.
- La aritmética del sueño es una resta, sin casos especiales de medianoche.
- Los días con cambio de horario (23 h o 25 h) dan la capacidad correcta sin código
  específico: se miden en instantes absolutos.
- Los turnos rotativos son representables sin excepciones.
- Las constraints de exclusión de PostgreSQL funcionan directamente sobre los intervalos.

**Lo que cuesta**
- **La interfaz debe traducir jornadas a rejilla de días calendario**, porque la gente piensa
  en días. Es trabajo real de presentación, incluido en la fase 7.
- Un bloque puede pertenecer a una jornada y aparecer visualmente en dos casillas de día. Hay
  que diseñarlo con cuidado.
- Todo instante viaja acompañado de su zona: más campos, más verbosidad en la API.
- La dependencia de una biblioteca temporal seria (`Temporal`) es obligatoria; `Date` de
  JavaScript no basta.

**Lo que queda condicionado**
- El esquema completo de [02](../02-modelo-de-datos.md).
- La expansión de recurrencia del [ADR-005], que debe expandirse en la zona de la regla.
- La fase 1 del plan de implementación, que construye este núcleo antes que nada.
- Q2 se resolvió el 2026-07-27 (marcado explícito, tres valores de anclaje). **No cambió este
  ADR**: el esquema ya lo soportaba, solo se amplió el enum. Es la confirmación práctica de
  que incluir `timezone_overrides` y `anchor` desde el día uno, con la lógica diferida, era
  la decisión correcta — la respuesta llegó tarde y no costó ninguna migración.
- **Dónde se captura el anclaje** es una decisión de producto que vive en
  [ADR-007](./ADR-007-entrevista-formulario-progresivo.md): no en la entrevista, sino la
  primera vez que el usuario declara un viaje.

[ADR-002]: ./ADR-002-persistencia-postgresql.md
[ADR-005]: ./ADR-005-recurrencia-y-excepciones.md
