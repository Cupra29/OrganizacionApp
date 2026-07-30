# 03 — Motor de planificación

Fecha: 2026-07-24
Decisiones de soporte: [ADR-004](./adr/ADR-004-motor-determinista-vs-llm.md), [ADR-006](./adr/ADR-006-versionado-de-plan-y-diff.md), [ADR-013](./adr/ADR-013-motor-como-funcion-pura.md)

> Este es el documento de referencia para implementar `packages/engine`. Todo lo que
> aparece aquí es determinista: misma entrada, misma salida, byte a byte.

---

## 1. Contrato

```ts
function runEngine(input: EngineInput): EngineOutput;   // pura, sin I/O, sin reloj
```

```ts
interface EngineInput {
  now: Instant;                       // INYECTADO. El motor nunca llama al reloj
  window: { start: Instant; end: Instant };
  regeneratedFrom: Instant;           // frontera de inmutabilidad del pasado
  profile: TemporalProfile;
  energyWindows: EnergyWindow[];
  dayExceptions: DayException[];
  capacityModifiers: CapacityModifier[];
  timezoneOverrides: TimezoneOverride[];
  commitments: MaterializedCommitment[];   // recurrencias YA expandidas por packages/temporal
  wellbeing: WellbeingCommitment[];
  goals: Goal[];                           // con rank_ordinal, orden total garantizado
  tasks: Task[];
  externalWindows: ExternalWindow[];
  previousVersion?: MaterializedVersion;   // para linaje y diff
  userOverrides: UserOverride[];
  adherenceStats: AdherenceStats;          // agregados, no registros crudos
  params: EngineParams;                    // constantes calibrables, explícitas
}

interface EngineOutput {
  capacity: CapacityReport;
  diagnosis: Finding[];
  feasibility: 'FEASIBLE' | 'INFEASIBLE';
  infeasibilityReasons: InfeasibilityReason[];
  blocks: PlacedBlock[];
  budgets: GoalBudget[];
  sacrifices: Sacrifice[];
  unplaced: UnplacedItem[];
  diff?: PlanDiff;
  trace: DecisionTrace;               // razón de CADA decisión. Ver §6
  validation: ValidationReport;
}
```

Dos exigencias del contrato que no son negociables:

- **`now` es un parámetro.** Ninguna línea del motor puede llamar a `Date.now()`. Es lo que
  permite probar "es miércoles y hay que replanificar lo que queda" sin manipular el reloj
  del sistema.
- **`params` es explícito.** Ninguna constante mágica enterrada en el código. Todos los
  números calibrables (porcentaje de fricción, pesos del ranking, duración mínima de bloque)
  viajan en la entrada, lo que permite barrer configuraciones en tests y ajustarlas por
  usuario más adelante sin tocar el motor.

---

## 2. Vista general de las fases

```mermaid
flowchart TD
    A["F0 · Normalización temporal<br/>Construir jornadas y expandir recurrencias"] --> B
    B["F1 · Capacidad<br/>Huecos libres con nivel de energía"] --> C
    C["F2 · Diagnóstico<br/>Hallazgos con evidencia numérica"] --> D
    D["F3 · Presupuesto por objetivo<br/>Reparto ordinal + reservas por deadline"]
    D --> E{"¿Reservas duras<br/>&gt; capacidad?"}
    E -->|Sí| X["INFEASIBLE<br/>declarado con evidencia"]
    E -->|No| F["F4 · Colocación<br/>9 pasadas en orden fijo"]
    F --> G{"¿Quedan bloques<br/>sin colocar?"}
    G -->|Sí, y hay margen ordinal| H["F4b · Recorte ordinal<br/>desde la prioridad más baja"]
    H --> F
    G -->|Sí, y afecta deadline duro| X
    G -->|No| I["F5 · Validación independiente"]
    I -->|Falla| Y["ERROR INTERNO<br/>no se entrega plan"]
    I -->|Pasa| J["F6 · Diff, sacrificios y explicación"]
    J --> K["EngineOutput"]

    style X fill:#bf8700,color:#fff
    style Y fill:#d1242f,color:#fff
    style I fill:#0969da,color:#fff
```

Nótese que **`INFEASIBLE` y el error interno son salidas distintas**. La primera es un
resultado legítimo del producto; la segunda es un fallo del software. Confundirlas es el
error de diseño que lleva a "generar un calendario que fracasará".

---

## 3. F1 — Cálculo de capacidad

### 3.1 Construcción de jornadas

```
función construirJornadas(ventana, perfil, excepcionesDia, overridesZona):
    jornadas = []
    para cada fecha local d en ventana:
        zona    = zonaEfectivaEn(d,   overridesZona, perfil.baseTimezone)
        zonaSig = zonaEfectivaEn(d+1, overridesZona, perfil.baseTimezone)   // ← ojo: d+1
        wake    = instante(d,    excepcionDe(d)?.wakeLocal  ?? perfil.defaultWakeLocal,  zona)
        wakeSig = instante(d+1,  excepcionDe(d+1)?.wakeLocal ?? perfil.defaultWakeLocal, zonaSig)
        sleep   = instante(d,    excepcionDe(d)?.sleepLocal ?? perfil.defaultSleepLocal, zona)
        si sleep <= wake:  sleep = sleep + 1 día     // cruza medianoche: caso NORMAL
        jornadas.push({ id: índice, wake, sleep, wakeSig,
                        vigilia:  sleep - wake,      // duración REAL, tolera DST
                        sueño:    wakeSig - sleep })
    devolver jornadas
```

Todo el manejo de medianoche vive en la línea `si sleep <= wake`. A partir de ahí, ninguna
otra parte del motor vuelve a razonar sobre horas locales: opera con instantes absolutos.
Ese confinamiento es intencional — es la única forma de que los bugs de medianoche no se
repartan por todo el código.

> **Corregido el 2026-07-29: `zonaSig`.** Este pseudocódigo calculaba `wakeSig` con la zona
> efectiva en `d`, no en `d+1`. Con un viaje que empieza en `d+1`, el `wakeSig` de la jornada `d`
> caía a las 07:00 de la zona **de origen** mientras que el `wake` de la jornada `d+1` caía a las
> 07:00 de la zona **de destino**: las dos jornadas dejaban de encajar y la línea de tiempo
> quedaba con un hueco —o un solape— de la anchura de la diferencia de offsets. Ahí se pierde o se
> duplica capacidad, sin que nada lo señale.
>
> Lo destapó la pregunta *"¿qué propiedad no trivial tiene la construcción de jornadas?"* al
> sustituir la property test tautológica de la fase 1 (auditoría de `qa-engineer`,
> [`docs/qa/fase-1-nucleo-temporal.md`](../qa/fase-1-nucleo-temporal.md) §2). La propiedad que
> reemplaza a la tautología es precisamente `∀ i: jornada[i].wakeSig == jornada[i+1].wake`, y este
> defecto es el primer fallo que habría cazado. Escrito el criterio, apareció el bug: la property
> test correcta no solo prueba mejor, obliga a pensar la invariante.
>
> **Queda un residuo sin decidir**, y no se decide aquí porque no hay caso delante: un
> `timezone_overrides` cuya frontera cae **dentro** de una jornada (viaje que empieza a mediodía).
> Este pseudocódigo asigna una sola zona a `wake` y `sleep`, así que ese caso sigue mal modelado.
> La property test lo señalará el día que aparezca una fixture así, que es la forma correcta de
> encontrarlo.

