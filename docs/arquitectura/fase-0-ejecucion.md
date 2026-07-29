# Fase 0 — Plan de ejecución

Fecha: 2026-07-28
Estado: **propuesto** — requiere ratificar D1–D5 antes de despachar nada.
Cubre: [05 §Fase 0](./05-plan-de-implementacion.md) y la estructura de
[01 §6](./01-arquitectura.md).

> Este documento es el guion de despacho. Cada tarea trae precondición, ejecutor, archivos
> exactos y reporte de salida, para que se pueda copiar tal cual al brief de un agente.

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

### D5 — Guardia contra el ruleset vacío: regla `required`, sin fixture envenenado permanente

El modo de fallo que más me preocupa de esta fase no es que la regla no salte: es que **un
glob mal escrito haga que ninguna regla se evalúe nunca y CI quede verde sin proteger nada**.
Una prueba negativa puntual no lo detecta si el error se introduce después.

Dos formas de blindarlo:

- **(a)** Una regla `required` en `dependency-cruiser`: `packages/engine/src/index.ts` **debe**
  depender de `packages/domain`. Si el grafo se vacía, la regla falla. Coste: 6 líneas de
  configuración.
- **(b)** Un fixture envenenado permanente en el repo más un paso de CI que exige que
  `dependency-cruiser` falle sobre él. Coste: un directorio raro que hay que explicar para
  siempre.

**Recomendación: (a).** Da la misma garantía sin dejar una rareza permanente en un repositorio
público. (b) queda como opción si algún día el ruleset se vuelve complejo.

### No bloqueantes, pero conviene resolverlas pronto

- **Licencia.** El repo es público y el README dice "sin licencia declarada" — por defecto,
  todos los derechos reservados. Para un SaaS propietario eso probablemente es lo correcto,
  pero conviene que sea explícito (`LICENSE` o una línea en el README) en vez de un vacío.
- **`apps/web` en el `projects` de Vitest.** Cuando la fase 7 traiga React necesitará
  `environment: 'jsdom'`. Hoy no, y no hay que anticiparlo.

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

**36 archivos.** Nada fuera de esta lista sin decirlo antes.

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
  "verify": "pnpm run typecheck && pnpm run lint && pnpm run test && pnpm run depcruise"
}
```

`--no-bail` en el typecheck para ver los errores de todos los paquetes de una pasada, no del
primero que rompe. `verify` sí corta en el primer fallo: es una puerta, no un informe.

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

---

## 7. Definición de "hecho"

La fase 0 está cerrada cuando **todo** esto es cierto y verificable por alguien que no lo
escribió:

1. `pnpm install` desde limpio (`rm -rf node_modules && pnpm install --frozen-lockfile`)
   funciona sin intervención manual.
2. `pnpm verify` pasa en local **y** en CI, sobre `main`.
3. El run verde muestra los cuatro pasos ejecutados, no saltados.
4. `pnpm depcruise` reporta rutas de `packages/…` y `apps/…` — **ninguna** ruta de
   `node_modules/@oa/…`. (Si aparecen, las fronteras no se están evaluando.)
5. La regla `el-grafo-no-esta-vacio` se satisface en verde: el grafo contiene módulos reales.
6. La prueba negativa de §6 se ejecutó, CI se puso rojo, la salida nombró
   `nucleo-no-va-a-apps`, y la evidencia literal está transcrita en §9.
7. La rama `chore/verificacion-frontera` no existe ni en local ni en remoto.
8. `security-reviewer` reportó, y todo hallazgo crítico o alto está resuelto o registrado con
   su motivo.
9. `docs/qa/fase-0-frontera.md` existe y el guion es repetible por alguien que no estuvo
   presente.
10. Los siete paquetes tienen `typecheck` y test de humo pasando, individualmente.
11. La documentación de §8 está actualizada **en el mismo PR/commit** que cierra la fase.

Un incumplimiento del punto 6 significa que la fase no está hecha, aunque todo lo demás esté
verde. Es el objetivo declarado de la fase: sin él, la frontera del motor es una intención.

---

## 8. Qué queda registrado al cerrar (T6)

| Documento | Cambio |
|---|---|
| `docs/arquitectura/fase-0-ejecucion.md` (este) | Estado → **cerrado**, con fecha. Rellenar §9 con la evidencia. Marcar D1–D5 como ratificadas o modificadas |
| `docs/arquitectura/adr/ADR-016-…` | **Nuevo**, si se ratifica D1: versión de TypeScript y estrategia frente al compilador nativo. Con el disparador de revisión explícito: *TS 7.1 publicado **y** `dependency-cruiser` con soporte declarado* |
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
