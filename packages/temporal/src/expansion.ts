// **Etapa 1 de ADR-018: el conjunto de fechas civiles.** La mitad SIN dificultad horaria.
//
// En este archivo no hay ni una zona horaria, ni un instante, ni un cambio de horario. Es
// deliberado y es la mitad de la decisión de ADR-018: `RRULE` y `CYCLE` son **dos
// implementaciones de la misma firma**, y la parte difícil —resolver una fecha civil a un
// intervalo absoluto— la comparten y está probada una sola vez en `ocurrencias.ts`.
//
// Que no haya zonas aquí tiene una consecuencia que conviene decir en voz alta: `UNTIL`, que
// ADR-018 §4 exige comparar **como instante**, no se compara en este archivo. Entra ya
// convertido a su última fecha civil permitida (`fechaLimiteDeUntil`, en `zona.ts`, donde sí
// hay zonas). La conversión es exacta y no una aproximación: para una hora local fija, el
// instante de una ocurrencia crece de forma monótona con su fecha, así que
// `instante(d) <= UNTIL` y `d <= d*` son la misma condición.

import type { VentanaFechas } from "./jornadas.ts";
import { desplazamientoDesdeLunes, ErrorRecurrencia, type ReglaRrule } from "./rrule.ts";
import { Temporal } from "./temporal.ts";

/** Lo que las dos etapas 1 tienen en común: de dónde arrancan y hasta dónde llegan. */
interface Acotado {
  /** `DTSTART`: ninguna ocurrencia lo precede, aunque la ventana empiece antes. */
  readonly ancla: Temporal.PlainDate;
  /** Ventana consultada, semiabierta `[desde, hasta)` en fechas civiles. */
  readonly ventana: VentanaFechas;
  /**
   * Última fecha civil permitida, **inclusiva**: la intersección de `effective_until` y `UNTIL`
   * que produce `limiteInclusivo`. Ausente = la regla no termina.
   */
  readonly limite?: Temporal.PlainDate | undefined;
}

export interface EntradaRrule extends Acotado {
  readonly regla: ReglaRrule;
}

export interface EntradaCiclo extends Acotado {
  readonly cycleLengthDays: number;
  /** Días del ciclo, en `[0, cycleLengthDays)`, en los que este turno ocurre. */
  readonly dayOffsets: readonly number[];
}

/**
 * La intersección de `effective_until` y `UNTIL` (ADR-018 §4): manda **el más restrictivo**.
 *
 * "Una intersección nunca inventa una instancia que ninguno de los dos límites permitía" es la
 * frase del ADR y es literalmente lo que hace un mínimo. Se escribe como función con nombre en
 * vez de resolverse en el sitio de la llamada porque el caso simétrico —que mande
 * `effective_until`— es tan fácil de olvidar como el otro, y así hay un solo lugar donde
 * mirarlo.
 */
export function limiteInclusivo(
  effectiveUntil: Temporal.PlainDate | undefined,
  untilComoFecha: Temporal.PlainDate | undefined,
): Temporal.PlainDate | undefined {
  if (effectiveUntil === undefined) {
    return untilComoFecha;
  }
  if (untilComoFecha === undefined) {
    return effectiveUntil;
  }
  return Temporal.PlainDate.compare(effectiveUntil, untilComoFecha) <= 0
    ? effectiveUntil
    : untilComoFecha;
}

/** La última fecha que puede salir: el fin de la ventana, o el límite si es anterior. */
function topeDe(acotado: Acotado): Temporal.PlainDate {
  const finVentana = acotado.ventana.hasta.subtract({ days: 1 });
  const { limite } = acotado;
  return limite !== undefined && Temporal.PlainDate.compare(limite, finVentana) < 0
    ? limite
    : finVentana;
}

/**
 * Un paso de la serie: el periodo `k`-ésimo de la regla.
 *
 * `referencia` es el **primer día del periodo** y sirve solo para terminar: como ninguna fecha
 * del paso puede precederla, en cuanto pasa del tope no queda nada por generar. Separarla de
 * `fechas` es lo que permite que `MONTHLY` **omita** un mes sin dejar de avanzar —si la
 * terminación dependiera de la fecha emitida, un febrero sin día 31 pararía la serie entera.
 */
interface PasoSerie {
  readonly referencia: Temporal.PlainDate;
  readonly fechas: readonly Temporal.PlainDate[];
}

