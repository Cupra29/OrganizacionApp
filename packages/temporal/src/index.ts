// La superficie pública de `@oa/temporal`. Todo el monorepo obtiene `Temporal` desde aquí
// (convención de ADR-018 §1); nadie importa `temporal-polyfill` salvo `./temporal.ts`.
export type {
  AccionExcepcion,
  ExcepcionRecurrencia,
  SalidaExcepciones,
} from "./excepciones.ts";
export { aplicarExcepciones } from "./excepciones.ts";
export type { EntradaCiclo, EntradaRrule } from "./expansion.ts";
export { fechasDeCiclo, fechasDeRrule, limiteInclusivo } from "./expansion.ts";
export type { IntervaloInstantes } from "./intervalos.ts";
export { restar, solapan, unir } from "./intervalos.ts";
export type {
  EntradaJornadas,
  ExcepcionDia,
  Jornada,
  JornadaDegenerada,
  PerfilTemporal,
  SalidaJornadas,
  VentanaFechas,
} from "./jornadas.ts";
export { construirJornadas } from "./jornadas.ts";
export type { Anclaje, EntradaOcurrencia, Ocurrencia } from "./ocurrencias.ts";
export { resolverOcurrencia } from "./ocurrencias.ts";
export type { DiaSemana, Frecuencia, ReglaRrule } from "./rrule.ts";
export { DIAS_SEMANA, ErrorRecurrencia, validarAncla, validarRrule } from "./rrule.ts";
export { Temporal } from "./temporal.ts";
export type { OverrideZona, ZonaIana } from "./zona.ts";
export {
  DESAMBIGUACION,
  fechaLimiteDeUntil,
  instanteDe,
  overrideActivoEn,
  zonaEfectivaEn,
  zonedDe,
} from "./zona.ts";
