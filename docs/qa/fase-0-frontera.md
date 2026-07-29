# QA — Frontera del motor: guion repetible

Fecha: 2026-07-28
Estado: escrito antes de que exista código (T5, en paralelo con T0-T4 según
[fase-0-ejecucion.md §5.3](../arquitectura/fase-0-ejecucion.md)). Solo se puede **ejecutar**
desde que T1 haya creado los 7 stubs; se puede **leer y revisar** desde ya.
Cubre: el procedimiento de [fase-0-ejecucion.md §6](../arquitectura/fase-0-ejecucion.md) y la
regla de dependencias de [01-arquitectura.md §6](../arquitectura/01-arquitectura.md).
Ejecutor esperado: `test-runner` (o quien tenga el carril abierto). Este documento es un
guion, no un reporte de ejecución — quien lo ejecute reporta según su propio brief.

---

## 0. Relación con `fase-0-ejecucion.md §6` — qué reutiliza, qué añade

`fase-0-ejecucion.md §6` es el procedimiento de cierre de la fase 0: se ejecuta **una vez**,
en una rama que se descarta, con evidencia transcrita a mano en su §9. Es correcto que sea así
de ceremonioso esa vez — es la prueba que cierra un criterio de aceptación.

Este documento es distinto: se ejecuta **cada vez que cambie el ruleset de
`dependency-cruiser`, la estructura de paquetes, o el `package.json` de `packages/engine` o
`packages/temporal`**, potencialmente muchas veces a lo largo de las fases 1-6. No repite los
pasos de git de §6 (rama, commit, push, borrado) — los referencia. Lo que aporta:

1. Un **modo de ejecución rápido en local** (§3), porque exigir un ciclo de push-y-esperar en
   CI cada vez que alguien toca una línea del ruleset es fricción que nadie va a pagar, y una
   comprobación que nadie ejecuta no protege nada.
2. **Cobertura de las cuatro prohibiciones de [01-arquitectura.md §6](../arquitectura/01-arquitectura.md)**,
   no solo la de `drizzle-orm` en `engine`: `engine → api`, `engine → contracts`,
   `temporal → domain`, y Fastify/Drizzle dentro de `engine` **o** `temporal`.
3. Un caso explícito para el **grafo vacío** (§6 no lo cubre; lo cubre D5 en teoría, sin
   probarlo).
4. Dos huecos que encontré en `§6` al diseñar esto (marcados inline donde aplican, resumidos en
   el reporte de entrega).

---

## 1. Disparadores — cuándo se re-ejecuta este guion

- Cualquier cambio a `.dependency-cruiser.cjs`.
- Cualquier paquete nuevo, movido o renombrado bajo `packages/*` o `apps/*`.
- Cualquier cambio al `packages:` de `pnpm-workspace.yaml` o a los scripts `depcruise`/`verify`
  del `package.json` raíz.
- Cualquier cambio a `dependencies`/`exports` del `package.json` de `packages/engine` o
  `packages/temporal`.
- Antes de cerrar cualquier fase que toque `packages/engine` o `packages/temporal` (fases 1-6),
  como chequeo de que la frontera se mantuvo intacta durante la fase.

Si ninguno de estos ocurrió, no hace falta re-ejecutarlo.

---

## 2. Cómo leer los casos

Cada caso trae: **Precondición**, **Acción**, **Resultado esperado**, **Regla que debe
dispararse**, **Por qué otra regla sería falso positivo**, **Modo**, **Automatizar**.

**Definición de "falso positivo" en este documento**: CI (o `depcruise` en local) se pone en
rojo, pero por una razón distinta de la regla de frontera que el caso pretende probar —
típicamente porque el import es irresoluble y dispara `not-to-unresolvable` (higiene, del
conjunto recomendado) en vez de la regla propia que prohíbe la arista por diseño. Un ruleset
con la regla de frontera comentada produciría exactamente el mismo rojo. Por eso ningún caso de
este documento se da por bueno con "salió rojo": hay que leer el **nombre de la regla** en la
salida.

**Comprobación transversal, aplica a todo caso que produzca una violación de frontera (Casos
1-5, 9)**: las rutas en la salida deben ser `packages/…` o `apps/…`, nunca
`node_modules/@oa/…`. Si aparece una ruta de `node_modules`, la resolución no está usando los
symlinks reales del workspace y el resultado no es de fiar, aunque el nombre de la regla sea el
correcto ([fase-0-ejecucion.md §7 punto 4](../arquitectura/fase-0-ejecucion.md)).

