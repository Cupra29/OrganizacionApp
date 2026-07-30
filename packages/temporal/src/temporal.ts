// El ÚNICO módulo del monorepo que importa el polyfill de `Temporal` (ADR-018 §1). No es solo
// una convención: la sostiene la regla `polyfill-temporal-solo-en-su-modulo` de
// `.dependency-cruiser.cjs`, y se la ha visto fallar con un segundo importador.
//
// Ningún otro archivo —de este paquete o de cualquier otro— importa `temporal-polyfill`. Todo
// lo demás pasa por aquí, y eso es lo que hace que **cambiar de polyfill** cueste exactamente
// una línea: el especificador del import de abajo, y nada más en todo el monorepo.
//
// PASAR A `Temporal` NATIVO cuesta este archivo, no una línea, y no se hace de la forma obvia.
// Queda escrito y comprobado (2026-07-30) porque las dos formas que uno escribe primero no
// sirven, y descubrirlo con el lint en rojo invita al `biome-ignore`:
//
//     const nativo = Temporal;          // el global desnudo; NO `globalThis.Temporal`
//     export { nativo as Temporal };
//
//   · `export const { Temporal } = globalThis;` — el guardrail la señala. `globalThis` está
//     prohibido ENTERO en estos cuatro paquetes y es deliberado, no un obstáculo que rodear:
//     es la puerta de atrás a todas las demás formas que el plugin persigue. Si alguna vez
//     hiciera falta de verdad, es un ADR, nunca una excepción local.
//   · `export { Temporal };` — ni siquiera es código válido. En un módulo ESM solo se exporta
//     por nombre una ligadura declarada o importada, jamás un global: Node responde
//     SyntaxError al cargar. Comprobado, no deducido.
//   · El alias hay que renombrarlo: `const Temporal = Temporal` es un error de zona muerta.
//
// Esa migración exige además subir `lib` a `es2025` en `tsconfig.base.json` para que existan
// los tipos globales de `Temporal`. Hoy está prohibido a propósito —con Node 24 compilaría y
// reventaría en ejecución— y ese día deja de estarlo; es parte del mismo cambio.
//
// El nombre exportado sigue siendo `Temporal`, así que el guardrail sigue protegiendo a todos
// los consumidores: `Temporal.Now.instant()` dispara igual en cualquier paquete. Lo único que
// el alias abriría es este archivo, donde `nativo.Now` no lo vería nadie. Son dos líneas y
// están aquí, a la vista.
//
// POR QUÉ UN REEXPORT Y NO UN SHIM GLOBAL. `temporal-polyfill` publica también
// `temporal-polyfill/global`, que instala `globalThis.Temporal`. Sería más cómodo —cero
// imports en el resto del paquete— y está descartado en ADR-018 ("Alternativas consideradas",
// tercera): un paquete puro cuyo import muta el objeto global tiene comportamiento
// dependiente del orden de importación, que es exactamente la clase de estado ambiente que
// este paquete existe para no tener. Además `target`/`lib` es `es2024` a propósito, sin los
// tipos globales de `Temporal`: si alguien escribiera `Temporal` sin importarlo, no compila.
//
// `Temporal.Now` NO se reexporta ni se usa: está prohibido por el guardrail
// `scripts/biome/sin-reloj-ni-azar-en-nucleo.grit` en los cuatro paquetes con salida
// determinista. Este archivo no necesita ninguna excepción del guardrail y no debe tenerla
// nunca: el patrón prohibido es el miembro `Temporal.Now`, no el identificador `Temporal`.
export { Temporal } from "temporal-polyfill";
