# ADR-014: RGPD como techo de cumplimiento; narrativas estructuradas en lugar de texto redactado
Estado: aceptado (2026-07-28)
Fecha: 2026-07-27
Responde a la pregunta abierta Q8.
**Parcialmente irreversible:** el cambio de narrativas afecta a datos ya escritos.

## Contexto

Q8 preguntaba qué régimen de protección de datos aplica. La respuesta del usuario el
2026-07-27 fue: **"aún no lo sé: diseñar contra el estándar más estricto (RGPD)"**, sin cerrar
mercados por adelantado.

Esto llega después de que Q1 confirmara **SaaS multiusuario**, así que habrá datos personales
de terceros y las obligaciones son reales, no hipotéticas.

El sistema ya partía de una posición fuerte: [ADR-011] excluye por completo los datos de
salud, lo que lo mantiene fuera de las categorías especiales del art. 9 —el régimen más
exigente— sin esfuerzo adicional. Lo que faltaba era revisar el resto: supresión,
portabilidad, plazos, alojamiento y qué hay que poder demostrar.

## Decisión

**Se diseña contra RGPD como techo.** Cinco consecuencias concretas.

### 1. Las narrativas no se persisten redactadas *(esto cambia el esquema)*

Afecta a **tres** tablas —`sacrifices`, `plan_diffs` e `infeasibility_reasons`— que
persistían texto ya redactado con los títulos de objetivos embebidos dentro:

```sql
-- ANTES                              -- DESPUÉS
sacrifices.narrative           text   sacrifices.narrative_code            text
plan_diffs.headline            text   sacrifices.narrative_params          jsonb
infeasibility_reasons.narrative text  plan_diffs.headline_code             text
                                      plan_diffs.headline_params           jsonb
                                      infeasibility_reasons.narrative_code   text
                                      infeasibility_reasons.narrative_params jsonb
```

Los parámetros referencian entidades **por id, nunca por título**. La redacción ocurre al
leer.

### 2. Inmutabilidad y derecho de supresión se reconcilian así

> La inmutabilidad de `plan_versions` es una invariante **de aplicación**, no de
> almacenamiento. **Inmutable mientras existe; borrable en su totalidad.**

Lo prohibido es *modificar* una versión conservándola. Borrar el agregado completo siempre
está permitido.

### 3. Plazos de retención explícitos

Definidos en [02 §10](../02-modelo-de-datos.md). Lo nuevo respecto al diseño original: purga
de cuentas inactivas (aviso a 24 meses, borrado a 30) y declaración honesta de que el borrado
se completa cuando rota la última copia de seguridad (≤30 días).

### 4. La región de alojamiento se elige por latencia, no por cumplimiento

**RGPD no exige alojar en la UE.** Exige base legal, minimización, derechos ejercitables,
plazos, contratos con los encargados y notificación de brechas — todo independiente de la
ubicación. Las transferencias internacionales se cubren con las cláusulas contractuales del
proveedor. Por tanto se elige la región **más cercana al mercado inicial**, y se revisará solo
si aparece un requisito de residencia de datos (cliente empresarial o sector regulado).

### 5. Lo que hay que poder demostrar

- Registro de actividades de tratamiento (documento).
- Contratos de encargado con PaaS, base de datos y proveedor de correo.
- Que los derechos funcionan: `GET /me/export` y `DELETE /me` **con tests que lo prueben**.
- Política de privacidad con la base legal declarada.
- Procedimiento de notificación de brechas en 72 h.

## Alternativas consideradas

**Esperar a conocer el mercado y cumplir después.**
A favor: no se paga por requisitos que quizá no apliquen. En contra: **el retrofit de
supresión sobre datos ya escritos es exactamente el problema caro.** Si las narrativas se
persisten redactadas durante seis meses, limpiarlas exige reescribir texto libre en tablas
históricas, de forma incompleta y frágil. Se descarta: el coste de anticiparse es un cambio de
esquema hoy; el de no hacerlo es una migración de datos con riesgo de dejar rastros.

