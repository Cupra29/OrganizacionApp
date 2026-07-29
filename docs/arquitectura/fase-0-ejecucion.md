# Fase 0 — Plan de ejecución

Fecha: 2026-07-28
Estado: **cerrado el 2026-07-29.** Los trece puntos de la definición de "hecho" (§7) se
cumplen; la evidencia está en §9 y §9.1.
Cubre: [05 §Fase 0](./05-plan-de-implementacion.md) y la estructura de
[01 §6](./01-arquitectura.md).

> Este documento fue el guion de despacho. Se conserva como está —con las correcciones
> fechadas en el sitio donde estaba el error, no reescritas— porque su valor a partir de ahora
> es el registro de qué se decidió, qué salió mal y cómo se comprobó.

**Estado de las decisiones al cerrar:**

| | Decisión | Resultado |
|---|---|---|
| D1 | TypeScript 6, no 7 | **Ratificada** y elevada a [ADR-016](./adr/ADR-016-version-de-typescript.md) |
| D2 | `moduleResolution: nodenext` con extensiones explícitas | **Ratificada**, con una consecuencia añadida: `allowImportingTsExtensions` (ver §2, desviaciones) |
| D3 | `target`/`lib` `es2024` para mantener `Temporal` fuera del ámbito global | **Ratificada** |
| D4 | Stubs de los 7 paquetes | **Ratificada** |
| D5 | Guardia contra el ruleset vacío | **Modificada.** La regla `required` no detectaba la ausencia de un módulo — verificado ejecutándolo. Sustituida por una aserción de presencia externa (§4.8) |

---

## 1. Qué entra y qué no

**Entra**: workspace pnpm, configuración raíz (TypeScript, Biome, Vitest,
`dependency-cruiser`), stubs de los 7 paquetes/apps declarados en [01 §6](./01-arquitectura.md),
CI en GitHub Actions, y **la prueba negativa de la frontera del motor**.

**No entra** (y no debe entrar aunque sea tentador):

| Fuera de alcance | Por qué | Dónde entra |
|---|---|---|
| Fastify, Drizzle, esquema, migraciones | Fase 0 no ejecuta nada | Fases 2 y 6 |
| React, Vite como dependencia de `apps/web`, Playwright | Ninguna pantalla existe | Fase 7 |
| Testcontainers, Docker | Sin base de datos que levantar | Fase 2 |
| `fast-check` | Sin propiedades que probar | Fase 1 |
| Entornos de despliegue, Dockerfile, PaaS | [05 §0](./05-plan-de-implementacion.md) los aplaza | Fase 9 |
| Scripts `db:*`, `test:golden`, `test:integration`, `dev` | No hay nada detrás; un script falso confunde más que un comando ausente | Sus fases |
| `CLAUDE.md` | Ya está commiteado | Hecho |

`CLAUDE.md` promete comandos que aún no existirán. Eso ya está cubierto por su propia nota de
estado; al cerrar la fase se sustituye por una tabla de "qué comando existe desde qué fase"
(ver §8).

---

## 2. Decisiones pendientes — bloquean el despacho

Ninguna está cubierta por un ADR vigente. Cada una trae recomendación; ratificar o vetar es
cosa de una frase.

### D1 — Versión de TypeScript: 6.0.x, no 7.x. **Recomiendo ADR-016.**

Esto no es un detalle de versión, es una restricción del ecosistema y por eso encabeza la
lista.

- TypeScript **7.0 salió estable el 2026-07-08** (compilador nativo en Go, 8–12× más rápido)
  y es lo que `npm install typescript` instala hoy (`latest` = 7.0.2).
- **TypeScript 7.0 no publica API programática.** Está anunciada para 7.1, ~octubre 2026.
- **`dependency-cruiser` 18.1.0 declara soporte de TypeScript `>=2.0.0 <7.0.0`** y usa la API
  del compilador para parsear `.ts`. Es decir: la herramienta que sostiene el criterio de
  aceptación de esta fase **no funciona con TypeScript 7**.
- Existe el montaje dual documentado por Microsoft (`typescript` → alias
  `npm:@typescript/typescript6`, más `@typescript/native` → `npm:typescript@^7`). Funciona,
  pero deja dos compiladores que pueden discrepar y un editor que hay que apuntar a uno de
  los dos.

**Recomendación: `typescript@^6.0.3` a secas.** El beneficio de TS 7 es velocidad de
typecheck sobre un repo que hoy tiene cero líneas; el coste es dos compiladores y una
herramienta no soportada. Se revisa cuando 7.1 publique la API **y** `dependency-cruiser`
anuncie soporte; hasta entonces el montaje dual no compra nada.

Merece ADR porque tiene fecha de revisión externa y una reversión ya prevista: cuando llegue,
conviene que exista el registro de por qué se esperó.

### D2 — Resolución de módulos: `nodenext` con extensiones explícitas

TypeScript 6 **eliminó** `moduleResolution: node`/`node10`/`classic`. Quedan dos opciones
reales:

| Opción | A favor | En contra |
|---|---|---|
| `nodenext` | Corre en Node sin transpilar; una sola forma de escribir imports en todo el repo | Hay que escribir `./foo.js` apuntando a `foo.ts`. Los agentes lo olvidan constantemente |
| `bundler` | Imports sin extensión, que es lo que todo el mundo escribe por defecto | Obliga a un bundler para ejecutar `apps/api`; dos dialectos si `apps/web` y `apps/api` divergen |

**Recomendación: `nodenext` en todo el repo**, con la regla `useImportExtensions` de Biome
activada (existe en Biome 2.x, grupo `correctness`, no activa por defecto, con autofix
seguro). Esa regla convierte el olvido de la extensión en un fallo mecánico de `pnpm verify`,
que es la única forma de que la convención sobreviva a un agente distraído.

Reversible por codemod. Barato hoy (0 imports), caro en fase 5 (cientos). Por eso se decide
ahora y no "cuando haga falta".

### D3 — `target` y `lib`: `es2024`, no el `es2025` por defecto

TypeScript 6 cambió el `target` por defecto a `es2025`, y **`es2025` incluye los tipos de
`Temporal`**. El runtime no acompaña:

- **Node 24 (Active LTS)** necesita `--harmony-temporal`; sin el flag no existe.
- **Node 26** lo trae sin flag, pero es *Current*: no es LTS hasta octubre de 2026.

Con `lib: es2025`, `Temporal.Now.instant()` compilaría y reventaría en ejecución. Con el
paquete más delicado del proyecto (`packages/temporal`, fase 1) eso es exactamente el tipo de
trampa que hay que desactivar antes de que alguien caiga en ella.

**Recomendación: `"target": "es2024"` y `"lib": ["es2024"]` en la base.** Se pierde
`RegExp.escape` y `Map.getOrInsert`, que no le importan a nadie aquí. El efecto útil es que
un `Temporal` global **no compila**, forzando el import explícito de `@js-temporal/polyfill`.
La elección polyfill vs. nativo sigue siendo de la fase 1 ([05 §Fase 1](./05-plan-de-implementacion.md));
esto solo impide que se tome por accidente.

### D4 — Se crean stubs de los 7 paquetes, no solo de los de las fases 1–2

Crear `packages/ical` (fase 8) y `packages/contracts` (fase 6) hoy es YAGNI de manual. Lo
justifica una sola cosa: **el entregable de esta fase es el grafo de dependencias, y un
ruleset solo se puede probar sobre directorios que existen.** Un stub son 4 archivos
minúsculos; re-litigar la estructura dentro de seis fases cuesta más.

**Recomendación: los 7** (`domain`, `temporal`, `engine`, `ical`, `contracts`, `apps/api`,
`apps/web`), como stubs **sin dependencias de framework**. Ni Fastify en `api`, ni React en
`web`.

### D5 — Guardia contra el ruleset vacío ~~regla `required`~~ → **aserción de presencia sobre la salida JSON**

**Revisada el 2026-07-29. La versión original era falsa y se comprobó ejecutándola.**

El modo de fallo que más me preocupa de esta fase no es que la regla no salte: es que **un
glob mal escrito haga que ninguna regla se evalúe nunca y CI quede verde sin proteger nada**.
Una prueba negativa puntual no lo detecta si el error se introduce después. Ese razonamiento
sigue en pie; el mecanismo que elegí para atenderlo, no.

#### Lo que escribí y era falso

