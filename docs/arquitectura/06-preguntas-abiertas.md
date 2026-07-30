# 06 — Preguntas abiertas

Fecha: 2026-07-24 · Última verificación: 2026-07-29
Estado: ✅ **TODAS RESUELTAS (14).** Q1, Q2, Q4, Q5, Q8 y Q12 el 2026-07-27; Q3, Q6, Q7, Q9, Q10 y
Q11 el 2026-07-28; **Q13 y Q14 el 2026-07-29**, el mismo día en que se abrieron. **No queda
ninguna pregunta abierta: la fase 1 sigue.**

Q13 y Q14 nacieron al enumerar el subconjunto de `RRULE` en
[ADR-018](./adr/ADR-018-expansion-de-recurrencia-sin-rrule.md). Es el quinto hallazgo que este
mecanismo destapa antes de escribir código, y esta vez fueron dos: un **criterio de aceptación
imposible de cumplir** y una **demo que enseñaba lo contrario de lo que el proyecto presume de
resolver**.

> Este documento pasa de ser una lista de bloqueos a ser el **registro de por qué el diseño es
> como es**. Conviene conservarlo: cuando dentro de seis meses alguien se pregunte por qué la
> fricción es del 15 % o por qué el anclaje tiene tres valores, la respuesta está aquí.

> **Q12 se añadió el 2026-07-27** al verificar la consistencia de los documentos: ADR-001
> asumía "equipo pequeño" apoyándose en Q1, pero Q1 preguntaba por el *modelo de producto*
> (monousuario vs. SaaS), no por el *tamaño del equipo*. Eran dos incógnitas fusionadas bajo
> el mismo identificador. Ya está resuelta.
>
> **Q2 y Q8 no confirmaron el supuesto por defecto** y tuvieron consecuencias en el diseño:
> el enum de anclaje pasó de dos a tres valores, y el esquema de `sacrifices` y `plan_diffs`
> cambió. Ver [ADR-014](./adr/ADR-014-cumplimiento-rgpd.md).

> Este documento es un entregable, no una nota al pie. Cada pregunta de aquí es una
> ambigüedad genuina del brief o una decisión de producto que no me corresponde tomar en
> silencio. Están ordenadas por coste de equivocarse.
>
> Junto a cada una va **el supuesto con el que el diseño avanza mientras tanto** y **qué hay
> que rehacer** si la respuesta es otra.

---

## Q1 — ¿Producto para una sola persona o SaaS multiusuario? ✅ Resuelta

> **Respuesta (2026-07-27): SaaS multiusuario.** Se confirma el supuesto. ADR-010 y ADR-012
> quedan firmes, y el aislamiento por `user_id` verificado con tests entra en la fase 0.

**Por qué importa.** Cambia autenticación, hosting, obligaciones de privacidad, copias de
seguridad y si hace falta panel de administración. Es la pregunta con mayor efecto sobre el
plan de fases.

**Supuesto actual.** SaaS multiusuario desde el día uno, pero con una base de usuarios
pequeña (decenas). Por eso: sesión propia con enlace por email, un solo contenedor, Postgres
gestionado, y aislamiento por `user_id` verificado con tests.

**Si la respuesta es "es para mí solo":** desaparece la autenticación por email (basta una
clave de entorno), el despliegue puede ser una máquina o incluso local, y la fase 1 se acorta
en torno a una semana. El modelo de datos no cambia.

---

## Q2 — Anclaje temporal durante los viajes: ¿hora local o zona de origen? ✅ Resuelta

> **Respuesta (2026-07-27): marcado explícito por compromiso.** Se descarta inferir a partir
> de la modalidad.
>
> **No confirmó el supuesto por completo, y tuvo dos consecuencias:**
>
> 1. **El enum pasó de dos valores a tres.** Al tomarse en serio el marcado explícito apareció
>    que faltaba el caso mayoritario: un compromiso presencial en tu ciudad no se re-ancla a
>    ninguna hora mientras viajas, **simplemente no ocurre**. Nace `SUSPEND_WHEN_AWAY`, junto
>    a `FIXED_ZONE` y `LOCAL_WHEREVER`. Modelarlo como local habría generado planes que
>    colocan a la persona donde no está.
> 2. **El campo no entra en la entrevista.** "Marcado explícito" no obliga a "preguntar por
>    cada compromiso en el onboarding": el valor se **precarga** desde la modalidad, queda
>    visible y editable, y la pregunta real se hace una sola vez, **la primera vez que el
>    usuario declara un viaje**, con sus compromisos agrupados para revisar en bloque. Si
>    nunca viaja, nunca se le pregunta. Las dos puertas de [ADR-007] no se tocan.
>
> **Bienestar y sueño:** el bienestar **sí** lleva anclaje (por defecto `LOCAL_WHEREVER`),
> porque existen rutinas con ancla fija como una clase en línea. El perfil de sueño **no lo
> lleva y es siempre local**: el cuerpo viaja con la persona y ofrecer la opción solo
> permitiría configurar algo incoherente.
>
> [ADR-007]: ./adr/ADR-007-entrevista-formulario-progresivo.md