**Cumplir solo la ley mexicana (LFPDPPP), por ser la del mercado probable.**
A favor: menos exigente en plazos y en derecho de supresión. En contra: cierra el mercado
europeo, y adaptar después es más caro que diseñarlo así desde el principio. El usuario pidió
explícitamente el techo. Se descarta.

**Alojar en la UE por precaución.**
A favor: elimina la cuestión de las transferencias internacionales. En contra: **se apoya en
una creencia errónea** —que RGPD obliga a alojar en la UE— y penaliza con latencia permanente
a un mercado inicial que probablemente sea LATAM. Se descarta a favor de elegir por latencia y
cubrir las transferencias contractualmente.

**Cifrado a nivel de campo y seudonimización.**
A favor: reduce el impacto de una brecha. En contra: son defensas proporcionadas a datos de
categoría especial, que este sistema **no tiene** gracias a [ADR-011]. Impedirían consultar y
añadirían gestión de claves. Se descarta por desproporción, igual que en [ADR-011].

**Anonimizar en lugar de borrar** (conservar las versiones con los objetivos anonimizados).
A favor: preserva las estadísticas agregadas. En contra: la anonimización real es difícil de
garantizar con datos de agenda —los patrones horarios son altamente identificativos— y una
"anonimización" que no lo es de verdad sigue siendo dato personal, con la agravante de creer
que no lo es. Se descarta: borrar es más honesto y más simple.

## Consecuencias

**Lo que ganamos**
- El derecho de supresión funciona **a cualquier granularidad** sin dejar rastros en texto
  libre.
- Se corrige una **inconsistencia del diseño original**: [04 §5](../04-contratos-api.md) ya
  establecía que los hallazgos del diagnóstico viajan como código + evidencia y que la
  interfaz redacta. Ese principio no se había aplicado a las narrativas de sacrificio, que sí
  se persistían redactadas. Ahora el sistema es coherente.
- **La internacionalización sale casi gratis** (Q10): con narrativas estructuradas, traducir
  el histórico es cambiar la plantilla, no migrar datos. No era el objetivo y es un beneficio
  real.
- Ningún mercado queda cerrado.
- El art. 22 (decisiones automatizadas) queda cubierto sin trabajo extra: la explicación de
  cada colocación y la regla nº7 del brief —el usuario siempre puede sobrescribir al motor—
  son literalmente la explicabilidad y la intervención humana que exige. Requisitos de
  producto que resultan cumplir un requisito legal.

**Lo que cuesta**
- **Redactar al leer es más trabajo en cada lectura** y obliga a resolver referencias que
  pueden apuntar a entidades borradas. Hay que manejar el caso "(objetivo eliminado)" en la
  interfaz, y no es solo cosmético: un diff histórico con la mitad de los nombres borrados es
  menos útil. Es el precio del derecho de supresión.
- Las plantillas de narrativa pasan a ser un artefacto versionado: cambiar una cambia cómo se
  lee el histórico. Hay que tratarlas con el cuidado de un contrato.
- Trabajo de cumplimiento que no es código: registro de tratamientos, contratos, política de
  privacidad, procedimiento de brechas. Para una persona sola es tiempo real que no produce
  producto.
- La purga de cuentas inactivas es un trabajo programado más, con el riesgo asociado a todo
  borrado automático. Necesita aviso previo y test.

**Lo que queda condicionado**
- El esquema de `sacrifices` y `plan_diffs` en [02 §6](../02-modelo-de-datos.md).
- Los contratos de API que devolvían `narrative` y `headline` ya redactados
  ([04 §6](../04-contratos-api.md)).
- La fase 9 del plan incorpora los entregables de cumplimiento.
- **Guardrail nuevo:** ningún campo de texto persistido puede contener un título copiado de
  otra entidad. Es verificable y va a [07](../07-convenciones-propuestas.md).
- Si aparece un requisito de residencia de datos, se revisa la región de [ADR-012].

[ADR-011]: ./ADR-011-privacidad-por-diseno.md
[ADR-012]: ./ADR-012-estrategia-de-despliegue.md