> *"Una regla `required`: `packages/engine/src/index.ts` debe depender de `packages/domain`.
> Si el grafo se vacía, la regla falla y CI se pone rojo."*

`qa-engineer` lo planteó como hipótesis al escribir el Caso 7 de
[`docs/qa/fase-0-frontera.md`](../qa/fase-0-frontera.md) y se verificó ejecutándolo: añadiendo
`exclude: { path: "packages/engine" }` a las opciones, el resultado es

```
✔ no dependency violations found (13 modules, 12 dependencies cruised)
```

Verde limpio, frente a los 15 módulos del run sano. `el-grafo-no-esta-vacio` no se dispara.

**Por qué falla:** las reglas `required` se evalúan **módulo a módulo, sobre los módulos que el
grafo contiene**. Detectan que a un módulo presente le falta una arista; no detectan que el
módulo entero ha desaparecido. Cuando `packages/engine` sale del grafo no queda nada sobre lo
que evaluar la regla, así que la regla no se evalúa y el resultado es éxito. Mi afirmación solo
era cierta en el caso menos probable —el módulo sigue ahí y pierde la arista— y falsa en el más
plausible, que es que el módulo desaparezca.

**No hay mecanismo nativo.** Lo comprobé antes de proponer alternativa: todas las clases de
regla de `dependency-cruiser` (`forbidden`, `allowed`, `required`) se evalúan sobre el grafo
cruzado, y ninguna puede aseverar sobre lo que el grafo *no* contiene. Tampoco hay umbral de
recuento en el CLI. Correr `depcruise` por paquete tampoco sirve: un `exclude` demasiado amplio
vacía igualmente cada invocación y devuelve cero. **La aserción tiene que ser externa a la
herramienta.**

#### Mecanismo nuevo: presencia por ruta, nunca recuento

Se aseveran dos cosas sobre la salida JSON de `depcruise`:

1. **Los 7 módulos de entrada están presentes** en el conjunto cruzado:
   `packages/{domain,temporal,engine,ical,contracts}/src/index.ts` y
   `apps/{api,web}/src/index.ts`.
2. **Ningún módulo de un paquete `@oa/*` aparece bajo `node_modules/`**, lo que convertiría la
   resolución por symlink en no fiable.

**Descarto el suelo por recuento**, que era la otra opción sobre la mesa, por tres razones y
no por gusto:

- **Deriva hacia arriba con cada archivo nuevo**, así que exige mantenimiento en un calendario
  que no tiene nada que ver con la arquitectura. Un guardrail que hay que tocar cada semana se
  acaba subiendo hasta que deja de proteger.
- **Es satisfacible por accidente**: si `packages/engine` desaparece (−2 módulos) y alguien
  añade dos tests en otro paquete (+2), el recuento cuadra y la protección se ha perdido en
  silencio. Mide volumen, no cobertura, y lo que nos importa es cobertura.
- **Cuando falla no dice qué se perdió.** "Hay menos módulos de los esperados" no es
  accionable; "`packages/engine/src/index.ts` no está en el grafo" sí.

La lista de 7 rutas se mantiene sola: solo cambia si cambia la estructura de paquetes de
[01 §6](./01-arquitectura.md), que es exactamente el momento en que quieres que un humano
piense. No hay deriva posible.

#### Efecto colateral: cierra tres casos del guion de QA de una vez

- **Caso 6** (glob de crawl roto): `depcruise` o bien erroriza y no emite JSON válido —el
  script falla al parsear— o bien emite un grafo vacío —faltan los 7 módulos—. Rojo por las dos
  ramas.
- **Caso 7** (`exclude` que atrapa `packages/engine`): faltan sus módulos. Rojo. Es el caso que
  destapó el fallo.
- **Caso 8** (config ausente o rota): sin JSON válido, rojo.

#### Cómo se demuestra que este guardrail sí funciona

No basta con escribirlo: **hay que reejecutar el Caso 7 con el guardrail puesto y ver que se
pone rojo nombrando `packages/engine/src/index.ts`.** Un guardrail contra fallos silenciosos
que no se ha visto fallar es, otra vez, una intención. El resultado va al registro de
ejecuciones de [`docs/qa/fase-0-frontera.md §9`](../qa/fase-0-frontera.md).

#### Por qué esto no necesita un ADR

El propósito no cambió —*el ruleset debe ser demostrablemente no vacío*— y D5 nunca fue un ADR:
era una decisión de implementación dentro de este plan. Lo que cambió es que el mecanismo
elegido no hacía lo que yo afirmé. Un ADR registra decisiones cuyas consecuencias sobreviven a
su implementación; esto es un defecto de implementación, y su sitio es este documento y el
registro del guion de QA. Abrir un ADR por cada corrección diluiría la serie.

**Lo que sí hay que conservar es el hallazgo**, porque no es obvio y alguien volverá a proponer
una regla `required` para esto dentro de un año: *las reglas `required` de `dependency-cruiser`
no detectan la ausencia de un módulo.* Está escrito aquí arriba y en el Caso 7 del guion.

### No bloqueantes, pero conviene resolverlas pronto

- ~~**Licencia.**~~ **Resuelta el 2026-07-29: MIT**, en `LICENSE` y declarada en el
  `package.json` raíz. El README ya no dice "sin licencia declarada".
- **`apps/web` en el `projects` de Vitest.** Cuando la fase 7 traiga React necesitará
  `environment: 'jsdom'`. Hoy no, y no hay que anticiparlo.

### Desviaciones de T1 respecto al manifiesto — ratificadas el 2026-07-29

Las tres son correctas y mejoran lo que yo había escrito. Quedan registradas porque dos tienen
consecuencias más allá de la fase 0.

| Desviación | Veredicto | Consecuencia que hay que recordar |
|---|---|---|
| `allowImportingTsExtensions` en `tsconfig.base.json` | **Correcta.** Es la consecuencia obligada de la combinación que yo elegí: `nodenext` + `exports` apuntando a `./src/index.ts` + `useImportExtensions` de Biome, que pide la extensión **real** del archivo. Los imports llevan `.ts` y son coherentes de punta a punta | **Nota para la fase 6**: los especificadores `.ts` exigen que `apps/api` se ejecute con el type-stripping nativo de Node o con un bundler. Es viable en Node 24 y no cambia ninguna decisión, pero decidirlo en la fase 6 y no descubrirlo |
| `pnpm/action-setup` sin `version:`, leyendo de `packageManager` | **Mejor que lo que especifiqué.** Dar ambos aborta la acción, y así hay una sola fuente de verdad de la versión de pnpm | Ninguna. Corregir §4.6 si alguien lo copia de ahí |
| Regex de `sin-io-en-nucleo` simplificado por rechazo de ReDoS | **Correcta como reacción**, pero deja una conjetura sin verificar | **Es la razón de §6.bis.** El regex nuevo no se ha ejecutado nunca contra una ruta resuelta real de pnpm. Sin esa prueba, la mitad npm de la frontera es una intención |

### Convenciones que este plan fija (vetables en una frase, no son ADR)

| Convención | Valor | Por qué |
|---|---|---|
| Scope npm | `@oa/*` (`@oa/engine`, `@oa/temporal`…) | Se escribe en cada import; corto gana. Si prefieres `@organizacion/*`, dilo antes de T1 |
| Ubicación de tests | Junto al código: `src/**/*.test.ts` | Un solo sitio donde mirar |
| Config de `dependency-cruiser` | `.dependency-cruiser.cjs` | Es lo que genera `depcruise --init` y evita el conflicto con `"type": "module"` |
| `erasableSyntaxOnly: true` | Activado | Prohíbe `enum`, `namespace` y propiedades de parámetro; mantiene abierta la ejecución directa en Node y empuja hacia uniones de literales, que es lo que el dominio ya usa |
| `.npmrc` | **No se crea** | En pnpm 11, `.npmrc` solo sirve para auth y registry. El resto va en `pnpm-workspace.yaml` |

---

## 3. Versiones — verificadas el 2026-07-28

