/**
 * Traduce a reglas ejecutables la regla de dependencias de
 * `docs/arquitectura/01-arquitectura.md §6` y los límites de `CLAUDE.md`.
 *
 * Es el archivo que sostiene el criterio de aceptación de la fase 0: sin él,
 * la frontera del motor es una intención y no una garantía.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */

// Paquetes de I/O que jamás pueden entrar al núcleo.
const IO_EXTERNO = "drizzle-orm|fastify|pg|postgres|react|react-dom|axios|undici|node-fetch";

// Built-ins de Node que implican I/O, reloj o aleatoriedad. `os` y `process` quedan
// fuera a propósito: no son I/O y prohibirlos daría falsos positivos.
//
// OJO: `Date.now()`, `new Date()`, `Math.random()`, `Temporal.Now`, la zona ambiente
// (`resolvedOptions`) y `globalThis` NO son imports, así que dependency-cruiser no puede
// verlos con ninguna configuración. Nótese que `crypto` y `perf_hooks` sí están en la lista de
// abajo, pero solo cierran la puerta del import: `globalThis.crypto` y `performance.now()`
// están disponibles sin importar nada, y esos los para el plugin. Esa otra mitad la
// cubre desde la fase 1 el plugin GritQL `scripts/biome/sin-reloj-ni-azar-en-nucleo.grit`
// (no `noRestrictedGlobals`, que mataría `new Date(argumento)` y `Math.max`; tampoco un
// test de arquitectura), cuyo alcance declara el `overrides` de biome.json y verifica
// `scripts/verificar-guardrail-nucleo.mjs` — el modo de fallo de ese alcance es silencioso.
// Ese alcance incluye además `packages/ical`, que aquí NO aparece: entra por la
// reproducibilidad del `.ics` (ADR-017), no por ausencia de I/O. Reparto: imports aquí,
// globales allí.
//
// Ojo con esa asimetría, que deja una rendija conocida: como `ical` no está en `NUCLEO`,
// `import { randomUUID } from "node:crypto"` le está permitido aquí, y el plugin solo para el
// global `crypto`, no ese import. Un UID aleatorio rompería la reproducibilidad que ADR-017 le
// exige. Hoy no ocurre —los UID salen de identificadores de entidad— pero cerrarlo es meter
// `ical` en una regla de azar, y eso es una decisión sobre el alcance de ADR-017, no una
// corrección de este comentario.
const IO_NATIVO =
  "fs|fs/promises|http|https|net|dgram|dns|tls|child_process|cluster|worker_threads|readline|repl|crypto|timers|timers/promises|perf_hooks";

const NUCLEO = "^packages/(engine|temporal|domain)/";

