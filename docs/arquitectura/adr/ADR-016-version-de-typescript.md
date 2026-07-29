# ADR-016: TypeScript 6.0 y no el compilador nativo 7.0, hasta que la API programática exista
Estado: aceptado (2026-07-29)
Fecha: 2026-07-29

## Contexto

[ADR-001](./ADR-001-stack-y-monorepo.md) decide "TypeScript en modo `strict` en todo el stack"
pero no fija versión. Al arrancar la fase 0 resultó que la versión no es un detalle de
instalación: es una restricción del ecosistema que decide si el criterio de aceptación de la
fase puede cumplirse.

Los hechos, verificados el 2026-07-28:

- **TypeScript 7.0 salió estable el 2026-07-08.** Es el compilador reescrito en Go, entre 8 y
  12 veces más rápido en compilación completa. Es lo que `npm install typescript` instala hoy:
  el dist-tag `latest` resuelve a `7.0.2`.
- **TypeScript 7.0 no publica API programática.** Es una omisión declarada por Microsoft, no un
  bug: la API nueva está anunciada para 7.1, con un plazo estimado de tres a cuatro meses
  desde el lanzamiento (en torno a octubre de 2026).
- **`dependency-cruiser` 18.1.0 declara soporte de TypeScript `>=2.0.0 <7.0.0`** y usa la API
  del compilador para parsear TypeScript. Con TypeScript 7 no funciona.
- Existe una vía documentada por Microsoft para tener ambos: `typescript` apuntando por alias
  a `npm:@typescript/typescript6` para las herramientas que consumen la API, y
  `@typescript/native` apuntando a `npm:typescript@^7` para compilar. Funciona; el propio Nx la
  recomienda mientras dure la transición.
- **TypeScript 6.0** (23 de marzo de 2026) es la última versión sobre el código base de
  JavaScript y conserva la API completa. No está abandonada: es el puente oficial hacia la 7.

La fuerza que decide: `dependency-cruiser` **no es una herramienta accesoria en este
proyecto**. Es lo que convierte el guardrail nº1 de `CLAUDE.md` —el motor y el paquete
temporal no tienen I/O— en una garantía mecánica en vez de una intención. Sin él,
[ADR-013](./ADR-013-motor-como-funcion-pura.md) depende de que nadie se despiste durante nueve
fases. [ADR-001](./ADR-001-stack-y-monorepo.md) ya lo dice sin rodeos en sus consecuencias:
*"sin `dependency-cruiser` en CI se degradaría en meses. Esa herramienta no es opcional."*

## Decisión

**`typescript@^6.0.3` como única versión del compilador en el monorepo, declarada en el
`catalog:` de `pnpm-workspace.yaml`.** No se instala TypeScript 7 ni siquiera bajo alias.

La decisión se revisa cuando se cumplan **las dos** condiciones, no una:

1. TypeScript 7.1 publicado con su API programática estable.
2. `dependency-cruiser` con soporte de TypeScript 7 declarado en su `package.json` o su
   documentación.

Hasta entonces, instalar `typescript@latest` en este repositorio es un error, y por eso la
advertencia vive también en `CLAUDE.md`, que es lo que leen los agentes de implementación.

## Alternativas consideradas

**Montaje dual con alias (`@typescript/typescript6` para las herramientas, `typescript@7` para
compilar).**
A favor: se gana ya la velocidad del compilador nativo sin romper `dependency-cruiser`; es la
vía que Microsoft y Nx recomiendan para la transición; es reversible.
En contra: deja **dos compiladores que pueden discrepar** sobre el mismo código, un editor que
hay que apuntar deliberadamente a uno de los dos, y un `package.json` con dos alias que hay que
explicar a cada agente que lea el repo. Y lo que se compra es velocidad de `tsc` sobre un
monorepo que en el momento de decidir tiene **cero líneas de código de producción**: los
typechecks tardan menos de dos segundos con cualquiera de los dos. Se descarta por
desproporción entre el coste cognitivo permanente y el beneficio actual.

**TypeScript 7 a secas, renunciando a `dependency-cruiser`.**
En contra: es renunciar al entregable de la fase 0. La frontera del motor volvería a ser una
convención vigilada por revisión humana, que es exactamente lo que
[ADR-001](./ADR-001-stack-y-monorepo.md) descarta. Se descarta sin más discusión.

**TypeScript 7 sustituyendo `dependency-cruiser` por otra herramienta de grafo
(`eslint-plugin-boundaries`, `sheriff`, `knip`).**
En contra: las alternativas basadas en ESLint arrastran `typescript-eslint`, que **también**
necesita la API programática, así que el problema se traslada sin resolverse. Además implicaría
revisar [ADR-001](./ADR-001-stack-y-monorepo.md), que eligió Biome precisamente para no tener
ESLint. Se descarta.

**Esperar a 7.1 sin arrancar la fase 0.**
En contra: bloquear el proyecto entre dos y cuatro meses por una mejora de velocidad de
compilación. Absurdo. Se descarta.

## Consecuencias

**Lo que ganamos**
- El criterio de aceptación de la fase 0 es ejecutable: la frontera del motor se verifica en
  CI desde el primer día.
- Una sola versión del compilador, un solo `tsc`, un editor sin configuración especial.
- Se aprovechan los cambios de TypeScript 6 sin coste: `strict` por defecto, `types: []` por
  defecto y la eliminación de `moduleResolution: node`, que empujan hacia la configuración que
  el proyecto quería de todas formas.

**Lo que cuesta**
- Se renuncia a compilaciones entre 8 y 12 veces más rápidas durante unos meses. En un
  monorepo de siete paquetes con un desarrollador, la diferencia es de segundos por ejecución.
- Se acumula deuda de migración: cuando llegue 7.1 habrá más código que migrar que hoy. Está
  acotada porque TypeScript 6 ya eliminó las opciones que 7 no soporta (`baseUrl`,
  `moduleResolution: node`, `target: es5`), así que la configuración ya está en el estado que
  7 exige.
- Hay que vigilar activamente que nadie instale `typescript@latest`. El rango `^6.0.3` del
  `catalog:` lo bloquea mecánicamente mientras se respete el catálogo.

**Lo que queda condicionado**
- La configuración de `tsconfig.base.json` de la fase 0, escrita contra los valores por
  defecto de TypeScript 6.
- La elección de `target`/`lib` `es2024` en vez del `es2025` por defecto, que mantiene los
  tipos de `Temporal` fuera del ámbito global hasta que la fase 1 decida entre polyfill y
  runtime nativo. No depende de este ADR, pero sí de conocer los defaults de la 6.
- Cuando se cumplan las dos condiciones de revisión, la migración se decide con un ADR nuevo
  que reemplace a este. **No se edita este.**