**Por qué importa.** Es la ambigüedad del brief con dos lecturas que llevan a expansiones de
recurrencia distintas. "Los martes a las 9:00" es ambiguo si el usuario está en otro huso.

- Una clase en línea con gente de su ciudad: sigue a las 09:00 **de la zona de origen**.
- El gimnasio, las comidas, dormir: siguen a las 09:00 **locales, donde esté**.

**Supuesto actual.** El campo `fixed_commitments.anchor` (`FIXED_ZONE` | `LOCAL_WHEREVER`)
existe desde el día uno con `FIXED_ZONE` por defecto, y la lógica de viajes está diferida.
El bienestar y el perfil de sueño se asumen `LOCAL_WHEREVER`.

**Lo que necesito saber.** ¿Es aceptable pedirle al usuario que marque esto por compromiso, o
debe inferirse de la modalidad (presencial → local, remoto → zona fija)? La inferencia es más
cómoda y falla en un caso frecuente: la reunión remota con el equipo de la oficina.

**Si la respuesta llega tarde:** no hay daño. El esquema ya lo soporta. Este es un caso donde
el coste de esperar es cero y por eso el campo se incluye aunque la funcionalidad se difiera.

---

## Q3 — ¿Cuál es la ventana de planificación por defecto? ✅ Resuelta

> **Respuesta (2026-07-28): ventana rodante de 14 días.** Confirma el supuesto.



**Por qué importa.** Afecta al rendimiento del motor, a la estabilidad del plan y a la forma
de la interfaz. El brief habla de "semana" (revisión semanal, planeación de la siguiente) pero
también de deadlines a meses y de estacionalidad.

**Supuesto actual.** Ventana **rodante de 14 días**, con revisión semanal. Razones: dos
semanas dan margen para que un deadline a diez días sea planificable sin declararlo
imposible el lunes; y la segunda semana se replanifica de todas formas, así que la
inestabilidad no molesta.

**Alternativas.** 7 días (más estable, ciego a deadlines cercanos) o 28 días (visión, pero
99 % del contenido lejano es ficción).

**Si cambia:** solo cambia un parámetro por defecto. Reversible.

---

## Q4 — "Máximo 2–3 temas de foco por día": ¿cuál, y qué cuenta como tema? ✅ Resuelta

> **Respuesta (2026-07-27): tope 3, y el contacto diario de la prioridad #1 SÍ consume plaza.**
> Se confirma el supuesto: quedan 2 plazas libres además del contacto diario.

**Por qué importa.** Tiene consecuencia algorítmica directa y hay dos subpreguntas:

1. ¿2 o 3? El brief da un rango; el motor necesita un número.
2. **¿El contacto diario de la prioridad #1 consume una de las plazas?** Si sí, con tope 3
   quedan solo 2 plazas libres el resto del día, lo que es una restricción mucho más severa
   de lo que parece.

**Supuesto actual.** Tope configurable con valor 3, y **el contacto diario de la prioridad #1
SÍ cuenta** como tema. Razón: si no contara, un día podría tener contacto de #1 más tres temas
de foco, es decir cuatro objetivos tocados, lo que contradice frontalmente la métrica de
éxito de "reducir objetivos tocados por día".

**Si la respuesta es la contraria:** es un cambio de una línea en el filtro de restricciones
duras y un fixture nuevo. Barato.

---

## Q5 — Ranking ordinal de *todos* los objetivos vs. tope de 3 ✅ Resuelta

> **Respuesta (2026-07-27): interpretación (b), con tope emergente.** El ranking es completo y
> el reparto ordinal; el filtro de bloque mínimo de 60 min produce el tope sin número fijo.