| Pieza | Versión | Nota |
|---|---|---|
| Node.js | **24.x** (24.18.0 es la última) | Active LTS. Node 26 es *Current*, LTS en octubre 2026: no todavía |
| pnpm | **11.17.0** | Va en `packageManager` |
| TypeScript | **^6.0.3** | Ver D1. **No** `latest`, que hoy resuelve a 7.0.2 |
| Vitest | **^4.1.10** | `vitest.workspace.ts` está deprecado desde 3.2: se usa `test.projects` |
| Vite | **^8.1.5** | Peer requerido por Vitest 4. Se instala en la raíz, no en `apps/web` todavía |
| `@vitest/coverage-v8` | **^4.1.10** | Mismo minor que Vitest |
| Biome | **2.5.6** | Pin exacto; el `$schema` del `biome.json` lleva la misma versión |
| dependency-cruiser | **^18.1.0** | `engines: ^22 \|\| ^24 \|\| >=26`. Soporta TS `<7.0.0` |
| `@types/node` | **^24** | Alineado con el Node de CI |
| `actions/checkout` | **v6** | v7.0.1 existe (2026-07-17); no hay razón para estrenarla |
| `actions/setup-node` | **v6** | |
| `pnpm/action-setup` | **v6.0.5** | Es la que documenta pnpm hoy |

### Incompatibilidades y trampas conocidas — leer antes de escribir la configuración

1. **TypeScript 7 rompe `dependency-cruiser`.** Ver D1. Si alguien instala `typescript@latest`,
   la fase pierde su criterio de aceptación.
2. **TypeScript 6 cambió los valores por defecto de `tsconfig`:** `strict` pasa a `true`,
   `module` a `esnext`, `target` a `es2025`, `noUncheckedSideEffectImports` a `true` y —la que
   muerde— **`types` a `[]`**. Cualquier paquete que necesite tipos de Node debe declarar
   `"types": ["node"]` explícitamente. Los stubs de esta fase no lo necesitan.
3. **TypeScript 6 eliminó** `baseUrl`, `moduleResolution: node/node10/classic`,
   `target: es5`, `outFile` y `esModuleInterop: false`. Configuración copiada de un tutorial
   de 2024 dará error duro.
4. **pnpm 11 eliminó `onlyBuiltDependencies`; ahora es `allowBuilds`** en
   `pnpm-workspace.yaml`. Los scripts de instalación de las dependencias siguen bloqueados por
   defecto. `esbuild` (vía Vite) los necesita. Si `pnpm install` avisa de scripts ignorados,
   se añaden **uno a uno** a `allowBuilds`; nunca un permiso global.
5. **pnpm 11 solo lee auth y registry de `.npmrc`.** Un `.npmrc` con `shamefully-hoist` o
   `node-linker` se ignora en silencio, que es la peor forma de fallar.
6. **Orden en CI:** `pnpm/action-setup` va **antes** de `actions/setup-node`. Con
   `cache: "pnpm"`, `setup-node` necesita que pnpm ya exista o falla en el primer paso.
7. **Vitest 4 termina en error si un proyecto no tiene ningún test.** Por eso cada stub lleva
   un test de humo — y ese test, además, demuestra que la resolución entre paquetes funciona.
8. **`coverage` es configuración de raíz en Vitest 4**, no de proyecto. El umbral de ≥95 % de
   ramas que la fase 1 exige para `packages/temporal` se declarará como umbral por glob en el
   `vitest.config.ts` raíz, no dentro del paquete.

---

## 4. Manifiesto de archivos

**37 archivos.** Nada fuera de esta lista sin decirlo antes.

> **Enmienda del 2026-07-29.** El manifiesto original tenía 36 archivos y ninguno era un
> script. La corrección de D5 obliga a añadir uno: la aserción de presencia no se puede
> expresar dentro de `dependency-cruiser`. Es la única excepción y va acotada en §4.8.

### 4.1 Raíz (10 archivos)

| Archivo | Contenido esencial |
|---|---|
| `pnpm-workspace.yaml` | `packages: ['packages/*', 'apps/*']`; `allowBuilds:` (vacío al principio, se rellena con lo que reclame `pnpm install`); `catalog:` con **todas** las versiones de §3 |
| `package.json` | `"private": true`, `"type": "module"`, `"packageManager": "pnpm@11.17.0"`, `engines.node: ">=24 <25"`, scripts de §4.4, devDependencies **todas** por `catalog:` |
| `tsconfig.base.json` | Solo `compilerOptions`. Sin `include`, sin `files`. Detalle en §4.3 |
| `biome.json` | `$schema` de 2.5.6; formateador y linter activados; `useImportExtensions: "error"` (si D2 = `nodenext`); `files.includes` excluyendo `node_modules`, `dist`, `coverage` |
| `vitest.config.ts` | `test.projects: ['packages/*', 'apps/*']`; `coverage.provider: 'v8'`, reporters `text` + `lcov`. **Sin umbrales todavía** |
| `.dependency-cruiser.cjs` | El ruleset de §4.5. Es el archivo más importante de la fase |
| `.github/workflows/ci.yml` | §4.6 |
| `.gitignore` | `node_modules/`, `dist/`, `coverage/`, `.DS_Store`, `*.local`, `.env`, `.env.*`, `!.env.example` |
| `.nvmrc` | `24` |
| `README.md` | *(existe)* — actualizar el bloque de estado en el cierre (T7) |

**No se crea `tsconfig.json` en la raíz.** Sin referencias de proyecto no aporta nada: cada
paquete tiene el suyo y los editores resuelven por proximidad. Un `tsconfig.json` raíz vacío
solo genera el error "No inputs were found".

**No se crea `.npmrc`** (trampa 5) **ni `.editorconfig`** (Biome es la única fuente de formato).

### 4.2 Por paquete — 4 archivos × 7 = 28

Aplica igual a `packages/{domain,temporal,engine,ical,contracts}` y a `apps/{api,web}`:

| Archivo | Contenido |
|---|---|
| `package.json` | `"name": "@oa/<nombre>"`, `"private": true`, `"type": "module"`, `"version": "0.0.0"`; `"exports": { ".": "./src/index.ts" }` **más** `"main"` y `"types"` apuntando al mismo `./src/index.ts`; `devDependencies: { typescript: "catalog:", vitest: "catalog:" }`; `scripts: { "typecheck": "tsc" }` |
| `tsconfig.json` | `{ "extends": "../../tsconfig.base.json", "include": ["src"] }` |
| `src/index.ts` | Contenido mínimo de §4.7 |
| `src/index.test.ts` | Un test de humo que importa el propio `index` y comprueba lo que exporta |

`main`/`types` duplicando `exports` es deliberado: `dependency-cruiser` resuelve con
`enhanced-resolve` y no quiero que la fase entera dependa de qué campo prioriza. Cuesta dos
líneas y elimina un modo de fallo.

Cada paquete declara `typescript` y `vitest` como devDependencies aunque estén en la raíz:
con el `node_modules` aislado de pnpm, `tsc` no está en el `PATH` del paquete y el
`import ... from 'vitest'` de un test no resuelve desde dentro del paquete. Las versiones
vienen del `catalog:`, así que no hay deriva posible.

### 4.3 `tsconfig.base.json` — los valores que importan

