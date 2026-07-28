# 00 — Visión y alcance

Fecha: 2026-07-24 · Última verificación: 2026-07-28
Estado: **aceptado**. Las 12 preguntas de [06](./06-preguntas-abiertas.md) están resueltas y
los 15 ADRs aceptados. **No queda nada bloqueante: la fase 0 puede arrancar.**

---

## 1. El problema, en una frase

La persona no necesita un calendario: necesita que alguien le diga **por qué su semana no
funciona** y **qué tiene que soltar** para que funcione. El calendario es la consecuencia,
no el producto.

De ahí se deriva la tesis arquitectónica central de este diseño:

> El artefacto de mayor valor no es el plan. Es el **diagnóstico** y el **registro de
> intercambios**. El plan es su representación en el tiempo.

Esto tiene consecuencias concretas y no cosméticas:

- El **diagnóstico es un subsistema de primera clase**, no un panel derivado del plan. Se
  puede calcular sin haber generado un solo bloque, y se entrega antes.
- El **diff entre versiones del plan es dato persistido**, no una vista calculada al vuelo.
  Contiene la narrativa del sacrificio, que solo el motor conoce en el instante de decidir.
- El motor debe ser capaz de **negarse a producir un plan** y eso es un camino de éxito del
  sistema, no un error.

## 2. Decisiones de producto que condicionan la arquitectura

Estas son lecturas del brief que se convierten en restricciones técnicas. Si alguna es una
mala lectura, hay que corregirla ahora, porque varias son puertas de una sola dirección.

| # | Decisión de producto | Consecuencia arquitectónica |
|---|---|---|
| P1 | La capacidad se calcula, nunca se pregunta | No existe campo `horas_disponibles`. La capacidad es **siempre** una función derivada de la línea de tiempo. Es salida del motor, jamás entrada de usuario. |
| P2 | Ningún intercambio es silencioso | El protocolo de la API impide activar una versión sin haber emitido su diff. La regla se hace cumplir en el contrato, no en la UI. |
| P3 | El sacrificio sigue el ranking ordinal | El motor produce una **traza de decisión estructurada** durante la colocación. La explicación se redacta desde la traza, nunca se reconstruye a posteriori. |
| P4 | Un plan imposible se declara imposible | `INFEASIBLE` es un estado terminal legítimo de una versión de plan, con su evidencia. No es una excepción. |
| P5 | El usuario siempre puede sobrescribir | Las sobrescrituras son entidades persistidas que se reinyectan al motor como restricciones en la siguiente generación. |
| P6 | Prohibido solicitar, registrar o inferir información médica | Ver §5. Elimina campos completos del modelo y obliga a un normalizador en el borde de entrada. |
| P7 | No obligar a migrar de calendario | El sistema **nunca escribe** en el calendario del usuario. Publica en un calendario propio y separado. Esto elimina de raíz toda una clase de conflictos de sincronización. |
| P8 | No llenar cada minuto | La capacidad asignable tiene un techo por debajo del 100 %. El colchón de fricción y el buffer no son opcionales ni recortables por el optimizador. |

## 3. El corte del primer entregable funcional

### 3.1 El criterio del corte (esto es lo que hay que discutir, no la lista)

Había dos formas de recortar:

- **(A) Amputar el flujo**: entregar entrevista + diagnóstico, y dejar el motor para después.
- **(B) Amputar el espacio de variantes**: entregar el flujo completo sobre menos casos.

**Se elige (B).** Razones:

1. Amputar el flujo rompe la tesis del producto. Sin replanificación no hay "intercambio
   explícito", que es la regla de negocio diferenciadora. Un MVP sin ella valida un
   diagnóstico bonito y nada más.
2. El riesgo técnico del proyecto está **concentrado en el motor**. Un MVP que lo posterga
   posterga el aprendizaje del único punto donde el proyecto puede fracasar.
3. Amputar variantes solo reduce el mercado inicial. Es reversible.

Y dentro de (B), el criterio de qué variante entra es:

> **Entra toda variante que fuerce la forma correcta del modelo temporal. Se difiere toda
> variante que solo añada superficie de UI, integraciones o volumen de datos.**

Esto es contraintuitivo pero es lo que protege el proyecto: si difiero turnos rotativos y
cronotipos nocturnos, el modelo temporal degenera en "semana plantilla de 9 a 5" y el brief
lo prohíbe explícitamente. Reintroducirlos después sería una reescritura del núcleo, no una
funcionalidad nueva.

### 3.2 Entra en el primer entregable

**Flujo completo**: entrevista → capacidad → diagnóstico → plan → export `.ics` →
seguimiento → revisión semanal → replanificación con diff.

**Variantes de la §5 del brief incluidas:**