**Aritmética del sueño como restricción dura:**

```
déficitSueño(j) = max(0, perfil.sleepNeedMinutes − duración(j.sueño))
si déficitSueño(j) > 0:
    j.prohibeFocoNocturno = true          // sin bloques de foco en el último tramo
    j.techoEnergía = NEUTRAL              // nada alcanza PEAK ese día
    emitir Finding SLEEP_DEBT con evidencia { requerido, real, déficit }
```

La consecuencia práctica: **el motor no puede resolver un déficit de sueño quitando sueño.**
Es la única restricción del sistema que nunca cede, ni siquiera ante un deadline duro. Si el
deadline solo cabe sacrificando sueño, el resultado correcto es `INFEASIBLE`.

### 3.2 Huecos libres con nivel de energía

**Un hueco es un tramo de tiempo libre contiguo. Un hueco no tiene un nivel de energía: tiene un
perfil de energía.** Las dos cosas se calculan en pasos separados y solo la primera corta.

```
función calcularHuecos(jornada, compromisos, transiciones, bienestarFijo):
    ocupado = []
    para cada compromiso c en jornada:
        ocupado.push(intervalo(c))
        para cada transición t de c aplicable a c.modalidad:
            ocupado.push(intervaloDe(t, c))      // antes o después según el tipo
    huecos = restar(intervalo(jornada.wake, jornada.sleep), unir(ocupado))
    para cada hueco h:
        h.perfilEnergía = segmentarEnergía(h, franjasEnergía, compromisos, modificadores, jornada)
    devolver huecos
```

**Solo el tiempo ocupado corta un hueco.** Nada de lo que afecta a la *calidad* del tiempo —una
franja de energía, el arrastre de un compromiso pesado, un modificador de capacidad, el techo por
deuda de sueño— parte un hueco en dos, porque **ninguna de esas cosas interrumpe nada**: la
persona puede trabajar de 21:45 a 23:15 sin levantarse aunque su pico empiece a las 22:00.

**Perfil de energía de un hueco** — aquí está la implementación del cronotipo y del arrastre:

```
retículo de niveles:  SIN_FOCO < LOW < NEUTRAL < PEAK
                      TODA influencia es un MÍNIMO con un nivel fijo: ninguna sube el nivel, y
                      ninguna depende de cuántas otras haya. Por tanto `tierEn` es el ínfimo de
                      un conjunto de cotas independientes: idempotente, conmutativa y ajena al
                      orden de iteración. NO hay decrementos encadenados.
                      SIN_FOCO es CALCULADO y no se persiste: el enum `energy_tier` de la base
                      de datos tiene tres valores, no cuatro (02 §3).

función tierEn(t, franjas, compromisos, modificadores, jornada):
    nivel = franjaEn(t, franjas)?.tier ?? NEUTRAL      // sin franja declarada => NEUTRAL
    para cada compromiso c con energyCost = HIGH:
        si c.fin <= t < c.fin + c.drainsAfterMinutes:  // SOLO dentro de la ventana de arrastre
            nivel = min(nivel, LOW)                    // NO se compone: dos arrastres = uno
    si jornada.techoEnergía:  nivel = min(nivel, jornada.techoEnergía)   // deuda de sueño
    según modificadorEn(t, modificadores):
        NONE:     nivel = SIN_FOCO
        REDUCED:  nivel = min(nivel, LOW)
        NORMAL, ninguno: sin cambio
    devolver nivel

función segmentarEnergía(hueco, franjas, compromisos, modificadores, jornada):
    // Fronteras: todo instante donde alguna influencia empieza o acaba. Entre dos fronteras
    // consecutivas NADA cambia, así que evaluar en el inicio del tramo es exacto.
    fronteras = { hueco.inicio, hueco.fin }
              ∪ { inicio y fin de cada franja de energía }
              ∪ { c.fin  y  c.fin + c.drainsAfterMinutes  de cada c con energyCost = HIGH }
              ∪ { inicio y fin de cada modificador de capacidad }
    fronteras = ordenar(fronteras ∩ [hueco.inicio, hueco.fin])
    segmentos = [ { inicio: a, fin: b, tier: tierEn(a, …) }
                  para cada par consecutivo (a, b) de fronteras ]
    devolver fusionarAdyacentesDelMismoTier(segmentos)
```

`h.perfilEnergía` es una **partición total del hueco**: los segmentos son contiguos, no se
solapan, cubren el hueco exacto y ninguno tiene duración cero. Un hueco de tarde libre de un
cronotipo nocturno produce `NEUTRAL → PEAK → NEUTRAL`, tres segmentos y **un solo hueco**.

El cronotipo no aparece en ningún `if`. Un pico a las 05:00 y uno a las 23:00 recorren
exactamente el mismo camino. **Eso es la garantía estructural de que el motor no favorece al
madrugador**, y es verificable con un test: espejar todas las franjas de un caso y comprobar
que la calidad de la asignación es equivalente.

