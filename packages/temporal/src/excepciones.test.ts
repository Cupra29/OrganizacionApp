// Casos T-13, T-14 y T-15 de `docs/qa/fase-1-nucleo-temporal.md`: excepciones ancladas por el
// instante de inicio original (ADR-005 §4) y el reporte de huérfanas (ADR-018 §7).
//
// Los casos recorren la tubería completa —etapa 1 (`fechasDeRrule`) → etapa 2
// (`resolverOcurrencia`) → excepciones— y no una lista de ocurrencias escrita a mano. Es
// deliberado: lo que hay que demostrar es que el instante con el que se ancla una excepción es el
// mismo que produce la expansión **en la fecha de esa ocurrencia**, y una lista a mano lo daría
// por supuesto, que es justo la parte que puede fallar.

import { describe, expect, it } from "vitest";
import {
  aplicarExcepciones,
  type ExcepcionRecurrencia,
  type SalidaExcepciones,
} from "./excepciones.ts";
import { fechasDeRrule } from "./expansion.ts";
import { D, I, T, ZONA } from "./fixtures.ts";
import { unir } from "./intervalos.ts";
import type { Ocurrencia } from "./ocurrencias.ts";
import { resolverOcurrencia } from "./ocurrencias.ts";
import { validarAncla, validarRrule } from "./rrule.ts";

interface Serie {
  readonly regla: string;
  readonly ancla: string;
  readonly zona: string;
  readonly hora: string;
  readonly duracionMinutes: number;
  readonly hasta: string;
}

/** La tubería real: conjunto de fechas → instantes. Sin viajes, para no mezclar dos mecanismos. */
function serie(s: Serie): readonly Ocurrencia[] {
  const regla = validarRrule(s.regla);
  const ancla = D(s.ancla);
  validarAncla(regla, ancla);
  return fechasDeRrule({ regla, ancla, ventana: { desde: ancla, hasta: D(s.hasta) } }).map(
    (fecha) => {
      const ocurrencia = resolverOcurrencia({
        fecha,
        horaLocal: T(s.hora),
        duracionMinutes: s.duracionMinutes,
        zonaRegla: s.zona,
        anclaje: "FIXED_ZONE",
        overridesZona: [],
      });
      if (ocurrencia === undefined) {
        throw new Error(`la fixture no debería suspender ninguna ocurrencia: ${fecha.toString()}`);
      }
      return ocurrencia;
    },
  );
}

const inicios = (salida: SalidaExcepciones): readonly string[] =>
  salida.ocurrencias.map((o) => o.inicio.toString());

const anclas = (salida: SalidaExcepciones): readonly string[] =>
  salida.huerfanas.map((e) => e.recurrenceId.toString());

/**
 * La clase de los lunes a las 09:00 en Madrid, **a caballo del adelanto del 2026-03-29**.
 *
 * `Europe/Madrid` y no `America/Mexico_City`: México no tiene transiciones futuras en su tzdata
 * (07 §4.E), así que con esa zona todas las ocurrencias caerían al mismo offset y este archivo
 * entero pasaría en verde sin haber ejercitado nada de lo que dice probar.
 */
const CLASE_LUNES: Serie = {
  regla: "FREQ=WEEKLY;BYDAY=MO",
  ancla: "2026-03-02",
  zona: ZONA.DST_UE,
  hora: "09:00",
  duracionMinutes: 90,
  hasta: "2026-04-14",
};

describe("El anclaje por instante, y por qué el instante no es el mismo en las dos temporadas", () => {
  it("la misma hora de pared da instantes distintos antes y después del adelanto", () => {
    // Es la premisa de todo lo demás: un offset no es propiedad de una zona, sino de una zona EN
    // UNA FECHA. Los lunes de marzo son 09:00 CET (+1) y los de abril, 09:00 CEST (+2).
    expect(serie(CLASE_LUNES).map((o) => o.inicio.toString())).toEqual([
      "2026-03-02T08:00:00Z",
      "2026-03-09T08:00:00Z",
      "2026-03-16T08:00:00Z",
      "2026-03-23T08:00:00Z",
      // ─── 2026-03-29: 02:00 CET → 03:00 CEST ───
      "2026-03-30T07:00:00Z",
      "2026-04-06T07:00:00Z",
      "2026-04-13T07:00:00Z",
    ]);
  });
});