module.exports = {
  forbidden: [
    // ---------- Higiene general ----------
    {
      name: "no-circular",
      comment: "Un ciclo hace imposible razonar sobre el orden de inicialización.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      comment: "Import que no resuelve: dependencia sin instalar o ruta mal escrita.",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "no-deps-sin-declarar",
      comment: "Todo import externo debe estar declarado en el package.json de su paquete.",
      severity: "error",
      from: { path: "^(packages|apps)/[^/]+/src" },
      to: { dependencyTypes: ["npm-no-pkg", "npm-unknown"] },
    },

    // ---------- La frontera del núcleo ----------
    // Esta es la regla que da sentido a la fase 0.
    {
      name: "sin-io-en-nucleo",
      comment:
        "CLAUDE.md nº1: engine, temporal y domain no tienen I/O. Ni base de datos, ni HTTP, " +
        "ni sistema de archivos. Romper esto destruye el determinismo y con él toda la " +
        "estrategia de testing.",
      severity: "error",
      from: { path: NUCLEO },
      // Se ancla al ÚLTIMO segmento `node_modules/`, que es el que nombra el paquete
      // real tanto en un layout plano como en el `.pnpm/` de pnpm. Sin cuantificadores
      // anidados: dependency-cruiser rechaza los regex con riesgo de ReDoS.
      to: { path: `node_modules/(${IO_EXTERNO})/` },
    },
    {
      name: "sin-io-nativo-en-nucleo",
      comment: "Mismo límite, para los built-ins de Node que hacen I/O.",
      severity: "error",
      from: { path: NUCLEO },
      to: { dependencyTypes: ["core"], path: `^(node:)?(${IO_NATIVO})$` },
    },
    {
      name: "polyfill-temporal-solo-en-su-modulo",
      comment:
        "ADR-018 §1: `packages/temporal/src/temporal.ts` es el ÚNICO punto de import del " +
        "polyfill en todo el monorepo. No es higiene, son dos propiedades concretas. (1) Un " +
        "segundo import puede traer una SEGUNDA implementación de `Temporal` al mismo " +
        "proceso, y los objetos de una no los aceptan los métodos de la otra: falla en " +
        "ejecución por comprobación de ranura interna, no al compilar, y ningún test de un " +
        "solo paquete lo ve. Es el motivo por el que `rrule-temporal` se quedó en " +
        "devDependency. (2) Es lo que hace que cambiar de polyfill cueste una línea, y que " +
        "pasar a `Temporal` nativo cuando llegue al LTS cueste un solo archivo — la forma " +
        "exacta de esa migración, que NO es la obvia porque el guardrail prohíbe `globalThis`, " +
        "está escrita y comprobada en la cabecera de ese archivo. Hoy esta regla pasa sin " +
        "hacer nada, porque hay exactamente un importador: por eso se pone hoy y no cuando " +
        "haya dos.",
      severity: "error",
      from: { path: "^(packages|apps)/", pathNot: "^packages/temporal/src/temporal\\.ts$" },
      to: { path: "node_modules/temporal-polyfill/" },
    },
    {
      name: "etapa-1-de-expansion-sin-zonas",
      comment:
        "ADR-018 §2: la expansión está partida en dos etapas y la etapa 1 —`expansion.ts`, el " +
        "conjunto de fechas civiles— NO tiene zonas. No es higiene de capas: es la razón por la " +
        "que `RRULE` y `CYCLE` son dos implementaciones de la misma firma y la parte difícil " +
        "—resolver una fecha civil a un intervalo absoluto— está escrita y probada UNA vez, en " +
        "`ocurrencias.ts`. Si la etapa 1 pudiera mirar la zona, la tentación inmediata sería " +
        "comparar `UNTIL` como instante ahí dentro (que es donde parece que va) y entonces la " +
        "aritmética de cambios de horario volvería a estar en dos sitios: uno probado y otro no. " +
        "Se prohíbe el import directo, que es la forma que toma la fuga: no se resuelve una hora " +
        "de pared sin traerse `zonedDe` o `instanteDe`. Queda fuera del alcance la arista " +
        "transitiva `expansion.ts -> jornadas.ts -> zona.ts`, que es de solo tipos " +
        "(`VentanaFechas`) y no lleva ninguna zona consigo.",
      severity: "error",
      from: { path: "^packages/temporal/src/expansion\\.ts$" },
      to: { path: "^packages/temporal/src/(zona|ocurrencias)\\.ts$" },
    },
    {
      name: "el-oraculo-no-entra-en-produccion",
      comment:
        "ADR-018 §8: `rrule-temporal` es el ORÁCULO DIFERENCIAL de la expansión, no una " +
        "implementación. La regla de arriba NO lo cubre: `doNotFollow` corta en node_modules, " +
        "así que su import estático de `temporal-polyfill/full` no aparece en el grafo y una " +
        "arista hacia él pasaría inadvertida — comprobado el 2026-07-30 sobre el grafo real. " +
        "El daño sería el de siempre: DOS implementaciones de `Temporal` en el mismo proceso, " +
        "cuyos objetos no interoperan por comprobación de ranura interna. Falla en ejecución y " +
        "no al compilar. Se expresa como 'ningún archivo de producción depende de una " +
        "devDependency' y no como 'nadie importa rrule-temporal' porque así cubre también a la " +
        "siguiente biblioteca que entre de oráculo, que es exactamente el fallo que se repite.",
      severity: "error",
      from: { path: "^packages/[^/]+/src/", pathNot: "\\.test\\.ts$" },
      to: { dependencyTypes: ["npm-dev"], dependencyTypesNot: ["type-only"] },
    },

    // ---------- Dirección de las flechas (01 §6) ----------
    {
      name: "nucleo-no-va-a-apps",
      comment: "La flecha solo va en un sentido: apps consume packages, nunca al revés.",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "engine-solo-domain-y-temporal",
      comment: "01 §6: engine --> domain, temporal. Nada más del proyecto.",
      severity: "error",
      from: { path: "^packages/engine/" },
      to: { path: "^packages/(?!engine/|domain/|temporal/)[^/]+/" },
    },
    {
      name: "temporal-no-conoce-dominio",
      comment: "01 §6: temporal no depende de nada del proyecto.",
      severity: "error",
      from: { path: "^packages/temporal/" },
      to: { path: "^packages/(?!temporal/)[^/]+/" },
    },
    {
      name: "domain-no-depende-de-nadie",
      comment: "01 §6: domain no depende de nada del proyecto.",
      severity: "error",
      from: { path: "^packages/domain/" },
      to: { path: "^packages/(?!domain/)[^/]+/" },
    },
    {
      name: "web-solo-contracts",
      comment:
        "01 §6: la interfaz solo conoce los contratos. Es la regla que más presión va a " +
        'recibir en la fase 7, cuando resulte cómodo importar el motor para "validar rápido".',
      severity: "error",
      from: { path: "^apps/web/" },
      to: { path: "^packages/(?!contracts/)[^/]+/" },
    },
    {
      name: "apps-no-se-cruzan",
      comment: "api y web son artefactos separados y se comunican por HTTP.",
      severity: "error",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^apps/(?!$1)[^/]+/" },
    },
  ],

  // ---------- Guardia contra el ruleset vacío ----------
  // Sin esto, un glob mal escrito que no analice nada deja CI verde sin
  // proteger nada, y un ruleset roto es indistinguible de uno satisfecho.
  required: [
    {
      name: "el-grafo-no-esta-vacio",
      comment:
        "engine debe depender de domain. Si esta regla falla, dependency-cruiser no está " +
        "viendo el grafo y ninguna regla de frontera está protegiendo nada.",
      severity: "error",
      module: { path: "^packages/engine/src/index\\.ts$" },
      to: { path: "^packages/domain/" },
    },
  ],

  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.base.json" },
    tsPreCompilationDeps: true,
    // preserveSymlinks se deja en false (valor por defecto): los paquetes del
    // workspace entran a node_modules como enlaces simbólicos y hay que verlos
    // por su ruta real. Si aparecen rutas de node_modules para paquetes @oa/*,
    // las reglas de frontera NO están funcionando.
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "default"] },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