**Por qué importa.** El brief pide ranking ordinal de las prioridades **y** "planeación de la
semana siguiente con tope de 3 objetivos". No queda claro si:

- (a) hay un ranking largo y solo los 3 primeros reciben tiempo en una semana dada, o
- (b) hay un ranking largo y todos reciben algo, pero solo 3 son "activos" por semana, o
- (c) el tope de 3 aplica solo al ritual de planeación, no al reparto.

**Supuesto actual.** Interpretación (b) con matiz: el ranking es completo y el reparto es
ordinal, pero **el filtro de viabilidad del bloque mínimo (60 min) produce el tope de forma
emergente**. ~~En una capacidad típica, solo 3–4 objetivos superan el mínimo~~; el resto cae a
cero y se declara. Es más honesto que un tope arbitrario porque el corte lo determina la
capacidad real de la persona, no un número redondo.

> ⚠️ **Corregido el 2026-07-28.** La frase tachada es **falsa** y lo era desde que se escribió.
> Al correr los números para Q6 se comprobó que el filtro de bloque mínimo casi nunca corta
> (compara el presupuesto *total de la ventana* contra 60 min). El tope emergente sí existe,
> pero lo produce la escasez de **plazas de colocación** —capacidad diaria × tope de 3 temas
> al día— y cae **entre 8 y 10 objetivos**, no en 3–4. La decisión de Q5 (interpretación b)
> sigue siendo válida; lo que estaba mal era el mecanismo que le atribuí y la magnitud.
> Ver [ADR-015](./adr/ADR-015-parametros-de-calibracion.md).

**Consecuencia si es (a):** el motor tendría que ignorar del todo los objetivos 4+, lo que es
más simple pero pierde el caso "prioridades bajas reciben bloques largos e infrecuentes" que
el brief pide explícitamente. Creo que esto respalda (b), pero conviene confirmarlo.

---

## Q6 — Valores iniciales del colchón de fricción y del contacto diario ✅ Resuelta

> **Respuesta (2026-07-28): banda conservadora.** Fricción base **15 %** (era 12 %), fricción
> por transición **7 min** (era 5), contacto diario **30 min** (confirma el supuesto), resto
> de la tabla sin cambios.
>
> **Razonamiento del usuario:** el brief establece que el incumplimiento es señal de mala
> calibración y no falla del usuario, y eso argumenta por errar hacia lo conservador — **un
> plan que promete de menos y se cumple construye confianza; uno que promete de más colapsa.**
>
> **Sobre el 18 %:** considerado y descartado. Para cubrir a los perfiles fragmentados ya
> está el término por transición, que mide la fragmentación directamente; subir la base
> penalizaría igual al freelance con el día despejado, donde la fricción real es menor.
>
> **Esta respuesta destapó un error del diseño, no en Q6 sino en Q5** — ver abajo y
> [ADR-015](./adr/ADR-015-parametros-de-calibracion.md).

### Interacción con el tope emergente de Q5 (verificada con números)

Se corrieron dos perfiles. Capacidad en 14 días: empleo híbrido 3366 → **3142 min (−6,6 %)**;
freelance 7994 → **7620 min (−4,7 %)**.

**Hallazgo 1 — la afirmación de Q5 era falsa, y ya lo era antes de Q6.** Escribí que el filtro
de bloque mínimo deja "solo 3–4 objetivos". No es cierto: el filtro compara el presupuesto
*total de la ventana* contra 60 min, y con 14 días hasta el objetivo de rango 5 recibe más de
200 min. **Casi nunca corta.** El tope emergente real lo produce la escasez de *plazas de
colocación* (capacidad diaria × tope de 3 temas/día), y cae **entre 8 y 10 objetivos**.

**Hallazgo 2 — el efecto de Q6 es de umbral, no lineal.** En un día presencial, tras el
contacto diario de la #1: con 12 % quedaban 130 min (caben **2** bloques de 60); con 15 %
quedan 117 min (cabe **1**). Trece minutos cambian el día de dos sesiones de foco a una.
**Eso valida la elección conservadora**: un día de oficina con 90 min de traslado no da
honestamente para dos sesiones profundas.