describe("T-13 — una excepción creada ANTES del cambio de horario sigue apuntando bien DESPUÉS", () => {
  const SALTAR_EL_30: readonly ExcepcionRecurrencia[] = [
    // El instante correcto: 09:00 en Madrid **el 30 de marzo**, es decir con el offset que aplica
    // esa fecha (+2), no con el que aplicaba el día en que se creó la excepción (+1).
    { recurrenceId: I("2026-03-30T07:00:00Z"), accion: "SKIP" },
  ];

  it("la ocurrencia del 30 de marzo se omite, y ninguna otra se ve afectada", () => {
    const salida = aplicarExcepciones(serie(CLASE_LUNES), SALTAR_EL_30);
    expect(inicios(salida)).toEqual([
      "2026-03-02T08:00:00Z",
      "2026-03-09T08:00:00Z",
      "2026-03-16T08:00:00Z",
      "2026-03-23T08:00:00Z",
      "2026-04-06T07:00:00Z",
      "2026-04-13T07:00:00Z",
    ]);
    expect(salida.huerfanas).toEqual([]);
  });

  it("el ancla cae en la temporada de verano y el resto de la serie sigue en las dos", () => {
    // La aserción que da sentido a la puerta de una sola dirección de ADR-005: la excepción
    // atraviesa la transición y sigue señalando una sola instancia, la correcta. Las cuatro
    // ocurrencias en CET y las dos restantes en CEST quedan intactas: el ancla no "arrastra" a
    // sus vecinas ni por hora de pared ni por proximidad.
    const salida = aplicarExcepciones(serie(CLASE_LUNES), SALTAR_EL_30);
    expect(
      salida.ocurrencias.filter((o) => o.inicio.toString().endsWith("T08:00:00Z")),
    ).toHaveLength(4);
    expect(
      salida.ocurrencias.filter((o) => o.inicio.toString().endsWith("T07:00:00Z")),
    ).toHaveLength(2);
  });

  it("anclada por HORA LOCAL, la misma excepción sería ambigua; por instante no lo es", () => {
    // El contrafáctico de ADR-005: "la ocurrencia del 30 de marzo a las 09:00" describe una
    // instancia sin decir cuál de los dos offsets vale, y en el atraso de octubre esa misma frase
    // describe DOS instantes. El ancla por instante no tiene esa forma de fallar: hay un solo
    // `epochNanoseconds` y casa con uno o con ninguno.
    const porInstante = serie(CLASE_LUNES).filter((o) =>
      o.inicio.equals(I("2026-03-30T07:00:00Z")),
    );
    expect(porInstante).toHaveLength(1);
  });
});

describe("T-14 — el ancla con el offset equivocado queda huérfana, y se REPORTA", () => {
  // El residuo que ADR-018 §7 previó y no se puede evitar: si un país cambia sus reglas de
  // horario de verano, el instante recalculado de una ocurrencia futura se mueve y la excepción
  // se queda apuntando a un instante que ya no existe. Aquí se simula con el offset de invierno
  // (+1) aplicado a una fecha que ya está en verano.
  const CON_OFFSET_VIEJO: readonly ExcepcionRecurrencia[] = [
    { recurrenceId: I("2026-03-30T08:00:00Z"), accion: "SKIP" },
  ];

  it("la ocurrencia del 30 de marzo se genera NORMALMENTE, sin omitir", () => {
    const salida = aplicarExcepciones(serie(CLASE_LUNES), CON_OFFSET_VIEJO);
    expect(inicios(salida)).toContain("2026-03-30T07:00:00Z");
    expect(salida.ocurrencias).toHaveLength(7);
  });

  it("la excepción sale en el reporte, no por consola y no en silencio", () => {
    const salida = aplicarExcepciones(serie(CLASE_LUNES), CON_OFFSET_VIEJO);
    expect(anclas(salida)).toEqual(["2026-03-30T08:00:00Z"]);
    // El objeto que sale es el que entró: quien llamó sabe de qué regla es sin que este paquete
    // tenga que conocer ningún identificador del dominio.
    expect(salida.huerfanas[0]).toBe(CON_OFFSET_VIEJO[0]);
  });

  it("no se aplica por proximidad a la ocurrencia de al lado", () => {
    // 08:00:00Z es exactamente el instante de los lunes de INVIERNO de esta misma regla, y está a
    // una hora de la ocurrencia real del 30. Ninguna de las dos cosas la hace casar: ni el 23 de
    // marzo (mismo instante del día, otra fecha) ni el 30 (misma fecha, otro instante) se tocan.
    const salida = aplicarExcepciones(serie(CLASE_LUNES), CON_OFFSET_VIEJO);
    expect(inicios(salida)).toContain("2026-03-23T08:00:00Z");
  });
});