> **Precisión del 2026-07-29 — `franjaQueContiene` no estaba definida.** `qa-engineer` la
> encontró al diseñar el caso del cronotipo 22:00–01:00
> ([`docs/qa/fase-1-nucleo-temporal.md`](../qa/fase-1-nucleo-temporal.md)): `nivelEnergía`
> arrancaba con `base = franjaQueContiene(hueco).tier`, que presupone que el hueco cabe dentro de
> **una** franja, y `calcularHuecos` nunca corta en las fronteras de `energy_windows`. Un usuario
> con la tarde libre y pico 22:00–01:00 tiene un hueco que abarca `NEUTRAL→PEAK→NEUTRAL`, y ahí la
> función no tenía valor. **No cambia ninguna decisión**: la hace total, en la única dirección que
> el resto del diseño ya exigía.
>
> **Se descartó trocear el hueco en las fronteras de franja**, que era la salida más obvia. Habría
> convertido cada tramo en una unidad de colocación independiente, y entonces la restricción dura
> nº 1 (`duración(h) >= duraciónRequerida`) se aplicaría por tramo: **un pico de 45 min entre dos
> tramos neutros dejaría de ser colocable para nada**, cuando la realidad es que un bloque de 90
> min puede montarse a caballo y aprovechar esos 45 min de pico. Trocear también habría cambiado
> el número de plazas de colocación y con él el tope emergente de
> [ADR-015](./adr/ADR-015-parametros-de-calibracion.md). Segmentar el perfil **sin** trocear el
> hueco da el pico como pico sin tocar ni las plazas ni el mínimo de 60 min.
>
> **Se descartó también un `tier` por hueco con regla de resolución** (el mayor, el del inicio, el
> mayoritario): cualquiera de las tres etiqueta una tarde libre larga con un solo nivel y **el
> pico deja de ser colocable como pico**, que es la funcionalidad entera del cronotipo.
>
> **`NONE` no corta el hueco, y eso lo decide [ADR-011](./adr/ADR-011-privacidad-por-diseno.md)
> §2**, no una preferencia: ahí la indisponibilidad es un `FixedCommitment` y la *menor capacidad
> de foco* es un `CapacityModifier`. Son dos cosas distintas a propósito. `focus_capacity = NONE`
> significa "este tiempo existe y está libre, pero no admite foco" — sigue siendo colocable para
> admin, seguimientos o bienestar. Tratarlo como tiempo ocupado habría borrado tiempo real de la
> jornada y habría hecho de `capacity_modifiers` un segundo mecanismo de indisponibilidad, que es
> justo lo que ADR-011 separó. Por eso `SIN_FOCO` sigue siendo un nivel del retículo y no una
> ausencia.
>
> **El arrastre degrada solo su ventana.** Antes, `si hueco.inicio < c.fin + c.drains` degradaba
> el hueco **completo**: un hueco de cuatro horas que empezaba un minuto antes de que expirara el
> arrastre perdía cuatro horas de calidad por un minuto de solape. Ahora la condición es
> `c.fin <= t < c.fin + c.drains`, evaluada por segmento. Es la misma regla, aplicada donde
> corresponde.
>
> **El arrastre es `min(nivel, LOW)` y NO se compone** (segunda precisión del 2026-07-29). Antes
> era `degradar(nivel)`, un decremento de un paso, y eso tenía tres problemas:
>
> 1. **Contradecía [02 §4](../02-modelo-de-datos.md)**, que es donde se definió la variante y que
>    dice literalmente: *"un bloque `HIGH` con arrastre de 90 min degrada a **`LOW`** la energía de
>    los 90 minutos siguientes"*. `degradar(PEAK)` da `NEUTRAL`, no `LOW`. Los dos documentos solo
>    coincidían cuando la base ya era `NEUTRAL`.
> 2. **No cumplía su propósito declarado.** [00](../00-vision-y-alcance.md) y 02 justifican el
>    arrastre con *"el motor no colocará trabajo profundo justo después"*. Con la tabla de
>    puntuación de §5.3, el foco profundo vale `NEUTRAL = +1`: positivo, así que el motor **sí** lo
>    colocaría, solo con menos ganas. `LOW = −2` es lo que lo repele activamente. El decremento
>    fallaba precisamente en el caso que más importa: el profesor cuyo pico viene justo después de
>    su clase.
> 3. **No era idempotente**, así que el resultado dependía de **cuántas** ventanas de arrastre
>    solapaban y no de cuál: dos clases seguidas daban `LOW`, tres daban `SIN_FOCO`. Y `SIN_FOCO`
>    habría sido indistinguible de un `capacity_modifier` `NONE` declarado por el usuario, que
>    semánticamente es otra cosa (ADR-011 §2), **y además habría descontado esos minutos de
>    `brutoAsignable`**: un efecto de capacidad producido por acumulación accidental. Con `min(·,
>    LOW)` el suelo del arrastre es `LOW` por construcción y esa colisión es imposible; no hace
>    falta ningún tope.
>
> Que dos clases seguidas "agoten más que una" es cierto como intuición, pero el sistema **no
> tiene con qué medir ese más**: `drains_after_minutes` expresa *cuánto dura* el arrastre, no su
> profundidad. Modelar la intensidad acumulada exigiría un campo que hoy no existe y que nadie ha
> pedido. Si algún día hace falta, será una decisión con su ADR y no un efecto lateral del orden en
> que se recorre un array.

### 3.3 Capacidad asignable

```
brutoAsignable(j) = suma(duración de SEGMENTOS con tier != SIN_FOCO)   // no de huecos enteros
fricción(j)       = brutoAsignable(j) × params.friccionBasePct
                  + númeroDeTransiciones(j) × params.friccionPorTransiciónMin
capacidad(j)      = brutoAsignable(j) − mantenimientoPersonal(j) − fricción(j)
```

> **Precisión del 2026-07-29.** Antes decía "huecos con `tier != SIN_FOCO`", y con un solo `tier`
> por hueco eso significaba que **un modificador `NONE` de media hora borraba de la capacidad el
> hueco entero** que lo contuviera. Sumando por segmentos se descuentan exactamente los minutos
> declarados, ni uno más. **Los números de ADR-015 no se mueven**: sus perfiles A y B se calcularon
> sin ningún `capacity_modifier` declarado, así que las 22 plazas y el corte entre 8 y 10 objetivos
> siguen igual. Lo que cambia es el caso del usuario que sí declara uno, y cambia a su favor.

**Por qué la fricción tiene dos términos.** Un porcentaje fijo trata igual un día de una sola
reunión y un día de seis, cuando el segundo es mucho más costoso: cada cambio de contexto
tiene un coste que no está en el calendario. El término por transición captura eso.

**Valores: 15 % + 7 min por transición** (Q6, resuelta el 2026-07-28). Se eligió la banda
conservadora deliberadamente: el brief establece que el incumplimiento es señal de mala
calibración y no falla del usuario, y de ahí se sigue que **un plan que promete de menos y se
cumple construye confianza, mientras que uno que promete de más colapsa**. Siguen siendo
suposiciones informadas, no datos, y por eso viven en `params`. Ver
[ADR-015](./adr/ADR-015-parametros-de-calibracion.md), que incluye el análisis numérico sobre
dos perfiles y el efecto de umbral que estos valores producen en los días apretados.

`capacidad(j)` es un **techo duro**: ninguna pasada de colocación puede superarlo. Es lo que
implementa el anti-requisito "no llenar cada minuto disponible", que es crítico en el caso
freelance donde el día está casi vacío y la tentación algorítmica es rellenarlo.

---

## 4. F2 — Diagnóstico

El diagnóstico se calcula **antes** de colocar nada y no depende de la colocación. Esa
independencia es lo que permite entregarlo con la entrevista a medias (regla nº5 del brief y
anti-requisito nº4).

Cada hallazgo es un objeto tipado con evidencia numérica, nunca una cadena de texto:

```ts
interface Finding {
  code: FindingCode;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  evidence: Record<string, number | string>;   // la interfaz redacta desde aquí
}
```