type Serie = (k: number) => PasoSerie;

/**
 * Recorre la serie desde el ancla y devuelve lo que cae dentro de la ventana.
 *
 * **`COUNT` cuenta el conjunto fusionado en orden cronológico** (ADR-018 §5), y por eso se
 * cuenta aquí y no dentro de cada serie: las ocurrencias anteriores a la ventana consultada
 * **gastan `COUNT`** igual que las demás, porque `COUNT` es una propiedad de la regla y no del
 * trozo que se está mirando. Contar solo lo devuelto haría que la misma regla produjera
 * conjuntos distintos según por dónde se la consulte.
 */
function recolectar(
  serie: Serie,
  entrada: Acotado,
  count: number | undefined,
): Temporal.PlainDate[] {
  const tope = topeDe(entrada);
  const salida: Temporal.PlainDate[] = [];
  let emitidas = 0;

  for (let k = 0; ; k++) {
    if (count !== undefined && emitidas >= count) {
      break;
    }
    const paso = serie(k);
    if (Temporal.PlainDate.compare(paso.referencia, tope) > 0) {
      break;
    }
    for (const fecha of paso.fechas) {
      if (count !== undefined && emitidas >= count) {
        break;
      }
      if (Temporal.PlainDate.compare(fecha, tope) > 0) {
        return salida;
      }
      emitidas++;
      if (Temporal.PlainDate.compare(fecha, entrada.ventana.desde) >= 0) {
        salida.push(fecha);
      }
    }
  }
  return salida;
}

/** El lunes de la semana de `fecha`. **`WKST` es `MO` siempre** y no es configurable. */
function lunesDe(fecha: Temporal.PlainDate): Temporal.PlainDate {
  return fecha.subtract({ days: fecha.dayOfWeek - 1 });
}

/**
 * La fecha `día` del periodo que empieza en `inicioPeriodo`, o **ninguna** si no existe.
 *
 * RFC 5545 §3.3.10 lo decide, no nosotros: el 31 de febrero **se omite**, no se recorta al
 * último día del mes. `overflow: 'reject'` es la forma de `Temporal` de preguntarlo, y el
 * `catch` no silencia el resto de la regla — solo este periodo.
 */
function fechaOOmitida(
  inicioPeriodo: Temporal.PlainDate,
  mes: number,
  dia: number,
): readonly Temporal.PlainDate[] {
  try {
    return [
      Temporal.PlainDate.from(
        { year: inicioPeriodo.year, month: mes, day: dia },
        { overflow: "reject" },
      ),
    ];
  } catch {
    return [];
  }
}

/**
 * `(regla, ancla, ventana) => PlainDate[]` — la etapa 1 de `RRULE`.
 *
 * **`WEEKLY;INTERVAL>1` se ancla a la SEMANA, no a la ocurrencia** (ADR-018 §5). Las semanas
 * activas son las que distan un múltiplo de `INTERVAL` semanas de la que contiene el ancla, con
 * `WKST=MO`; dentro de una semana activa se emiten los días de `BYDAY` iguales o posteriores al
 * ancla. Sumar `INTERVAL × 7` días a cada ocurrencia da otro conjunto, y es el primero de los
 * dos errores clásicos que ADR-018 §5 nombra. El segundo —contar `COUNT` por día de la semana
 * en vez de sobre el conjunto fusionado— vive en `recolectar`.
 *
 * `week_starts_on` del perfil **no aparece en esta firma y no debe aparecer nunca**: es
 * presentación (ADR-003 regla 3), y dejarla entrar haría que *qué instancias existen* dependiera
 * de un ajuste de visualización, dejando huérfanas las excepciones ancladas por instante.
 */
export function fechasDeRrule(entrada: EntradaRrule): readonly Temporal.PlainDate[] {
  return recolectar(serieDe(entrada.regla, entrada.ancla), entrada, entrada.regla.count);
}

/**
 * Un `switch` exhaustivo sobre las cuatro frecuencias, sin `default`.
 *
 * Sin `default` a propósito: si algún día se admitiera una quinta frecuencia, el compilador
 * señalaría este punto. Un `default` que lanza sería una rama que ningún test puede ejercitar,
 * y una rama inalcanzable es cobertura que miente sobre lo que se ha probado.
 */
