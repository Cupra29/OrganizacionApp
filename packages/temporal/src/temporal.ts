// El ÚNICO módulo del monorepo que importa el polyfill de `Temporal` (ADR-018 §1).
//
// Ningún otro archivo —de este paquete o de cualquier otro— importa `temporal-polyfill`.
// Todo lo demás pasa por aquí, y eso es lo que hace que cambiar de polyfill, o pasar a
// `Temporal` nativo cuando llegue a un LTS de Node, cueste exactamente una línea. El día que
// llegue, este archivo se queda como reexport de `globalThis.Temporal` y nadie más se entera.
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