| Código | Cálculo | Corresponde a la causa del brief |
|---|---|---|
| `PEAK_HOURS_OCCUPIED` | `minutosPicoOcupadosPorFijos / minutosPicoTotales` | Causa 1: las mejores horas ocupadas |
| `GOALS_EXCEED_CAPACITY` | `objetivosActivos × bloqueMinUtil × frecMin` vs `capacidadSemanal` | Causa 2: más objetivos que capacidad |
| `CAPACITY_GAP` | capacidad real vs. capacidad ingenua (`vigilia − trabajo`) | Causa 3: nunca calculó su capacidad |
| `TRANSITION_LOAD` | `minutosTransición / minutosVigilia` | Coste invisible de los traslados |
| `SLEEP_DEBT` | jornadas con `déficitSueño > 0` | Restricción dura violada |
| `NO_PROTECTED_WELLBEING` | bienestar declarado sin hueco viable | Regla nº4 |
| `FRAGMENTATION_RISK` | **huecos** < bloque mínimo útil / **huecos** totales | Fragmentos inútiles |
| `DEADLINE_AT_RISK` | trabajo restante vs. capacidad hasta la fecha | Anticipa `INFEASIBLE` |

**`FRAGMENTATION_RISK` se cuenta sobre huecos, nunca sobre segmentos de energía** (precisión del
2026-07-29). Un hueco de cuatro horas cuyo perfil es `NEUTRAL→PEAK→NEUTRAL` **no está fragmentado**:
nada lo interrumpe, la persona trabaja de un tirón y solo cambia la calidad del tiempo. Contar los
segmentos aquí reportaría como día fragmentado uno que está entero, y sería un hallazgo falso
mostrado al usuario. La fragmentación es discontinuidad causada por tiempo **ocupado** —
compromisos y transiciones—, que es lo que el brief nombra y lo único que corta un hueco.

`CAPACITY_GAP` merece una nota: la "capacidad ingenua" (vigilia menos trabajo) es una
aproximación deliberadamente ingenua que sirve **solo** para el contraste narrativo —
"creías tener 40 horas; tienes 22". No se usa en ningún cálculo de planificación. Que sea
una aproximación tosca es aceptable porque su función es retórica, no operativa; conviene
que quien lo implemente lo sepa para no "mejorarla".

---

## 5. F3 y F4 — Presupuesto y colocación

### 5.1 Presupuesto por objetivo

Orden de reparto, estricto:

```
1. RESERVAS POR DEADLINE DURO (antes de cualquier reparto)
   para cada objetivo g con deadline HARD dentro del horizonte:
       requerido(g) = trabajoRestante(g)
       disponible   = capacidadTotal hasta g.deadline
       reserva(g)   = requerido(g)              // se reserva ÍNTEGRO
   si suma(reservas) > capacidadTotal:
       -> INFEASIBLE  con InfeasibilityReason HARD_DEADLINE_UNREACHABLE
          por cada objetivo, con { requerido, disponible, déficit }
       -> SE DETIENE AQUÍ. No se genera un plan que fracasará.

2. CONTACTO DIARIO DE LA PRIORIDAD #1
   reserva(g1) += params.contactoDiarioMin × númeroDeJornadas

3. REPARTO ORDINAL DEL REMANENTE
   restante = capacidadTotal − suma(reservas)
   peso(g)  = 1 / rank_ordinal(g)               // serie armónica
   presupuesto(g) = reserva(g) + restante × peso(g) / suma(pesos)

4. FILTRO DE VIABILIDAD  <-- la regla más importante de esta fase
   para cada objetivo g en orden ordinal DESCENDENTE (del menos prioritario hacia arriba):
       si presupuesto(g) < params.bloqueMinUtilMin:      // por defecto 60
           presupuesto(g) = 0
           registrar Sacrifice { g, minutos, reason: BELOW_MIN_BLOCK }
           redistribuir esos minutos hacia los objetivos de mayor rango

5. GARANTÍA DE BLOQUE LARGO PARA PRIORIDADES BAJAS   // ADR-015
   para cada objetivo g con rank(g) > 3 y presupuesto(g) > 0:
       consolidar su presupuesto en el MENOR número de bloques posible,
       cada uno >= params.bloqueLargoMin (90),
       marcados para colocarse en las jornadas de MAYOR capacidad libre
       si no cabe ni un bloque de 90 min:
           presupuesto(g) = 0
           registrar Sacrifice { g, minutos, reason: BELOW_LONG_BLOCK }
```

**El paso 4 es la traducción algorítmica de la causa nº2 del brief.** Si un objetivo no
alcanza para un bloque útil, el sistema **no lo fragmenta: lo deja fuera y lo dice**. Es
exactamente lo contrario del comportamiento por defecto de un repartidor proporcional, que
daría 20 minutos a cada uno y produciría los "fragmentos inútiles" que el brief identifica
como el problema.

> **Corrección del 2026-07-28.** Al resolverse Q5 se afirmó que este filtro produce un tope
> de "3–4 objetivos en una capacidad típica". **Es falso.** El filtro compara el presupuesto
> *total de la ventana* contra 60 min, y con 14 días y ~3000 min de capacidad hasta el
> objetivo de rango 5 recibe más de 200 min: casi nunca corta.
>
> **El tope emergente lo produce otro mecanismo:** lo que escasea no son los minutos sino las
> **plazas de colocación**, limitadas por la capacidad diaria y por el tope de 3 temas de foco
> al día. Contando plazas reales en un perfil de empleo híbrido salen ~22 en 14 días, y el
> corte cae **entre 8 y 10 objetivos**, no en 3–4. La dispersión diaria —que es la métrica del
> brief— la controla el tope de temas por día, no este filtro.
> Análisis completo en [ADR-015](./adr/ADR-015-parametros-de-calibracion.md).

**El paso 5 convierte en garantía lo que antes era una propiedad emergente.** La regla del
brief *"las prioridades bajas reciben bloques largos e infrecuentes"* dependía de que el
reparto cayera de forma favorable. Ahora se fuerza: el presupuesto de un objetivo de rango
bajo se consolida en pocos bloques grandes, o no se le da nada y se explica por qué. Nunca se
reparte en fragmentos diarios.

**Regla de forma por rango**, que orienta la consolidación:

```
frecuenciaObjetivo(g) = rank(g) == 1  ->  diaria (contacto) + 2-3 bloques de foco
                        rank(g) <= 3  ->  2-3 bloques de foco por semana
                        rank(g) >  3  ->  1 bloque LARGO por semana (>= 90 min), o cero
```

### 5.2 Orden de colocación

El orden es fijo y no configurable. Cada pasada solo puede usar huecos que dejaron las
anteriores.

