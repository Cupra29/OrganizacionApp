# ADR-009: Alcance del primer entregable — flujo completo sobre un subconjunto de variantes
Estado: aceptado (2026-07-28)
Fecha: 2026-07-24
Responde a la decisión §10.6 del brief.

## Contexto

El brief describe una visión completa y muy amplia. Entregarla entera antes de validar nada
sería un error; entregar un recorte arbitrario también, porque hay recortes que destruyen la
tesis del producto y recortes que solo reducen su alcance.

Dos ejes posibles de recorte:

- **Eje A — amputar el flujo**: entregar entrevista y diagnóstico, dejar el motor para después.
- **Eje B — amputar el espacio de variantes**: entregar el flujo completo sobre menos casos.

## Decisión

**Recortar por el eje B: flujo completo de extremo a extremo sobre un subconjunto de
variantes.** Y dentro de ese eje, aplicar un criterio explícito:

> **Entra toda variante que fuerce la forma correcta del modelo temporal. Se difiere toda
> variante que solo añada superficie de interfaz, integraciones o volumen de datos.**

Consecuencia contraintuitiva y deliberada: **turnos rotativos, cronotipos nocturnos y
compromisos con fecha de expiración entran en el primer entregable**, pese a ser casos poco
frecuentes, porque son los que validan que el núcleo temporal es correcto.

La lista completa de lo que entra y lo que se difiere está en
[00 §3](../00-vision-y-alcance.md). Resumen de los diferimientos: sincronización bidireccional
de calendarios, viajes con cambio de zona horaria (esquema sí, lógica no), compromisos
compartidos entre dos personas, recalibración automática, entrevista conversacional,
estacionalidad y traducción.

## Alternativas consideradas

**Eje A: entrevista + diagnóstico primero, motor después.**
A favor: es el recorte más pequeño posible y el diagnóstico ya tiene valor propio según el
propio brief. En contra, dos razones decisivas:
1. **Rompe la tesis del producto.** Sin replanificación no hay "intercambio explícito", que es
   la regla nº2 y el verdadero diferenciador. Se validaría un diagnóstico bonito y nada más.
2. **Posterga el único riesgo que puede matar el proyecto.** Si el motor resulta inviable o
   produce planes malos, hay que saberlo pronto, no después de construir toda la interfaz
   encima.
Se descarta como recorte principal. Nótese que el plan de implementación **sí** entrega el
diagnóstico primero (fase 3), pero como hito interno dentro de un alcance que llega hasta la
replanificación — no como el producto final.

**Recortar variantes por frecuencia esperada** (quedarse con el empleado de oficina y diferir
lo raro).
A favor: es lo que haría la mayoría, y maximiza el mercado inicial por unidad de esfuerzo. En
contra, y es la razón central de este ADR: **produciría exactamente el sistema que el brief
prohíbe.** Sin turnos rotativos, el modelo degenera en semana plantilla; sin cronotipos
nocturnos, aparecen `if` que favorecen al madrugador. Reintroducirlos después no sería añadir
una funcionalidad: sería reescribir el núcleo y migrar los datos ya guardados. Se descarta.

**Entregarlo todo antes de exponerlo a nadie.**
Se descarta: retrasa el aprendizaje indefinidamente y las decisiones más inciertas (colchón de
fricción, contacto diario, umbrales de recalibración) solo se pueden resolver con datos reales.

**Prototipo desechable primero.**
A favor: aprendizaje rápido sobre la calidad de los planes. En contra: el riesgo real no es
"¿la idea funciona?" sino "¿el modelo temporal aguanta?", y un prototipo que ignora zonas
horarias y turnos rotativos no responde a esa pregunta. Un prototipo que sí las contempla ya
es la fase 1 del plan real. Se descarta por redundante.

## Consecuencias

**Lo que ganamos**
- El primer entregable **valida la tesis completa**: diagnosticar, planificar, mostrar el
  intercambio, seguir y replanificar.
- El modelo temporal queda probado contra los casos que lo tensionan, así que ampliar
  variantes después es añadir, no reescribir.
- Los tres escenarios de prueba de fuego ([00 §3.4](../00-vision-y-alcance.md)) son criterios
  de aceptación observables, no aspiraciones.

**Lo que cuesta**
- **El primer entregable tarda más que un MVP convencional.** Turnos rotativos y cronotipos
  nocturnos añaden trabajo en las fases 1 y 3–4 que un MVP típico se ahorraría.
- **Onboarding con fricción**: sin importación de calendario, la entrevista es más larga
  ([ADR-008]).
- **La recalibración no es automática** en el primer entregable; el brief la describe como
  parte del motor. Es el diferimiento más discutible y se acepta porque un aprendizaje con dos
  semanas de datos genera ruido con apariencia de inteligencia. La **captura** de datos —lo
  irreversible— sí entra.
- Se pierden casos de usuario completos: coordinación entre dos personas, viajes
  internacionales.

**Lo que queda condicionado**
- El orden de fases de [05](../05-plan-de-implementacion.md), que empieza por el núcleo
  temporal aunque no haya nada demostrable hasta la fase 4.
- Varios campos existen en el esquema con la lógica diferida (`timezone_overrides`,
  `fixed_commitments.anchor`). Es deliberado: son puertas de una sola dirección donde el coste
  de anticiparse es cero y el de no hacerlo es una migración.
- Q1 se resolvió el 2026-07-27 como **SaaS multiusuario**, así que el alcance descrito aquí
  queda firme: no se acorta por esa vía.

[ADR-008]: ./ADR-008-sincronizacion-calendarios.md
