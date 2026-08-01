// Excepciones ancladas por `recurrence_id` — ADR-005 §4, y **puerta de una sola dirección**:
// cambiar el anclaje exigiría migrar datos.
//
// El ancla es **el instante de inicio original en UTC** de la ocurrencia afectada, exactamente
// como el `RECURRENCE-ID` de RFC 5545. No la fecha local y no el índice de ocurrencia, y las dos
// razones están en ADR-005:
//
//   - **Por fecha local** se rompe con los cambios de horario: "la ocurrencia del 25 de octubre a
//     las 02:30" es ambigua el día que las 02:30 ocurren dos veces.
//   - **Por índice** ("la 5ª") se rompe al editar la regla: renumera todas las ocurrencias y las
//     excepciones pasan a apuntar a instancias equivocadas **en silencio**, que es el modo de
//     fallo caro.
//
// Lo que compra el anclaje por instante: una excepción creada ANTES de un cambio de horario sigue
// apuntando a la instancia correcta DESPUÉS, porque el instante de una ocurrencia se calcula con
// el offset que su zona tiene **en la fecha de esa ocurrencia**, no con el que tenía el día en que
// se creó la excepción.
//
// Lo que NO compra, y por eso existe el reporte de huérfanas (ADR-018 §7): si un país cambia sus
// reglas de horario de verano, el instante recalculado de una ocurrencia futura se mueve y la
// excepción se queda apuntando a un instante que ya no existe. No hay forma de evitarlo —lo tiene
// cualquier regla expresada en hora de pared— pero sí de hacerlo **ruidoso** en vez de silencioso.

import type { Ocurrencia } from "./ocurrencias.ts";
import type { Temporal } from "./temporal.ts";

/** Las dos acciones de ADR-005 §4. No hay una tercera. */
export type AccionExcepcion = "SKIP" | "OVERRIDE";

/** Una fila de `recurrence_exceptions` (02 §4.2). */
export interface ExcepcionRecurrencia {
  /** El instante de inicio **original** de la ocurrencia afectada. El ancla, y es exacto. */
  readonly recurrenceId: Temporal.Instant;
  readonly accion: AccionExcepcion;
  /**
   * Solo con `OVERRIDE`. Es un **instante**, no una hora local: la columna es `timestamptz` y ya
   * viene resuelta, así que mover una ocurrencia no vuelve a plantear ninguna pregunta de zona.
   * Ausente = la ocurrencia no se mueve (solo cambia su duración).
   */
  readonly newStart?: Temporal.Instant | undefined;
  /** Solo con `OVERRIDE`. Ausente = conserva la duración original. `0` es cancelación efectiva. */
  readonly newDurationMinutes?: number | undefined;
}

/**
 * Las ocurrencias que sobreviven **más** las excepciones que no casaron con ninguna.
 *
 * Es la misma forma que `SalidaJornadas` usa para las jornadas degeneradas, y por la misma razón:
 * un descarte silencioso no se distingue de un caso que nunca existió.
 */
export interface SalidaExcepciones {
  readonly ocurrencias: readonly Ocurrencia[];
  /**
   * ADR-018 §7: **una excepción que no casa con ninguna instancia se reporta, no se descarta.**
   *
   * Devuelve los mismos objetos que entraron, no una copia: quien llamó ya sabe de qué regla son
   * —la expansión es por regla— y así este paquete no necesita conocer ningún identificador del
   * dominio para que el reporte sea accionable.
   */
  readonly huerfanas: readonly ExcepcionRecurrencia[];
}

function duracionMinutos(ocurrencia: Ocurrencia): number {
  return ocurrencia.inicio.until(ocurrencia.fin).total({ unit: "minute" });
}

function aplicarOverride(ocurrencia: Ocurrencia, excepcion: ExcepcionRecurrencia): Ocurrencia {
  const inicio = excepcion.newStart ?? ocurrencia.inicio;
  const minutos = excepcion.newDurationMinutes ?? duracionMinutos(ocurrencia);
  return {
    inicio,
    // Minutos REALES sobre la línea de instantes, igual que en la resolución (ADR-018 §4): una
    // ocurrencia movida al otro lado de un cambio de horario dura lo que dice durar.
    fin: inicio.add({ minutes: minutos }),
    // La zona con la que se resolvió no cambia: `newStart` mueve el instante, no el lugar donde
    // ocurre la clase. Es lo que el `.ics` necesita para escribir su `TZID`.
    zonaAplicada: ocurrencia.zonaAplicada,
  };
}

/**
 * `(ocurrencias, excepciones) => ocurrencias con SKIP y OVERRIDE aplicados, más las huérfanas`.
 *
 * La coincidencia es por **igualdad exacta de instante** contra `ocurrencia.inicio`, sin ninguna
 * tolerancia: aplicar una excepción "por proximidad" convertiría el residuo conocido de ADR-018
 * §7 —una huérfana que se reporta— en el modo de fallo que ADR-005 descartó al elegir el anclaje,
 * una excepción aplicada a la instancia equivocada sin que nada lo señale.
 *
 * Se compara por `epochNanoseconds` y no por la cadena ISO porque es la definición de igualdad de
 * instantes: dos escrituras distintas del mismo instante son el mismo ancla.
 *
 * **Cada excepción casa con una ocurrencia como mucho.** El esquema garantiza
 * `UNIQUE (rule_id, recurrence_id)`, así que un duplicado no debería llegar aquí; si llega, el
 * segundo no casa con nada y sale reportado, en vez de perderse al pisar una clave de mapa.
 *
 * El orden de salida es el de entrada. Un `OVERRIDE` que mueve una ocurrencia puede dejar la lista
 * fuera de orden cronológico, y se deja así a propósito: reordenar aquí sería inventar un criterio
 * de desempate que nadie ha pedido, y el único consumidor de estos intervalos —`unir`, en 03
 * §3.2— ordena por su cuenta.
 */
export function aplicarExcepciones(
  ocurrencias: readonly Ocurrencia[],
  excepciones: readonly ExcepcionRecurrencia[],
): SalidaExcepciones {
  const porInstante = new Map<string, ExcepcionRecurrencia[]>();
  for (const excepcion of excepciones) {
    const clave = excepcion.recurrenceId.epochNanoseconds.toString();
    const mismas = porInstante.get(clave);
    if (mismas === undefined) {
      porInstante.set(clave, [excepcion]);
    } else {
      mismas.push(excepcion);
    }
  }

  const casadas = new Set<ExcepcionRecurrencia>();
  const supervivientes: Ocurrencia[] = [];
  for (const ocurrencia of ocurrencias) {
    const excepcion = porInstante
      .get(ocurrencia.inicio.epochNanoseconds.toString())
      ?.find((candidata) => !casadas.has(candidata));

    if (excepcion === undefined) {
      supervivientes.push(ocurrencia);
      continue;
    }
    casadas.add(excepcion);
    if (excepcion.accion === "OVERRIDE") {
      supervivientes.push(aplicarOverride(ocurrencia, excepcion));
    }
    // `SKIP`: la ocurrencia no se emite. Ausente, no marcada como cancelada — el hueco queda
    // libre y la capacidad de esa jornada crece sin código específico (ADR-005).
  }

  return {
    ocurrencias: supervivientes,
    // El orden de entrada, no el de las claves del mapa: un reporte tiene que ser reproducible.
    huerfanas: excepciones.filter((excepcion) => !casadas.has(excepcion)),
  };
}
