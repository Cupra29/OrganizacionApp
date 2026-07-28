# ADR-006: Versionado por instantánea inmutable, linaje asignado durante la colocación y diff de dos niveles
Estado: aceptado (2026-07-28)
Fecha: 2026-07-24
Responde a la decisión §10.3 del brief.
**Puerta de una sola dirección.** El linaje debe existir desde la primera versión guardada.

## Contexto

La regla de negocio nº2 del brief —*"ningún intercambio es silencioso: toda replanificación
muestra tabla de antes y después por objetivo, y nombra lo que se sacrificó"*— es el
diferenciador del producto. El diseño del versionado y del diff es lo que la hace posible o
imposible.

Requisitos concretos:
- Tabla de antes/después **por objetivo**, con lo sacrificado nombrado.
- Poder **volver a una versión anterior**.
- Replanificar a mitad de semana **sin rehacer los días ya pasados**.
- La evidencia de cumplimiento debe sobrevivir a los cambios de versión.

Y una preocupación de diseño que condiciona todo lo demás:

> Una promesa de negocio innegociable no puede descansar sobre una heurística.

El problema difícil no es guardar versiones: es saber que un bloque de la versión 3 **es el
mismo** que uno de la versión 2, movido. Sin eso, un bloque desplazado tres días se declara
"borrado + creado" y el diff resulta confuso justo cuando más importa.

## Decisión

**Tres piezas.**

**1. Instantánea inmutable por versión.**
`plan_versions` con estados `DRAFT → ACTIVE → SUPERSEDED`, y sus `plan_blocks` copiados
enteros. Nunca se mutan los bloques de una versión existente. Un índice único parcial
garantiza una sola versión `ACTIVE` por plan.

**2. El linaje se asigna durante la colocación, no emparejando a posteriori.**
El motor recibe la versión anterior como parte de su entrada. Al crear un bloque calcula su
clave semántica:

```
identity_key = hash(kind, goalId, taskId, wellbeingId, commitmentId,
                    planningDayId, ordinalDentroDelDía)
```

Si esa clave existía en la versión padre, **hereda su `lineage_id`**; si no, genera uno nuevo.

**3. Diff de dos niveles, con la promesa apoyada solo en el exacto.**

- **Nivel 1 — `diff_goal_deltas`, aritmética pura.** Minutos por objetivo en cada versión, y
  la resta. Sin emparejamiento, sin heurística. **Es la fuente de verdad de la regla nº2 y de
  donde se construye el titular.**
- **Nivel 2 — `diff_block_events`, detalle por bloque.** Usa los linajes ya asignados.
  Complementario, para dibujar el "qué se movió a dónde".

El diff se **persiste** en el momento de la generación, junto con los `sacrifices` y sus
narrativas.

**Complementos:** `regenerated_from` marca la frontera de inmutabilidad del pasado (los
bloques anteriores se copian textualmente y el validador lo comprueba); `input_hash` y
`engine_version` permiten reproducir cualquier plan del pasado.

## Alternativas consideradas

**Mutación in-place con bitácora de auditoría.**
A favor: lo más simple, sin duplicación de filas. En contra: "volver a una versión anterior"
exige reproducir la bitácora hacia atrás, con todos los riesgos de una operación así; y el
diff hay que reconstruirlo desde eventos de bajo nivel, perdiendo la narrativa del sacrificio.
Se descarta.

**Event sourcing completo.**
A favor: historial perfecto, viaje en el tiempo gratis, auditoría total. En contra: es la
sobreingeniería clásica de este dominio. El número de versiones por plan es pequeño (unidades
por semana) y las instantáneas caben de sobra; a cambio habría que construir proyecciones,
gestionar la evolución de los eventos y asumir complejidad permanente. **El brief no pide
reconstruir estados arbitrarios: pide comparar versiones**, que es justo lo que las
instantáneas resuelven directamente. Se descarta por desproporción.

**Emparejamiento heurístico de bloques a posteriori** (por solape temporal, similitud de
título o mismo objetivo y día).
A favor: no requiere que el motor conozca la versión anterior; el diff es un módulo aparte.
En contra, y es decisivo: **produce resultados incorrectos justo en los casos que más
importan.** Un bloque movido de lunes a jueves no solapa con su original, así que se reporta
como borrado + creado. Dos bloques del mismo objetivo el mismo día son indistinguibles. Y
sobre todo: haría que la regla de negocio central del producto dependiera de una heurística
que a veces falla. Se descarta por esa razón.

**Diff calculado al vuelo, sin persistir.**
A favor: sin datos derivados que puedan quedar desactualizados. En contra: la **narrativa** de
por qué se sacrificó algo solo la conoce el motor en el instante de decidir. Recalcular el
diff después recupera los números pero pierde el razonamiento — y el razonamiento es el
producto. Se descarta.

**Un solo nivel de diff (solo bloques).**
En contra: obliga a derivar la tabla por objetivo del emparejamiento de bloques, de modo que
un fallo del emparejamiento se propagaría al agregado, que es la promesa. La separación en
dos niveles es precisamente lo que aísla la promesa de la heurística.

## Consecuencias

**Lo que ganamos**
- La tabla antes/después por objetivo es **exacta por construcción**. No hay caso en que
  mienta.
- Un bloque movido se declara `MOVED` con su origen y destino, porque el linaje se decidió
  con información completa.
- El linaje sirve además para dos cosas que no eran su objetivo y salen gratis:
  **`UID` estable en el `.ics`** (un bloque que se mueve se actualiza en el calendario del
  usuario en lugar de duplicarse — el fallo más común de los feeds `.ics`), y
  **historial de cumplimiento por bloque recurrente** a través de versiones, que es el insumo
  de "este horario se incumple siempre, propón moverlo".
- Volver a una versión anterior es copiarla como versión nueva. Operación trivial y segura.
- La replanificación parcial es una frontera explícita y verificable.

**Lo que cuesta**
- **Duplicación de filas**: cada versión copia todos sus bloques. Con decenas de bloques y
  unidades de versiones por semana, son miles de filas por usuario y año. Irrelevante.
- El motor debe recibir la versión anterior, lo que engorda `EngineInput` y acopla ligeramente
  la generación al historial.
- La clave de identidad necesita afinarse: si dos bloques del mismo objetivo caen el mismo
  día, el `ordinalDentroDelDía` los desempata, y ese desempate debe ser estable ante
  reordenamientos. Es un punto de cuidado en la implementación y tiene test propio.
- La política de retención quedó definida al resolverse Q8 el 2026-07-27: versiones no activas
  purgadas a los 12 meses. Ver [ADR-014].
- **La inmutabilidad de las versiones no impide el derecho de supresión**, aunque lo parezca:
  es una invariante de aplicación (el motor y el diff asumen que una versión no cambia bajo
  sus pies), no de almacenamiento. La regla es *inmutable mientras existe, borrable en su
  totalidad*. Lo que obligó a cambiar el esquema fue otra cosa: las narrativas se persistían
  redactadas con los títulos embebidos, y ahora son plantilla + parámetros.

[ADR-014]: ./ADR-014-cumplimiento-rgpd.md

**Lo que queda condicionado**
- El contrato de aceptación exige `acknowledgedDiffId`
  ([04 §6.2](../04-contratos-api.md)): la regla nº2 se hace cumplir en el protocolo, no en la
  interfaz.
- La fase 5 del plan de implementación, con el invariante testeable
  `∀g: delta == después − antes`.
- El motor debe ser puro para poder generar un borrador y su diff sin persistir nada
  ([ADR-013]).

[ADR-013]: ./ADR-013-motor-como-funcion-pura.md
