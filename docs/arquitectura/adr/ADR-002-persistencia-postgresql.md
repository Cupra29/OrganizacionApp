# ADR-002: PostgreSQL con tipos de rango y constraints de exclusión; Drizzle como capa de acceso
Estado: aceptado (2026-07-28)
Fecha: 2026-07-24

## Contexto

El dominio es intensivamente **temporal e intervalar**: casi todas las consultas y todos los
invariantes hablan de rangos de tiempo que no deben solaparse. Las necesidades concretas:

- Garantizar **cero solapes** entre bloques de una misma versión del plan. Es un requisito de
  validación del brief, no una conveniencia.
- Garantizar un **orden total** en el ranking de objetivos (sin empates) y **una sola versión
  activa** por plan.
- Almacenar respuestas de entrevista **parciales y sin esquema fijo**, y trazas de decisión
  del motor.
- Transacciones fuertes: una versión de plan con sus bloques, presupuestos, sacrificios y
  diff se escribe entera o no se escribe.
- Volumen pequeño: miles de filas por usuario y año.

## Decisión

**PostgreSQL 16** como único almacén, explotando deliberadamente sus tipos avanzados:

- `timestamptz` para todo instante; `tstzrange` para todo intervalo.
- `btree_gist` + **constraints de exclusión** para hacer imposible persistir solapes:
  ```sql
  EXCLUDE USING gist (version_id WITH =, during WITH &&)
  ```
- **Índices únicos parciales** para el ranking sin empates y la versión activa única.
- `jsonb` para respuestas de entrevista, trazas y evidencia de hallazgos.

Capa de acceso: **Drizzle ORM**, con migraciones SQL versionadas en el repositorio.

## Alternativas consideradas

**SQLite.**
A favor: cero operaciones, y habría sido razonable si el producto fuera monousuario — Q1 se
resolvió el 2026-07-27 como **SaaS multiusuario**, así que ese argumento ya no aplica. En contra:
**no tiene tipos de rango ni constraints de exclusión**, así que "cero solapes" volvería al
código de aplicación, que es exactamente donde no quiero que esté. Ese único punto decide.

**MongoDB u otro documental.**
A favor: el versionado por instantánea encaja con documentos. En contra: no hay forma de
garantizar el no-solape ni la unicidad del ranking; las transacciones multi-documento son
posibles pero incómodas; y el modelo es marcadamente relacional. Se descarta.

**Prisma como ORM.**
Es la alternativa real a Drizzle. A favor: mejor ergonomía y ecosistema. En contra: **soporte
pobre de tipos exóticos de PostgreSQL**. `tstzrange` y las constraints de exclusión requerirían
SQL crudo y migraciones manuales, es decir, se perdería la ventaja de Prisma justo en la parte
del esquema que sostiene los invariantes del producto. Se descarta.

**SQL crudo con una biblioteca fina (`postgres.js`, Kysely).**
A favor: control total. En contra: se pierde el tipado del esquema, que en un dominio con
tantas tablas relacionadas es una red de seguridad valiosa. Drizzle es el punto medio: SQL
explícito y tipado.

**Event sourcing como almacenamiento primario.**
Ver [ADR-006]: se descarta por complejidad desproporcionada; el versionado por instantánea
cubre lo que exige el brief.

## Consecuencias

**Lo que ganamos**
- **Un plan inválido es imposible de persistir**, aunque el motor tenga un bug. La constraint
  de exclusión es la pieza de mayor relación valor/esfuerzo del esquema: dos líneas de DDL
  cubren un requisito de validación del brief.
- El ranking ordinal sin empates es un invariante de base de datos, lo que hace determinista
  la regla del sacrificio ordinal.
- `jsonb` permite guardar respuestas a medias sin migrar el esquema en cada pregunta nueva de
  la entrevista.

**Lo que cuesta**
- Los tests de integración necesitan PostgreSQL real (Testcontainers → Docker en CI y en
  local). Es una fricción diaria aceptada a cambio de probar los invariantes de verdad.
- Drizzle es más joven que Prisma; su documentación de tipos de rango es escasa y habrá que
  escribir algo de SQL a mano.
- `jsonb` sin esquema puede degenerar en un vertedero. Mitigación: se valida con Zod al
  entrar y al salir, y se limita a entrevista, trazas y evidencia — nunca a datos que se
  consulten para planificar.

**Lo que queda condicionado**
- La forma del esquema de [02](../02-modelo-de-datos.md).
- La prohibición de mockear la base de datos en tests de integración: si se mockea, las
  constraints —donde vive la garantía— se vuelven invisibles.

[ADR-006]: ./ADR-006-versionado-de-plan-y-diff.md
