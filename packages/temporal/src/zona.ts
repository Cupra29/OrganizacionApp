// Zona efectiva y paso de hora de pared a instante — la etapa 2 de ADR-018, y **el único sitio
// del paquete donde existe una zona horaria**. Todo lo que hay por encima (jornadas,
// ocurrencias) llama aquí y a partir de ahí razona solo con instantes absolutos, que es lo que
// ADR-003 exige al confinar el razonamiento sobre horas locales a un solo punto.
//
// La zona **nunca** se lee del entorno: entra como parámetro, igual que `now`. El guardrail
// `scripts/biome/sin-reloj-ni-azar-en-nucleo.grit` lo mecaniza, pero la razón es de diseño.

import { Temporal } from "./temporal.ts";

/** Identificador IANA (`'America/Mexico_City'`). Nunca un offset numérico: ADR-003 lo descarta. */
export type ZonaIana = string;

/** Intervalo de instantes semiabierto `[desde, hasta)`, la misma semántica que `tstzrange`. */
export interface IntervaloInstantes {
  readonly desde: Temporal.Instant;
  readonly hasta: Temporal.Instant;
}

/** Una fila de `timezone_overrides` (02 §3): un viaje. */
export interface OverrideZona {
  readonly during: IntervaloInstantes;
  readonly timezone: ZonaIana;
}

/**
 * Política de horas de pared inexistentes y ambiguas, fijada por ADR-018 §4 como **constante
 * nombrada de la etapa 2** y no esparcida por las llamadas.
 *
 * `'compatible'` significa: ante un hueco de adelanto (02:30 no existe) se desplaza adelante el
 * tamaño exacto del hueco; ante un pliegue de atraso (02:30 ocurre dos veces) se toma la
 * primera de las dos. Es el valor por defecto de `Temporal`, y aun así se escribe: ni RFC 5545
 * ni las bibliotecas del ecosistema documentan qué hacen aquí, y lo que no se nombra no se
 * prueba.
 */
export const DESAMBIGUACION = "compatible" as const;

/**
 * Hora de pared -> instante, con la política de desambiguación de ADR-018 §4.
 *
 * Devuelve el `ZonedDateTime` y no el `Instant` porque quien resuelve una ocurrencia necesita
 * seguir sumando **minutos reales** sobre él (`zdt.add({ minutes })`). Volver a hora de pared
 * para sumar —`zdt.toPlainDateTime().add(...).toZonedDateTime(...)`— es la trampa que ADR-018
 * §4 nombra: da 07:00 donde la respuesta es 08:00 al cruzar un adelanto.
 */
export function zonedDe(
  fecha: Temporal.PlainDate,
  hora: Temporal.PlainTime,
  zona: ZonaIana,
): Temporal.ZonedDateTime {
  return fecha.toPlainDateTime(hora).toZonedDateTime(zona, { disambiguation: DESAMBIGUACION });
}

/** Atajo de `zonedDe` para quien solo quiere el instante. */
export function instanteDe(
  fecha: Temporal.PlainDate,
  hora: Temporal.PlainTime,
  zona: ZonaIana,
): Temporal.Instant {
  return zonedDe(fecha, hora, zona).toInstant();
}

const MEDIANOCHE = Temporal.PlainTime.from("00:00");

/**
 * El override de viaje vigente para la fecha civil `d`, o `undefined` si no hay ninguno.
 *
 * **La regla de referencia, que 03 §3.1 no fija y hay que fijar en alguna parte.** `during` es
 * un intervalo de **instantes** y `d` es una **fecha civil**: para cruzarlos hace falta elegir
 * un instante que represente a `d`, y aquí es el **inicio del día civil `d` en la zona base**.
 * Se elige así por tres razones, y ninguna es cómoda de improvisar más tarde:
 *
 *  1. Es **función pura de `d`**, lo que hace que `zonaEfectivaEn(d)` sea el mismo valor lo
 *     llame quien lo llame. De ahí sale el embaldosado: `jornada[d].wakeSig` y
 *     `jornada[d+1].wake` resuelven la misma zona porque preguntan por la misma fecha, no
 *     porque compartan código.
 *  2. No introduce ninguna constante calibrable (no es "el mediodía", ni "las 12 h del viaje").
 *  3. Colapsa a una sola zona por día el caso que 03 §3.1 declara **residuo sin decidir** — un
 *     `timezone_overrides` cuya frontera cae a mitad de jornada (viaje que empieza a mediodía).
 *     Ese día entero toma la zona que estaba vigente al empezar. Es una aproximación declarada,
 *     no un descuido: el pseudocódigo asigna una sola zona a `wake` y `sleep` de todos modos.
 *
 * El esquema garantiza que los overrides de un usuario **no se solapan** (`EXCLUDE USING gist`,
 * 02 §3), así que como mucho uno casa y el resultado no depende del orden del array.
 */
export function overrideActivoEn(
  fecha: Temporal.PlainDate,
  overridesZona: readonly OverrideZona[],
  zonaBase: ZonaIana,
): OverrideZona | undefined {
  const referencia = instanteDe(fecha, MEDIANOCHE, zonaBase);
  return overridesZona.find(
    (o) =>
      Temporal.Instant.compare(o.during.desde, referencia) <= 0 &&
      Temporal.Instant.compare(referencia, o.during.hasta) < 0,
  );
}

/** La zona en la que se interpretan las horas locales de la fecha `d`. */
export function zonaEfectivaEn(
  fecha: Temporal.PlainDate,
  overridesZona: readonly OverrideZona[],
  zonaBase: ZonaIana,
): ZonaIana {
  return overrideActivoEn(fecha, overridesZona, zonaBase)?.timezone ?? zonaBase;
}
