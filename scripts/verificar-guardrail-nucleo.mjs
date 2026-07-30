/**
 * Responde sobre el guardrail de reloj y aleatoriedad la misma pregunta que
 * `verificar-cobertura-grafo.mjs` responde sobre dependency-cruiser: ¿sigue mirando lo que
 * debe? Y de paso la contraria, que aquí importa igual: ¿sigue dejando pasar lo legítimo?
 *
 * Hace falta porque el modo de fallo es SILENCIOSO. Se comprobó el 2026-07-29: con el
 * `overrides.includes` de biome.json apuntando a una ruta que no existe, `biome check`
 * responde `Checked N files` y sale con código 0. Verde limpio, indistinguible de un run
 * sano, con el núcleo entero sin proteger. Es exactamente el fallo que dejó la lección de
 * la fase 0 ("un guardrail que no se ha visto fallar es una intención").
 *
 * Cómo: escribe un canario en cada paquete con salida determinista, con las diecisiete formas
 * prohibidas y once legítimas, pasa Biome, y exige que las señaladas sean EXACTAMENTE las
 * prohibidas. Los canarios se borran siempre, incluso si algo revienta; y si un fallo brusco
 * dejara alguno, el siguiente `pnpm lint` se pondría rojo, que es la dirección segura del
 * error.
 *
 * Las formas nuevas de la ampliación de ADR-018 §9 (`Temporal.Now`, zona ambiente,
 * `performance.now`) entraron el 2026-07-29, y el eje `globalThis` el 2026-07-30, con los
 * casos G1–G11 de
 * `docs/qa/fase-1-guardrail-temporal-now.md`, escritos antes de la implementación. Los
 * controles negativos pesan lo mismo que los positivos: si el plugin sobre-bloqueara un uso
 * legítimo, la respuesta habitual sería silenciarlo entero con un `biome-ignore`, y entonces
 * dejaría de proteger nada.
 */

import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const BIOME = join(RAIZ, "node_modules/.bin/biome");
const NOMBRE_CANARIO = "__canario-guardrail__.ts";

// Los mismos cuatro del `overrides.includes` de biome.json: los paquetes cuya salida tiene
// que ser función únicamente de su entrada. Los tres del núcleo entran por el determinismo
// del motor (ADR-013) e `ical` por la reproducibilidad del `.ics` (ADR-017), que es una
// propiedad distinta y con motivo propio. Se listan a mano, igual que en
// verificar-cobertura-grafo.mjs: leerlos de la configuración haría que este script y lo
// que vigila se movieran juntos, que es justo lo que lo convertiría en una tautología.
const PAQUETES_DEL_NUCLEO = [
  "packages/engine",
  "packages/temporal",
  "packages/domain",
  "packages/ical",
];

// El canario, una forma por línea. El número de línea es la aserción, y se deriva de esta
// lista para que añadir una forma no exija recontar a mano. `caso` referencia
// docs/qa/fase-1-guardrail-temporal-now.md cuando la forma viene de ahí; las formas originales
// de la fase 1 no lo llevan porque se escribieron junto con el plugin.
//
// `new Date` sin paréntesis está aquí por separado de `new Date()` aunque parezca redundante:
// son dos patrones distintos del plugin y ninguno casa con el otro, así que sin esta línea
// borrar el patrón `new Date` dejaría el canario en verde.
//
// Las dos declaraciones van primero para que el canario sea código válido de arriba abajo: si
// alguna vez se filtrara uno, el `pnpm lint` siguiente debe ponerse rojo por el plugin y no
// por ruido de otras reglas.
const FORMAS = [
  { codigo: "const reloj = { Now: () => 1 };", prohibida: false, caso: "G9 (declaración)" },
  {
    codigo: "function usaReloj(fn: () => unknown) { return fn(); }",
    prohibida: false,
    caso: "G11 (auxiliar)",
  },

  { codigo: "export const prohibido1 = Date.now();", prohibida: true },
  { codigo: "export const prohibido2 = new Date();", prohibida: true },
  { codigo: "export const prohibido3 = Math.random();", prohibida: true },
  { codigo: "export const prohibido4 = new Date;", prohibida: true },
  { codigo: "export const prohibido5 = Temporal.Now.instant();", prohibida: true, caso: "G1" },
  {
    codigo: 'export const prohibido6 = Temporal.Now.zonedDateTimeISO("America/Chicago");',
    prohibida: true,
    caso: "G2",
  },
  { codigo: "export const prohibido7 = Temporal.Now.timeZoneId();", prohibida: true, caso: "G3" },
  {
    codigo: "export const prohibido8 = Intl.DateTimeFormat().resolvedOptions().timeZone;",
    prohibida: true,
    caso: "G4",
  },
  { codigo: "export const prohibido9 = performance.now();", prohibida: true, caso: "G5" },
  // G10 resuelto en lectura AMPLIA: `.calendar` también es estado ambiente del proceso y la
  // forma estrecha (`.timeZone` únicamente) se esquiva partiendo la expresión en dos
  // sentencias. El argumento completo está en el plugin.
  {
    codigo: "export const prohibido10 = Intl.DateTimeFormat().resolvedOptions().calendar;",
    prohibida: true,
    caso: "G10",
  },
  {
    codigo: "export const prohibido11 = usaReloj(Temporal.Now.instant);",
    prohibida: true,
    caso: "G11",
  },

  // El eje `globalThis`, que no está en el documento de QA: se aprobó el 2026-07-30, después
  // de escribirlo. Un solo patrón los cubre a los seis, así que estas líneas son redundantes
  // ENTRE SÍ mientras el patrón sea el identificador entero. Están una por una a propósito:
  // son las formas que había que cerrar, y si alguien cambia el patrón por una lista de
  // `globalThis.$miembro` el canario tiene que decir cuál de ellas dejó de cubrir.
  { codigo: "export const prohibido12 = globalThis.Date.now();", prohibida: true },
  { codigo: "export const prohibido13 = globalThis.Math.random();", prohibida: true },
  { codigo: "export const prohibido14 = globalThis.performance.now();", prohibida: true },
  { codigo: "export const prohibido15 = globalThis.Temporal.Now.instant();", prohibida: true },
  {
    codigo: "export const prohibido16 = globalThis.Intl.DateTimeFormat().resolvedOptions();",
    prohibida: true,
  },
  { codigo: "export const prohibido17 = usaReloj(() => globalThis);", prohibida: true },

  { codigo: 'export const legitimo1 = new Date("2026-08-03T00:00:00Z");', prohibida: false },
  { codigo: "export const legitimo2 = Math.max(1, 2);", prohibida: false },
  { codigo: "export const legitimo3 = Math.floor(1.5);", prohibida: false },
  {
    codigo: 'export const legitimo4 = Temporal.PlainDate.from("2026-08-03");',
    prohibida: false,
    caso: "G6",
  },
  {
    codigo: "export const legitimo5 = Temporal.Instant.fromEpochMilliseconds(0);",
    prohibida: false,
    caso: "G7",
  },
  {
    codigo:
      'export const legitimo6 = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Chicago" });',
    prohibida: false,
    caso: "G8",
  },
  { codigo: "export const legitimo7 = reloj.Now();", prohibida: false, caso: "G9" },
  // Los dos vecinos plausibles de `globalThis`. NO hay control negativo de un uso legítimo de
  // `globalThis` porque no existe ninguno en estos cuatro paquetes: está razonado en el
  // plugin y su ausencia es deliberada, no un olvido.
  { codigo: 'export const legitimo8 = "globalThis".length;', prohibida: false },
  { codigo: "export const legitimo9 = { esGlobalThis: false };", prohibida: false },
];

