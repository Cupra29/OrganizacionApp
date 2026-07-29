/**
 * Responde una pregunta que `dependency-cruiser` no puede responder sobre sí mismo:
 * ¿el análisis está mirando lo que debe?
 *
 * Sus tres clases de regla (`forbidden`, `allowed`, `required`) se evalúan sobre el grafo
 * ya cruzado, así que ninguna puede aseverar sobre lo que el grafo NO contiene. Se verificó
 * empíricamente el 2026-07-29: con `exclude: { path: "packages/engine" }`, depcruise responde
 * `✔ no dependency violations found (13 modules)` y la regla `required` `el-grafo-no-esta-vacio`
 * no llega a evaluarse, porque no hay instancia del módulo que revisar. Verde limpio,
 * indistinguible de un run sano.
 *
 * Por eso la aserción vive fuera de la herramienta. Lee el JSON de depcruise por stdin.
 */

// Los 7 puntos de entrada de 01-arquitectura.md §6. Se listan a mano a propósito:
// derivarlos del ruleset costaría metaprogramación para mantener sincronizadas 7 rutas
// que solo cambian si cambia la estructura del repositorio.
const MODULOS_EXIGIDOS = [
  "packages/domain/src/index.ts",
  "packages/temporal/src/index.ts",
  "packages/engine/src/index.ts",
  "packages/ical/src/index.ts",
  "packages/contracts/src/index.ts",
  "apps/api/src/index.ts",
  "apps/web/src/index.ts",
];

function fallar(mensaje, detalle) {
  console.error(`\n  ✖ cobertura del grafo: ${mensaje}\n`);
  for (const linea of detalle) console.error(`      ${linea}`);
  console.error("");
  process.exit(1);
}

const crudo = await new Promise((resolve) => {
  let acumulado = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (trozo) => {
    acumulado += trozo;
  });
  process.stdin.on("end", () => resolve(acumulado));
});

// Aserción 1: stdin vacío o JSON ilegible ES uno de los fallos que vigilamos
// (config ausente o rota). No se traga la excepción.
if (crudo.trim() === "") {
  fallar("no llegó nada por stdin", [
    "depcruise no produjo salida: probablemente abortó antes de cruzar el grafo.",
    "Revisa que .dependency-cruiser.cjs exista y sea válido.",
  ]);
}

let informe;
try {
  informe = JSON.parse(crudo);
} catch (error) {
  fallar("la salida de depcruise no es JSON válido", [
    error.message,
    `Primeros 200 caracteres recibidos: ${crudo.slice(0, 200)}`,
  ]);
}

const fuentes = (informe.modules ?? []).map((modulo) => modulo.source);

// Aserción 2: los 7 puntos de entrada están en el grafo. Se listan los que faltan,
// no se cuentan: un recuento no dice qué se perdió.
const ausentes = MODULOS_EXIGIDOS.filter((esperado) => !fuentes.includes(esperado));
if (ausentes.length > 0) {
  fallar(`faltan ${ausentes.length} de ${MODULOS_EXIGIDOS.length} puntos de entrada`, [
    "El análisis NO está cubriendo estos módulos, así que ninguna regla los protege:",
    ...ausentes.map((ruta) => `  - ${ruta}`),
    "",
    "Causa habitual: un glob o un `exclude` demasiado amplio en .dependency-cruiser.cjs.",
    `Módulos vistos: ${fuentes.length}.`,
  ]);
}

// Aserción 3: ningún paquete del workspace se ve a través de node_modules.
// Si los enlaces simbólicos de pnpm no se resuelven a su ruta real, las reglas de
// frontera casan contra `node_modules/@oa/...` y dejan de proteger sin avisar.
const porEnlace = fuentes.filter((fuente) => fuente.includes("node_modules/@oa/"));
if (porEnlace.length > 0) {
  fallar("hay paquetes del workspace vistos a través de node_modules", [
    "Las reglas de frontera casan contra rutas reales; así no protegen nada:",
    ...porEnlace.map((ruta) => `  - ${ruta}`),
    "",
    "Revisa `preserveSymlinks` en las opciones de .dependency-cruiser.cjs.",
  ]);
}

console.log(
  `  ✔ cobertura del grafo: los ${MODULOS_EXIGIDOS.length} puntos de entrada están ` +
    `analizados (${fuentes.length} módulos vistos)\n`,
);
