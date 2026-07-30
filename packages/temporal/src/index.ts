// La superficie pública de `@oa/temporal`. Todo el monorepo obtiene `Temporal` desde aquí
// (convención de ADR-018 §1); nadie importa `temporal-polyfill` salvo `./temporal.ts`.
export type {
  EntradaJornadas,
  ExcepcionDia,
  Jornada,
  PerfilTemporal,
  VentanaFechas,
} from "./jornadas.ts";
export { construirJornadas } from "./jornadas.ts";
export type { Anclaje, EntradaOcurrencia, Ocurrencia } from "./ocurrencias.ts";
export { resolverOcurrencia } from "./ocurrencias.ts";
export { Temporal } from "./temporal.ts";
export type { IntervaloInstantes, OverrideZona, ZonaIana } from "./zona.ts";
export { DESAMBIGUACION, instanteDe, overrideActivoEn, zonaEfectivaEn, zonedDe } from "./zona.ts";
