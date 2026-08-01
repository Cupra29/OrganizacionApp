// Constructores cortos para las fixtures de este paquete. No es superficie pública: `index.ts`
// no lo reexporta y nadie fuera de `packages/temporal` lo importa.
//
// Existe para que los casos de `docs/qa/fase-1-nucleo-temporal.md` se lean como el documento
// —zona, hora, fecha— y no como diez líneas de construcción por caso.

import { Temporal } from "./temporal.ts";

export const D = (iso: string): Temporal.PlainDate => Temporal.PlainDate.from(iso);
export const T = (iso: string): Temporal.PlainTime => Temporal.PlainTime.from(iso);
export const I = (iso: string): Temporal.Instant => Temporal.Instant.from(iso);

/**
 * Las cinco zonas de referencia de `07 §4.E`. **No son intercambiables**, y la tabla está aquí
 * en vez de en cada test porque el modo de fallo es elegir la equivocada sin darse cuenta.
 *
 * `MEDIANOCHE_SIN_DST` es `America/Mexico_City`: aísla el bug de medianoche del de horario de
 * verano, que son dos bugs distintos. **No sirve para ninguna fixture de cambio de horario** —
 * México suprimió el DST en 2022 y su tzdata no tiene transiciones futuras, así que un test de
 * "02:30 ambigua" escrito con ella pasa en verde con un motor que no desambigüe en absoluto.
 */
export const ZONA = {
  MEDIANOCHE_SIN_DST: "America/Mexico_City",
  /** Regla de EE. UU. Transiciones 2026: 03-08 (adelanto) y 11-01 (atraso). */
  DST_EEUU: "America/Chicago",
  /** Regla de la UE: hueco y pliegue caen los dos en 02:00–02:59. 2026: 03-29 y 10-25. */
  DST_UE: "Europe/Madrid",
  /** Salto de 30 min. Un motor que asuma 60 pasa todo lo demás y falla aquí. */
  DST_MEDIA_HORA: "Australia/Lord_Howe",
  /** Offset no entero, +05:30, sin DST. */
  OFFSET_NO_ENTERO: "Asia/Kolkata",
} as const;

/**
 * El elemento `indice` de una fixture, o un fallo con nombre.
 *
 * Existe porque `noUncheckedIndexedAccess` hace que todo índice sea `T | undefined` y la salida
 * fácil es `valores[0]!`, que convierte una fixture rota en un `TypeError` sin contexto tres
 * líneas más abajo.
 */
export function elemento<T>(valores: readonly T[], indice: number): T {
  const valor = valores[indice];
  if (valor === undefined) {
    throw new Error(`la fixture no tiene elemento ${indice}: solo ${valores.length}`);
  }
  return valor;
}

/** El offset de una zona en un instante, en minutos. Lo que exige la propiedad 2. */
export function offsetMinutosEn(instante: Temporal.Instant, zona: string): number {
  return instante.toZonedDateTimeISO(zona).offsetNanoseconds / 60_000_000_000;
}