**Respuesta a la preocupación: Q6 no mata la regla de las prioridades bajas, la refuerza.** Al
quedarse los días laborables con una sola plaza de foco, los objetivos de rango bajo son
empujados hacia las jornadas holgadas (findes y días remotos), donde reciben bloques de
150–250 min. Es exactamente el patrón "largo e infrecuente" que pide el brief.

**Aun así se refuerza el mecanismo**, porque dependía de una propiedad emergente: se añade la
garantía de consolidación en bloques ≥90 min para objetivos de rango > 3, con sacrificio
explícito si no caben, y la propiedad de test **P13**.

---

## Q6 — texto original de la pregunta

**Por qué importa.** El colchón de fricción determina la capacidad y por tanto todo lo demás.
Un valor mal puesto hace que el sistema mienta en la dirección que más daño hace: si es bajo,
sobrecarga y el plan fracasa; si es alto, infravalora y el usuario lo percibe como pesimista.

**Supuestos actuales**, todos en `params` y por tanto ajustables sin tocar código:

| Parámetro | Valor inicial | Fundamento |
|---|---|---|
| Fricción base | ~~12 %~~ → **15 %** | Decidido: banda conservadora |
| Fricción por transición | ~~5 min~~ → **7 min** | Decidido: banda conservadora |
| Bloque mínimo útil de foco | 60 min | **Del brief** |
| Bloque largo (rango > 3) | **90 min** | Nuevo, ADR-015 |
| Contacto diario de la #1 | 30 min | Confirmado |
| Buffer semanal | 2 × 60 min | Suposición |
| Captura/admin | 5 × 30 min | Suposición |
| Revisión semanal | 45 min | Suposición |
| Planeación de la siguiente | 30 min | Suposición |

**Lo que necesito.** Saber si alguno de estos tiene un valor "correcto" desde la experiencia
del usuario, especialmente el contacto diario: 15, 30 y 60 minutos dan productos distintos.

---

## Q7 — ¿Cómo se captura la línea base de la métrica de éxito? ✅ Resuelta

> **Respuesta (2026-07-28): opción (c) con (a) opcional.** Tendencia propia desde el día uno,
> más una pregunta retrospectiva **opcional** de línea base. Confirma el supuesto.
>
> Es la misma lógica con la que se difiere la recalibración: **se captura el dato irreversible,
> se difiere la funcionalidad de comparación.** No se retrasa el valor una semana (opción b)
> para obtener una línea base que además tendría sesgo de memoria.



**Por qué importa.** La métrica principal es "tareas y objetivos cerrados por semana **frente
a la línea base antes de usar el producto**". Esa línea base no existe en ningún sitio, y sin
ella la métrica es incalculable desde la primera semana.