Solo se declara lo que no coincide con el valor por defecto de TypeScript 6, más lo que exige
[05](./05-plan-de-implementacion.md). `strict: true` ya no hace falta escribirlo, pero se
escribe igual: es una promesa del diseño y prefiero verla.

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,      // exigido por 05
    "exactOptionalPropertyTypes": true,    // exigido por 05
    "module": "nodenext",                  // D2
    "moduleResolution": "nodenext",        // D2
    "target": "es2024",                    // D3 — mantiene Temporal fuera del ámbito global
    "lib": ["es2024"],                     // D3
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "noEmit": true,
    "skipLibCheck": true
  }
}
```

No entran: `paths`, `baseUrl` (eliminado en TS 6), `composite`, `references`, `outDir`.
**Sin referencias de proyecto**: compran compilación incremental sobre cero líneas de código y
cuestan `composite`, emisión de declaraciones y restricciones de `rootDir`. `pnpm -r run
typecheck` basta. Se revisa si el typecheck completo pasa de ~10 s.

### 4.4 Scripts del `package.json` raíz

```jsonc
{
  "typecheck": "pnpm -r --no-bail run typecheck",
  "lint": "biome check .",
  "format": "biome check --write .",
  "test": "vitest run",
  "test:engine": "vitest run --project @oa/engine",
  "depcruise": "depcruise packages apps --config .dependency-cruiser.cjs",
  // Enmienda 2026-07-29 (D5): cobertura del grafo, no violaciones. Ver §4.8.
  "depcruise:cobertura": "depcruise packages apps --config .dependency-cruiser.cjs --output-type json | node scripts/verificar-cobertura-grafo.mjs",
  "verify": "pnpm run typecheck && pnpm run lint && pnpm run test && pnpm run depcruise && pnpm run depcruise:cobertura"
}
```

`--no-bail` en el typecheck para ver los errores de todos los paquetes de una pasada, no del
primero que rompe. `verify` sí corta en el primer fallo: es una puerta, no un informe.

**`depcruise` y `depcruise:cobertura` son dos comandos porque responden a dos preguntas
distintas**, y mezclarlos perdería la salida legible del primero: *¿hay aristas prohibidas?*
frente a *¿el análisis está mirando lo que debe mirar?*. Dos ejecuciones sobre un grafo de 15
módulos cuestan milisegundos.

Detalle que hay que conocer: en el `sh` de los scripts de npm no está activo `pipefail`, así
que el código de salida de `depcruise:cobertura` es el del script de Node, no el de
`depcruise`. Es **deliberado** — si hay violaciones, el rojo lo pone `pnpm depcruise` en el
paso anterior; este comando solo opina sobre cobertura. Lo que sí propaga es el fallo cuando
`depcruise` no emite JSON válido, que es como se detectan los Casos 6 y 8.

Los scripts `test:golden`, `test:integration`, `db:generate`, `db:migrate` y `dev` que
`CLAUDE.md` anuncia **no se crean**. Un script que hace `echo "no implementado"` es ruido que
hay que mantener; la tabla de §8 resuelve la confusión mejor.

### 4.5 `.dependency-cruiser.cjs` — especificación del ruleset

Se parte de `depcruise --init` (que produce el conjunto recomendado: ciclos, huérfanos,
`not-to-unresolvable`, dependencias no declaradas en el `package.json`) y **se le añaden estas
reglas propias**, todas con `severity: "error"`:

| Nombre | Prohíbe | Traduce el guardrail |
|---|---|---|
| `sin-io-en-nucleo` | `packages/{engine,temporal,domain}` → `drizzle-orm`, `fastify`, `pg`, `postgres`, `react`, `axios`, `node:fs`, `node:http`, `node:child_process` y demás built-ins de I/O | 01 §6 y `CLAUDE.md` nº1. **Es el criterio de aceptación de la fase** |
| `nucleo-no-va-a-apps` | `packages/*` → `apps/*` | La flecha solo va en un sentido |
| `engine-solo-domain-y-temporal` | `packages/engine` → cualquier `packages/*` que no sea `domain` o `temporal` | 01 §6 |
| `temporal-no-conoce-dominio` | `packages/temporal` → cualquier otro paquete del proyecto | 01 §6 |
| `domain-no-depende-de-nadie` | `packages/domain` → cualquier otro paquete del proyecto | 01 §6 |
| `web-solo-contracts` | `apps/web` → cualquier `packages/*` que no sea `contracts` | 01 §6, y es la regla que más presión va a recibir en la fase 7 |
| `apps-no-se-cruzan` | `apps/api` ↔ `apps/web` | Son artefactos separados |

Y **una regla `required`** (D5):

| Nombre | Exige | Para qué |
|---|---|---|
| `el-grafo-no-esta-vacio` | `packages/engine/src/index.ts` **debe** depender de `packages/domain` | Si un glob mal escrito vacía el grafo, esta regla falla y CI se pone rojo. Sin ella, un ruleset roto es indistinguible de un ruleset satisfecho |

Notas de implementación para quien lo escriba:

- `preserveSymlinks` se deja en su valor por defecto (`false`): los paquetes del workspace
  entran a `node_modules` como enlaces simbólicos y hay que verlos por su ruta real
  (`packages/domain/src/index.ts`), no como `node_modules/@oa/domain`. Si aparecen rutas de
  `node_modules` en la salida, las reglas de frontera **no están funcionando**.
- La regla `no-engine-a-apps` se prueba con una ruta relativa, no con el nombre del paquete
  (§6): es la única forma de que resuelva siempre.
- La prohibición de built-ins de Node se expresa con `dependencyTypes: ["core"]` más una lista
  explícita; conviene revisar la salida a mano una vez.

### 4.6 `.github/workflows/ci.yml`

```yaml
on:
  push:                    # todas las ramas: la prueba negativa de §6 no debe necesitar un PR
  workflow_dispatch:
permissions:
  contents: read           # repo público: nada de escritura por defecto
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  verify:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v6.0.5        # antes de setup-node (trampa 6)
        with: { version: 11 }
      - uses: actions/setup-node@v6
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run typecheck
      - run: pnpm run lint
        if: ${{ !cancelled() }}
      - run: pnpm run test
        if: ${{ !cancelled() }}
      - run: pnpm run depcruise
        if: ${{ !cancelled() }}
      - run: pnpm run depcruise:cobertura      # enmienda 2026-07-29 (D5)
        if: ${{ !cancelled() }}
```

Sin `pull_request` por ahora: trabajando en solitario duplicaría ejecuciones y, en un repo
público, abre la superficie de los PRs desde forks. Se añade el día que haya alguien más.

Los cuatro pasos van separados con `if: ${{ !cancelled() }}` en vez de un único `pnpm verify`.
Un CI rojo debe decir **todo** lo que está mal de una vez; en local, `pnpm verify` sigue
siendo la puerta única. Los dos usan exactamente los mismos scripts, así que no pueden
divergir.

### 4.7 Contenido de los stubs

Aquí es donde un ejecutor se pondría creativo. No debe.

- `packages/domain/src/index.ts`:
  `export const PACKAGE_ID = '@oa/domain' as const;`
  con el comentario `// ANDAMIAJE: se elimina en la fase 1.`
- `packages/engine/src/index.ts`: importa `PACKAGE_ID` de `@oa/domain` y lo reexporta dentro
  de una constante propia. **Esta arista es obligatoria**: es la que satisface la regla
  `el-grafo-no-esta-vacio` y la que demuestra que las reglas se están evaluando de verdad.
- El resto (`temporal`, `ical`, `contracts`, `apps/api`, `apps/web`): la constante
  `PACKAGE_ID` y nada más. Sin imports.
- Cada `src/index.test.ts`: un `expect(PACKAGE_ID).toBe('@oa/<nombre>')`. Trivial a propósito;
  lo que prueba no es la lógica, es que TypeScript, Vitest y la resolución entre paquetes
  funcionan en ese directorio.

**Ni un tipo del dominio en la fase 0.** `Minutes`, `Instant`, `PlanningDay` y compañía son
diseño de la fase 1 y no se pre-cocinan aquí.

### 4.8 `scripts/verificar-cobertura-grafo.mjs` — enmienda del 2026-07-29 (D5)

El único archivo ejecutable del andamiaje. Existe porque la aserción que D5 necesita no se
puede expresar dentro de `dependency-cruiser` (razonamiento completo en D5).

**Entrada**: el reporte JSON de `depcruise` por `stdin`.
**Salida**: nada en verde salvo una línea de confirmación; en rojo, qué falta y por qué.

Tres comportamientos, en este orden:

1. **JSON no parseable o `stdin` vacío** → error explícito ("`depcruise` no emitió un reporte
   JSON válido: probablemente el argumento de crawl o la configuración están rotos") y salida
   distinta de cero. **No se traga la excepción**: este caso *es* uno de los fallos que el
   script vigila (Casos 6 y 8 del guion de QA), no un contratiempo.
2. **Presencia obligatoria.** Los 7 módulos de entrada deben aparecer en `modules[].source`:

   ```
   packages/domain/src/index.ts      packages/ical/src/index.ts       apps/api/src/index.ts
   packages/temporal/src/index.ts    packages/contracts/src/index.ts  apps/web/src/index.ts
   packages/engine/src/index.ts
   ```

   Si falta alguno: listar **cuáles** (no cuántos) y salir con código distinto de cero.
3. **Resolución por symlink sana.** Ningún `modules[].source` que corresponda a un paquete
   `@oa/*` puede contener `node_modules/`. Si aparece, la resolución no está usando las rutas
   reales del workspace y las reglas de frontera no se están aplicando donde creemos.

Esta tercera aserción **sustituye al punto 4 de §7**, que hasta ahora era "mirar la salida y
comprobar que no hay rutas de `node_modules`". Convertir una obligación humana recurrente en
una comprobación mecánica es una reducción de trabajo, no una adición.

**Límites del script**, para que no crezca:

- No comprueba violaciones. Eso es de `pnpm depcruise`.
- No comprueba recuentos. Ver D5.
- No lee `.dependency-cruiser.cjs` ni deriva nada de él. Se consideró derivar la lista de
  módulos obligatorios de los `from:` de cada regla —elegante, y cubriría reglas futuras
  automáticamente— y se descartó: son 35 líneas de metaprogramación sobre un archivo de
  configuración para mantener sincronizada una lista de 7 rutas que solo cambia si cambia
  [01 §6](./01-arquitectura.md). Si el ruleset crece hasta que la lista se quede corta, se
  reconsidera.

---

## 5. Reparto, orden de despacho y contratos de traspaso

### 5.1 Sobre el paralelismo: casi no lo hay, y forzarlo empeora el resultado

Coincido con tu lectura, y la extiendo. La configuración raíz es una unidad atómica: el
`package.json` referencia el `catalog:` del `pnpm-workspace.yaml`, los `tsconfig.json` de
paquete extienden la base, `vitest.config.ts` descubre proyectos con el mismo glob que declara
el workspace, y CI invoca los scripts del `package.json`. Repartirla entre tres agentes
produce tres modelos mentales del mismo montaje y una tarde de depurar por qué el glob de uno
no casa con el del otro.

**Y los stubs pertenecen a esa misma unidad**, aunque caigan geográficamente en carriles
distintos. Son 28 archivos de tres líneas generados por plantilla; despachar `engine-dev`,
`backend-dev` y `frontend-dev` para escribir siete variantes de `{"extends": "../../tsconfig.base.json"}`
cuesta más coordinación que hacerlos y garantiza que la forma del stub diverja. El criterio
correcto para repartir carriles es *quién es dueño de la lógica*, no *quién es dueño del
directorio*, y aquí no hay lógica de nadie: hay andamiaje.

Lo que sí es paralelismo genuino:

- **T6 (`qa-engineer`)** solo lee documentación y escribe en `docs/qa/`. Cero colisión.
  Puede correr desde el minuto uno.
- **T5 (`security-reviewer`)** es de solo lectura y puede correr a la vez que T4.

Todo lo demás es una cadena. Un plan secuencial de siete pasos para una fase de un día no es
un problema que resolver.

### 5.2 Quién hace la configuración raíz: **la sesión principal**

Es una decisión real y `engine-dev` es un candidato serio: es opus, es quien más va a sufrir
si la frontera no funciona, y es quien más veces va a ejecutar `pnpm verify` en las fases 1–5.
Aun así, la sesión principal gana por tres razones:

1. **Tu propia tabla de enrutamiento ya lo dice**: "cualquier cosa que no caiga en un carril".
   La raíz no es `packages/*` ni `apps/*`.
2. **Despachar a `engine-dev` exige suspender su restricción más importante** —"nunca fuera de
   `packages/*`"— en el primer día de vida del proyecto. Los carriles son el mecanismo que va
   a mantener este repo coherente durante meses; erosionarlos en la tarea 1 para ahorrar un
   par de horas establece exactamente el precedente equivocado. La próxima vez que un agente
   quiera salirse, el argumento ya está sentado.
3. **El bucle de esta fase es push → mirar CI → arreglar → push**, sobre un repositorio
   público del que tú eres dueño. Es intrínsecamente interactivo y de git. Un subagente
   empujando commits a `main` de un repo público para ver si el YAML compila es la peor parte
   de este plan para delegar.

**Descartado también un paso de revisión de `engine-dev` sobre el ruleset.** Lo consideré: es
barato y el ruleset es el artefacto crítico. Pero la prueba negativa de §6 es evidencia
estrictamente más fuerte que una lectura — si la arista prohibida falla y la permitida pasa,
las reglas funcionan; y si no, ninguna revisión lo habría garantizado. Añadir la revisión
sería ceremonia.

### 5.3 Tabla de despacho

| # | Tarea | Ejecutor | Depende de | Duración |
|---|---|---|---|---|
| T0 | Ratificar D1–D5 | tú | — | 10 min |
| T1 | Configuración raíz + 7 stubs + `pnpm install` + `pnpm verify` verde en local | **sesión principal** | T0 | 2–3 h |
| T2 | Primer commit y primer CI verde en `main` | **sesión principal** | T1 | 1–2 h |
| T3 | Prueba negativa de la frontera | **sesión principal** (git) + **`test-runner`** (evidencia) | T2 | 30–45 min |
| T4 | Revisión de seguridad del andamiaje | **`security-reviewer`** | T2 | 20 min |
| T5 | Guion repetible de la prueba de frontera | **`qa-engineer`** | T0 | 30 min |
| T6 | Cierre documental + ADR-016 | **`arquitecto`** | T3, T4, T5 | 45 min |

Orden real: `T0 → T1 → T2 → T3 → T6`, con `T4` en paralelo a `T3` y `T5` en paralelo a
cualquier cosa desde T0.

### 5.4 Contratos de traspaso

**T1 — Configuración raíz y stubs (sesión principal)**

- *Precondición*: D1–D5 ratificadas. Repositorio con solo documentación.
- *Entrada*: §3 (versiones), §4 (manifiesto completo), §2 (decisiones).
- *Límites*: exactamente los 36 archivos de §4. Ni un archivo más sin decirlo. Nada de
  Fastify, React, Drizzle, Playwright ni Testcontainers.
- *Salida verificable*: `pnpm install` sin advertencias de scripts bloqueados sin resolver;
  `pnpm verify` verde en local; `pnpm depcruise` mostrando **rutas de `packages/…`, no de
  `node_modules/…`**, y la arista `engine → domain` presente.
- *Reporte*: lista de archivos creados; versiones exactas que resolvió el lockfile (las
  resueltas, no los rangos); qué entró en `allowBuilds` y por qué; cualquier desviación de §4
  con su motivo.

**T2 — Primer CI verde**

- *Precondición*: T1 reportado, `pnpm verify` verde en local.
- *Salida verificable*: un run verde en `main`, con los cuatro pasos ejecutados.
- *Reporte*: URL del run; cuántas iteraciones hicieron falta y qué falló en cada una (esto
  alimenta la lista de trampas de §3 para el futuro).

**T3 — Prueba negativa** — procedimiento completo en §6.

- *Precondición*: T2 verde.
- *Salida verificable*: un run **rojo** cuyo fallo es el paso `depcruise`, con el nombre de la
  regla de frontera en la salida.
- *Reporte* (`test-runner`, en local, antes de empujar): el nombre exacto de cada regla que
  saltó, el código de salida y el número de violaciones. Distinguiendo explícitamente
  violación de arquitectura de fallo de test, que es lo que su brief le pide hacer.

**T4 — Revisión de seguridad (`security-reviewer`, solo lectura)**

- *Precondición*: T2 verde.
- *Alcance acotado* — no es una auditoría del producto, que aún no existe:
  1. `ci.yml`: `permissions`, disparadores, versiones de acciones ancladas, ausencia de
     secretos y de `pull_request_target`.
  2. `.gitignore`: que `.env` y variantes estén excluidos antes de que exista el primer
     secreto.
  3. `pnpm audit` sobre el lockfile inicial.
  4. Que ningún archivo del andamiaje contenga credenciales, URLs internas ni datos
     personales.
- *Reporte*: lista priorizada. Si no hay nada, que lo diga.

**T5 — Guion de QA (`qa-engineer`)**

- *Precondición*: D1–D5 ratificadas (nada más; no necesita código).
- *Entrega*: `docs/qa/fase-0-frontera.md` con el procedimiento de §6 en formato
  precondición / acción / resultado esperado, **reutilizable**: se vuelve a ejecutar cada vez
  que cambie el ruleset o se añada un paquete.
- *Límite explícito*: no rediseñar los criterios de aceptación de la fase 0 ni adelantar los
  de la fase 1. Solo el guion de la prueba de frontera y la lista de comprobación del cierre.

**T6 — Cierre documental (`arquitecto`)** — detalle en §8.

- *Precondición*: reportes de T2, T3, T4 y T5.
- *Entrada necesaria*: URLs de los runs verde y rojo, SHA del commit envenenado, salida
  literal de `dependency-cruiser`, versiones resueltas del lockfile.

---

## 6. La prueba negativa, paso a paso

El criterio de [05](./05-plan-de-implementacion.md) dice: *un import de `drizzle-orm` dentro
de `packages/engine` rompe el build*. Ejecutado tal cual en la fase 0 **da un falso positivo**,
y conviene entenderlo antes de darlo por bueno:

`drizzle-orm` no está instalado en ningún sitio (llega en la fase 2), y aunque lo estuviera en
`apps/api`, el `node_modules` aislado de pnpm no lo haría resoluble desde `packages/engine`.
El import sería **irresoluble**, y `dependency-cruiser` lo marcaría con la regla
`not-to-unresolvable` del conjunto recomendado. CI se pondría rojo — pero por higiene de
dependencias, no porque la regla de frontera exista. Un ruleset con la regla de frontera
comentada daría el mismo rojo.

Por eso la prueba envenena **dos** imports y verifica **tres** cosas.

### Procedimiento

**Paso 1 — Rama.** Desde `main` verde:

```
git switch -c chore/verificacion-frontera
```

**Paso 2 — Envenenar.** En `packages/engine/src/index.ts`, añadir arriba:

```ts
// PRUEBA NEGATIVA DE LA FRONTERA — este commit DEBE romper CI. No mergear.
import { drizzle } from 'drizzle-orm';                      // (a) el criterio literal del 05
import { PACKAGE_ID as API } from '../../../apps/api/src/index.ts';  // (b) regla de frontera
```

(b) es el que importa. Al ser una ruta relativa resuelve siempre, independientemente de qué
haya instalado, así que obliga a la regla `nucleo-no-va-a-apps` a pronunciarse. Sin él, la
prueba no distingue "la frontera funciona" de "la higiene de dependencias funciona".

**Paso 3 — Verificar en local antes de empujar.** Despachar `test-runner` con:
`pnpm depcruise` y `pnpm verify`, reportando nombres de regla, número de violaciones y código
de salida. Debe aparecer `nucleo-no-va-a-apps` de forma explícita.

**Paso 4 — Empujar y mirar CI.**

```
git commit -am "test: verifica que la frontera del motor rompe el build (DEBE fallar)"
git push -u origin chore/verificacion-frontera
```

CI se dispara porque el workflow escucha `push` en todas las ramas: no hace falta abrir un PR.

**Paso 5 — Las tres comprobaciones.** El run debe cumplir las tres, no una:

1. **Rojo**, y el paso que falla es `depcruise`. Si falla antes (typecheck), el import
   irresoluble tumbó el typecheck primero: sigue siendo un rojo válido, pero hay que leer el
   log de `depcruise` —que se ejecuta igual gracias a `if: ${{ !cancelled() }}`— para
   comprobar el punto 2.
2. **La salida nombra `nucleo-no-va-a-apps`.** Esta es la prueba de que la regla de frontera
   existe y se evalúa. Sin ella, la prueba no vale.
3. **El run verde anterior (T2) satisfacía `el-grafo-no-esta-vacio`.** Es la mitad positiva:
   demuestra que el ruleset estaba viendo módulos de verdad y no un grafo vacío.

**Paso 6 — Evidencia.** Copiar a la sección §9 de este documento, antes de borrar nada:

- SHA del commit envenenado y URL del run rojo.
- URL del run verde inmediatamente anterior.
- **La salida literal de `dependency-cruiser`** (recortada a las líneas de violación).
- Fecha y quién lo ejecutó.

Lo literal no es opcional: los runs de Actions sobreviven al borrado de la rama, pero el commit
queda inalcanzable y GitHub no garantiza conservarlo para siempre. **Si la evidencia es solo un
enlace, dentro de un año no habrá evidencia.**

**Paso 7 — Descartar. Sin merge.**

```
git switch main
git push origin --delete chore/verificacion-frontera
git branch -D chore/verificacion-frontera
```

**Por qué se descarta y no se mergea.** El repositorio es público. Un commit rojo deliberado
en el historial de `main` es un "aquí `main` estuvo roto" permanente para cualquiera que pase
por encima, y además ensucia cualquier `git bisect` futuro que use "CI verde" como criterio.
El valor del commit es la ejecución, no su presencia en el árbol; y la ejecución queda
registrada en Actions y transcrita en §9. Descartar la rama no pierde nada que importe.

### 6.bis — La mitad npm de `sin-io-en-nucleo`. Enmienda del 2026-07-29

**El hueco.** Las tres comprobaciones del procedimiento de arriba se pasarían con la regla
`sin-io-en-nucleo` **completamente ausente del ruleset**. La evidencia de §9 lo confirma: solo
saltaron `nucleo-no-va-a-apps` y `not-to-unresolvable`. El import (a) —`drizzle-orm`, que es el
criterio textual de [05](./05-plan-de-implementacion.md)— nunca llega a ejercitar la regla que
supuestamente lo prohíbe.

La mitad nativa ya está demostrada: `node:fs/promises` dispara `sin-io-nativo-en-nucleo` de
forma aislada, porque los built-ins siempre resuelven. La mitad npm no.

#### Diferirlo a la fase 2 no funciona, y es importante entender por qué

La respuesta intuitiva es "esperar a que llegue `drizzle-orm` de verdad". **No sirve.** La fase
2 instala `drizzle-orm` en `apps/api`, y con el `node_modules` aislado de pnpm eso **no lo hace
resoluble desde `packages/engine`**. El import seguiría siendo irresoluble en la fase 2, en la
6 y en la 9. Esperar no cambia nada.

`sin-io-en-nucleo` solo puede dispararse cuando el paquete prohibido es **resoluble desde el
paquete del núcleo**, porque la regla casa contra la ruta resuelta
(`to: { path: "node_modules/(...)/" }`) y un módulo irresoluble no tiene ruta resuelta. Eso no
es un defecto: es exactamente el ataque realista. Alguien que quiera usar Drizzle dentro del
motor no escribirá un import roto — lo declarará en `packages/engine/package.json`, lo
instalará y entonces resolverá. Los dos caminos están cubiertos (irresoluble →
`not-to-unresolvable` + `no-deps-sin-declarar`; resoluble → `sin-io-en-nucleo`), pero solo uno
está demostrado.

#### Por qué esto no es opcional: el regex nunca se ha probado contra una ruta real

El regex de `sin-io-en-nucleo` **se simplificó durante T1** porque `dependency-cruiser` rechazó
el original por riesgo de ReDoS. La versión que quedó se ancla al último segmento
`node_modules/` con la intención de casar tanto un layout plano como el `.pnpm/` de pnpm —y
esa intención **no se ha verificado nunca contra una ruta resuelta de verdad**, que en pnpm
tiene la forma `node_modules/.pnpm/drizzle-orm@X.Y.Z/node_modules/drizzle-orm/dist/index.js`.

Un guardrail cuyo regex no se ha ejecutado sobre su entrada real es una conjetura. Esta prueba
es lo que la convierte en un hecho, y cuesta tres minutos.

#### Procedimiento (Modo B del guion de QA: local, sin commit)

```bash
git status --short                                  # árbol limpio

pnpm --filter @oa/engine add drizzle-orm            # el ataque realista: declararlo
# añadir a packages/engine/src/index.ts:
#   import { drizzle } from 'drizzle-orm';
pnpm depcruise

# revertir SIEMPRE, aunque el resultado sea el esperado
git checkout -- packages/engine/src/index.ts packages/engine/package.json pnpm-lock.yaml
pnpm install
git status --short                                  # limpio otra vez
```

**Criterio de éxito**: la salida nombra **`sin-io-en-nucleo`**. Nada más cuenta. Que salga rojo
no vale: `no-deps-sin-declarar` ya no dispararía (la dependencia está declarada), pero cualquier
otro ruido tampoco es prueba.

**Si no salta**, el regex no casa con el layout de pnpm y hay que corregirlo **antes de cerrar
la fase**. Es el escenario que justifica hacer esto ahora: descubrirlo en la fase 2, con el
motor a medio escribir, es infinitamente peor.

**Nota sobre la red**: `pnpm add` necesita descargar `drizzle-orm` una vez. Si no hay red, la
alternativa es añadir temporalmente al `IO_EXTERNO` del ruleset un paquete que ya esté en el
lockfile (`vite`, por ejemplo) y repetir el ejercicio con él. Prueba la mecánica del regex
contra una ruta real de pnpm, que es el 90 % del valor, pero mueve dos variables a la vez:
úsalo solo como último recurso y déjalo anotado.

#### Gap adicional detectado al revisar el ruleset, y qué hacer con él

`IO_NATIVO` cubre sistema de archivos, red y procesos, pero **no cubre reloj ni aleatoriedad**:
faltan `crypto`, `timers`, `timers/promises` y `perf_hooks`. `CLAUDE.md` nº1 prohíbe el reloj
en el mismo aliento que la I/O, y nº9 prohíbe la aleatoriedad incluso con semilla.

- **Ahora, 30 segundos**: añadir esos cuatro a `IO_NATIVO`. Misma regla, mismo test (Caso 4 del
  guion de QA ya lo cubre sin cambios).
- **Diferido a la fase 1, con dueño**: `Date.now()`, `new Date()` y `Math.random()` **no son
  imports**, así que `dependency-cruiser` no puede verlos jamás — ninguna configuración lo
  arregla. Ese guardrail necesita una regla de Biome (`noRestrictedGlobals` o equivalente) o el
  test de arquitectura que [05 §6](./05-plan-de-implementacion.md) ya anuncia. Entra en la fase
  1, que es cuando `packages/temporal` tiene código que proteger, y lo implementa `engine-dev`.
  **Anotarlo ahora evita cerrar la fase 0 creyendo que el reloj ya está cubierto: no lo está.**

---

## 7. Definición de "hecho"

**Revisada el 2026-07-29** tras los dos huecos que destapó el guion de QA. Los puntos 4 y 5
cambian de naturaleza y aparecen dos nuevos (6 y 8).

La fase 0 está cerrada cuando **todo** esto es cierto y verificable por alguien que no lo
escribió:

1. `pnpm install` desde limpio (`rm -rf node_modules && pnpm install --frozen-lockfile`)
   funciona sin intervención manual.
2. `pnpm verify` pasa en local **y** en CI, sobre `main`.
3. El run verde muestra los **cinco** pasos ejecutados, no saltados.
4. ~~Revisión visual de la salida~~ → `pnpm depcruise:cobertura` pasa en verde. La comprobación
   de que no hay rutas de `node_modules/@oa/…` ya es mecánica (§4.8, aserción 3): nadie tiene
   que acordarse de mirar.
5. **El guardrail de cobertura se ha visto fallar.** Reejecutar el Caso 7 del guion de QA
   (`exclude` que atrapa `packages/engine`) con `depcruise:cobertura` puesto, y comprobar que se
   pone rojo nombrando `packages/engine/src/index.ts`. Registrar el resultado en el §9 del
   guion. *Sustituye al antiguo punto 5, que daba por buena una regla `required` que no hacía
   lo que se le atribuía.*
6. **La mitad npm de `sin-io-en-nucleo` está demostrada** (§6.bis): con `drizzle-orm` declarado
   e instalado en `packages/engine`, la salida nombra `sin-io-en-nucleo`. Es lo que valida que
   el regex simplificado por ReDoS casa con el layout real de pnpm.
7. La prueba negativa de §6 se ejecutó, CI se puso rojo, la salida nombró
   `nucleo-no-va-a-apps`, y la evidencia literal está transcrita en §9. **Hecho el 2026-07-29.**
8. La mitad nativa de la frontera está demostrada: `node:fs/promises` en `packages/engine`
   dispara `sin-io-nativo-en-nucleo` de forma aislada. **Hecho el 2026-07-29.**
9. La rama `chore/verificacion-frontera` no existe ni en local ni en remoto. **Hecho.**
10. `security-reviewer` reportó, y todo hallazgo crítico o alto está resuelto o registrado con
    su motivo.
11. `docs/qa/fase-0-frontera.md` existe, el guion es repetible por alguien que no estuvo
    presente, y su §9 registra las ejecuciones de los puntos 5 y 6.
12. Los siete paquetes tienen `typecheck` y test de humo pasando, individualmente.
13. La documentación de §8 está actualizada **en el mismo PR/commit** que cierra la fase.

Los puntos que deciden si la fase está hecha son el **5, 6, 7 y 8**: son las cuatro mitades de
la única garantía que esta fase entrega. Todo lo demás es andamiaje que se puede rehacer en una
tarde; esto no, porque nadie vuelve a verificar una frontera que ya cree verificada.

**Lo que esta fase NO garantiza, y conviene decirlo antes de cerrarla:**

- El reloj y la aleatoriedad **no** están cubiertos. `Date.now()` y `Math.random()` no son
  imports y `dependency-cruiser` no puede verlos. Entra en la fase 1 (§6.bis).
- ~~`web-solo-contracts` y `apps-no-se-cruzan` están escritas pero **no demostradas**~~.
  **Corregido el 2026-07-29: ambas demostradas.** El argumento de esperar a la fase 7 no se
  sostenía — `nucleo-no-va-a-apps` se demostró contra stubs igual de vacíos, y una regla se
  ejercita con una arista prohibida, no con contenido real. Envenenando
  `apps/web/src/index.ts`:

  ```
  error web-solo-contracts: apps/web/src/index.ts → packages/engine/src/index.ts
  error apps-no-se-cruzan:  apps/web/src/index.ts → apps/api/src/index.ts
  ```

  Importa más de lo que parece: `apps-no-se-cruzan` usa una retrorreferencia `$1` al grupo
  capturado en su `from`, y esa sintaxis **nunca se había ejecutado**. Era la tercera
  conjetura sin verificar de la fase, después del regex de `sin-io-en-nucleo` y del guardia D5.

---

## 8. Qué queda registrado al cerrar (T6)

| Documento | Cambio |
|---|---|
| `docs/arquitectura/fase-0-ejecucion.md` (este) | Estado → **cerrado**, con fecha. Rellenar §9 con la evidencia. Marcar D1–D5 como ratificadas o modificadas |
| [`adr/ADR-016-version-de-typescript.md`](./adr/ADR-016-version-de-typescript.md) | ✅ **Escrito el 2026-07-29.** TypeScript 6.0 en vez del compilador nativo 7.0. Disparador de revisión explícito: *TS 7.1 publicado **y** `dependency-cruiser` con soporte declarado*, las dos condiciones, no una. Índice de ADRs actualizado |
| `docs/arquitectura/05-plan-de-implementacion.md` | Fase 0 marcada como cerrada, con la fecha y el enlace a la evidencia. Corregir la línea que dice que conviene resolver Q12 antes de cerrarla: ya está resuelta |
| `docs/arquitectura/07-convenciones-propuestas.md` | Sustituir la nota "versiones y comandos que todavía no existen" por las versiones reales del lockfile |
| `CLAUDE.md` | **Propuesta, no cambio silencioso.** Sustituir el bloque "Estado del repo" por: versiones confirmadas (§3), decisiones D2/D3 como convención (`nodenext` + extensiones explícitas, `target es2024`), y una tabla de qué comando existe desde qué fase. Y la advertencia de D1: **no instalar `typescript@latest`** |
| `README.md` | El bloque de estado dice "la fase 0 aún no arranca". Actualizar |
| `docs/qa/fase-0-frontera.md` | Lo entrega T5; se enlaza desde aquí |

La actualización de `CLAUDE.md` es la más importante de la lista: es lo único que va a leer
cada agente de las fases 1–9, y hoy contiene comandos que no existen y ninguna versión.

---

## 9. Registro de la prueba negativa

> **Ejecutada y superada el 2026-07-29.** Las tres comprobaciones del §6 se cumplen.

| Campo | Valor |
|---|---|
| Fecha de ejecución | 2026-07-29 |
| SHA del commit envenenado | `2bd84f52696e8c710b9c09d0f8ecb55da87bd203` |
| URL del run rojo | https://github.com/Cupra29/OrganizacionApp/actions/runs/30411377175 |
| URL del run verde anterior | https://github.com/Cupra29/OrganizacionApp/actions/runs/30411155069 |
| Reglas que saltaron | `nucleo-no-va-a-apps` (1) y `not-to-unresolvable` (1) |
| Código de salida de `depcruise` | 2 |
| Rama borrada | `chore/verificacion-frontera`, sin merge |

Salida literal de `dependency-cruiser` en el run rojo de CI:

```
$ depcruise packages apps --config .dependency-cruiser.cjs

  error nucleo-no-va-a-apps: packages/engine/src/index.ts → apps/api/src/index.ts
  error not-to-unresolvable: packages/engine/src/index.ts → drizzle-orm

x 2 dependency violations (2 errors, 0 warnings). 16 modules, 17 dependencies cruised.
```

**Las tres comprobaciones del §6:**

1. **Rojo, con `depcruise` fallando.** Los cuatro pasos se ejecutaron pese a fallar el
   primero, gracias al `if: ${{ !cancelled() }}`. `depcruise` salió con código 2.
2. **La salida nombra `nucleo-no-va-a-apps`.** Es la prueba de que la regla de frontera
   existe y se evalúa, y no un rojo de higiene de dependencias disfrazado.
3. **El run verde anterior satisfacía `el-grafo-no-esta-vacio`.** Su `depcruise` pasó sobre
   15 módulos y 15 dependencias, con la regla `required` satisfecha en silencio.

**Atribución de cada import a su regla**, que es el objetivo de envenenar dos y no uno:

| Import | Regla que dispara | Por qué |
|---|---|---|
| `drizzle-orm` (el criterio literal de [05](./05-plan-de-implementacion.md)) | `not-to-unresolvable` | El paquete no está instalado, así que nunca resuelve y no llega a evaluarse contra `sin-io-en-nucleo`. **Por sí solo no probaría nada**: un ruleset con la frontera comentada daría el mismo rojo |
| `../../../apps/api/src/index.ts` | `nucleo-no-va-a-apps` | Ruta relativa: resuelve siempre, así que obliga a la regla de frontera a pronunciarse |

**Hallazgo de la ejecución — `pnpm verify` no basta para validar la frontera.** En local,
`pnpm verify` encadena con `&&` y **corta en `typecheck`** (el import irresoluble tumba `tsc`
con `TS2307`), sin llegar nunca al paso `depcruise`. La regla de frontera quedó sin evaluar
en esa invocación. Solo `pnpm depcruise` en aislado, y CI con sus pasos separados, producen la
evidencia. Esto **valida la decisión del §4.6** de no colapsar los cuatro pasos de CI en un
único `pnpm verify`: si se hubieran colapsado, este run rojo no habría demostrado nada.

### 9.1 Enmiendas del 2026-07-29 — las tres pruebas que faltaban

Las tres nacen de los huecos que detectó [`qa-engineer`](../qa/fase-0-frontera.md) al escribir
el guion repetible. Ninguna estaba en el procedimiento original.

**Prueba 1 — mitad nativa de la frontera de I/O.** Envenenando `packages/engine/src/index.ts`
con `import { readFile } from "node:fs/promises"`:

```
  error sin-io-nativo-en-nucleo: packages/engine/src/index.ts → fs/promises
x 1 dependency violations (1 errors, 0 warnings). 16 modules, 16 dependencies cruised.
```

**Prueba 2 — mitad npm de la frontera (§6.bis).** Es la que valida el regex simplificado tras
el rechazo por ReDoS, que hasta ahora **nunca se había ejecutado contra una ruta resuelta real
de pnpm**. Con `pnpm --filter @oa/engine add drizzle-orm` y el import envenenado:

```
  error sin-io-en-nucleo: packages/engine/src/index.ts → node_modules/.pnpm/drizzle-orm@0.45.2/node_modules/drizzle-orm/index.js
x 1 dependency violations (1 errors, 0 warnings). 16 modules, 16 dependencies cruised.
```

La ruta real confirma que anclar al **último** segmento `node_modules/` era correcto: el layout
de pnpm interpone `.pnpm/drizzle-orm@0.45.2/` y un anclaje al primero no habría casado.
Revertido con `git checkout` + `pnpm install`; verificado que `drizzle-orm` no queda enlazado
en `packages/engine/node_modules`, ni en su `package.json`, ni en el lockfile.

**Prueba 3 — el guardrail de cobertura, que reemplaza a D5.** Con
`exclude: { path: "packages/engine" }` en las opciones del ruleset:

```
  ✖ cobertura del grafo: faltan 1 de 7 puntos de entrada

      El análisis NO está cubriendo estos módulos, así que ninguna regla los protege:
        - packages/engine/src/index.ts

      Causa habitual: un glob o un `exclude` demasiado amplio en .dependency-cruiser.cjs.
      Módulos vistos: 13.
```

Código de salida 1, y nombra el módulo perdido en vez de contarlos. Sobre el árbol sano:
`✔ cobertura del grafo: los 7 puntos de entrada están analizados (15 módulos vistos)`.

**Contraste con el D5 original, que es el motivo de todo esto.** El mismo `exclude`, con la
regla `required` `el-grafo-no-esta-vacio` como único guardia, producía:

```
✔ no dependency violations found (13 modules, 12 dependencies cruised)
```

Verde limpio. Ese es el fallo que D5 existía para prevenir y no prevenía.

---

## 10. Estimación y riesgos

### Estimación: **6–9 horas efectivas**, tope realista de 12

| Tarea | Estimado |
|---|---|
| T0 ratificar decisiones | 10 min |
| T1 configuración raíz + stubs | 2–3 h |
| T2 primer CI verde | 1–2 h |
| T3 prueba negativa | 30–45 min |
| T4 seguridad + T5 QA | 50 min (en paralelo) |
| T6 cierre documental | 45 min |

A 10–20 h semanales, es **media semana de trabajo**: cabe holgadamente en una semana de
calendario sin consumirla. No conviene comprimirlo en una sesión: T2 tiene una latencia
irreducible de push-y-esperar.

Las dos horas de T2 son la partida menos comprimible y la que más gente subestima. El primer
CI verde de un monorepo nuevo casi nunca sale a la primera: orden de las acciones, lockfile,
`allowBuilds`, rutas relativas. Es normal y no significa que algo esté mal.

Si el total se va por encima de 12 h, el sospechoso casi seguro es D1/D2: TypeScript 6 con
`nodenext` sobre un monorepo con `exports` a `.ts` es donde hay más rozamiento.

### Riesgos

| Riesgo | Probabilidad | Si pasa |
|---|---|---|
| `dependency-cruiser` no resuelve `@oa/*` y reporta rutas de `node_modules` o `not-to-unresolvable` sobre imports legítimos | Media | Se detecta en T1 (comprobación 4 de §7), no en producción. Salidas: `--ts-config` con `paths`, o `exports` apuntando a `dist` con un `build` por paquete. La segunda es más trabajo y solo si la primera falla |
| Vitest 4 no descubre proyectos sin `vitest.config.ts` propio | Baja | La documentación dice que sí. Si no, un `vitest.config.ts` de tres líneas por paquete: +7 archivos, sin cambio de diseño |
| `useImportExtensions` no cubre todos los casos y `nodenext` se vuelve molesto | Media-baja | Es la parte reversible de D2. Cambiar a `bundler` en fase 0 cuesta minutos; en fase 5, un codemod |
| Un agente instala `typescript@latest` (=7.x) en una fase futura y rompe `depcruise` | **Media-alta** | Por eso la advertencia va en `CLAUDE.md` y no solo aquí. Un rango `^6.0.3` en el `catalog:` lo bloquea mecánicamente |
| El commit envenenado se mergea por inercia | Baja | El paso 7 de §6 es explícito. El mensaje de commit lleva "DEBE fallar" en el título |
| La fase se alarga porque aparecen decisiones de la fase 1 (Temporal, tipos del dominio) | Media | D3 existe justamente para cortar esa conversación. Si aparecen tipos del dominio en un stub, es señal de que la fase 0 está desbordando |

### Lo que este plan asume y podría estar mal

- Que `dependency-cruiser` 18.1.0 funciona bien con TypeScript 6.0.x. Su `package.json`
  declara `typescript: ^6.0.3` en devDependencies, así que está probado contra esa línea —
  pero no lo he ejecutado.
- Que Vitest 4 descubre proyectos por glob sin config propia por paquete. Es lo que documenta;
  no lo he ejecutado.
- Que los `exports` apuntando a `./src/index.ts` no dan problemas de resolución. Es la razón
  de duplicar `main`/`types`.

Las tres se caen —si se caen— dentro de T1, con arreglo conocido y sin tocar ninguna decisión
de arquitectura. Ninguna es una puerta de una sola dirección.