| # | Pasada | Regla del brief que implementa |
|---|---|---|
| 1 | Compromisos fijos + sus transiciones | Ya son inmovibles; definen los huecos |
| 2 | **Tareas con ventana externa obligatoria** | "se colocan primero, junto con los compromisos fijos" |
| 3 | Bloques `PIN` del usuario | Regla nº7: la sobrescritura manda |
| 4 | Innegociables de bienestar | Regla nº4: bloque protegido, no relleno |
| 5 | Estructura obligatoria de la semana | Captura/admin, buffer, revisión, planeación |
| 6 | Foco de objetivos con deadline duro | Urgencia real; mejor hueco disponible |
| 7 | Contacto diario de la prioridad #1 | "recibe contacto diario aunque sea breve" |
| 8 | Foco del resto, por orden ordinal | Reparto ordinal |
| 9 | Seguimientos cortos (bloqueados por terceros) | "seguimiento corto, no trabajo profundo" |
| 10 | Designación del amortiguador | "se mueve dentro del día, no se cancela" |

Justificación del orden: **primero lo que tiene menos grados de libertad**. Una tarea que
solo puede hacerse martes de 9 a 14 en una oficina tiene un espacio de soluciones minúsculo;
si se coloca tarde, no cabe. El trabajo de foco, en cambio, admite muchos huecos. Es la
heurística clásica de *most-constrained-first*, y es lo que hace innecesario un backtracking
caro.

El bienestar va en la posición 4, **antes que cualquier trabajo**. Si fuera después, en una
semana apretada se quedaría sin sitio, que es la definición de "relleno".

### 5.3 Elección de hueco: función de puntuación

```
función mejorColocación(bloque, huecosDisponibles, estadoDelDía):
    // Un candidato es un PAR (hueco, instante de inicio), no un hueco.
    candidatos = []
    para cada hueco h en huecosDisponibles:
        para cada inicio en iniciosCandidatos(h, bloque):
            candidatos.push({ h, inicio, tramo: [inicio, inicio + duración(bloque)) })
    candidatos = candidatos.filtrar(c => cumpleRestriccionesDuras(bloque, c, estadoDelDía))
    si candidatos vacío: devolver NO_CABE
    devolver max(candidatos, por puntuación) con desempate determinista

función iniciosCandidatos(hueco, bloque):
    // El perfil de energía es constante a trozos, así que la puntuación es lineal a trozos en
    // el desplazamiento del bloque: su máximo se alcanza SIEMPRE en un punto donde el inicio o
    // el fin del bloque coincide con una frontera. Basta un conjunto finito y pequeño.
    fronteras = { f.inicio, f.fin  de cada segmento f de hueco.perfilEnergía }
    devolver { x ∈ fronteras ∪ { b − duración(bloque) : b ∈ fronteras }
               : hueco.inicio <= x  ∧  x + duración(bloque) <= hueco.fin }
```

**Por qué el candidato es un par y no un hueco** (precisión del 2026-07-29): con un `tier` por
hueco, `mejorHueco` nunca decidía *dónde dentro* del hueco cae el bloque, así que un pico de
22:00–01:00 dentro de una tarde libre era inalcanzable — el bloque caía donde cayera y puntuaba
con un nivel único. Elegir el instante es lo que hace que el cronotipo se cumpla, y el conjunto
finito de candidatos lo hace sin búsqueda continua ni pérdida de determinismo.

**Restricciones duras (filtro binario, no puntuación):**

```
1. duración(h) >= duraciónRequerida(bloque)
2. bloque.kind = FOCUS  =>  duración >= params.bloqueMinUtilMin (60)
3. temasDeFocoDistintosEn(día) + (bloque introduce tema nuevo ? 1 : 0)
       <= perfil.maxFocusTopicsPerDay
4. minutosUsados(día) + duración(bloque) <= capacidad(día)
5. ningún minuto del tramo del bloque cae en un segmento SIN_FOCO, si el bloque requiere foco
      (antes: `h.tier != SIN_FOCO`. Un hueco ya no tiene un único tier)
6. jornada.prohibeFocoNocturno  =>  bloque FOCUS no puede caer en el último tramo
7. hay hueco para las transiciones respecto a los bloques vecinos
8. si bloque tiene ventana externa: h está dentro de esa ventana
```

**Puntuación (todo lo demás):**

```
puntuación(bloque, candidato) =
      W_ENERGÍA     × ajusteEnergía(bloque.necesidad, candidato.tramo)   // término dominante
    − W_FRAGMENTO   × residuoInútil(candidato)       // restos < 60 min a AMBOS lados del bloque
    + W_CONTIGÜIDAD × contiguoConMismoObjetivo(candidato)
    − W_ARRASTRE    × proximidadACompromisoPesado(candidato)
    − W_DISPERSIÓN  × objetivosYaTocadosEseDía       // empuja hacia la métrica de éxito
    + W_URGENCIA    × cercaníaDelDeadline(bloque)

// El bloque puede abarcar varios segmentos de energía: el ajuste es la MEDIA PONDERADA POR
// MINUTOS del valor de cada segmento que el tramo toca.
ajusteEnergía(necesidad, tramo) =
    suma( duración(tramo ∩ seg) × valor(necesidad, seg.tier) ) / duración(tramo)

valor:  FOCUS profundo    -> PEAK=3, NEUTRAL=1, LOW=-2
        ADMIN / reactivo  -> LOW=3,  NEUTRAL=1, PEAK=-3   // ¡negativo!
        bienestar         -> según preferred_tier
```

