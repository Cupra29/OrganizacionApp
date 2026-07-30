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
  /** Posición en `jornadas`: `jornadas[i].id === i`. No es un identificador persistido. */
  readonly id: number;
  /** La fecha civil que ancla la jornada. Sirve para depurar; no es la unidad. */
  readonly fecha: Temporal.PlainDate;
  readonly wake: Temporal.Instant;
  /** Acotado a `wakeSig`: una jornada NUNCA reclama minutos de la siguiente. */
  readonly sleep: Temporal.Instant;
  /** El `wake` de la jornada siguiente. Es el fin **exclusivo** de esta: `[wake, wakeSig)`. */
  readonly wakeSig: Temporal.Instant;
  /** `sleep - wake` en minutos REALES. Tolera el cambio de horario sin código específico. */
  readonly vigiliaMinutes: number;
  /** `wakeSig - sleep` en minutos REALES. **Nunca negativo**, por el acotado de `sleep`. */
  readonly sueñoMinutes: number;
  /**
   * Minutos de vigilia declarada que **no cupieron en la jornada**, recortados por el acotado.
   *
   * **0 en absolutamente toda jornada que no cruce un salto de huso.** Es lo único que permite a
   * F2 distinguir "dormiste 4 h porque te acostaste tarde" de "tu jornada se acortó 9 h al cruzar
   * husos": sin este número las dos son el mismo `sueñoMinutes` bajo y la explicación al usuario
   * sería falsa. Campo **derivado**: no toca esquema, ni API, ni superficie de privacidad.
   */
  readonly recorteVigiliaMinutes: number;
  /** `max(0, sleepNeedMinutes - sueñoMinutes)`. La evidencia del `Finding SLEEP_DEBT`. */
  readonly déficitSueñoMinutes: number;
  /** Con déficit de sueño no se colocan bloques de foco en el último tramo de la jornada. */
  readonly prohibeFocoNocturno: boolean;
  /** Con déficit de sueño nada alcanza `PEAK` ese día. `null` = sin techo. */
  readonly techoEnergía: "NEUTRAL" | null;
}

/**
 * Una fecha cuya jornada tendría **duración negativa** (`wakeSig <= wake`), y que por tanto no se
 * emite: no hay forma de que `[wake, wakeSig)` embaldose nada.
 *
 * Solo la produce un salto de huso hacia el este de más de 24 h dentro de una jornada, y **existe
 * entre sitios habitados**: `Pacific/Midway` (−11) → `Pacific/Kiritimati` (+14) son 25 h. Qué hace
 * el motor con ella se decide en la fase 3, con el caso delante; que no salga en silencio es de
 * ahora.
 */
export interface JornadaDegenerada {
  readonly fecha: Temporal.PlainDate;
  readonly wake: Temporal.Instant;
  readonly wakeSig: Temporal.Instant;
}

/**
 * Las jornadas construidas **más** las fechas que no pudieron producir una.
 *
 * Es la misma forma que ADR-018 §7 exige al expansor para las excepciones huérfanas, y por la
 * misma razón: un descarte silencioso no se distingue de un caso que nunca existió.
 */
export interface SalidaJornadas {
  readonly jornadas: readonly Jornada[];
  readonly degeneradas: readonly JornadaDegenerada[];
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
 *
 * **`sleep` sale acotado a `wakeSig`.** Es lo que garantiza que `[wake, sleep)` —el intervalo del
 * que 03 §3.2 saca los huecos— cabe dentro de la jornada, y por tanto que dos jornadas
 * consecutivas nunca reclaman los mismos minutos. Sin el acotado hay doble conteo de capacidad, y
 * la propiedad del embaldosado NO lo caza: va de despertar a despertar y no dice nada de dónde
 * cae `sleep`.
 */
export function construirJornadas(entrada: EntradaJornadas): SalidaJornadas {
  const { ventana, perfil, excepcionesDia, overridesZona } = entrada;
  const porFecha = new Map(excepcionesDia.map((e) => [e.localDate.toString(), e]));

  const jornadas: Jornada[] = [];
  const degeneradas: JornadaDegenerada[] = [];
  for (
    let fecha = ventana.desde;
    Temporal.PlainDate.compare(fecha, ventana.hasta) < 0;
    fecha = fecha.add({ days: 1 })
  ) {
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
    const sleepDeclarado = instanteDe(fechaSleep, sleepLocal, zona);
    const wakeSig = instanteDe(fechaSig, wakeLocalSig, zonaSig);

    // PRECONDICIÓN: la jornada tiene que durar algo. Solo la viola un salto de huso hacia el
    // este de más de 24 h, que existe entre sitios habitados. Se reporta y se salta: emitir una
    // jornada de duración negativa rompería el embaldosado de raíz.
    if (Temporal.Instant.compare(wakeSig, wake) <= 0) {
      degeneradas.push({ fecha, wake, wakeSig });
      continue;
    }

    // ACOTADO AL FIN DE LA JORNADA, y va aquí y no en `calcularHuecos` porque la invariante
    // "una jornada no reclama minutos de otra" pertenece a la jornada.
    //
    // `sleepDeclarado` es una hora local de la zona de `d`, y `wakeSig` puede estar en OTRA:
    // viajando al este, la hora de acostarse cae DESPUÉS del despertar siguiente. Sin este
    // `min`, el intervalo `[wake, sleep)` —que es exactamente lo que 03 §3.2 resta para obtener
    // los huecos— se sale de la jornada e invade la siguiente: las dos reclaman los mismos
    // minutos y `brutoAsignable` los suma DOS VECES. Con Lord Howe son ocho horas y media
    // contadas dos veces. El `sueñoMinutes` negativo era el síntoma visible de ese solape.
    const recorteVigiliaMinutes = Math.max(
      0,
      wakeSig.until(sleepDeclarado).total({ unit: "minute" }),
    );
    const sleep = recorteVigiliaMinutes > 0 ? wakeSig : sleepDeclarado;

    const vigiliaMinutes = wake.until(sleep).total({ unit: "minute" });
    const sueñoMinutes = sleep.until(wakeSig).total({ unit: "minute" });
    const déficitSueñoMinutes = Math.max(0, perfil.sleepNeedMinutes - sueñoMinutes);
    const hayDéficit = déficitSueñoMinutes > 0;

    jornadas.push({
      id: jornadas.length,
      fecha,
      wake,
      sleep,
      wakeSig,
      vigiliaMinutes,
      sueñoMinutes,
      recorteVigiliaMinutes,
      déficitSueñoMinutes,
      // El motor no puede resolver un déficit de sueño quitando sueño: es la única restricción
      // que nunca cede. Quien emite el `Finding SLEEP_DEBT` es la fase de diagnóstico del
      // motor (03 §4), no este paquete; aquí queda su evidencia numérica completa.
      prohibeFocoNocturno: hayDéficit,
      techoEnergía: hayDéficit ? "NEUTRAL" : null,
    });
  }
  return { jornadas, degeneradas };
}