| Variante | Por qué entra |
|---|---|
| Horario fijo / remoto / híbrido con días variables | Fuerza recurrencia + excepciones a la recurrencia. Base del modelo. |
| Múltiples empleos simultáneos | Cae solo si el modelo es correcto: son N compromisos fijos con distinto `imposedBy`. Coste marginal ≈ 0. Si costara, el modelo estaría mal. |
| **Turnos rotativos / semanas que no se repiten** | **Crítico.** Es la variante que mata el modelo "semana plantilla". Valida el generador de recurrencia cíclica. |
| Freelance sin horario impuesto | Caso degenerado (poca restricción, mucha capacidad). Valida que el motor **no llene** el día — anti-requisito nº1. |
| Persona que imparte clases / servicios | Valida el modelo de coste energético con arrastre posterior, que condiciona qué se puede agendar después de un bloque pesado. |
| **Cronotipo nocturno (pico 22:00–01:00)** | **Crítico.** Valida la jornada como ciclo de vigilia y la aritmética del sueño cruzando medianoche. |
| **Compromisos fijos con fecha de término** | **Crítico.** La reasignación automática del hueco liberado a la prioridad más alta es una regla distintiva del brief. |
| Objetivos continuos vs. proyectos; deadlines duros vs. suaves | Es el modelo de objetivo. No es separable. |
| Tareas con ventana externa obligatoria | Regla de colocación de primer orden en §4 del brief ("se colocan primero"). |
| Tareas bloqueadas por terceros | Regla de §4, coste bajo, cambia la clase de bloque asignado. |
| Semanas atípicas (viaje, vacaciones, visitas) **sin cambio de zona horaria** | Se modelan como anulación de disponibilidad en un intervalo. Barato y frecuente. |
| Días de energía reducida | Es la vía *privacy-safe* para las restricciones derivadas de salud. Ver §5. |
| **Cambio a mitad de semana → replanificación parcial** | **Crítico.** Es lo que sostiene la regla "ningún intercambio es silencioso". |
| Tareas de aparición súbita con urgencia real | Es el disparador natural de la replanificación parcial. |
| Búsqueda activa de empleo | No requiere nada nuevo: objetivo con deadline + contacto diario + bloques reactivos. Sirve como escenario de aceptación. |

### 3.3 Se difiere explícitamente

| Diferido | Justificación | Coste asumido |
|---|---|---|
| Sync bidireccional con Google/Microsoft Calendar | OAuth + webhooks + reconciliación de conflictos es un subsistema entero. El export `.ics` y el feed de suscripción cubren la salida. | Fricción de onboarding: el usuario carga su disponibilidad manualmente o importando un `.ics` una vez. Es real y hay que decirlo. |
| **Cambio temporal de zona horaria por viaje** | La variante de menor frecuencia y mayor complejidad de lógica. | **El modelo de datos SÍ la soporta desde el día uno** (zona por entidad + tabla de overrides). Diferimos la lógica y la UI, no el esquema: cambiar el esquema después sería una migración destructiva. |
| Compromisos compartidos / coordinación entre dos agendas | Introduce multi-tenancy, permisos y negociación entre planes. Es prácticamente otro producto. | Se pierde el caso "planificar una boda entre dos". Aceptable. |
| **Recalibración automática** de estimaciones | Un aprendizaje sin datos es un generador de ruido con apariencia de inteligencia. | El MVP **registra** el cumplimiento y **muestra** la desviación en la revisión semanal; el ajuste lo decide el usuario. La captura de datos —que es la parte irreversible— entra desde el día uno. |
| Entrevista conversacional con LLM | El formulario progresivo es la fuente de verdad de todas formas; el LLM es un acelerador de entrada. | Onboarding más largo y menos seductor. |
| Estacionalidad / temporadas de alta carga | Es planificación a escala de meses; requiere un horizonte distinto al de la ventana de planificación. | Se cubre a mano marcando semanas atípicas. |
| Periodos de exámenes como concepto dedicado | Se aproxima con "semana atípica" + objetivo con deadline duro. | La ergonomía para estudiantes es peor. |
| Notificaciones / recordatorios | **Anti-requisito explícito.** No es un diferido: es un no permanente. | Ninguno. |
| App móvil nativa | Web responsive. | Ninguno relevante para validar la tesis. |
| i18n completa | Q10, resuelta el 2026-07-28: **solo es-MX visible**, con la capa de traducción presente desde el día uno. Se difiere la traducción, **no** el manejo correcto de zonas horarias ni el inicio de semana configurable. Desde [ADR-014] el histórico también es traducible, porque las narrativas ya no se persisten redactadas. | Producto en un solo idioma al principio. |

[ADR-014]: ./adr/ADR-014-cumplimiento-rgpd.md

### 3.4 La prueba de fuego del alcance

El primer entregable está bien cortado si estos tres escenarios funcionan de extremo a
extremo:

1. **Enfermera con turnos rotativos 4×3** que quiere estudiar una certificación con fecha de
   examen. El sistema debe generar semanas distintas entre sí y declarar si el examen no cabe.