describe("T-15 — un ancla que nunca correspondió a ninguna ocurrencia, sin DST de por medio", () => {
  // Aísla el reporte de huérfanas del ruido del cambio de horario, igual que T-1/T-2 aíslan la
  // medianoche: aquí la zona no tiene transiciones y aun así la excepción no casa.
  const LUNES_MEXICO: Serie = {
    regla: "FREQ=WEEKLY;BYDAY=MO",
    ancla: "2026-08-03",
    zona: ZONA.MEDIANOCHE_SIN_DST,
    hora: "09:00",
    duracionMinutes: 60,
    hasta: "2026-08-25",
  };

  it("una excepción sobre un martes no omite nada y se reporta", () => {
    const enMartes: readonly ExcepcionRecurrencia[] = [
      { recurrenceId: I("2026-08-04T15:00:00Z"), accion: "SKIP" },
    ];
    const salida = aplicarExcepciones(serie(LUNES_MEXICO), enMartes);
    expect(inicios(salida)).toEqual([
      "2026-08-03T15:00:00Z",
      "2026-08-10T15:00:00Z",
      "2026-08-17T15:00:00Z",
      "2026-08-24T15:00:00Z",
    ]);
    expect(anclas(salida)).toEqual(["2026-08-04T15:00:00Z"]);
  });

  it("un `OVERRIDE` huérfano tampoco se aplica a nadie", () => {
    // La acción no cambia el criterio de coincidencia. Un `OVERRIDE` que se aplicara "al que más
    // se le parezca" movería una clase que nadie pidió mover.
    const salida = aplicarExcepciones(serie(LUNES_MEXICO), [
      {
        recurrenceId: I("2026-08-04T15:00:00Z"),
        accion: "OVERRIDE",
        newStart: I("2026-08-04T18:00:00Z"),
      },
    ]);
    expect(inicios(salida)).toEqual([
      "2026-08-03T15:00:00Z",
      "2026-08-10T15:00:00Z",
      "2026-08-17T15:00:00Z",
      "2026-08-24T15:00:00Z",
    ]);
    expect(salida.huerfanas).toHaveLength(1);
  });

  it("sin excepciones no hay ni omisiones ni huérfanas", () => {
    const salida = aplicarExcepciones(serie(LUNES_MEXICO), []);
    expect(salida.ocurrencias).toHaveLength(4);
    expect(salida.huerfanas).toEqual([]);
  });

  it("una excepción duplicada casa una vez y la segunda se reporta", () => {
    // El esquema lo impide (`UNIQUE (rule_id, recurrence_id)`), y aun así importa qué hace: con
    // un mapa de una entrada por clave, la segunda se perdería al pisar a la primera y el
    // descarte volvería a ser silencioso justo donde ADR-018 §7 lo prohíbe.
    const dosVeces: readonly ExcepcionRecurrencia[] = [
      { recurrenceId: I("2026-08-10T15:00:00Z"), accion: "SKIP" },
      { recurrenceId: I("2026-08-10T15:00:00Z"), accion: "SKIP" },
    ];
    const salida = aplicarExcepciones(serie(LUNES_MEXICO), dosVeces);
    expect(inicios(salida)).toEqual([
      "2026-08-03T15:00:00Z",
      "2026-08-17T15:00:00Z",
      "2026-08-24T15:00:00Z",
    ]);
    expect(salida.huerfanas).toHaveLength(1);
    expect(salida.huerfanas[0]).toBe(dosVeces[1]);
  });
});