**Nota sobre la extensión `.ts` en los imports envenenados**: igual que
[fase-0-ejecucion.md §6 paso 2](../arquitectura/fase-0-ejecucion.md), los imports relativos de
este documento usan extensión `.ts` explícita (`'../../contracts/src/index.ts'`), no `.js`. Con
`nodenext` y sin `allowImportingTsExtensions`, eso probablemente también rompe el typecheck. No
importa: `dependency-cruiser` resuelve la ruta igual (usa su propio resolvedor, no `tsc`), y un
typecheck roto sigue siendo un rojo válido siempre que se revise también el log de `depcruise`
— mismo razonamiento que §6 paso 5, comprobación 1. Del mismo modo, los imports a builtins de
Node del Caso 4 probablemente rompen el typecheck porque los stubs no declaran
`"types": ["node"]` (fase-0-ejecucion.md §3, trampa 2). Tampoco importa por la misma razón.

---

## 3. Modos de ejecución

| Modo | Qué es | Cuándo usarlo |
|---|---|---|
| **A — CI completo** | El procedimiento íntegro de [§6](../arquitectura/fase-0-ejecucion.md): rama, commit, push, verificar en GitHub Actions, transcribir evidencia, borrar la rama | El cierre de la fase 0 (ya hecho en T3). Reescrituras grandes del ruleset. Antes de cerrar cualquier fase que dependa fuertemente de la frontera, como chequeo periódico de que la integración CI→depcruise no se rompió (que Modo B no puede probar) |
| **B — local, sin commit** | Envenenar el archivo sin commitear, correr `pnpm depcruise` directamente, leer la salida, revertir | Todo lo demás. Es el modo por defecto de los Casos 2-9 de este documento |

**Receta de Modo B** (se referencia desde cada caso, no se repite):

```bash
# 1. Árbol limpio antes de empezar
git status --short              # sin salida esperada

# 2. Editar el archivo indicado en "Acción" del caso

# 3. Ejecutar SOLO depcruise, nunca `pnpm verify`
pnpm depcruise

# 4. Leer: código de salida, nombre(s) de regla en la salida, rutas mostradas

# 5. Revertir siempre, incluso si el resultado fue el esperado
git checkout -- <archivo editado>
git status --short              # confirmar que vuelve a estar limpio
```

**Por qué `pnpm depcruise` y no `pnpm verify` en Modo B**: `verify` encadena los pasos con
`&&` ([fase-0-ejecucion.md §4.4](../arquitectura/fase-0-ejecucion.md): `pnpm run typecheck &&
pnpm run lint && pnpm run test && pnpm run depcruise`). En **local** eso corta en el primer
fallo. Si el import envenenado también rompe el typecheck — esperable en varios casos de este
documento, ver nota de §2 — `pnpm verify` nunca llegaría a ejecutar `depcruise`, y la
comprobación de frontera quedaría sin hacer aunque el comando entero "falle". En CI esto no
pasa porque cada paso de `ci.yml` lleva `if: ${{ !cancelled() }}`, pero ese guardrail no existe
al correr en local.

---

## 4. Precondiciones comunes a todos los casos

- Los 7 paquetes/apps existen con la estructura mínima de
  [fase-0-ejecucion.md §4.7](../arquitectura/fase-0-ejecucion.md). Si no existen, este guion no
  se puede ejecutar todavía.
- `pnpm install --frozen-lockfile` corrido sin advertencias de scripts bloqueados sin resolver.
- Árbol de trabajo git limpio (`git status --short` sin salida) antes de envenenar nada.
- Caso 0 (línea base) ejecutado y en verde antes de correr cualquier otro caso.

---

## 5. Índice rápido de casos

