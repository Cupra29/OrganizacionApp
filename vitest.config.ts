import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

/** El único paquete con umbral de cobertura obligatorio (criterio de aceptación de la fase 1). */
const RUTA_CON_UMBRAL = "packages/temporal/src";
const UMBRAL_RAMAS = 95;

// El umbral por glob tiene el mismo modo de fallo SILENCIOSO que ya costó dos guardias en este
// repositorio (`depcruise:cobertura`, `guardrail:cobertura`). Comprobado el 2026-07-30: con el
// glob apuntando a una ruta que no existe, `pnpm test` responde "Coverage summary ... 100%" y
// sale con código 0. Verde limpio, indistinguible de un run sano, con el umbral sin comprobar
// una sola línea. Esta comprobación convierte ese silencio en un fallo de arranque.
if (!existsSync(new URL(`./${RUTA_CON_UMBRAL}/`, import.meta.url))) {
  throw new Error(
    `El umbral de cobertura apunta a "${RUTA_CON_UMBRAL}", que no existe. Un glob que no casa ` +
      `con ningún archivo NO falla: deja pasar la suite en verde sin comprobar nada.`,
  );
}

export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // El umbral por glob se declara AQUÍ, en la raíz, y no en el proyecto: en Vitest 4 la
      // cobertura es configuración de raíz y un bloque `coverage` dentro de un proyecto se
      // ignora en silencio — que es el modo de fallo peligroso, porque sale en verde.
      //
      // `packages/temporal` es el ÚNICO paquete con umbral obligatorio (criterio de aceptación
      // de la fase 1). No es arbitrario: es el paquete donde una rama sin ejercitar es un bug
      // de medianoche o de cambio de horario que nadie ve hasta que produce una jornada de 24 h
      // donde había 23. Se pone ANTES de que el paquete crezca, no después: un umbral añadido
      // sobre código ya escrito se ajusta a lo que salga, y entonces ya no manda nadie.
      thresholds: {
        [`${RUTA_CON_UMBRAL}/**`]: { branches: UMBRAL_RAMAS },
      },
    },
  },
});
