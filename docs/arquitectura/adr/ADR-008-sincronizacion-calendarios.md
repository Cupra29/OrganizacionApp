# ADR-008: Publicación en un calendario separado de solo lectura; sin escritura en el calendario del usuario
Estado: aceptado (2026-07-28)
Fecha: 2026-07-24
Responde a la decisión §10.5 del brief.

## Contexto

El brief pide iCalendar como salida mínima, sincronización como capacidad deseable "con
manejo explícito de conflictos contra eventos preexistentes", y añade dos restricciones
fuertes:

- **Anti-requisito**: no obligar a migrar desde el calendario que la persona ya usa.
- **Reversibilidad**: "todo plan generado debe poder deshacerse: importar a un calendario
  separado, borrarlo completo sin daño colateral".

La sincronización bidireccional con Google o Microsoft Calendar es un subsistema entero:
OAuth, renovación de tokens, webhooks, sondeo, reconciliación, resolución de conflictos,
manejo de borrados hechos desde el otro lado, y cuotas de API. Es probablemente el componente
más caro de todo el sistema y el que más soporte genera.

## Decisión

**El sistema nunca escribe en el calendario del usuario. Publica sus bloques en un calendario
propio y separado, al que el usuario se suscribe en modo solo lectura.**

Escalonado en tres niveles:

**Nivel 1 — primer entregable.**
- Descarga puntual: `GET /plans/{id}/versions/{v}/export.ics`.
- **Feed suscribible** por token opaco: `webcal://…/feeds/{token}.ics`, que el usuario añade
  como calendario nuevo en su aplicación. Se actualiza solo en cada replanificación.
- El feed **excluye** los bloques `FIXED` y `TRANSITION`: son eco de eventos que ya están en su
  calendario, y duplicarlos es la vía más rápida a que se dé de baja.
- `UID` estable = `lineageId` ([ADR-006]), de modo que un bloque que se mueve **se actualiza**
  en lugar de duplicarse.
- Token revocable, rotable y **revocado automáticamente al borrar la cuenta**.

**Nivel 2 — fase posterior: lectura de ocupación.**
Importación de `.ics` y, más adelante, OAuth de **solo lectura**. Los eventos externos entran
como `busy` opacos: ocupan tiempo y **no se guarda título ni descripción**.

**Nivel 3 — solo si los datos lo justifican: escritura bidireccional.**
No se descarta para siempre, pero solo se abordará si hay evidencia de que el nivel 1 no
basta. La política de conflictos ya está decidida por si llega: **el evento externo es un
hecho, no una propuesta**. Gana siempre. El motor replanifica sus propios bloques y nunca
toca un evento ajeno.

## Alternativas consideradas

**Sincronización bidireccional desde el primer entregable.**
A favor: la mejor experiencia; los bloques aparecen en el calendario que la persona ya usa, sin
suscripciones. En contra: es el subsistema más caro del sistema, y sobre todo **traiciona la
reversibilidad**. Si escribimos en el calendario principal, "borrarlo completo sin daño
colateral" pasa a depender de que nuestro borrado sea perfecto — y los borrados masivos en
calendarios ajenos son el peor incidente posible en un producto de este tipo. Se descarta para
el primer entregable.

**Escribir en un calendario propio dentro de la cuenta del usuario (vía API de Google).**
Es la alternativa intermedia seria: el calendario está separado, así que borrarlo es limpio, y
la experiencia es mejor que una suscripción. En contra: sigue exigiendo OAuth y manejo de
cuotas, y **el usuario puede editar esos eventos**, creando una divergencia que habría que
reconciliar — es decir, aparece el problema de la bidireccionalidad por la puerta de atrás.
Se aplaza al nivel 3.

**Solo descarga puntual de `.ics`, sin feed.**
A favor: lo más simple posible. En contra: cada replanificación obliga a descargar e importar a
mano, y a limpiar los eventos viejos. La reversibilidad se cumple pero la usabilidad la hace
inútil tras dos semanas. Se descarta: el feed cuesta poco más y cambia el producto.

**No exportar nada; ser el calendario del usuario.**
Contradice frontalmente el anti-requisito. Se descarta.

## Consecuencias

**Lo que ganamos**
- **La reversibilidad es estructural, no un procedimiento.** Darse de baja del feed elimina
  todo rastro sin tocar un solo evento propio del usuario. Es imposible causar daño colateral
  porque no tenemos permiso de escritura.
- Toda la clase de problemas de reconciliación bidireccional desaparece del primer entregable:
  sin tokens que renovar, sin webhooks, sin cuotas, sin conflictos.
- Funciona con **cualquier** cliente de calendario que soporte suscripciones (Google, Apple,
  Outlook, Thunderbird), sin integrar con ninguno.
- Sin OAuth en el primer entregable, la superficie de privacidad es mínima.

**Lo que cuesta**
- **El sistema no conoce la ocupación real del usuario en el primer entregable.** Es el coste
  más serio de esta decisión: la persona debe declarar sus compromisos fijos en la entrevista
  en lugar de importarlos. Fricción real de onboarding, mitigada parcialmente por la
  importación de `.ics` del nivel 2.
- Los feeds `.ics` se actualizan cuando el cliente decide sondear, típicamente entre 15
  minutos y varias horas — y Google es notoriamente lento. Una replanificación urgente puede
  tardar en verse. Mitigación: la aplicación web muestra siempre el estado actual, y se
  documenta la latencia esperada en lugar de fingir tiempo real.
- El usuario tiene que dar un paso de configuración (suscribirse a una URL) que no es obvio
  para todo el mundo.
- Un token de feed filtrado expone los bloques. Mitigación: ≥128 bits de entropía, revocable,
  rotable, y contenido mínimo.

**Lo que queda condicionado**
- El linaje del [ADR-006] es requisito para el `UID` estable. Si el linaje falla, el
  calendario del usuario se llena de duplicados: es la manifestación más visible de un fallo
  en esa decisión, y por eso hay una prueba manual dedicada en la fase 8.
- Los eventos importados en el nivel 2 no guardan título: minimización de datos aplicada al
  punto por donde entraría más información ajena al producto.

[ADR-006]: ./ADR-006-versionado-de-plan-y-diff.md