| # | Envenena | Archivo | Regla esperada | Modo | Automatizar |
|---|---|---|---|---|---|
| 0 | (nada — línea base) | — | — (0 violaciones) | B | ya lo está (es CI) |
| 1 | `drizzle-orm` + ruta relativa a `apps/api` | `packages/engine/src/index.ts` | `nucleo-no-va-a-apps` (obligatoria) | A | parcial |
| 2 | ruta relativa a `packages/contracts` | `packages/engine/src/index.ts` | `engine-solo-domain-y-temporal` | B | sí |
| 3 | ruta relativa a `packages/domain` | `packages/temporal/src/index.ts` | `temporal-no-conoce-dominio` | B | sí |
| 4 | `node:fs` / `node:child_process` | engine y temporal | `sin-io-en-nucleo`, señal aislada | B | sí, prioridad alta |
| 5 | `drizzle-orm` / `fastify`, nombre real | engine y temporal | `sin-io-en-nucleo` **+** `not-to-unresolvable` | B | sí, prioridad alta |
| 6 | argumento de crawl roto (glob total) | ninguno (CLI) | ver decisión — puede ser hallazgo | B | sí, prioridad máxima |
| 7 | `exclude` que atrapa `packages/engine` | `.dependency-cruiser.cjs` | ver decisión — probable hallazgo crítico | B | sí, prioridad máxima |
| 8 | config ausente/rota | `.dependency-cruiser.cjs` | error de carga de config, ruidoso | B | opcional |
| 9 (opcional) | bare specifier no declarado | `packages/engine/src/index.ts` | control negativo — reproduce la trampa a propósito | B | no |

---

## 6. Casos de prueba

### Caso 0 — Línea base verde

- **Precondición**: ninguna adicional (es el primero).
- **Acción**: sobre el estado actual, sin modificar nada, ejecutar `pnpm depcruise`.
- **Resultado esperado**: código de salida 0, 0 violaciones. Si el reporter usado expone el
  detalle de reglas `required` satisfechas, `el-grafo-no-esta-vacio` aparece cumplida — es la
  "mitad positiva" de [§6 paso 5, comprobación 3](../arquitectura/fase-0-ejecucion.md): sin
  esto, ningún rojo posterior es interpretable, porque no se sabe si el ruleset ya venía roto.
- **Regla que debe dispararse**: ninguna.
- **Por qué otra regla sería falso positivo**: N/A — este caso no envenena nada, solo
  establece la línea base contra la que se comparan los Casos 1-9.
- **Modo**: B. **Automatizar**: ya lo está — es literalmente lo que corre `ci.yml` en cada
  push. No se necesita nada nuevo.

### Caso 1 — Frontera canónica: `engine → api` (+ `drizzle-orm`)

- **Procedimiento completo**: [fase-0-ejecucion.md §6, pasos 1-7](../arquitectura/fase-0-ejecucion.md).
  No se repite aquí.
- **Regla que debe dispararse**: `nucleo-no-va-a-apps`, sobre el import relativo a
  `apps/api/src/index.ts` (import (b) de §6).
- **Por qué otra regla sería falso positivo**: el import (a) (`drizzle-orm`) por sí solo
  dispara `not-to-unresolvable` porque el paquete no está instalado en ningún sitio durante la
  fase 0 — un ruleset con la frontera comentada daría el mismo rojo con ese import solo. El
  import (b) usa ruta relativa precisamente porque una ruta relativa siempre resuelve,
  independientemente de qué esté instalado, así que es el único de los dos que obliga a la
  regla de frontera a pronunciarse. Ver también el hallazgo de la nota siguiente.
