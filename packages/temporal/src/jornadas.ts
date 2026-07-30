// `PlanningDay`: la construcción de jornadas de 03 §3.1, con la corrección de `zonaSig`.
//
// **La unidad de planificación es la jornada `[wake, wakeSig)`, no el día calendario**
// (ADR-003 regla 1). Todo el manejo de medianoche vive en una línea —`si sleep <= wake`— y a
// partir de ahí nadie vuelve a razonar sobre horas locales: solo instantes. Ese confinamiento
// es lo que impide que los bugs de medianoche se repartan por el resto del motor, y es también
// lo que hace que un cronotipo nocturno no sea un caso especial en ninguna parte.

import { Temporal } from "./temporal.ts";
import { instanteDe, type OverrideZona, type ZonaIana, zonaEfectivaEn } from "./zona.ts";

/** Ventana de fechas civiles semiabierta `[desde, hasta)`: una jornada por fecha. */
export interface VentanaFechas {
  readonly desde: Temporal.PlainDate;
  readonly hasta: Temporal.PlainDate;
}

/** Lo que `temporal_profiles` (02 §3) aporta a la construcción de jornadas. */
export interface PerfilTemporal {
  readonly baseTimezone: ZonaIana;
  readonly defaultWakeLocal: Temporal.PlainTime;
  /** Puede ser menor que `defaultWakeLocal`: eso es que el sueño cruza medianoche, y es NORMAL. */
  readonly defaultSleepLocal: Temporal.PlainTime;
  readonly sleepNeedMinutes: number;
}

/** Una fila de `day_exceptions` (02 §3). `undefined` en un campo = se usa el del perfil. */
export interface ExcepcionDia {
  readonly localDate: Temporal.PlainDate;
  readonly wakeLocal?: Temporal.PlainTime | undefined;
  readonly sleepLocal?: Temporal.PlainTime | undefined;
}

export interface EntradaJornadas {
  readonly ventana: VentanaFechas;
  readonly perfil: PerfilTemporal;
  readonly excepcionesDia: readonly ExcepcionDia[];
  readonly overridesZona: readonly OverrideZona[];
}

export interface Jornada {
  /** Índice dentro de la ventana, no un identificador persistido. */
  readonly id: number;
  /** La fecha civil que ancla la jornada. Sirve para depurar; no es la unidad. */
  readonly fecha: Temporal.PlainDate;
  readonly wake: Temporal.Instant;
  readonly sleep: Temporal.Instant;
  /** El `wake` de la jornada siguiente. Es el fin **exclusivo** de esta: `[wake, wakeSig)`. */
  readonly wakeSig: Temporal.Instant;
  /** `sleep - wake` en minutos REALES. Tolera el cambio de horario sin código específico. */
  readonly vigiliaMinutes: number;
  /** `wakeSig - sleep` en minutos REALES. */
  readonly sueñoMinutes: number;
  /** `max(0, sleepNeedMinutes - sueñoMinutes)`. La evidencia del `Finding SLEEP_DEBT`. */
  readonly déficitSueñoMinutes: number;
  /** Con déficit de sueño no se colocan bloques de foco en el último tramo de la jornada. */
  readonly prohibeFocoNocturno: boolean;
  /** Con déficit de sueño nada alcanza `PEAK` ese día. `null` = sin techo. */
  readonly techoEnergía: "NEUTRAL" | null;
}

function excepcionDe(
  fecha: Temporal.PlainDate,
  porFecha: ReadonlyMap<string, ExcepcionDia>,
): ExcepcionDia | undefined {
  return porFecha.get(fecha.toString());
}

/**
 * Construye una jornada por cada fecha civil de la ventana.
 *
 * **`wakeSig` se calcula con la zona de `d+1`, no con la de `d`.** No es un detalle: con un
 * viaje que empieza en `d+1`, calcularlo con la zona de `d` deja el `wakeSig` de esta jornada y
 * el `wake` de la siguiente en instantes distintos, y la línea de tiempo queda con un hueco —o
 * un solape— del ancho de la diferencia de offsets. Ahí se pierde o se duplica capacidad sin
 * que nada lo señale. Lo caza la propiedad del embaldosado, y se ha visto cazarlo.
 */
export function construirJornadas(entrada: EntradaJornadas): readonly Jornada[] {
  const { ventana, perfil, excepcionesDia, overridesZona } = entrada;
  const porFecha = new Map(excepcionesDia.map((e) => [e.localDate.toString(), e]));

  const jornadas: Jornada[] = [];
  let fecha = ventana.desde;
  for (let id = 0; Temporal.PlainDate.compare(fecha, ventana.hasta) < 0; id += 1) {
    const fechaSig = fecha.add({ days: 1 });
    const zona = zonaEfectivaEn(fecha, overridesZona, perfil.baseTimezone);
    const zonaSig = zonaEfectivaEn(fechaSig, overridesZona, perfil.baseTimezone);

    const excepcion = excepcionDe(fecha, porFecha);
    const excepcionSig = excepcionDe(fechaSig, porFecha);
    const wakeLocal = excepcion?.wakeLocal ?? perfil.defaultWakeLocal;
    const sleepLocal = excepcion?.sleepLocal ?? perfil.defaultSleepLocal;
    const wakeLocalSig = excepcionSig?.wakeLocal ?? perfil.defaultWakeLocal;

    // La ÚNICA línea de medianoche de todo el motor. `sleepLocal <= wakeLocal` no es un error de
    // datos: es un sueño que cruza medianoche, y la hora de dormir pertenece al día siguiente.
    // Se compara en hora de pared y se salta un día de CALENDARIO, no 24 h de la línea de
    // instantes: en un día de cambio de horario esas dos cosas no son la misma.
    const cruzaMedianoche = Temporal.PlainTime.compare(sleepLocal, wakeLocal) <= 0;
    const fechaSleep = cruzaMedianoche ? fechaSig : fecha;

    const wake = instanteDe(fecha, wakeLocal, zona);
    const sleep = instanteDe(fechaSleep, sleepLocal, zona);
    const wakeSig = instanteDe(fechaSig, wakeLocalSig, zonaSig);

    const vigiliaMinutes = wake.until(sleep).total({ unit: "minute" });
    const sueñoMinutes = sleep.until(wakeSig).total({ unit: "minute" });
    const déficitSueñoMinutes = Math.max(0, perfil.sleepNeedMinutes - sueñoMinutes);
    const hayDéficit = déficitSueñoMinutes > 0;

    jornadas.push({
      id,
      fecha,
      wake,
      sleep,
      wakeSig,
      vigiliaMinutes,
      sueñoMinutes,
      déficitSueñoMinutes,
      // El motor no puede resolver un déficit de sueño quitando sueño: es la única restricción
      // que nunca cede. Quien emite el `Finding SLEEP_DEBT` es la fase de diagnóstico del
      // motor (03 §4), no este paquete; aquí queda su evidencia numérica completa.
      prohibeFocoNocturno: hayDéficit,
      techoEnergía: hayDéficit ? "NEUTRAL" : null,
    });

    fecha = fechaSig;
  }
  return jornadas;
}