describe("`OVERRIDE`: la segunda acción de ADR-005 §4", () => {
  const LUNES_MEXICO: Serie = {
    regla: "FREQ=WEEKLY;BYDAY=MO",
    ancla: "2026-08-03",
    zona: ZONA.MEDIANOCHE_SIN_DST,
    hora: "09:00",
    duracionMinutes: 60,
    hasta: "2026-08-18",
  };

  it("`newStart` mueve la ocurrencia y conserva su duración", () => {
    const salida = aplicarExcepciones(serie(LUNES_MEXICO), [
      {
        recurrenceId: I("2026-08-10T15:00:00Z"),
        accion: "OVERRIDE",
        newStart: I("2026-08-10T18:00:00Z"),
      },
    ]);
    expect(inicios(salida)).toEqual([
      "2026-08-03T15:00:00Z",
      "2026-08-10T18:00:00Z",
      "2026-08-17T15:00:00Z",
    ]);
    expect(salida.ocurrencias[1]?.fin.toString()).toBe("2026-08-10T19:00:00Z");
    expect(salida.ocurrencias[1]?.zonaAplicada).toBe(ZONA.MEDIANOCHE_SIN_DST);
    expect(salida.huerfanas).toEqual([]);
  });

  it("`newDurationMinutes` cambia la duración sin mover el inicio", () => {
    const salida = aplicarExcepciones(serie(LUNES_MEXICO), [
      {
        recurrenceId: I("2026-08-10T15:00:00Z"),
        accion: "OVERRIDE",
        newDurationMinutes: 45,
      },
    ]);
    expect(salida.ocurrencias[1]?.inicio.toString()).toBe("2026-08-10T15:00:00Z");
    expect(salida.ocurrencias[1]?.fin.toString()).toBe("2026-08-10T15:45:00Z");
  });

  it("los dos campos a la vez", () => {
    const salida = aplicarExcepciones(serie(LUNES_MEXICO), [
      {
        recurrenceId: I("2026-08-10T15:00:00Z"),
        accion: "OVERRIDE",
        newStart: I("2026-08-10T20:30:00Z"),
        newDurationMinutes: 30,
      },
    ]);
    expect(salida.ocurrencias[1]?.inicio.toString()).toBe("2026-08-10T20:30:00Z");
    expect(salida.ocurrencias[1]?.fin.toString()).toBe("2026-08-10T21:00:00Z");
  });

  it("`newDurationMinutes = 0` es una cancelación efectiva y el álgebra no le da tiempo", () => {
    // T-7.5 desde el otro extremo: aquí se ve de dónde sale de verdad un intervalo degenerado.
    const salida = aplicarExcepciones(serie(LUNES_MEXICO), [
      {
        recurrenceId: I("2026-08-10T15:00:00Z"),
        accion: "OVERRIDE",
        newDurationMinutes: 0,
      },
    ]);
    const cancelada = salida.ocurrencias[1];
    expect(cancelada?.inicio.toString()).toBe("2026-08-10T15:00:00Z");
    expect(cancelada?.fin.toString()).toBe("2026-08-10T15:00:00Z");
    // Sigue en la lista —no desaparece como con `SKIP`— pero no ocupa ni un minuto.
    expect(salida.ocurrencias).toHaveLength(3);
    expect(unir(salida.ocurrencias.map((o) => ({ desde: o.inicio, hasta: o.fin })))).toHaveLength(
      2,
    );
  });

  it("un `OVERRIDE` que mueve una ocurrencia al otro lado de un adelanto dura lo que dice", () => {
    // Minutos reales sobre la línea de instantes (ADR-018 §4), igual que en la resolución: la
    // clase movida a las 01:30 del 29 de marzo dura 90 minutos aunque el reloj de pared salte de
    // 02:00 a 03:00 en medio.
    const salida = aplicarExcepciones(serie(CLASE_LUNES), [
      {
        recurrenceId: I("2026-03-23T08:00:00Z"),
        accion: "OVERRIDE",
        newStart: I("2026-03-29T00:30:00Z"),
      },
    ]);
    const movida = salida.ocurrencias[3];
    expect(movida?.inicio.toString()).toBe("2026-03-29T00:30:00Z");
    expect(movida?.fin.toString()).toBe("2026-03-29T02:00:00Z");
    // 01:30 CET a 04:00 CEST: dos horas y media de reloj de pared, noventa minutos reales.
    expect(movida?.inicio.toZonedDateTimeISO(ZONA.DST_UE).toPlainTime().toString()).toBe(
      "01:30:00",
    );
    expect(movida?.fin.toZonedDateTimeISO(ZONA.DST_UE).toPlainTime().toString()).toBe("04:00:00");
  });

  it("el orden de salida es el de entrada, aunque un `OVERRIDE` mueva una ocurrencia", () => {
    // Documentado en `aplicarExcepciones` y comprobado aquí para que nadie lo dé por ordenado:
    // el único consumidor de estos intervalos ordena por su cuenta (`unir`, 03 §3.2).
    const salida = aplicarExcepciones(serie(LUNES_MEXICO), [
      {
        recurrenceId: I("2026-08-03T15:00:00Z"),
        accion: "OVERRIDE",
        newStart: I("2026-08-20T15:00:00Z"),
      },
    ]);
    expect(inicios(salida)).toEqual([
      "2026-08-20T15:00:00Z",
      "2026-08-10T15:00:00Z",
      "2026-08-17T15:00:00Z",
    ]);
  });
});
