// Resolución de una ocurrencia a instantes — etapa 2 de ADR-018, la mitad **con** dificultad
// horaria. Consume una fecha civil (que produce la etapa 1, aún sin escribir) y devuelve el
// intervalo absoluto, o su ausencia.
//
// Los tres valores de `anchor` de ADR-003 se resuelven **aquí y solo aquí**. El tercero,
// `SUSPEND_WHEN_AWAY`, no mueve la ocurrencia: la hace **desaparecer**. Modelarlo como un
// desplazamiento produciría planes que colocan a la persona donde no está.

import type { Temporal } from "./temporal.ts";
import { type OverrideZona, overrideActivoEn, type ZonaIana, zonedDe } from "./zona.ts";

/** Comportamiento declarado de un compromiso mientras el usuario está de viaje (ADR-003). */
export type Anclaje = "FIXED_ZONE" | "LOCAL_WHEREVER" | "SUSPEND_WHEN_AWAY";

export interface EntradaOcurrencia {
  readonly fecha: Temporal.PlainDate;
  readonly horaLocal: Temporal.PlainTime;
  readonly duracionMinutes: number;
  /** La zona **en la que se pensó la regla** (ADR-003 regla 2), no la del proceso. */
  readonly zonaRegla: ZonaIana;
  readonly anclaje: Anclaje;
  readonly overridesZona: readonly OverrideZona[];
}

export interface Ocurrencia {
  readonly inicio: Temporal.Instant;
  readonly fin: Temporal.Instant;
  /** La zona con la que se resolvió la hora de pared. Útil para depurar y para el `.ics`. */
  readonly zonaAplicada: ZonaIana;
}

/**
 * `(fecha, hora local, zona de la regla, anclaje, overrides) => intervalo absoluto`.
 *
 * Devuelve `undefined` cuando la ocurrencia **no existe**: un `SUSPEND_WHEN_AWAY` durante un
 * viaje. Ausente, no movida ni marcada como cancelada — el hueco queda libre.
 *
 * `fin` son **minutos reales sobre la línea de instantes** (ADR-018 §4): un bloque que contiene
 * un cambio de horario dura lo que dura, así que un turno de 720 min que arranca la noche
 * anterior a un adelanto termina a las 08:00 locales y no a las 07:00.
 */
export function resolverOcurrencia(entrada: EntradaOcurrencia): Ocurrencia | undefined {
  // `FIXED_ZONE` no consulta los overrides **en absoluto**: no es que consulte y descarte, es
  // que la pregunta no se hace. Una clase en línea con gente de tu ciudad no sabe que viajaste.
  const override =
    entrada.anclaje === "FIXED_ZONE"
      ? undefined
      : overrideActivoEn(entrada.fecha, entrada.overridesZona, entrada.zonaRegla);

  if (entrada.anclaje === "SUSPEND_WHEN_AWAY" && override !== undefined) {
    return undefined;
  }

  // Estar fuera es que haya un viaje declarado, no que la zona de destino sea distinta: viajar
  // a otra ciudad del mismo huso sigue siendo estar fuera del gimnasio del barrio.
  const zonaAplicada =
    entrada.anclaje === "LOCAL_WHEREVER" && override !== undefined
      ? override.timezone
      : entrada.zonaRegla;

  const inicio = zonedDe(entrada.fecha, entrada.horaLocal, zonaAplicada);
  return {
    inicio: inicio.toInstant(),
    fin: inicio.add({ minutes: entrada.duracionMinutes }).toInstant(),
    zonaAplicada,
  };
}
