# ADR-015: Parámetros de calibración conservadores, y corrección del mecanismo del tope emergente
Estado: aceptado (2026-07-28)
Fecha: 2026-07-28
Responde a la pregunta abierta Q6. **Corrige una afirmación errónea de Q5.**

## Contexto

Q6 preguntaba por los valores iniciales del colchón de fricción y del contacto diario, que
eran suposiciones mías sin fundamento empírico. La respuesta del usuario el 2026-07-28 eligió
**la banda conservadora**: fricción base 15 % (frente al 12 % supuesto) y 7 min por transición
(frente a 5). El contacto diario de la prioridad #1 se confirma en 30 min y el resto de la
tabla no cambia.

Su razonamiento, que merece quedar registrado porque es la justificación de fondo:

> El brief establece que el incumplimiento es señal de mala calibración y no falla del
> usuario. Eso argumenta por errar hacia lo conservador: **un plan que promete de menos y se
> cumple construye confianza; uno que promete de más colapsa.**

Al verificar la interacción entre esta respuesta y el "tope emergente" de Q5 apareció un
problema que no tiene que ver con Q6: **el mecanismo que describí en Q5 no producía el efecto
que le atribuí.**

## Decisión

### 1. Parámetros conservadores

| Parámetro | Antes | Ahora |
|---|---|---|
| Fricción base | 12 % | **15 %** |
| Fricción por transición | 5 min | **7 min** |
| Contacto diario de la #1 | 30 min | 30 min (confirmado) |
| Bloque mínimo útil de foco | 60 min | 60 min (del brief) |
| Buffer, captura, revisión, planeación | — | sin cambios |

**Sobre el 18 %:** se consideró y **se descarta**, y conviene decir por qué en lugar de
callarlo. El argumento para subir la base sería cubrir mejor a los perfiles muy fragmentados,
pero **para eso ya está el término por transición**, que mide la fragmentación directamente.
Subir la base al 18 % penalizaría por igual al freelance con el día despejado, que es
justamente donde la fricción real es menor. Si algún día los datos muestran que 15 % se queda
corto, la respuesta correcta no será 18 % fijo sino una base adaptativa — y eso es prematuro
sin datos.

### 2. Corrección: el filtro de viabilidad no producía el tope emergente

Al resolver Q5 escribí que "en una capacidad típica, solo 3–4 objetivos superan el mínimo".
**Es falso, y lo era ya antes de Q6.** El filtro compara el presupuesto **total de la ventana**
contra el bloque mínimo de 60 min; con una ventana de 14 días y ~3000 min de capacidad, hasta
el objetivo de rango 5 recibe más de 200 min. El filtro casi nunca corta.

Confundí dos cosas distintas:

- *"el presupuesto alcanza para al menos un bloque útil"* — trivialmente cierto, no discrimina.
- *"el objetivo recibe bloques de tamaño útil con una cadencia razonable"* — lo que importa.

**El tope emergente existe, pero lo produce otro mecanismo:** la interacción entre la
capacidad diaria, el tope de 3 temas de foco por día (Q4) y el bloque mínimo de 60 min. Lo que
escasea no son los minutos, son las **plazas de colocación**.

Contando plazas reales en el perfil A con los parámetros nuevos: 6 días presenciales × 1 plaza
+ 4 remotos × 2 + 4 de fin de semana × 2 = **22 plazas de foco en 14 días**, además del
contacto diario. Repartidas con pesos armónicos, el corte real cae **entre 8 y 10 objetivos**,
no en 3–4.

### 3. Las prioridades bajas reciben su bloque largo — garantizado, no emergente

La pregunta de si Q6 mata la regla del brief *"las prioridades bajas reciben bloques largos e
infrecuentes"* tiene respuesta: **no la mata, la refuerza** (ver análisis abajo). Pero como
dependía de una propiedad emergente, se convierte en garantía explícita:

```
// Tras el reparto, para todo objetivo con rank > 3 y presupuesto > 0:
consolidar su presupuesto en el MENOR número de bloques posible,
cada uno >= params.bloqueLargoMin (90 min),
colocados preferentemente en las jornadas de mayor capacidad libre.
Si no cabe ni un bloque de 90 min, poner presupuesto a 0 y registrar
Sacrifice { reason: BELOW_LONG_BLOCK } — explícito, nunca silencioso.
```

Se añade `bloqueLargoMin = 90` a `params` y la propiedad **P13** a la suite.

## Análisis de la interacción Q6 × Q5

Es lo que motivó este ADR y conviene dejarlo escrito con números.

**El efecto de Q6 no es lineal: es un efecto de umbral en los días apretados.**

En un día presencial del perfil A, tras reservar el contacto diario de la prioridad #1:

