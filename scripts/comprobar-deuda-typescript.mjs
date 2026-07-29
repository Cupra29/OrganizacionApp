/**
 * Vigila el disparador de ADR-016: cuándo se puede migrar a TypeScript 7.
 *
 * Son DOS condiciones, no una. TypeScript 7.0 ya está estable, pero no publica API
 * programática, y `dependency-cruiser` la necesita para parsear `.ts`. Migrar antes de
 * que ambas se cumplan dejaría al proyecto sin la herramienta que sostiene la frontera
 * del motor entera.
 *
 * Sale con código 1 SOLO cuando las dos se cumplen: es la señal de "toca escribir el ADR
 * que reemplace al 016". Un fallo de este workflow es una tarea, no una avería.
 */

const REGISTRO = "https://registry.npmjs.org";

async function ultimaVersion(nombre) {
  const respuesta = await fetch(`${REGISTRO}/${nombre}/latest`);
  if (!respuesta.ok) {
    throw new Error(`No se pudo consultar ${nombre}: HTTP ${respuesta.status}`);
  }
  return respuesta.json();
}

const typescript = await ultimaVersion("typescript");
const depcruise = await ultimaVersion("dependency-cruiser");

// Condición 1: TypeScript publica API programática, prometida para la 7.1.
const [mayor, menor] = typescript.version.split(".").map(Number);
const tsTieneApi = mayor > 7 || (mayor === 7 && menor >= 1);

// Condición 2: dependency-cruiser declara soporte para la 7.x. Se mira su peerDependency
// si algún día la declara y, si no, el rango con el que se desarrolla. Es heurístico a
// propósito: ante la duda preferimos no avisar antes de tiempo, y por eso se imprimen
// siempre los valores crudos para que una persona pueda juzgar.
const rango = depcruise.peerDependencies?.typescript ?? depcruise.devDependencies?.typescript ?? "";
const dcSoportaTs7 = /(^|\D)7\./.test(rango) || rango.includes(">=7");

console.log("Disparador de ADR-016 — migración a TypeScript 7\n");
console.log(`  typescript@latest ................ ${typescript.version}`);
console.log(`  ¿publica API programática? ....... ${tsTieneApi ? "sí" : "no (hace falta >= 7.1)"}`);
console.log(`  dependency-cruiser@latest ........ ${depcruise.version}`);
console.log(`  rango de typescript que declara .. ${rango || "(ninguno)"}`);
console.log(`  ¿soporta la 7.x? ................. ${dcSoportaTs7 ? "sí" : "no"}\n`);

if (tsTieneApi && dcSoportaTs7) {
  console.error("  ⚠ LAS DOS CONDICIONES SE CUMPLEN.\n");
  console.error("    Toca revisar ADR-016 y, si procede, escribir el ADR que lo reemplace.");
  console.error("    No se edita el 016: se supera con otro (CLAUDE.md).\n");
  process.exit(1);
}

console.log("  ✔ Todavía no. La deuda sigue correctamente diferida.\n");