2. **Freelance con cronotipo nocturno** (pico 22:00–01:00) con tres clientes y un objetivo
   personal. El sistema no debe favorecer al madrugador ni llenarle el día.
3. **Persona con un curso que termina el 30 de septiembre**. Al pasar esa fecha, el hueco
   liberado se reasigna solo, y el diff lo dice.

## 4. Lo que este sistema deliberadamente no es

- No es un gestor de tareas. La tarea existe porque el motor necesita estimar y colocar.
- No es un tracker de hábitos. No hay rachas, ni porcentajes de cumplimiento en portada.
- No es un coach. El copy es descriptivo y aritmético, nunca exhortativo.
- No es la fuente de verdad del calendario del usuario. Es un productor de propuestas que
  vive en su propio carril.

## 5. Privacidad por diseño: consecuencias concretas en el modelo

El brief prohíbe **solicitar, registrar o inferir** información médica. Esto no es una nota
legal: elimina campos del esquema y obliga a un componente que de otro modo no existiría.

**Consecuencia 1 — Campos que no existen y no se van a añadir.**
No hay `condicion`, `diagnostico`, `sintoma`, `medicacion`, `estado_animo`, `nivel_dolor`,
ni ningún campo de motivo asociado a una limitación de capacidad. Su ausencia es
intencional y debe documentarse en el esquema para que nadie los añada "por completitud".

**Consecuencia 2 — La limitación se expresa solo en la moneda del sistema: tiempo y energía.**
Un día de energía reducida es `CapacityModifier { intervalo, focusCapacity: NONE | REDUCED | NORMAL }`.
**No tiene campo de motivo.** Una cita médica recurrente es un `FixedCommitment` con
horario, transiciones y `negotiable = false`, y su título lo escribe el usuario, no el
sistema — el sistema nunca lo clasifica ni lo interpreta.

**Consecuencia 3 — El borde de entrada en lenguaje natural es el punto de fuga.**
En cuanto exista captura conversacional, el usuario escribirá *"los martes tengo diálisis"*.
Por eso el diseño incluye un **normalizador a restricción temporal**: el único resultado
persistible de esa frase es
`{ tipo: compromiso fijo, martes 10:00–13:00, negociable: false }`. La etiqueta clínica se
descarta antes de tocar el almacenamiento. Este componente existe **aunque la entrevista
conversacional esté diferida**, porque cualquier campo de texto libre lo necesita.

**Consecuencia 4 — Minimización activa.**
Los campos de texto libre existen solo donde son imprescindibles, **no se indexan para
búsqueda de texto completo**, y no se envían a proveedores externos (incluidos LLM) sin
consentimiento explícito por operación.

**Consecuencia 5 — Exportar y borrar todo es una funcionalidad, no una tarea de soporte.**
`GET /me/export` (JSON completo) y `DELETE /me` (borrado duro en cascada, con revocación de
feeds `.ics` publicados) entran en el primer entregable. Un feed de calendario huérfano tras
un borrado sería una fuga persistente.

## 6. Métricas: qué instrumentar desde el día uno

La métrica de éxito del brief no es el cumplimiento de bloques, y eso cambia qué se guarda.

| Métrica | Qué hay que capturar desde el principio |
|---|---|
| Objetivos/tareas cerrados por semana vs. línea base | Q7, resuelta el 2026-07-28: **se mide la tendencia propia desde el día uno**, más una pregunta retrospectiva **opcional** de línea base. Es la misma lógica que difiere la recalibración: se captura el dato irreversible, se difiere la comparación. Una línea base con sesgo de memoria puede ser peor que ninguna, y no se retrasa el valor una semana para obtenerla. |
| Dispersión (objetivos tocados por día) | Se deriva de `adherence_records` + `plan_blocks`. Nada extra. |
| Estabilidad del plan | Número de versiones por plan y motivo de cada una. Ya está en `plan_versions.reason`. |
| Retención en la revisión semanal | `weekly_reviews.completed_at`. Es la métrica de alerta temprana: si cae, el producto falló. |

Explícitamente **no** se instrumenta ni se muestra: porcentaje de bloques cumplidos como
métrica de portada, rachas, ni comparativas entre usuarios.

## 7. Documentos relacionados

- [01 — Arquitectura](./01-arquitectura.md)
- [02 — Modelo de datos](./02-modelo-de-datos.md)
- [03 — Motor de planificación](./03-motor-de-planificacion.md)
- [04 — Contratos de API](./04-contratos-api.md)
- [05 — Plan de implementación](./05-plan-de-implementacion.md)
- [06 — Preguntas abiertas](./06-preguntas-abiertas.md)
- [07 — Convenciones propuestas para CLAUDE.md](./07-convenciones-propuestas.md)
- [ADRs](./adr/README.md)