const CANARIO = `${FORMAS.map(({ codigo }) => codigo).join("\n")}\n`;
const LINEAS_PROHIBIDAS = FORMAS.flatMap(({ prohibida }, indice) =>
  prohibida ? [indice + 1] : [],
);
const TOTAL_LEGITIMAS = FORMAS.length - LINEAS_PROHIBIDAS.length;

// Describe una línea del canario en un mensaje de error: sin el número no se localiza, y sin
// el código hay que abrir este archivo para saber qué falló.
const describir = (linea) => {
  const forma = FORMAS[linea - 1];
  if (forma === undefined) return `línea ${linea} (fuera del canario)`;
  return forma.caso === undefined
    ? `línea ${linea}: ${forma.codigo}`
    : `línea ${linea} [${forma.caso}]: ${forma.codigo}`;
};

const problemas = [];
const canariosEscritos = [];

try {
  for (const paquete of PAQUETES_DEL_NUCLEO) {
    const ruta = join(RAIZ, paquete, "src", NOMBRE_CANARIO);
    writeFileSync(ruta, CANARIO, "utf8");
    canariosEscritos.push({ paquete, ruta });
  }

  // `biome lint` y no `check`: el formateo no tiene nada que decir aquí y solo añadiría ruido.
  // Sale con código 1 cuando hay diagnósticos, que es el caso normal, así que no se mira el
  // código de salida sino el JSON.
  let informe;
  try {
    const salida = execFileSync(
      BIOME,
      ["lint", "--reporter=json", ...canariosEscritos.map(({ ruta }) => relative(RAIZ, ruta))],
      { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    informe = JSON.parse(salida);
  } catch (error) {
    if (error.stdout === undefined) throw error;
    informe = JSON.parse(error.stdout);
  }

  // `category: "plugin"` es común a todos los plugins GritQL. Hoy solo hay uno; si algún día
  // hay dos, este filtro tendrá que estrecharse por mensaje.
  const senalados = (informe.diagnostics ?? []).filter((d) => d.category === "plugin");

  for (const { paquete, ruta } of canariosEscritos) {
    const relativa = relative(RAIZ, ruta);
    const lineas = senalados
      .filter((d) => d.location?.path === relativa)
      .map((d) => d.location?.start?.line)
      .sort((a, b) => a - b);

    const faltan = LINEAS_PROHIBIDAS.filter((linea) => !lineas.includes(linea));
    const sobran = lineas.filter((linea) => !LINEAS_PROHIBIDAS.includes(linea));

    if (faltan.length > 0) {
      problemas.push(
        `${paquete}: el guardrail NO señaló ${faltan.length} de las ` +
          `${LINEAS_PROHIBIDAS.length} formas prohibidas — ${faltan.map(describir).join(" / ")}.`,
      );
    }
    if (sobran.length > 0) {
      problemas.push(
        `${paquete}: FALSO POSITIVO en ${sobran.length} forma(s) legítima(s) — ` +
          `${sobran.map(describir).join(" / ")}.`,
      );
    }
  }
} finally {
  for (const { ruta } of canariosEscritos) rmSync(ruta, { force: true });
}

if (problemas.length > 0) {
  console.error("\n  ✖ guardrail del núcleo: no protege lo que dice proteger\n");
  for (const problema of problemas) console.error(`      ${problema}`);
  console.error("");
  console.error("      Revisa el `overrides` de biome.json y");
  console.error("      scripts/biome/sin-reloj-ni-azar-en-nucleo.grit.\n");
  process.exit(1);
}

console.log(
  `  ✔ guardrail del núcleo: las ${LINEAS_PROHIBIDAS.length} formas prohibidas se señalan y ` +
    `las ${TOTAL_LEGITIMAS} legítimas no, en los ${PAQUETES_DEL_NUCLEO.length} paquetes con ` +
    `salida determinista\n`,
);