- **Nota — lo que este caso NO verifica**: el paso 5 de §6 exige que la salida nombre
  `nucleo-no-va-a-apps`, pero nunca exige que nombre `sin-io-en-nucleo`, pese a que el import
  (a) es literalmente `drizzle-orm` — el criterio textual de
  [05-plan-de-implementacion.md](../arquitectura/05-plan-de-implementacion.md) ("un import de
  `drizzle-orm` dentro de `packages/engine` rompe el build"). Es posible pasar las tres
  comprobaciones de §6 con `sin-io-en-nucleo` completamente rota o ausente, porque
  `not-to-unresolvable` y `nucleo-no-va-a-apps` ya bastan para poner todo en verde/rojo como se
  espera. El Caso 5 de este documento cierra ese hueco.
- **Modo**: A, obligatorio al menos una vez por cambio significativo del ruleset. **Automatizar**:
  parcial — la generación del fixture y el assert sobre nombres de regla sí son automatizables;
  el ciclo rama/push/CI/borrado es deliberadamente manual (repo público, "no mergear" depende
  de disciplina humana, no de una máquina).

### Caso 2 — `engine → contracts`

- **Precondición**: Caso 0 en verde.
- **Acción** (Modo B): en `packages/engine/src/index.ts`, añadir junto a los imports
  existentes:
  ```ts
  import { PACKAGE_ID as CONTRACTS } from '../../contracts/src/index.ts';
  ```
  Ejecutar `pnpm depcruise`. Revertir.
- **Resultado esperado**: violación con nombre `engine-solo-domain-y-temporal`. Ruta mostrada:
  `packages/contracts/src/index.ts`, no `node_modules/@oa/contracts`.
- **Regla que debe dispararse**: `engine-solo-domain-y-temporal` (`packages/engine → cualquier
  packages/* que no sea domain o temporal`).
- **Por qué otra regla sería falso positivo**: `packages/engine/package.json` no declara
  `@oa/contracts` como dependencia (el manifiesto de stubs solo declara `typescript` y `vitest`
  como devDependencies para los 7 paquetes). Si el import se escribiera como especificador de
  paquete (`from '@oa/contracts'`) en vez de ruta relativa, sería irresoluble bajo el
  `node_modules` aislado de pnpm y dispararía `not-to-unresolvable` en vez de (o además de)
  `engine-solo-domain-y-temporal` — la misma trampa que `drizzle-orm`, aplicada a un paquete
  del propio monorepo. El Caso 9 reproduce esto a propósito como ejercicio de calibración.
- **Modo**: B. **Automatizar**: sí, nivel integración (verifica interacción entre config real
  y estructura de archivos real; no es unitario de lógica de negocio ni e2e de producto).

### Caso 3 — `temporal → domain`

- **Precondición**: Caso 0 en verde.
- **Acción** (Modo B): en `packages/temporal/src/index.ts`, añadir:
  ```ts
  import { PACKAGE_ID as DOMAIN } from '../../domain/src/index.ts';
  ```
  Ejecutar `pnpm depcruise`. Revertir.
- **Resultado esperado**: violación con nombre `temporal-no-conoce-dominio`. Ruta mostrada:
  `packages/domain/src/index.ts`.
- **Regla que debe dispararse**: `temporal-no-conoce-dominio` (`packages/temporal → cualquier
  otro paquete del proyecto`).
- **Por qué otra regla sería falso positivo**: mismo mecanismo que el Caso 2 —
  `@oa/domain` no está declarado como dependencia de `packages/temporal`, así que un
  especificador de paquete en vez de ruta relativa daría `not-to-unresolvable`.
  Adicionalmente, el stub de `packages/temporal/src/index.ts` no tiene ningún import legítimo
  ([fase-0-ejecucion.md §4.7](../arquitectura/fase-0-ejecucion.md): "sin imports"), así que el
  envenenado es el único del archivo — la señal no se puede confundir con nada preexistente.
- **Modo**: B. **Automatizar**: sí, integración.

### Caso 4 — `sin-io-en-nucleo`, señal aislada (builtins de Node)

- **Precondición**: Caso 0 en verde.
- **Acción** (Modo B, una combinación a la vez):

  | Sub-caso | Archivo | Import |
  |---|---|---|
  | 4a | `packages/engine/src/index.ts` | `import { readFileSync } from 'node:fs';` |
  | 4b | `packages/temporal/src/index.ts` | `import { spawnSync } from 'node:child_process';` |

  Ejecutar `pnpm depcruise` tras cada uno, revertir antes del siguiente.
- **Resultado esperado**: violación con nombre `sin-io-en-nucleo`, exclusivamente.
  `not-to-unresolvable` **no** debería aparecer: los módulos `node:*` son internos del
  runtime y siempre resuelven, sin depender de que nada esté instalado.
- **Regla que debe dispararse**: `sin-io-en-nucleo`.
- **Por qué otra regla sería falso positivo**: ninguna otra regla del ruleset prohíbe builtins
  de Node hacia `engine`/`temporal` (no son `apps/*` ni `packages/*` del proyecto), así que la
  única forma de obtener rojo aquí es que `sin-io-en-nucleo` esté realmente activa. **Este es
  el caso más limpio de los diez**: a diferencia de `drizzle-orm`/`fastify` (Caso 5), aquí no
  hay ningún mecanismo de higiene que pueda producir un rojo por resolución y disfrazarse de
  protección real.
- **Modo**: B. **Automatizar**: sí, integración, **prioridad alta** — es la comprobación más
  barata y más determinista de la lista.

### Caso 5 — `sin-io-en-nucleo`, señal con el nombre real del paquete prohibido

- **Precondición**: Caso 0 en verde.
- **Acción** (Modo B, una combinación a la vez, cada una **aislada** — sin el import adicional
  a `apps/api` que trae el Caso 1):

  | Sub-caso | Archivo | Import |
  |---|---|---|
  | 5a | `packages/engine/src/index.ts` | `import { drizzle } from 'drizzle-orm';` |
  | 5b | `packages/engine/src/index.ts` | `import Fastify from 'fastify';` |
  | 5c | `packages/temporal/src/index.ts` | `import { drizzle } from 'drizzle-orm';` |
  | 5d | `packages/temporal/src/index.ts` | `import Fastify from 'fastify';` |

  Ejecutar `pnpm depcruise` tras cada uno, revertir antes del siguiente.
- **Resultado esperado**: la salida debe nombrar **las dos reglas a la vez**:
  `not-to-unresolvable` **y** `sin-io-en-nucleo`.
- **Regla que debe dispararse**: `sin-io-en-nucleo`. (`not-to-unresolvable` también dispara,
  y eso es aceptable — ver siguiente punto.)
- **Por qué esto es el caso más fácil de leer mal de los diez**: a diferencia de los Casos 2-4,
  aquí **no es posible aislar la señal** durante la fase 0, porque ni Fastify ni Drizzle están
  instalados en ningún paquete del monorepo todavía (llegan en las fases 2 y 6, según
  [fase-0-ejecucion.md §1](../arquitectura/fase-0-ejecucion.md)). Cualquier import a estos dos
  paquetes, venga de donde venga, es irresoluble y **siempre** dispara
  `not-to-unresolvable`, sin importar si `sin-io-en-nucleo` funciona o está rota. Por eso el
  criterio de éxito de este caso no es "salió rojo" — eso pasa incluso con `sin-io-en-nucleo`
  comentada. El criterio es exclusivamente: **¿aparece también `sin-io-en-nucleo` nombrada en
  la salida?** Si solo aparece `not-to-unresolvable`, la regla de frontera específica para
  Drizzle/Fastify no está funcionando, y el criterio literal de
  [05-plan-de-implementacion.md](../arquitectura/05-plan-de-implementacion.md) se está
  cumpliendo por accidente de higiene, no por diseño. Este caso existe para cerrar el hueco que
  el propio Caso 1 (heredado de §6) deja abierto: ver la nota de esa sección.
- **Modo**: B. **Automatizar**: sí, integración, **prioridad alta**. Nota para quien
  automatice: el assert correcto es "el conjunto de violaciones incluye `sin-io-en-nucleo`",
  nunca "código de salida ≠ 0" ni "hay al menos una violación" — ambas cosas son ciertas incluso
  si la regla real está rota.

### Caso 6 — Grafo vacío total (glob de crawl roto)

- **Precondición**: Caso 0 en verde.
- **Acción**: sin editar ningún archivo (nada que revertir), ejecutar directamente:
  ```bash
  pnpm exec depcruise packagess apps --config .dependency-cruiser.cjs
  ```
  (nombre de directorio deliberadamente mal escrito, simulando el typo que rompería el
  argumento del script `depcruise` o, con el mismo efecto práctico, el `packages:` de
  `pnpm-workspace.yaml`).
- **Resultado esperado — dos ramas posibles; registrar cuál ocurre realmente, porque no está
  verificado en ningún documento del proyecto**:
  - **Rama A (deseable)**: `depcruise` termina con código de salida distinto de cero y un
    mensaje explícito de ruta no encontrada. Es un fallo ruidoso — nadie lo confundiría con
    "todo bien". El guardrail D5 no llega a ser necesario porque el propio CLI ya protege.
  - **Rama B (el escenario que D5 fue diseñada para evitar)**: `depcruise` termina con código 0
    y reporta 0 módulos / 0 violaciones. Comprobar de inmediato si `el-grafo-no-esta-vacio`
    figura como violación. Si el código de salida es 0 y no aparece ninguna violación, el
    guardrail **no** cumple lo que
    [fase-0-ejecucion.md D5](../arquitectura/fase-0-ejecucion.md) promete
    ("Si el grafo se vacía, la regla falla"), y es un hallazgo crítico que bloquea el punto 5
    de [§7](../arquitectura/fase-0-ejecucion.md) ("la regla `el-grafo-no-esta-vacio` se
    satisface en verde: el grafo contiene módulos reales") — porque implica que la misma regla
    que debería fallar en rojo cuando el grafo está vacío tampoco puede usarse para confirmar
    que estaba lleno.
- **Regla que debe dispararse**: `el-grafo-no-esta-vacio` (si Rama B) o ningún resultado
  interpretable porque el CLI ya erroró (si Rama A).
- **Modo**: B. **Automatizar**: sí, integración, **prioridad máxima** — es, por diseño, el modo
  de fallo silencioso. Dejarlo en manos de la memoria de un humano contradice el motivo por el
  que existe este caso.

### Caso 7 — Grafo vacío parcial (`exclude` que atrapa justo `packages/engine`)

- **Precondición**: Caso 0 en verde. Caso 6 ya ejecutado y su resultado registrado.
- **Acción**: en `.dependency-cruiser.cjs`, añadir temporalmente (sin commitear) una entrada
  `exclude` cuya expresión regular capture `^packages/engine` — reproduciendo el escenario más
  realista: alguien amplía una exclusión pensada para otra cosa (p. ej. excluir fixtures o
  specs) con un patrón demasiado amplio que también atrapa a `packages/engine`. Ejecutar
  `pnpm depcruise`. Revertir con `git checkout -- .dependency-cruiser.cjs`.
- **Resultado esperado — este es el caso más importante de los diez, y el que más se presta a
  pasar inadvertido**: a diferencia del Caso 6, aquí el resto del repositorio sí se analiza con
  normalidad — solo `packages/engine` desaparece del grafo. Registrar qué ocurre realmente.
  **Hipótesis a verificar, no confirmada empíricamente**: las reglas de tipo `required` de
  `dependency-cruiser` (como `el-grafo-no-esta-vacio`) se evalúan módulo a módulo sobre los
  módulos que sí aparecen en el grafo — no detectan la *ausencia* de un módulo, solo la
  ausencia de una arista en un módulo presente. Si esa hipótesis es correcta, el resultado de
  este caso sería **verde limpio, sin ninguna violación**, indistinguible de un run sano —
  exactamente el modo de fallo silencioso que motivó pedir este documento, y esta vez ni
  siquiera el guardrail D5 lo nota. **Si el resultado observado es "verde limpio", es un
  hallazgo crítico que hay que escalar antes de cerrar cualquier fase que dependa de esta
  garantía**, porque contradice lo que D5 promete literalmente.
- **Regla que debe dispararse**: `el-grafo-no-esta-vacio`, si la hipótesis de arriba es
  incorrecta. Verde sin violaciones, si es correcta — y eso es el hallazgo.
- **Modo**: B. **Automatizar**: sí, integración, **prioridad máxima**, mismo motivo que el
  Caso 6.

### Caso 8 — Configuración ausente o rota

- **Precondición**: Caso 0 en verde.
- **Acción**: renombrar temporalmente el archivo de configuración:
  ```bash
  mv .dependency-cruiser.cjs .dependency-cruiser.cjs.bak
  pnpm depcruise
  # revertir:
  mv .dependency-cruiser.cjs.bak .dependency-cruiser.cjs
  ```
- **Resultado esperado**: `depcruise` falla de forma ruidosa (config no encontrada, código de
  salida distinto de cero). Confirmar que no cae en algún comportamiento por defecto que salga
  en verde — el conjunto `--init` recomendado, si se usara como *fallback*, no incluye ninguna
  de las reglas de frontera propias del proyecto. Si el resultado fuera verde, es el mismo modo
  de fallo silencioso de los Casos 6 y 7, con una causa raíz distinta (config ausente, no glob
  roto): arreglar uno no arregla el otro.
- **Regla que debe dispararse**: N/A — se espera un error de carga de configuración, no una
  violación de regla.
- **Modo**: B. **Automatizar**: opcional, prioridad media — es más un chequeo de robustez de la
  herramienta que del ruleset del proyecto. Un archivo de config borrado suele notarse en la
  revisión de un PR (el diff lo muestra); un glob sutilmente mal escrito (Casos 6-7) no deja ese
  rastro visual, por eso esos dos tienen prioridad mayor.

### Caso 9 (opcional, pedagógico) — Control negativo: especificador de paquete no declarado

- **Precondición**: Caso 0 en verde.
- **Acción** (Modo B): en `packages/engine/src/index.ts`, en vez de la ruta relativa del Caso
  2, añadir:
  ```ts
  import { PACKAGE_ID as CONTRACTS } from '@oa/contracts';
  ```
  (especificador de paquete, no ruta relativa; `@oa/contracts` no está declarado como
  dependencia de `packages/engine`). Ejecutar `pnpm depcruise`. Revertir.
- **Resultado esperado**: rojo, pero la regla nombrada es `not-to-unresolvable` — no
  necesariamente (o no exclusivamente) `engine-solo-domain-y-temporal`.
- **Para qué sirve**: reproduce a pequeña escala, y a propósito, la trampa que motivó el diseño
  de dos imports en [§6](../arquitectura/fase-0-ejecucion.md). Comparar la salida de este caso
  con la del Caso 2 (misma prohibición, ruta relativa) es el ejercicio que enseña a distinguir
  "protegido" de "parece protegido" sin tener que esperar a encontrarse la trampa en un caso
  real.
- **Modo**: B. **Automatizar**: no. Es un ejercicio de calibración humana, no una regresión que
  vigilar — no cambia con el tiempo salvo que cambie el propio ruleset de higiene
  (`not-to-unresolvable`), que no está bajo control de este proyecto.

---

## 7. Reglas del ruleset fuera de alcance de este guion

Explícitamente no cubiertas, porque la petición que originó este documento acota "la frontera
del motor" a `engine` + `temporal`:

- `domain-no-depende-de-nadie` — mismo mecanismo que los Casos 2-3, con `packages/domain` como
  origen.
- `web-solo-contracts` y `apps-no-se-cruzan` — no aplican hasta que `apps/web` tenga contenido
  real (fase 7).
- `sin-io-en-nucleo` también protege `packages/domain`, no solo `engine`/`temporal` — mismo
  mecanismo que los Casos 4-5.

Extender este documento a cualquiera de estas es mecánico (mismo patrón, otro par
origen-destino) cuando la fase correspondiente lo requiera.

---

## 8. Automatización — resumen

Ninguno de estos casos es "unitario" en sentido estricto (no prueban una función aislada):
todos dependen de la estructura real de archivos y de la configuración real de
`dependency-cruiser`. Tampoco son e2e de producto. La etiqueta correcta es **test de
arquitectura / integración de configuración**, y así deberían agruparse si se automatizan: en
un job o script propio (p. ej. generando fixtures temporales en un directorio aislado y
parseando el reporter JSON de `depcruise` para aserciones deterministas sobre nombres de
regla), no dentro de `pnpm test` (Vitest), que es para lógica de negocio.

| Caso | Automatizar | Prioridad | Nota |
|---|---|---|---|
| 0 | Ya lo está | — | Es el propio pipeline |
| 1 | Parcial | Media | El ciclo rama/push/CI se queda manual a propósito |
| 2 | Sí | Media | |
| 3 | Sí | Media | |
| 4 | Sí | Alta | Señal más limpia, cero ambigüedad |
| 5 | Sí | Alta | Assert correcto: "incluye `sin-io-en-nucleo`", no "código ≠ 0" |
| 6 | Sí | Máxima | Modo de fallo silencioso |
| 7 | Sí | Máxima | El caso con mayor probabilidad de fallar en la práctica |
| 8 | Opcional | Media | Robustez de la herramienta, no del ruleset |
| 9 | No | — | Pedagógico |

Cuándo construir esta automatización no lo decide este documento — igual que D4 aplicó YAGNI a
los stubs, conviene esperar a que el guion manual se haya corrido un par de veces y demuestre
que vale la pena, salvo los Casos 6-7, que por ser silenciosos son candidatos a automatizarse
antes, incluso dentro de la propia fase 0 si el arquitecto lo considera necesario para cerrarla
con confianza.

---

## 9. Registro de ejecuciones

No es evidencia de cierre de fase (esa vive en
[fase-0-ejecucion.md §9](../arquitectura/fase-0-ejecucion.md), la rellena T6 con lo que reporte
T3 usando el Caso 1 de aquí). Es un registro de mantenimiento: añadir una fila cada vez que se
corra este guion, completo o parcialmente.

| Fecha | Quién / commit | Disparador (qué cambió) | Casos ejecutados | Resultado | Hallazgos |
|---|---|---|---|---|---|
| | | | | | |
