// La superficie pública de `@oa/temporal`. Todo el monorepo obtiene `Temporal` desde aquí
// (convención de ADR-018 §1); nadie importa `temporal-polyfill` salvo `./temporal.ts`.
export { Temporal } from "./temporal.ts";