> **Estos números son `params`, no literales, y la fase 4 no puede tratarlos de otro modo.** Los
> seis pesos `W_*` y la tabla `valor` son **parámetros de calibración** y caen de lleno en el
> límite nº 5 de `CLAUDE.md` ("ninguna constante mágica en el motor; todo número calibrable va en
> `EngineInput.params`"). Hoy están escritos aquí como ilustración y **no aparecen en
> [ADR-015](./adr/ADR-015-parametros-de-calibracion.md) ni en ningún `params` declarado**: es deuda
> preexistente, anotada el 2026-07-29 al revisar la segmentación.
>
> **Por qué ahora importa más que antes.** Con un `tier` por hueco, `valor` se consultaba una vez
> por bloque y solo ordenaba huecos entre sí. Con el perfil segmentado es el **peso de una media
> ponderada por minutos**, así que las magnitudes relativas deciden **dónde exactamente** desliza el
> bloque dentro del hueco. Que `PEAK` valga 3 y `NEUTRAL` 1 —y no 5 y 1— cambia cuánto pico está
> dispuesto a sacrificar un bloque para evitar dejar un residuo inútil. El apalancamiento de estos
> números subió; su condición de literales no.
>
> **Recomendación para la fase 4:** al calibrarlos, un **ADR nuevo** que los fije con su análisis
> numérico, al estilo de ADR-015 y **sin editarlo** — ADR-015 no los menciona, así que no hay
> contradicción que reemplazar, es una decisión sobre parámetros que él no cubrió.

**La media ponderada es lo que alinea el bloque con el pico sin trocear nada.** Un bloque de foco
de 90 min en una tarde libre con pico de 22:00 a 01:00 puntúa más alto cuanto más pico cubre, así
que el maximizador lo desliza hasta encajarlo dentro del pico por sí solo. Y si el pico solo mide
45 min, el bloque se monta a caballo y cobra por esos 45: nada se pierde por no llegar al mínimo.
El comportamiento que el cronotipo promete **emerge de la puntuación**, no de una regla nueva.

> **Pendiente para la fase 4, anotado para que sea una elección y no un descubrimiento:** con el
> arrastre fijando `LOW` exactamente en su ventana (§3.2), el término `W_ARRASTRE` queda **muy
> probablemente redundante**: `valor(FOCUS profundo, LOW) = −2` ya repele el foco de esa ventana con
> fuerza, así que el término penalizaría dos veces lo mismo. Puede que siga valiendo para castigar
> la *proximidad* a un compromiso pesado **más allá** de la ventana declarada, que es un efecto
> distinto y que hoy nada modela. Se decide con el código delante y midiendo, no ahora.

El valor **negativo** de colocar trabajo administrativo en la franja pico es deliberado: no
basta con preferir el pico para el trabajo profundo, hay que **penalizar activamente** que lo
ocupe lo reactivo. Sin ese negativo, un día con abundante hueco pico se llena de correo, que
es la causa nº1 del brief.

`W_DISPERSIÓN` conecta el algoritmo con la métrica de éxito declarada (reducir objetivos
tocados por día). Es un caso raro y valioso de métrica de producto codificada directamente en
la función objetivo.

**Desempate determinista, sin aleatoriedad:** **instante de inicio más temprano** → hueco más
temprano en la jornada → jornada de índice menor → `identity_key` lexicográficamente menor. El
primer criterio es nuevo (2026-07-29) y es necesario: dos candidatos del mismo hueco con la misma
puntuación solo se distinguen por su instante de inicio. Nunca se usa un generador aleatorio,
ni siquiera con semilla. Un motor con aleatoriedad sembrada sigue siendo frágil ante
reordenamientos de la entrada; el orden total explícito no.

### 5.4 Cuando algo no cabe: recorte ordinal, no búsqueda exhaustiva

```
función colocarConRecorte(bloques, huecos, presupuestos):
    para intento en 1..params.maxIntentosRecorte:          // por defecto 3
        resultado = colocarTodasLasPasadas(bloques, huecos)
        si resultado.sinColocar vacío: devolver resultado

        críticos = resultado.sinColocar.filtrar(b => b.objetivo.deadline == HARD)
        si críticos no vacío:
            // No se puede recortar lo que tiene deadline duro
            devolver INFEASIBLE con HARD_DEADLINE_UNREACHABLE por cada crítico

        // Recorte desde la prioridad MÁS BAJA hacia arriba (regla nº3)
        víctima = objetivoActivoDeMayorRankOrdinal(presupuestos)
        minutos = presupuesto(víctima)
        presupuesto(víctima) = 0
        registrar Sacrifice {
            goal: víctima, minutos, reason: ORDINAL_TRIM,
            evidence: { intento, bloquesSinColocar, capacidadDisponible }
        }
        bloques = regenerarBloquesDesde(presupuestos)

    devolver INFEASIBLE con CAPACITY_STRUCTURALLY_INSUFFICIENT
```

**Por qué no hay backtracking exhaustivo ni un solver de restricciones.** Se evaluó modelar
esto como CSP/ILP con OR-Tools. Se descarta por tres razones concretas:

1. **La explicabilidad es el producto.** Un solver devuelve una solución óptima sin decir por
   qué sacrificó lo que sacrificó. La regla nº2 y nº3 del brief exigen justamente esa
   narrativa, y reconstruirla desde un solver es un problema abierto.
2. **La optimalidad no es el requisito.** El usuario no necesita el mejor plan posible;
   necesita un plan honesto que respete el orden de prioridades. Un greedy con recorte
   ordinal produce exactamente eso, y la diferencia de calidad frente al óptimo es
   irrelevante frente al error de las estimaciones de entrada, que es de decenas de minutos.
3. **Coste y determinismo.** Un solver añade una dependencia nativa pesada y tiempos de
   ejecución con cola larga.

Si más adelante aparecen instancias que el greedy resuelve mal, el punto de extensión es
sustituir la fase 4 dejando intactas las demás — es una decisión reversible por diseño.

---

## 6. F6 — Explicación de cada colocación e intercambio

### 6.1 La traza se emite al decidir, nunca se reconstruye

Cada bloque colocado lleva su `rationale` estructurado, escrito en el momento de la decisión:

```jsonc
{
  "chosenSlot":  { "start": "...", "tier": "PEAK" },
  "reasonCode":  "BEST_ENERGY_MATCH",
  "score":       7.4,
  "runnerUp":    { "start": "...", "tier": "NEUTRAL", "score": 3.1 },
  "constraints": ["MIN_BLOCK_60", "MAX_TOPICS_3", "TRANSITION_20_BEFORE"],
  "displaced":   [{ "lineageId": "...", "goalId": "...", "minutes": 60 }]
}
```

`runnerUp` es lo que permite responder la pregunta que el usuario realmente hace: *"¿por qué
aquí y no el martes?"* — "el martes tu franja pico ya tenía dos temas de foco". Reconstruir
esa respuesta después de haber decidido es imposible: la información del segundo mejor
candidato solo existe durante la comparación.

### 6.2 Redacción del texto

La explicación mostrada se compone con **plantillas deterministas** sobre `reasonCode` y
`evidence`:

```
ORDINAL_TRIM     -> "Se retiró {minutos} de «{objetivo}» (prioridad #{rank}) porque
                     {objetivoGanador} tiene fecha límite el {fecha} y necesitaba
                     {minutosNecesarios} más."
BELOW_MIN_BLOCK  -> "«{objetivo}» solo alcanzaba {minutos} esta semana. Menos de
                     {mínimo} minutos no produce avance, así que queda fuera en vez de
                     repartirse en fragmentos."
```

El LLM, cuando se active, **solo reescribe estas plantillas ya rellenas** para hacerlas más
naturales. Nunca genera la explicación desde los datos crudos, porque entonces podría
inventar una causa. Ver [ADR-004](./adr/ADR-004-motor-determinista-vs-llm.md).

**El motor emite `narrativeCode` + `narrativeParams`, nunca texto redactado** (desde el
2026-07-27, [ADR-014](./adr/ADR-014-cumplimiento-rgpd.md)). Los parámetros referencian
objetivos y tareas **por id**; el motor no conoce los títulos y no debe recibirlos. Un título
copiado dentro de una narrativa persistida sobreviviría al borrado de su objetivo y rompería
el derecho de supresión. La composición del texto ocurre al leer, fuera del motor.

### 6.3 Cálculo del diff

```
función calcularDiff(anterior, nueva):
    // NIVEL 1 — exacto, sin heurística. Es la fuente de verdad de la regla nº2.
    para cada objetivo g en union(objetivos(anterior), objetivos(nueva)):
        antes   = suma minutos de bloques de g en anterior
        después = suma minutos de bloques de g en nueva
        veredicto = clasificar(antes, después)   // GAINED/LOST/UNCHANGED/DROPPED/INTRODUCED
        emitir GoalDelta

    // NIVEL 2 — detalle por bloque, usando linajes YA asignados en la colocación
    porLinaje = indexar(anterior.bloques, nueva.bloques) por lineage_id
    para cada linaje:
        si solo en nueva:                      ADDED
        si solo en anterior:                   REMOVED
        si en ambos y cambió el inicio:        MOVED
        si en ambos y cambió la duración:      RESIZED
        si en ambos y cambió el tier:          RETIERED

    // TITULAR: se construye desde el nivel 1, nunca desde el 2
    ganadores = deltas con verdict GAINED ordenados por delta desc
    perdedores= deltas con verdict LOST|DROPPED ordenados por delta asc
    headlineCode   = "GAIN_LOSS"
    headlineParams = { gainedGoalId, gainedMinutes, lostGoalId, lostMinutes }
    // El texto "Ganas 3 h en «X»..." se compone AL LEER, fuera del motor.
```

**El titular se construye desde el nivel agregado**, que es aritmética exacta. Si se
construyera desde los eventos de bloque, dependería del emparejamiento por linaje y podría
mentir en casos raros. Esta separación es la que permite afirmar sin matices que ningún
intercambio es silencioso.

**Invariante testeable:**
`∀g: delta_minutes(g) == minutos(g, nueva) − minutos(g, anterior)`. Property-based test
obligatorio.

---

## 7. F5 — Validación con verificador independiente

```
función validar(salida, entrada) -> ValidationReport:
    afirmar sinSolapes(salida.bloques)
    afirmar transicionesRespetadas(salida.bloques, entrada.commitments)
    afirmar ∀ jornada: minutosUsados <= capacidad(jornada)
    afirmar ∀ bloque FOCUS: duración >= params.bloqueMinUtilMin
    afirmar ∀ jornada: temasDeFocoDistintos <= perfil.maxFocusTopicsPerDay
    afirmar ∀ bloque: tiene exactamente 0 o 1 vínculo de contenido   // un bloque, un objetivo
    afirmar ∀ jornada con déficit de sueño: sin bloques FOCUS nocturnos
    afirmar bienestarDeclarado ⊆ bienestarColocado ∪ sacrificiosExplicados
    afirmar estructuraSemanal presente (captura, buffer, revisión, planeación)
    afirmar exactamente un bloque con is_shock_absorber por jornada con foco
    afirmar ∀ objetivo con deadline HARD: minutosAsignados >= minutosRequeridos
    afirmar ∀ bloque anterior a entrada.regeneratedFrom: idéntico al de la versión padre
```

**Regla de implementación, y es la parte importante de esta sección:** este módulo
**no importa nada de la fase de colocación**. Reimplementa sus propios cálculos de solape y
de capacidad desde los datos de la salida. Se paga duplicación a propósito. Si compartiera
la utilidad `solapan()` con el colocador, un bug en esa utilidad haría que la validación
pasara siempre — el chequeo se volvería una tautología y la garantía sería falsa.

Si la validación falla, **no se entrega plan**: es un error interno con alerta. La tasa de
fallo del validador es una métrica de calidad que debe ser exactamente cero en producción.

---

## 8. Casos difíciles y cómo se resuelven

### 8.1 Compromiso que expira y libera un hueco

Es una variante que el brief destaca y que muchos diseños tratan como caso especial. Aquí
**no requiere código específico**:

1. `recurrence_rules.effective_until` hace que la expansión deje de producir instancias.
2. La siguiente generación ve más huecos libres, sin más.
3. El reparto ordinal asigna ese excedente por peso, es decir, mayoritariamente a la
   prioridad más alta.
4. El diff lo declara: `GAINED` para el objetivo beneficiado.

Lo único que hace falta es un **disparador**: un trabajo diario que detecte reglas que
expiraron desde la última generación y sugiera replanificar con
`reason = 'COMMITMENT_EXPIRED'`. Es el único componente programado del sistema y su
justificación es exactamente esta variante.

### 8.1b Semana atípica dentro de la ventana (viaje, vacaciones)

Se planifica **la ventana completa de 14 días**, tratando el periodo atípico como una
anulación de disponibilidad. No se corta el plan en el evento (Q11, resuelta el 2026-07-28).

La razón no es de preferencia sino de regla innegociable: **si el plan se cortara en el
viaje, el sistema no podría detectar que un deadline posterior al viaje es inalcanzable**, y
callaría en vez de declararlo. Eso incumpliría directamente la regla nº6 del brief ("un plan
imposible se declara imposible"). La detección de inviabilidad exige mirar toda la ventana,
incluidos los días al otro lado del hueco.

Los días posteriores al periodo atípico se planifican con la información disponible y se
replanifican al volver, con `reason = 'CONSTRAINT_CHANGE'`.

### 8.2 Cambio a mitad de semana

`regeneratedFrom = now`. Los bloques anteriores se copian textualmente de la versión padre
(el validador lo comprueba). El motor solo coloca desde `now`. El diff compara las versiones
completas, así que la parte pasada aparece como `UNCHANGED` y el usuario ve únicamente el
intercambio real sobre los días que quedan.

### 8.3 Turnos rotativos

No hay caso especial. `packages/temporal` expande el generador `CYCLE` y el motor recibe una
lista de compromisos materializados como cualquier otra. **La complejidad del turno rotativo
está toda en la expansión, no en la planificación.** Ese confinamiento es el objetivo de
diseño: si el motor tuviera que saber qué es un turno, cada regla nueva tendría que
contemplarlo.

### 8.4 Freelance con exceso de capacidad

El riesgo aquí es opuesto y el motor lo resuelve por construcción:

- El techo de `capacidad(j)` impide llenar el día.
- El tope de temas de foco por día impide la dispersión.
- Los presupuestos por objetivo se topan con lo que el objetivo realmente necesita
  (`min(presupuesto, trabajoRestante)`), así que no se inventa trabajo.
- Si sobra capacidad tras cubrir todo, **el motor deja el hueco vacío** y emite un
  `Finding` de tipo `SPARE_CAPACITY`. No lo rellena. Anti-requisito nº1.

### 8.5 Tarea urgente de aparición súbita

Entra como replanificación parcial con `reason = 'URGENT_TASK'`. Compite en la pasada 6 si
tiene deadline duro. El diff muestra qué desplazó. Si desplaza un bienestar protegido, **no
se coloca** y el sistema propone `INFEASIBLE` parcial o recorte de un objetivo bajo — la
decisión la toma el usuario.

### 8.6 El bloque amortiguador

Se designa al final: dentro de cada jornada con foco, el bloque de menor rango ordinal que no
sea bienestar ni tenga deadline duro recibe `is_shock_absorber = true`. Su semántica ("se
mueve dentro del día, no se cancela") es una regla de la interfaz al arrastrar, no del motor,
pero el motor la marca.

---

## 9. Recalibración con datos reales

**En el primer entregable la recalibración es asistida, no automática.** Ver la justificación
del diferimiento en [00 §3.3](./00-vision-y-alcance.md): ajustar estimaciones con dos semanas
de datos produce ruido con apariencia de inteligencia.

Lo que sí entra desde el día uno es la **captura** (irreversible si se pierde) y la
**detección**, mostrada en la revisión semanal como propuesta que el usuario acepta o
rechaza:

```
señal SOBRE_DURACIÓN_SISTEMÁTICA:
    si ≥ 3 registros del mismo objetivo con outcome = OVERRAN
       y mediana(real/planificado) > 1.25:
    -> proponer: "Los bloques de «X» duran un 30 % más de lo estimado.
                  ¿Ajusto la estimación a {nuevo}?"

señal HORARIO_INCUMPLIDO:
    si ≥ 3 registros del mismo lineage_id con outcome ∈ {MOVED, CANCELLED}:
    -> proponer: "El bloque de los martes a las 07:00 se movió 4 de 5 veces.
                  ¿Lo cambio a {alternativa con mejor histórico}?"
    // el brief: "propone moverlo en vez de insistir"

señal FRANJA_PICO_EQUIVOCADA:
    si cumplimiento en franja PEAK declarada < cumplimiento en otra franja,
       con ≥ 10 registros:
    -> proponer revisar la franja de mayor rendimiento
```

Umbrales (3 registros, 1.25, 10 registros) son **suposiciones iniciales** que viven en
`params`. Se validan con datos, no con opinión.

Cuando se automatice, el requisito de diseño es que **cada ajuste automático debe ser
visible y reversible en la revisión semanal**. Un motor que cambia sus estimaciones en
silencio viola el mismo principio que "ningún intercambio es silencioso".

---

## 10. Testing determinista del motor

Esta sección es normativa para la implementación.

### 10.1 Golden tests: la §5 del brief como suite ejecutable

Un fixture por variante, en `packages/engine/fixtures/`:

```
fixtures/
  01-horario-fijo-oficina/            input.json  expected.json
  02-hibrido-dias-variables/
  03-multiples-empleos/
  04-turno-rotativo-4x3/
  05-freelance-sin-horario/
  06-imparte-clases-arrastre/
  07-busqueda-de-empleo/
  08-cronotipo-nocturno-22-01/
  09-cronotipo-madrugador-05-08/      <- espejo de 08: la asignación debe ser equivalente
  10-compromiso-que-expira/
  11-ventana-externa-tramite/
  12-bloqueado-por-terceros/
  13-semana-atipica-viaje/
  14-energia-reducida/
  15-cambio-a-mitad-de-semana/
  16-tarea-urgente-subita/
  17-plan-imposible-deadline/
  18-deficit-de-sueno/
  19-muchos-objetivos-tope-emergente/   <- 10+ objetivos: fija dónde corta DE VERDAD
  20-prioridad-baja-bloque-largo/       <- rank > 3 recibe >= 90 min, o se explica
```

**Los fixtures 19 y 20 se añadieron el 2026-07-28** con
[ADR-015](./adr/ADR-015-parametros-de-calibracion.md). El 19 existe porque la caracterización
del tope emergente resultó ser errónea, y el comportamiento real debe quedar fijado por un
caso ejecutable en lugar de por una frase en un documento. El 20 protege la regla de las
prioridades bajas, que hasta entonces dependía de una propiedad emergente.

**Todos los fixtures de capacidad deben generarse con 15 % + 7 min**; cualquiera calculado
con los valores antiguos (12 % + 5) está mal.

Cada fixture es un contrato: si el comportamiento cambia, el diff del `expected.json` muestra
exactamente qué cambió y obliga a decidir si es una mejora o una regresión. **Es el mecanismo
que convierte la sección 5 del brief en algo verificable en vez de aspiracional.**

El par 08/09 es el test antisesgo: mismo escenario con las franjas espejadas debe producir la
misma calidad de asignación (mismos minutos de foco en PEAK, mismo número de sacrificios).

### 10.2 Property-based testing de los invariantes

Con `fast-check`, generando entradas válidas arbitrarias:

```
∀ entrada válida, salida = runEngine(entrada):
  P1  ningún par de bloques se solapa
  P2  ningún día excede su capacidad calculada
  P3  todo bloque FOCUS dura >= 60 min
  P4  ningún día tiene más de maxFocusTopics temas de foco distintos
  P5  todo bloque tiene como máximo un vínculo de contenido
  P6  todo bienestar declarado está colocado o tiene un sacrificio que lo explica
  P7  si feasibility = FEASIBLE, todo deadline duro tiene sus minutos
  P8  ∀ objetivo: diff.delta == minutos(nueva) − minutos(anterior)
  P9  runEngine(x) == runEngine(x)                      // determinismo estricto
  P10 runEngine(x) == runEngine(permutarOrdenDeEntrada(x))   // independencia del orden
  P11 los bloques anteriores a regeneratedFrom son idénticos a los de la versión padre
  P12 sacrificios ordenados por rank descendente: nunca se recorta a #1 antes que a #4
  P13 todo objetivo con rank > 3 y presupuesto > 0 recibe al menos un bloque de
      >= bloqueLargoMin (90 min), o un Sacrifice BELOW_LONG_BLOCK que lo explique.
      Nunca recibe fragmentos diarios.   // ADR-015
```

P10 es el que caza la clase de bug más traicionera: un motor que depende del orden de llegada
de los objetivos en un array produce planes distintos ante los mismos datos y hace imposible
depurar una queja.

P12 codifica la regla nº3 del brief como propiedad matemática.

P13 es la red de seguridad de la regla "las prioridades bajas reciben bloques largos e
infrecuentes". Antes dependía de que el reparto cayera bien; ahora es verificable. Es también
el test que detectaría una regresión si alguien subiera la fricción sin darse cuenta de que
deja a los objetivos bajos sin sitio.

### 10.3 Aritmética temporal

Suite dedicada en `packages/temporal`, con casos reales:

- Día de cambio de horario de 23 h y de 25 h (con zonas que aún aplican DST).
- Sueño que cruza medianoche, y jornada que cruza cambio de horario.
- Cronotipo con pico 22:00–01:00 (el pico cruza medianoche).
- Excepción de recurrencia en el día del cambio de horario.
- Zonas con desfase no entero (`Asia/Kolkata`, +05:30) y con cambios históricos.
- Año bisiesto y semana 53.

Se usa un huso con DST real, no un huso fijo, para que las pruebas se parezcan al mundo.

### 10.4 Regla de disciplina

`packages/engine` y `packages/temporal` no pueden tener dependencias de I/O en su
`package.json`. Un test de arquitectura lo verifica. Es la salvaguarda mecánica de todo lo
anterior: sin ella, el determinismo dura hasta la primera fecha de entrega apretada.