**Opciones.**
- (a) Una pregunta retrospectiva en la entrevista ("¿cuántas cosas cerraste la semana
  pasada?"). Barata, con sesgo de memoria, disponible desde el minuto uno.
- (b) Semana 0 de observación: se planifica pero se mide sin comparar. Honesta, retrasa el
  valor una semana.
- (c) Renunciar a la línea base y medir solo la tendencia propia.

**Supuesto actual.** (c) con opción de (a): se mide la tendencia semanal desde el principio y
se ofrece una pregunta opcional de línea base. Razón: (b) contradice el espíritu de dar valor
pronto, y una línea base con sesgo de memoria puede ser peor que ninguna.

---

## Q8 — Retención del historial de versiones ✅ Resuelta

> **Respuesta (2026-07-27): diseñar contra RGPD como techo**, sin cerrar mercados.
>
> **No confirmó el supuesto: obligó a cambiar el modelo de datos.** El punto de fricción no
> resultó ser el que parecía. La inmutabilidad de las versiones y el derecho de supresión
> **no se contradicen**: la inmutabilidad es una invariante *de aplicación* (el motor asume
> que una versión no cambia bajo sus pies), no de almacenamiento, y no hay requisito legal de
> conservar planes. La regla es *inmutable mientras existe, borrable en su totalidad*.
>
> El problema real estaba un nivel más abajo: **las narrativas se persistían como texto ya
> redactado con los títulos embebidos** (`sacrifices.narrative`, `plan_diffs.headline`). Al
> borrar un objetivo, su título sobrevivía dentro de texto libre en tablas históricas, y
> limpiarlo exigía buscar y reescribir cadenas. Ahora se guardan como plantilla + parámetros
> con referencias por id, y se redactan al leer.
>
> Era además una **inconsistencia del diseño original**: los hallazgos del diagnóstico ya
> viajaban como código + evidencia con la interfaz redactando; las narrativas no seguían esa
> regla. Beneficio colateral: la i18n del histórico (Q10) sale casi gratis.
>
> Detalle completo en [ADR-014](./adr/ADR-014-cumplimiento-rgpd.md).

**Por qué importa.** El historial de versiones es lo que da valor al diff y a "volver a una
versión anterior", pero acumula datos personales indefinidamente, lo que roza con la
minimización que exige el brief.

**Supuesto actual.** Se conservan todas las versiones; purga automática de las no activas con
más de 12 meses. Configurable por el usuario.

**Lo que necesito.** ¿Hay algún requisito de cumplimiento aplicable (RGPD por usuarios en la
UE, LFPDPPP en México) que fije un plazo? Cambia la política y posiblemente el hosting.

---

## Q9 — Presupuesto para LLM ✅ Resuelta

> **Respuesta (2026-07-28): coste variable cero en el primer entregable.** Formulario
> progresivo y explicaciones por plantilla. Confirma el supuesto. **No cierra la puerta**: la
> frontera de [ADR-004](./adr/ADR-004-motor-determinista-vs-llm.md) permite añadir los dos
> bordes más adelante sin tocar el motor.



**Por qué importa.** Determina si la entrevista conversacional y la redacción con LLM llegan a
existir. El diseño las trata como opcionales precisamente por esta incertidumbre
([ADR-004](./adr/ADR-004-motor-determinista-vs-llm.md)), pero conviene saberlo antes de
diseñar la interfaz de la entrevista, que se ve distinta en cada caso.

**Supuesto actual.** Coste variable cero en el primer entregable: formulario progresivo y
explicaciones por plantilla. El LLM se añade después si hay presupuesto.

---

## Q10 — Idioma e internacionalización ✅ Resuelta

> **Respuesta (2026-07-28): solo es-MX visible, con la capa de traducción presente desde el
> día uno.** Confirma el supuesto. Desde [ADR-014](./adr/ADR-014-cumplimiento-rgpd.md) el
> histórico también es traducible, porque las narrativas dejaron de persistirse redactadas.



**Supuesto actual.** Español (es-MX) como único idioma, pero **todo el copy pasa por una
función de traducción desde el primer día**. El coste ahora es de horas; el retrofit
posterior es de días.

Lo que **no** se difiere en ningún caso: zonas horarias correctas e inicio de semana
configurable. Eso entra completo.

---

## Q11 — ¿El plan se genera para toda la ventana o solo hasta el próximo evento estructural? ✅ Resuelta

> **Respuesta (2026-07-28): se planifican los 14 días completos.** Confirma el supuesto, pero
> **con un argumento mejor que el que yo tenía**, y conviene registrarlo porque cambia la
> categoría de la decisión:
>
> No es una preferencia de producto, es **consecuencia de una regla innegociable**. Si el plan
> se cortara en el viaje, el sistema **no podría detectar que un deadline posterior al viaje
> es inalcanzable**, y callaría en vez de declararlo — incumpliendo la regla nº6 del brief
> ("un plan imposible se declara imposible"). La detección de inviabilidad exige mirar toda la
> ventana, incluidos los días al otro lado del hueco.



Duda menor de producto: si un usuario tiene un viaje dentro de 5 días y la ventana es de 14,
¿se planifican los 14 días o solo hasta el viaje?

**Supuesto actual.** Se planifican los 14, tratando el viaje como una anulación de
disponibilidad. Los días posteriores al viaje se planifican con la información disponible y se
replanifican al volver.

---

## Q12 — ¿Cuántas personas van a construir esto, y hay plazo objetivo? ✅ Resuelta

> **Respuesta (2026-07-27): una persona, sin plazo externo.** La disponibilidad de horas
> quedó pendiente en su momento y se **confirmó el 2026-07-28 en 10–20 h semanales**, que es
> la franja para la que el plan de fases está dimensionado: ni ADR-001 ni el alcance de
> ADR-009 cambian.
>
> **ADR-001 se reexaminó de verdad, no se ratificó por inercia** — el antecedente del
> argumento a favor de Next.js ("menos piezas para quien trabaja solo") acababa de
> confirmarse. **Se mantiene Fastify + React/Vite**, por tres razones que no estaban
> articuladas antes: (1) las fases 1–5 son paquetes puros agnósticos al shell HTTP, así que
> el ahorro aplica a la parte minoritaria del trabajo; (2) `app.inject()` de Fastify da tests
> de integración HTTP en proceso, y trabajando solo eso pesa más porque **el test incómodo es
> el que no se escribe** —y son los tests que protegen las reglas innegociables; (3) el
> modelo de caché de Next.js es un impuesto justo donde hay requisitos precisos de cabeceras
> para los feeds `.ics`. Ver [ADR-001] §5.
>
> **Sobre la disponibilidad:** la decisión se tomó siendo robusta en ambos escenarios, y al
> confirmarse en 10–20 h semanales no requirió revisión. Si en la práctica cayera, la palanca
> correcta no sería cambiar de framework (ahorra días) sino recortar variantes del alcance
> (ahorra semanas).
>
> **Efecto en el plan de fases:** el orden se mantiene y queda reforzado —sin plazo, el único
> argumento para alterarlo (necesitar demo temprana) desaparece. Pero el riesgo cambia de
> naturaleza: pasa de "no llegar a la fecha" a **abandono por falta de recompensa visible**,
> el modo de fallo típico del proyecto personal largo. Mitigación añadida a la fase 3: un
> comando que renderiza el diagnóstico de un fixture en texto legible, media jornada de
> trabajo que adelanta la primera recompensa varias fases. Se simplifican además los entornos
> de previsualización por rama, que sin revisiones cruzadas aportan poco.
>
> [ADR-001]: ./adr/ADR-001-stack-y-monorepo.md

**Por qué importa.** Es la incógnita que estaba escondida dentro de Q1 y que su respuesta no
resolvió. Condiciona tres cosas concretas:

1. **La elección de stack de [ADR-001].** Fastify + React/Vite frente a Next.js se decidió por
   margen estrecho, y el argumento más fuerte a favor de Next.js era "menos piezas para una
   persona sola". Si el equipo son 3+ personas, el margen se ensancha a favor de lo elegido;
   si es una persona con poco tiempo, merece reconsiderarse. Es reversible, pero es más barato
   decidirlo antes de la fase 0.
2. **Las duraciones del plan de fases**, que hoy son relativas por no conocer este dato.
3. **Si conviene reordenar las fases.** El orden actual (núcleo temporal primero, nada
   demostrable hasta la fase 4) es correcto para minimizar riesgo técnico, pero exige
   tolerancia a no ver producto durante un tiempo. Con un plazo externo o con necesidad de
   enseñar avances pronto, habría que negociar ese orden explícitamente — y sería una
   conversación sobre qué riesgo se acepta a cambio.

**Supuesto actual.** Una persona (posiblemente tú), sin plazo externo, con disponibilidad
desconocida. Es el supuesto de [ADR-001] y de [05](./05-plan-de-implementacion.md).

**Lo que necesito saber.** Número de personas, y si hay una fecha objetivo o una demo
comprometida con alguien.

[ADR-001]: ./adr/ADR-001-stack-y-monorepo.md

---

## Q13 — ¿El turno rotativo real está alineado con la semana civil o no? ✅ Resuelta

> **Respuesta (2026-07-29): DESALINEADO de la semana civil.** **No confirmó el supuesto**, que
> trataba las dos fixtures como equivalentes y dejaba la de 7 días como caso principal.
>
> **Consecuencias, en orden de importancia:**
>
> 1. **La fixture representativa pasa a ser la de ciclo desalineado**; la de 4×3 (7 días) se queda
>    como el caso que nombra el brief, no como el caso de referencia.
> 2. **La demo de la fase 3 cambia de patrón.** Decía "fixture de enfermera con turnos 4×3", que
>    es el patrón alineado: habría enseñado ocho semanas idénticas, es decir algo que un
>    calendario semanal ordinario también sabe enseñar. Siendo la **primera recompensa visible**
>    del proyecto, enseñar precisamente lo que no nos distingue era el peor error posible ahí.
>    Corregido en [05](./05-plan-de-implementacion.md).
> 3. **La justificación de `CYCLE` en [ADR-005](./adr/ADR-005-recurrencia-y-excepciones.md) deja
>    de apoyarse en un caso hipotético.** El ADR descarta "solo RRULE" porque los turnos con
>    *"ciclo desfasado de la semana civil"* exigirían reglas artificiales con offsets calculados;
>    hasta hoy el único ejemplo desalineado del documento era el 2-2-3, que nadie había
>    confirmado. Ahora hay un caso real. **Ninguna decisión cambia**, así que se anota como nota
>    fechada dentro del ADR y no con un ADR de reemplazo — mismo mecanismo que la confirmación de
>    disponibilidad en ADR-001.
>
> **Lo que la respuesta NO fija: la longitud exacta del ciclo.** La opción elegida agrupaba varios
> patrones ("2-2-3, 8 días…"), así que está confirmado el *hecho* (desalineado) y no el *número*.
> Los criterios de aceptación de las fases 1 y 3 usan 8 días porque es el ciclo con el que la
> aserción es más fuerte —periodo de exactamente 8 semanas, así que las ocho salen distintas y la
> novena repite la primera— no porque sea el turno de nadie. **Si la fixture tiene que retratar un
> turno real, falta ese dato**; está anotado como tal en el reporte y en la fase 3.

**Por qué importaba.** Al contrastar los candidatos de expansión contra el criterio de aceptación
de la fase 1 apareció que ese criterio era **insatisfacible**: pedía que un 4×3 produjera semanas
civiles distintas entre sí, y 4 + 3 = 7, así que el ciclo está alineado con la semana y las ocho
semanas salen **idénticas** con cualquier ancla. Corregido en el
[05](./05-plan-de-implementacion.md) añadiendo una fixture de ciclo de 8 días, que sí desalinea.
Lo que no puedo decidir yo es **cuál de las dos es la fixture representativa**, y de eso depende:

1. La demo de la fase 3 ("fixture de enfermera con turnos 4×3"), que es la primera recompensa
   visible del proyecto. Si el turno real está alineado con la semana, la demo enseña un patrón
   que un calendario semanal ordinario también sabría enseñar, y el argumento de valor se debilita.
2. La frase de [ADR-005](./adr/ADR-005-recurrencia-y-excepciones.md) que justifica el generador
   `CYCLE` por *"ciclo desfasado de la semana civil"*. Sigue siendo cierta para el 2-2-3 de 14
   días que el mismo ADR nombra, así que **la decisión no está en riesgo**; pero el ejemplo con el
   que se ilustra sí es engañoso.

**Supuesto actual.** Se implementan y prueban **las dos**: la de 7 días porque es el caso que
nombra el brief, y la de 8 porque es la que carga la aserción de semanas distintas. Coste de
mantener ambas: una fixture más, despreciable.

**Si la respuesta es "mi turno real es de 7 días, alineado":** no cambia nada del código, pero
conviene cambiar la demo de la fase 3 a un patrón desalineado o a un caso con excepciones, porque
un 4×3 alineado no demuestra lo que el proyecto presume de resolver.

---

## Q14 — ¿Algún compromiso real necesita "el tercer martes de cada mes"? ✅ Resuelta

> **Respuesta (2026-07-29): no, ninguno.** Confirma el supuesto de
> [ADR-018](./adr/ADR-018-expansion-de-recurrencia-sin-rrule.md) §3 sin cambios: el validador
> sigue rechazando `BYDAY` con prefijo numérico (`3TU`, `-1FR`) y `BYSETPOS` con un error que
> nombra la propiedad. **La fase 1 no crece**, y el expansor de la etapa 1 se queda sin ningún
> camino de selección posicional, que era la mitad de su coste.
>
> Queda como puerta abierta y barata: el día que aparezca un compromiso así, es un ADR que
> reemplaza a ADR-018 y ~50 % más de trabajo en la parte `RRULE` de la fase 1. No toca el modelo
> de datos ni ninguna puerta de una sola dirección.

**Por qué importaba.** [ADR-018](./adr/ADR-018-expansion-de-recurrencia-sin-rrule.md) §3 enumera el
subconjunto de `RRULE` y **rechaza `BYDAY` con prefijo numérico** (`3TU`, `-1FR`) y `BYSETPOS`.
Esa exclusión es la mitad del coste de implementar la expansión: es el único caso que exige
selección posicional dentro de un periodo. Ningún caso del brief lo pide, pero es un patrón real
(reunión mensual de equipo, junta, clase quincenal por posición).

**Supuesto actual.** No se soporta. El validador lo rechaza con un error que nombra la propiedad,
así que el fallo es explícito y no un plan silenciosamente equivocado.

**Si la respuesta es "sí, tengo uno":** hay que añadir la selección posicional al expansor de la
etapa 1 y **reabrir la enumeración con un ADR que reemplace a ADR-018** (no se edita). Trabajo
estimado: la parte de `RRULE` de la fase 1 crece en torno a un 50 %, más fixtures. No afecta al
modelo de datos ni a ninguna puerta de una sola dirección: `rrule_text` ya es texto libre
validado. Barato de decidir ahora, caro de descubrir en la fase 6 con la entrevista escrita.

---

## Cómo responder

**Resueltas (6), todas el 2026-07-27:**

| | Respuesta | ¿Confirmó el supuesto? |
|---|---|---|
| Q1 | SaaS multiusuario | Sí |
| Q4 | Tope 3, el contacto diario consume plaza | Sí |
| Q5 | Ranking completo, tope emergente | Sí |
| Q12 | Una persona, sin plazo externo | Sí — ADR-001 reexaminado y confirmado |
| **Q2** | Marcado explícito del anclaje | **No** — el enum pasó a tres valores |
| **Q8** | RGPD como techo | **No** — cambió el esquema de narrativas |

**Resueltas el 2026-07-28 (6):**

| | Respuesta | ¿Confirmó el supuesto? |
|---|---|---|
| Q3 | Ventana rodante de 14 días | Sí |
| Q7 | Tendencia propia + línea base opcional | Sí |
| Q9 | Coste variable cero; LLM sin fecha | Sí |
| Q10 | Solo es-MX, capa de traducción presente | Sí |
| Q11 | 14 días completos | Sí, con mejor argumento (regla nº6) |
| **Q6** | Fricción 15 % + 7 min | **No** — y destapó un error en Q5 |

**Resueltas el 2026-07-29 (2):**

| | Respuesta | ¿Confirmó el supuesto? |
|---|---|---|
| **Q13** | Turno rotativo **desalineado** de la semana civil | **No** — cambia la fixture representativa y el patrón de la demo de la fase 3 |
| Q14 | Sin `BYDAY` posicional | Sí — ADR-018 §3 se mantiene, la fase 1 no crece |

## Las 14, y qué dejaron

De las 14, **cinco no confirmaron el supuesto** y cada una dejó rastro en el diseño:

| | Qué cambió |
|---|---|
| Q2 | El enum de anclaje pasó de 2 a 3 valores (`SUSPEND_WHEN_AWAY`) |
| Q8 | Tres tablas dejaron de persistir narrativas redactadas → [ADR-014] |
| Q6 | Fricción conservadora → [ADR-015] |
| Q6 (efecto colateral) | **Corrigió una afirmación falsa de Q5** sobre el tope emergente |
| Q13 | La fixture representativa del turno rotativo pasa a ser un ciclo desalineado, y con ella el patrón de la demo de la fase 3 |

Ese último es el argumento a favor de haber escrito este documento: la pregunta que parecía
menor —unos parámetros numéricos— fue la que obligó a correr los números y destapó que un
mecanismo del motor no producía el efecto que le había atribuido. **Se corrigió antes de
escribir una línea de código.**

**La fase 0 puede arrancar.** Este documento deja de ser una lista de bloqueos y pasa a ser el
registro de por qué el diseño es como es.

> **Y sigue trabajando.** El 2026-07-29, ya con la fase 0 cerrada, el mismo mecanismo destapó que
> el criterio de aceptación del turno rotativo de la fase 1 **no podía cumplirse**: un 4×3 es un
> ciclo de 7 días y produce semanas civiles idénticas. Lo encontró el intento de contrastar tres
> candidatos de implementación contra un criterio concreto, no una revisión general. Es el
> argumento para seguir escribiendo criterios de aceptación con fechas y números en lugar de
> descripciones.
>
> Y la respuesta a Q13, el mismo día, mostró que **el error se había propagado**: la demo de la
> fase 3 —la primera cosa que el proyecto enseña— usaba el mismo patrón alineado, así que habría
> presentado ocho semanas idénticas como prueba de que el modelo no es una semana plantilla. Un
> ejemplo mal elegido no se queda quieto en el documento donde nació.

[ADR-014]: ./adr/ADR-014-cumplimiento-rgpd.md
[ADR-015]: ./adr/ADR-015-parametros-de-calibracion.md
