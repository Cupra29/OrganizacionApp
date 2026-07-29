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
 * Cómo: escribe un canario en cada paquete con salida determinista, con las tres formas
 * prohibidas y tres legítimas, pasa Biome, y exige que las señaladas sean EXACTAMENTE las
 * prohibidas. Los canarios se borran siempre, incluso si algo revienta; y si un fallo brusco
 * dejara alguno, el siguiente `pnpm lint` se pondría rojo, que es la dirección segura del
 * error.
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

// El canario. El número de línea es la aserción: 1-3 deben dispararse, 4-6 no.
const LINEAS_PROHIBIDAS = [1, 2, 3];
const CANARIO = [
  "export const prohibido1 = Date.now();",
  "export const prohibido2 = new Date();",
  "export const prohibido3 = Math.random();",
  'export const legitimo1 = new Date("2026-08-03T00:00:00Z");',
  "export const legitimo2 = Math.max(1, 2);",
  "export const legitimo3 = Math.floor(1.5);",
  "",
].join("\n");

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
        `${paquete}: el guardrail NO señaló ${faltan.length} de las 3 formas prohibidas ` +
          `(líneas ${faltan.join(", ")} del canario: ` +
          `${faltan.map((n) => CANARIO.split("\n")[n - 1].trim()).join(" / ")}).`,
      );
    }
    if (sobran.length > 0) {
      problemas.push(
        `${paquete}: FALSO POSITIVO en ${sobran.length} forma(s) legítima(s) ` +
          `(líneas ${sobran.join(", ")}: ` +
          `${sobran.map((n) => CANARIO.split("\n")[n - 1].trim()).join(" / ")}).`,
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
  `  ✔ guardrail del núcleo: las 3 formas prohibidas se señalan y las 3 legítimas no, ` +
    `en los ${PAQUETES_DEL_NUCLEO.length} paquetes con salida determinista\n`,
);
