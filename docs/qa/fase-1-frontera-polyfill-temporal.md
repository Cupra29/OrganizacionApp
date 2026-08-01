# QA — Frontera del polyfill de `Temporal`: `polyfill-temporal-solo-en-su-modulo`

Fecha: 2026-07-30
Estado: escrito tras la implementación de la regla (commit `eaf92f2`, reportada junto a la
ampliación del guardrail de reloj en
[`fase-1-guardrail-temporal-now.md`](./fase-1-guardrail-temporal-now.md)). No he ejecutado
estos casos yo mismo — igual que `fase-0-frontera.md`, este documento es un guion que
`test-runner` (o quien tenga el carril abierto) ejecuta y reporta.

Cubre: la regla nueva `polyfill-temporal-solo-en-su-modulo` de `dependency-cruiser`, que
mecaniza [ADR-018](../arquitectura/adr/ADR-018-expansion-de-recurrencia-sin-rrule.md)
("`packages/temporal/src/temporal.ts` es el único punto de import del polyfill") y la
convención repetida en `CLAUDE.md` ("`Temporal` se importa desde `@oa/temporal`... Ningún
otro archivo importa el polyfill").

---

## 0. Por qué es un documento propio y no más casos en `fase-1-guardrail-temporal-now.md`

**Mecanismo distinto.** El guardrail de reloj es un plugin GritQL de Biome (`sin-reloj-ni-azar-en-nucleo.grit`,
alcance `packages/{engine,temporal,domain,ical}`). Esta regla nueva es de
**`dependency-cruiser`** — el mismo motor que protege la frontera `engine → apps/api` en
`fase-0-frontera.md`. Ambas viven bajo el paraguas de "límite nº1 de `CLAUDE.md`" pero son
**dos mecanizaciones distintas**, tal como el propio `CLAUDE.md` lo explica: una ve imports,
la otra ve sintaxis de reloj/azar/estado global. Mezclar los casos de las dos en un solo
documento habría hecho perder esa distinción, que es justo la que `CLAUDE.md` se toma la
molestia de remarcar.

**Consecuencia práctica**: los casos de aquí siguen el formato y las trampas de
`fase-0-frontera.md` (Modo A/B, la trampa de `not-to-unresolvable`, la comprobación transversal
de que las rutas en la salida son `packages/…` y no `node_modules/@oa/…`), no el formato de
canario de Biome del documento hermano.

---

## 1. La regla, en una frase

`temporal-polyfill` solo puede importarse desde `packages/temporal/src/temporal.ts`. Cualquier
otro archivo del monorepo que lo importe directamente —esté dentro de `packages/temporal` o
fuera— viola la regla, sin importar si ese archivo pertenece al núcleo o no. Todo lo demás
debe importar `Temporal` desde `@oa/temporal` (que reexporta desde ese único módulo).

---

## 2. Precondiciones comunes

- `temporal-polyfill@1.0.2` declarado como dependencia de producción de `packages/temporal`
  (necesario para que los Casos 1–2 resuelvan de verdad y no disparen `not-to-unresolvable`,
  la misma trampa que `fase-0-frontera.md` documenta para `drizzle-orm` en la fase 0).
- `.dependency-cruiser.cjs` con la regla `polyfill-temporal-solo-en-su-modulo` activa.
- Árbol de trabajo git limpio antes de envenenar nada; revertir siempre después de cada caso
  (misma receta de Modo B que `fase-0-frontera.md` §3).
- Caso 0 (línea base) en verde antes de correr cualquier otro caso.

---

## 3. Índice de casos

| # | Envenena | Archivo | Regla esperada | Modo | Automatizar |
|---|---|---|---|---|---|
| P0 | (nada — línea base) | — | 0 violaciones | B | ya lo está (CI) |
| P1 | segundo importador dentro de `packages/temporal` | `packages/temporal/src/otro-archivo.ts` | `polyfill-temporal-solo-en-su-modulo` | B | sí |
| P2 | importador fuera de `packages/temporal` | `packages/engine/src/index.ts` | `polyfill-temporal-solo-en-su-modulo` | B | sí |
| P3 | control negativo: el propio `temporal.ts` | `packages/temporal/src/temporal.ts` | ninguna (es el único permitido) | B | sí |
| P4 | control negativo: reexport vía `@oa/temporal` | cualquier otro archivo de `packages/temporal` | ninguna | B | sí |
| P5 | subpath del mismo paquete (`temporal-polyfill/full`) | `packages/temporal/src/otro-archivo.ts` | ver decisión — probable hallazgo | B | sí, prioridad alta |

---

## 4. Casos

### Caso P0 — línea base verde

- **Precondición**: ninguna adicional.
- **Acción**: `pnpm depcruise` sobre el estado actual, sin modificar nada.
- **Resultado esperado**: 0 violaciones de `polyfill-temporal-solo-en-su-modulo`.
- **Modo**: B. **Automatizar**: ya lo está (CI).

### Caso P1 — segundo importador dentro del propio `packages/temporal`

- **Precondición**: Caso P0 en verde.
- **Acción** (Modo B): en un archivo distinto de `temporal.ts` dentro de
  `packages/temporal/src/` (p. ej. `packages/temporal/src/otro-archivo.ts`), añadir:
  ```ts
  import { Temporal } from "temporal-polyfill";
  ```
  Ejecutar `pnpm depcruise`. Revertir.
- **Resultado esperado**: violación `polyfill-temporal-solo-en-su-modulo`, señalando el
  archivo envenenado como origen y `temporal-polyfill` como destino.
- **Regla que debe dispararse**: `polyfill-temporal-solo-en-su-modulo`.
- **Por qué otra regla sería falso positivo**: `temporal-polyfill` **sí** está declarado e
  instalado como dependencia real de `packages/temporal` (a diferencia de `drizzle-orm` en la
  fase 0), así que resuelve sin problema y **no** dispara `not-to-unresolvable`. La única
  señal posible aquí es la regla propia — este caso es, en ese sentido, más limpio que el
  Caso 1 de `fase-0-frontera.md`, que necesitaba dos imports para aislar la señal de la
  trampa de higiene.
- **Por qué este caso importa más que P2**: es la violación con más probabilidad real de
  ocurrir — alguien añadiendo una segunda función de utilidad dentro del propio paquete que
  necesita `Temporal` y, sin pensarlo, importa el polyfill directamente en vez de reexportar
  desde `temporal.ts`. Es un error de "estoy dentro del paquete correcto, no debería importar
  nada raro" — precisamente el punto ciego que la regla existe para cerrar.
- **Modo**: B. **Automatizar**: sí, prioridad alta.

### Caso P2 — importador fuera de `packages/temporal`

- **Precondición**: Caso P0 en verde.
- **Acción** (Modo B): en `packages/engine/src/index.ts`, añadir:
  ```ts
  import { Temporal } from "temporal-polyfill";
  ```
  Ejecutar `pnpm depcruise`. Revertir.
- **Resultado esperado**: depende de si `temporal-polyfill` está declarado como dependencia de
  `packages/engine`. **Verificar las dos ramas por separado**, con la misma lógica que
  `fase-0-frontera.md` aplica a `drizzle-orm`:
  - Si **no** está declarado (el caso esperable — `packages/engine` no debería depender
    directamente del polyfill): dispara **también** `not-to-unresolvable`, además de (o en vez
    de) `polyfill-temporal-solo-en-su-modulo`. El criterio de éxito de este caso, igual que el
    Caso 5 de `fase-0-frontera.md`, **no** es "salió rojo" (eso pasa aunque la regla propia
    esté rota), sino **¿aparece nombrada `polyfill-temporal-solo-en-su-modulo` en la salida,
    además de `not-to-unresolvable`?**
  - Si se declara a propósito para aislar la señal (mismo truco que el Caso 2 de
    `fase-0-frontera.md`): debe aparecer únicamente `polyfill-temporal-solo-en-su-modulo`.
- **Regla que debe dispararse**: `polyfill-temporal-solo-en-su-modulo` (en ambas ramas,
  nombrada explícitamente, no inferida del código de salida).
- **Por qué otra regla sería falso positivo**: ver arriba — `not-to-unresolvable` puede
  aparecer legítimamente a la vez, y no hay que confundir "salió rojo por higiene de
  dependencias" con "la regla de frontera del polyfill funciona".
- **Modo**: B. **Automatizar**: sí, prioridad alta, con las dos ramas documentadas por
  separado para no repetir el hallazgo que costó una revisión completa en la fase 0.

### Caso P3 — control negativo: el propio `temporal.ts` (el único importador permitido)

- **Precondición**: Caso P0 en verde. Este caso **no envenena nada** — confirma que el estado
  real del repositorio (donde `temporal.ts` sí importa `temporal-polyfill`, por diseño) no
  dispara la regla.
- **Acción**: `pnpm depcruise` sobre `packages/temporal/src/temporal.ts` tal como está.
- **Resultado esperado**: 0 violaciones de `polyfill-temporal-solo-en-su-modulo` atribuibles a
  esta arista.
- **Por qué hace falta un caso explícito para esto y no basta con "ya lo cubre P0"**: una
  regla de "solo este archivo puede importar X" tiene dos formas de estar mal: ser demasiado
  laxa (no detecta P1/P2) o ser demasiado estricta (prohíbe también al propio archivo
  permitido, por un error en la expresión regular o el `path` de la excepción dentro de la
  regla de `dependency-cruiser`). P0 confirma la línea base general; este caso aísla
  específicamente que la excepción para `temporal.ts` funciona, que es la mitad de la regla
  que un ruleset mal escrito rompe con más facilidad (negar la negación).
- **Modo**: B. **Automatizar**: sí — es barato y es exactamente el tipo de comprobación que
  "ya lo cubre la línea base" tienta a saltarse.

### Caso P4 — control negativo: el resto del monorepo consume `Temporal` vía `@oa/temporal`

- **Precondición**: Caso P0 en verde.
- **Acción**: confirmar (sin envenenar nada) que archivos como
  `packages/temporal/src/index.ts` u otros módulos del paquete que necesiten `Temporal` lo
  importan con `import { Temporal } from './temporal.ts'` (ruta relativa dentro del propio
  paquete) o equivalente, **no** `from 'temporal-polyfill'` directamente, y que
  `pnpm depcruise` no reporta nada para esas aristas.
- **Resultado esperado**: 0 violaciones. Esta es la forma legítima que P1 contrasta.
- **Por qué es distinto de P0**: P0 es "nada envenenado, todo verde" en general; P4 mira
  específicamente la arista `temporal.ts → resto del paquete` para confirmar que el
  re-exportar (no volver a importar el polyfill) es indistinguible de "todo bien" en el
  reporte — es decir, que la regla no penaliza el patrón correcto por error de diseño de la
  propia regla.
- **Modo**: B. **Automatizar**: sí.

### Caso P5 (prioridad alta) — subpath del mismo paquete: `temporal-polyfill/full`

- **Precondición**: Caso P0 en verde.
- **Acción** (Modo B): en `packages/temporal/src/otro-archivo.ts` (no `temporal.ts`), añadir:
  ```ts
  import { Temporal } from "temporal-polyfill/full";
  ```
  Ejecutar `pnpm depcruise`. Revertir.
- **Resultado esperado — no verificado, y es el hallazgo de este documento**: no sé si la
  regla `polyfill-temporal-solo-en-su-modulo` casa por el **specifier exacto**
  (`temporal-polyfill`) o por el **nombre de paquete** (cualquier subpath de
  `temporal-polyfill/*`). Si casa solo por el specifier exacto, este import **no dispara nada**
  y queda un segundo camino de entrada al polyfill sin proteger — exactamente el tipo de hueco
  que ADR-018 ya identificó como real: `rrule-temporal` (la dependencia de desarrollo, oráculo
  diferencial) importa **`temporal-polyfill/full`** internamente (ADR-018, tabla "Estado real
  de los candidatos"), así que el subpath **existe y se usa** en el propio repositorio, aunque
  hoy solo como `devDependency` fuera de producción. Si algún día alguien en `packages/temporal`
  necesitara algo de `temporal-polyfill/full` en vez de la exportación por defecto, este es el
  camino por el que se colaría sin que la regla se dé cuenta — si la hipótesis de "solo
  specifier exacto" es correcta.
- **Regla que debe dispararse**: `polyfill-temporal-solo-en-su-modulo`, si la regla está
  escrita para casar el paquete completo. Silencio (ninguna violación), si solo casa el
  specifier exacto — y eso sería el hallazgo a escalar.
- **Por qué otra regla sería falso positivo**: ninguna — `temporal-polyfill/full` resuelve
  igual que `temporal-polyfill` en cuanto a instalación (mismo paquete npm), así que no hay
  higiene de dependencias que confundir aquí; el único resultado posible es que la regla
  propia case o no case.
- **Modo**: B. **Automatizar**: sí, prioridad alta — es el caso con más probabilidad de
  destapar un hueco real, por la razón contraria a la habitual: aquí no hay que imaginar un
  escenario hipotético, el subpath ya se usa en el repositorio (aunque hoy fuera del alcance
  de la regla, en una `devDependency`).

---

## 5. Automatización — resumen

| Caso | Automatizar | Prioridad | Nota |
|---|---|---|---|
| P0 | Ya lo está | — | Es el propio pipeline |
| P1 | Sí | Alta | El error con más probabilidad real de ocurrir |
| P2 | Sí | Alta | Documentar las dos ramas (`not-to-unresolvable` sí/no), igual que fase 0 |
| P3 | Sí | Media | Confirma que la excepción para `temporal.ts` no se rompe por exceso de celo |
| P4 | Sí | Media | Confirma que reexportar vía `@oa/temporal` no se penaliza |
| P5 | Sí | **Alta** | Hueco potencial real: el subpath `temporal-polyfill/full` ya se usa en el repo (`rrule-temporal`, como `devDependency`) |

---

## 6. Registro de ejecuciones

| Fecha | Quién / commit | Casos ejecutados | Resultado | Hallazgos |
|---|---|---|---|---|
| | | | | |