function serieDe(regla: ReglaRrule, ancla: Temporal.PlainDate): Serie {
  const { interval } = regla;
  switch (regla.freq) {
    case "DAILY":
      return (k) => {
        const fecha = ancla.add({ days: k * interval });
        return { referencia: fecha, fechas: [fecha] };
      };
    case "WEEKLY": {
      // Sin `BYDAY`, el día de la semana lo pone el ancla: es el `DTSTART` de RFC 5545 haciendo
      // de valor implícito, no una regla nuestra.
      const desplazamientos =
        regla.byDay === undefined
          ? [ancla.dayOfWeek - 1]
          : regla.byDay.map((dia) => desplazamientoDesdeLunes(dia)).sort((a, b) => a - b);
      const lunesDelAncla = lunesDe(ancla);
      return (k) => {
        const lunes = lunesDelAncla.add({ weeks: k * interval });
        return {
          referencia: lunes,
          fechas: desplazamientos
            .map((d) => lunes.add({ days: d }))
            // Los días `BYDAY` de la semana del ancla anteriores al ancla no existen: el lunes
            // 2026-08-03 de una regla anclada el miércoles 2026-08-05 NO está en el conjunto.
            .filter((f) => Temporal.PlainDate.compare(f, ancla) >= 0),
        };
      };
    }
    case "MONTHLY":
      return (k) => {
        const inicioMes = ancla.with({ day: 1 }).add({ months: k * interval });
        return {
          referencia: inicioMes,
          fechas: fechaOOmitida(inicioMes, inicioMes.month, ancla.day),
        };
      };
    case "YEARLY":
      return (k) => {
        const inicioAnio = ancla.with({ month: 1, day: 1 }).add({ years: k * interval });
        return {
          referencia: inicioAnio,
          fechas: fechaOOmitida(inicioAnio, ancla.month, ancla.day),
        };
      };
  }
}

/**
 * `(patrón, ancla, ventana) => PlainDate[]` — la etapa 1 de `CYCLE`, misma firma que la de
 * `RRULE` y por eso el mismo coste de fixturar (ADR-005 admitía dos caminos con el riesgo de
 * que uno recibiera menos pruebas; en la etapa 1 los dos son igual de baratos).
 *
 * **El módulo es `cycleLengthDays`, jamás 7.** El periodo en semanas civiles de un ciclo de `L`
 * días es `L / mcd(L, 7)`: 7 → 1, **14 → 2**, 8 → 8, 28 → 4. Reducir el ciclo módulo 7 colapsa
 * cualquier `L` múltiplo de 7 a un patrón semanal único, y con `L = 14` —el turno 2-2-3 real—
 * el resultado es **equivocado pero plausible**: todas las semanas salen iguales en vez de
 * alternar dos patrones. Con `L = 8` el mismo bug es obvio; por eso la fixture que lo caza es
 * la de 14 y no la de 8.
 */
export function fechasDeCiclo(entrada: EntradaCiclo): readonly Temporal.PlainDate[] {
  const { cycleLengthDays, dayOffsets, ancla } = entrada;
  if (!Number.isInteger(cycleLengthDays) || cycleLengthDays < 1) {
    throw new ErrorRecurrencia("cycleLengthDays", `${cycleLengthDays} no es un entero ≥ 1`);
  }
  for (const offset of dayOffsets) {
    if (!Number.isInteger(offset) || offset < 0 || offset >= cycleLengthDays) {
      throw new ErrorRecurrencia(
        "dayOffsets",
        `${offset} está fuera de [0, ${cycleLengthDays}): un offset fuera del ciclo genera ` +
          "fechas que el patrón no describe, sin que nada lo señale",
      );
    }
  }

  const tope = topeDe(entrada);
  const offsets = new Set(dayOffsets);
  const salida: Temporal.PlainDate[] = [];

  // Se arranca en el ancla aunque la ventana empiece antes: un turno no existía antes de que la
  // persona entrara a ese trabajo. Y así el módulo nunca ve un diferencial negativo.
  const primera =
    Temporal.PlainDate.compare(entrada.ventana.desde, ancla) > 0 ? entrada.ventana.desde : ancla;

  for (
    let fecha = primera;
    Temporal.PlainDate.compare(fecha, tope) <= 0;
    fecha = fecha.add({ days: 1 })
  ) {
    const diaDelCiclo = ancla.until(fecha, { largestUnit: "day" }).days % cycleLengthDays;
    if (offsets.has(diaDelCiclo)) {
      salida.push(fecha);
    }
  }
  return salida;
}