| | Capacidad | Menos contacto (30) | Bloques de 60 que caben |
|---|---|---|---|
| Fricción vieja | 160 min | 130 min | **2** |
| Fricción nueva | 147 min | 117 min | **1** |

Trece minutos de diferencia cambian el día de dos sesiones de foco a una. Ese es el efecto
real de Q6, y **valida la elección conservadora en lugar de refutarla**: un día de oficina con
90 minutos de traslado no da honestamente para dos sesiones de trabajo profundo. El parámetro
viejo prometía algo que la persona no iba a cumplir, que es exactamente el fallo que el brief
identifica.

**Consecuencia en cadena, y es la respuesta a la preocupación:** al quedarse los días
laborables presenciales con una sola plaza de foco, los objetivos de rango bajo son empujados
hacia las jornadas de mayor capacidad —fines de semana y días remotos— donde el tope de 3
temas por día deja hueco para bloques largos (hasta ~160 min en el perfil A, ~250 en el B).

Es decir: **la fricción más alta produce justamente el patrón que el brief pide para las
prioridades bajas.** Bloques largos, infrecuentes, concentrados en los días holgados. La
interacción no rompe nada; empuja en la dirección correcta.

**Efecto por perfil:** −6,6 % de capacidad en el perfil A (empleo híbrido) frente a −4,7 % en
el B (freelance). La diferencia viene del término por transición: quien tiene el día troceado
paga más. Eso es deliberado y ahora está reforzado.

## Alternativas consideradas

**Mantener 12 % + 5 min.**
A favor: más capacidad aparente, planes más ambiciosos, producto que "rinde más". En contra:
es la dirección del error que el brief señala como causa de abandono. Descartada por la
respuesta del usuario, con razonamiento que comparto.

**Hacer la fricción adaptativa desde el día uno** (que aprenda del cumplimiento real).
A favor: resolvería el problema de raíz. En contra: es recalibración automática, diferida por
[ADR-009] con el mismo argumento —sin datos, produce ruido con apariencia de inteligencia. El
parámetro fijo y conservador es el punto de partida honesto.

**Arreglar el tope emergente bajando el bloque mínimo por debajo de 60 min** para que más
objetivos quepan.
Descartada de plano: 60 min viene del brief y es la definición de bloque útil. Bajarlo sería
volver a los fragmentos inútiles que el producto existe para evitar.

**Introducir un tope duro de 3 objetivos activos por semana**, en vez del emergente.
A favor: coincide literalmente con "planeación con tope de 3 objetivos" y garantiza baja
dispersión. En contra: Q5 se resolvió como interpretación (b) y un tope duro elimina el caso
"prioridades bajas con bloques largos e infrecuentes", que el brief pide explícitamente.
Además, **la métrica de dispersión del brief es por día, no por semana**, y esa ya está
controlada por el tope de 3 temas diarios. Se descarta, pero la afirmación de Q5 se corrige.

## Consecuencias

**Lo que ganamos**
- Planes que prometen menos y se cumplen más, alineado con el diagnóstico del brief.
- La regla de prioridades bajas pasa de propiedad emergente y frágil a **garantía verificable**
  con una propiedad de test.
- Una afirmación falsa del diseño queda corregida antes de escribir código, que es cuando sale
  barato. El tope emergente real está en 8–10 objetivos, y quien implemente ya no partirá de
  una expectativa equivocada.
- El término por transición penaliza la fragmentación con más fuerza, que es la señal correcta.

**Lo que cuesta**
- **Menos capacidad calculada significa más planes `INFEASIBLE`** y más sacrificios ordinales.
  Es el precio de la honestidad y hay que vigilarlo: si la tasa de `INFEASIBLE` resulta
  desmoralizante en uso real, el problema estará en estos parámetros y no en el motor.
- Los días laborables presenciales quedan con **una sola plaza de foco**. Es realista, pero la
  interfaz debe presentarlo sin que parezca un defecto: es un hallazgo del diagnóstico, no una
  limitación del producto.
- Los objetivos 2 y siguientes se atienden casi solo en días remotos y fines de semana en el
  perfil A. Realista, y conviene que el diagnóstico lo diga explícitamente.
- Estos valores siguen siendo **suposiciones informadas, no datos**. Se revisan cuando haya
  cumplimiento real.

**Lo que queda condicionado**
- Los valores por defecto de `temporal_profiles` en [02](../02-modelo-de-datos.md).
- El filtro de viabilidad y la garantía de bloque largo en
  [03 §5.1](../03-motor-de-planificacion.md).
- La propiedad P13 y los fixtures de capacidad, que deben regenerarse con los valores nuevos.

[ADR-009]: ./ADR-009-alcance-primer-entregable.md
