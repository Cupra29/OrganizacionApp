// Caso T-9 de `docs/qa/fase-1-nucleo-temporal.md` y **las tres fixtures por régimen de
// periodo** del criterio de aceptación de la fase 1 (`05`, tabla de "Tres fixtures de `CYCLE`").
//
// **El eje es el periodo, no "alineado o no".** El periodo en semanas civiles de un ciclo de `L`
// días es `L / mcd(L, 7)`, y ese número decide qué prueba cada fixture:
//
//   | Fixture | `L` | Periodo | Qué prueba                                                    |
//   |---------|-----|---------|---------------------------------------------------------------|
//   | 4×3     |   7 |       1 | El caso del brief. NO refuta la semana plantilla               |
//   | 2-2-3   |  14 |       2 | El turno REAL del usuario. Caza el bug del módulo 7            |
//   | 4 on/4  |   8 |       8 | Deriva máxima. Carga la aserción fuerte, con falsificador      |
//
// Lo que refuta la semana plantilla (ADR-003 regla 3) es **periodo ≥ 2**, no la deriva. Por eso
// la fixture de 14 días no es redundante con la de 8: es la que caza una implementación que
// reduzca el ciclo módulo 7, porque con `L = 14` ese bug produce un resultado **equivocado pero
// plausible** (todas las semanas iguales) mientras que con `L = 8` salta a la vista.

import { describe, expect, it } from "vitest";
import { fechasDeCiclo } from "./expansion.ts";
import { D } from "./fixtures.ts";
import { ErrorRecurrencia } from "./rrule.ts";
import { Temporal } from "./temporal.ts";

/** Lunes. Las tres fixtures se anclan aquí, como fija el criterio de la fase. */
const ANCLA = D("2026-08-03");

function mcd(a: number, b: number): number {
  return b === 0 ? a : mcd(b, a % b);
}

/** El número que ADR-005 señala como "el que importa": `L / mcd(L, 7)`. */
function periodoSemanas(cycleLengthDays: number): number {
  return cycleLengthDays / mcd(cycleLengthDays, 7);
}

/**
 * El patrón `W`/`R` de `semanas` semanas civiles consecutivas desde `ANCLA`, lunes → domingo.
 *
 * Se deriva del conjunto de fechas de trabajo, que es la salida real del expansor: no reimplementa
 * el ciclo por otro camino, solo reagrupa lo que salió.
 */
function patronesSemanales(
  cycleLengthDays: number,
  dayOffsets: readonly number[],
  semanas: number,
) {
  const trabajo = new Set(
    fechasDeCiclo({
      cycleLengthDays,
      dayOffsets,
      ancla: ANCLA,
      ventana: { desde: ANCLA, hasta: ANCLA.add({ weeks: semanas }) },
    }).map((f) => f.toString()),
  );
  return Array.from({ length: semanas }, (_, s) =>
    Array.from({ length: 7 }, (_, d) =>
      trabajo.has(ANCLA.add({ days: s * 7 + d }).toString()) ? "W" : "R",
    ).join(" "),
  );
}

/**
 * La aserción que las tres fixtures comparten, y la única que distingue los tres regímenes.
 *
 * Dice dos cosas y las dos hacen falta: los patrones se repiten **con** el periodo (semana
 * `i + periodo` idéntica a la `i`, que es el falsificador que exige el criterio) y **no antes**
 * (las `periodo` primeras son mutuamente distintas). Sin la segunda mitad, un expansor que
 * devolviera siempre el mismo patrón pasaría la primera.
 */
function verificarPeriodo(cycleLengthDays: number, dayOffsets: readonly number[]): string[] {
  const periodo = periodoSemanas(cycleLengthDays);
  const patrones = patronesSemanales(cycleLengthDays, dayOffsets, periodo * 2 + 1);

  expect(new Set(patrones.slice(0, periodo)).size).toBe(periodo);
  for (let i = 0; i + periodo < patrones.length; i++) {
    expect(patrones[i + periodo]).toBe(patrones[i]);
  }
  return patrones;
}

describe("el periodo es `L / mcd(L, 7)`, y es lo que separa los tres regímenes", () => {
  it.each([
    [7, 1],
    [14, 2],
    [8, 8],
    [28, 4],
    [21, 3],
  ])("un ciclo de %i días tiene periodo %i semanas", (largo, periodo) => {
    expect(periodoSemanas(largo)).toBe(periodo);
  });
});

describe("Fixture 1 — 4×3, `L = 7`, periodo 1: el caso del brief, que NO demuestra nada", () => {
  const OFFSETS = [0, 1, 2, 3];

  it("las ocho semanas son IDÉNTICAS, por construcción", () => {
    // Está escrito como aserción positiva a propósito. El criterio original de la fase pedía
    // ocho semanas *distintas* de un 4×3, y era insatisfacible: 4 + 3 = 7. Que las ocho salgan
    // iguales es la respuesta correcta, no un fallo, y dejarlo comprobado impide que alguien
    // "arregle" el expansor para satisfacer aquel criterio.
    const patrones = patronesSemanales(7, OFFSETS, 8);
    expect(new Set(patrones).size).toBe(1);
    expect(patrones[0]).toBe("W W W W R R R");
  });

  it("periodo 1: la semana 2 ya repite la 1", () => {
    expect(verificarPeriodo(7, OFFSETS)).toHaveLength(3);
  });
});

describe("Fixture 2 — 2-2-3, `L = 14`, periodo 2: el turno REAL del usuario (Q13)", () => {
  // 2 de trabajo, 2 de descanso, 3 de trabajo, 2 de descanso, 2 de trabajo, 3 de descanso.
  // Anclado en lunes: semana impar {L,M,V,S,D}, semana par {X,J}.
  const OFFSETS = [0, 1, 4, 5, 6, 9, 10];

  it("produce exactamente dos patrones civiles que alternan", () => {
    const patrones = verificarPeriodo(14, OFFSETS);
    expect(patrones.slice(0, 2)).toEqual(["W W R R W W W", "R R W W R R R"]);
  });

  it("semanas impares {L,M,V,S,D} y pares {X,J}, como dice ADR-005", () => {
    const fechas = fechasDeCiclo({
      cycleLengthDays: 14,
      dayOffsets: OFFSETS,
      ancla: ANCLA,
      ventana: { desde: ANCLA, hasta: ANCLA.add({ weeks: 2 }) },
    }).map((f) => f.toString());
    expect(fechas).toEqual([
      "2026-08-03", // L
      "2026-08-04", // M
      "2026-08-07", // V
      "2026-08-08", // S
      "2026-08-09", // D
      "2026-08-12", // X
      "2026-08-13", // J
    ]);
  });

  it("la semana 3 es idéntica a la 1 y la 4 a la 2: el falsificador de la alternancia", () => {
    const patrones = patronesSemanales(14, OFFSETS, 4);
    expect(patrones[2]).toBe(patrones[0]);
    expect(patrones[3]).toBe(patrones[1]);
    expect(patrones[0]).not.toBe(patrones[1]);
  });

  it("periodo 2 refuta la semana plantilla, que es lo que el 4×3 no podía hacer", () => {
    // ADR-003 regla 3 quedaría en pie con periodo 1. Basta periodo ≥ 2 para tumbarla, y el
    // turno real ya lo tiene: no hacía falta esperar a un ciclo desalineado.
    expect(periodoSemanas(14)).toBeGreaterThanOrEqual(2);
    expect(new Set(patronesSemanales(14, OFFSETS, 2)).size).toBe(2);
  });

  it("LA TRAMPA: reducir el ciclo módulo 7 daría un patrón semanal único y plausible", () => {
    // Se escribe el bug al lado del resultado correcto, con el mismo método que T-12 usa para
    // la trampa de conversión de ADR-018 §4. Una implementación que hiciera `diff % 7` en vez
    // de `diff % cycleLengthDays` nunca vería los offsets 9 y 10 (son ≥ 7), así que las dos
    // semanas saldrían iguales: {L,M,V,S,D} todas. Es un resultado equivocado y **plausible**,
    // que es exactamente lo que lo hace peligroso.
    const conBugModulo7 = (semanas: number) =>
      Array.from({ length: semanas }, (_, s) =>
        Array.from({ length: 7 }, (_, d) => {
          const fecha = ANCLA.add({ days: s * 7 + d });
          return OFFSETS.includes(ANCLA.until(fecha, { largestUnit: "day" }).days % 7) ? "W" : "R";
        }).join(" "),
      );

    expect(new Set(conBugModulo7(4)).size).toBe(1);
    expect(conBugModulo7(4)[0]).toBe("W W R R W W W");
    // El bug reproduce la semana 1 correcta y falsifica la 2: por eso una fixture que solo
    // mirara la primera semana lo dejaría pasar.
    const correcto = patronesSemanales(14, OFFSETS, 4);
    expect(conBugModulo7(4)[0]).toBe(correcto[0]);
    expect(conBugModulo7(4)[1]).not.toBe(correcto[1]);
  });

  it("con `L = 7` el mismo bug es INVISIBLE: por eso la fixture del brief no bastaba", () => {
    const cuatroPorTres = [0, 1, 2, 3];
    const conBugModulo7 = Array.from({ length: 4 }, (_, s) =>
      Array.from({ length: 7 }, (_, d) => {
        const fecha = ANCLA.add({ days: s * 7 + d });
        return cuatroPorTres.includes(ANCLA.until(fecha, { largestUnit: "day" }).days % 7)
          ? "W"
          : "R";
      }).join(" "),
    );
    expect(conBugModulo7).toEqual(patronesSemanales(7, cuatroPorTres, 4));
  });
});

describe("Fixture 3 — 4 on / 4 off, `L = 8`, periodo 8: la aserción fuerte (T-9)", () => {
  const OFFSETS = [0, 1, 2, 3];

  it("las ocho semanas del caso T-9, escritas una por una", () => {
    expect(patronesSemanales(8, OFFSETS, 9)).toEqual([
      "W W W W R R R", // 1 · 03–09 ago
      "R W W W W R R", // 2 · 10–16 ago
      "R R W W W W R", // 3 · 17–23 ago
      "R R R W W W W", // 4 · 24–30 ago
      "R R R R W W W", // 5 · 31 ago–06 sep
      "W R R R R W W", // 6 · 07–13 sep
      "W W R R R R W", // 7 · 14–20 sep
      "W W W R R R R", // 8 · 21–27 sep
      "W W W W R R R", // 9 · 28 sep–04 oct — idéntica a la 1
    ]);
  });

  it("ocho semanas mutuamente distintas y la novena repitiendo la primera", () => {
    const patrones = verificarPeriodo(8, OFFSETS);
    expect(new Set(patrones.slice(0, 8)).size).toBe(8);
    expect(patrones[8]).toBe(patrones[0]);
  });

  it("cada semana es la anterior DESPLAZADA un puesto a la derecha, no rotada", () => {
    // T-9 dice "cada una es la rotación de la anterior un puesto a la izquierda", y **eso es
    // falso** — la tabla de arriba, que sí es correcta, lo desmiente sola: una rotación conserva
    // el número de W, y aquí las cuatro primeras semanas tienen 4 días de trabajo y las cuatro
    // siguientes 3. La relación real es un DESPLAZAMIENTO: `semana[s+1][d] == semana[s][d-1]`,
    // porque avanzar 7 días en un ciclo de 8 retrocede una posición de fase; el valor que entra
    // por el lunes es el de la fase nueva, no el que salió por el domingo. Se comprueba la
    // relación verdadera; la discrepancia queda reportada, no ajustada en silencio.
    const patrones = patronesSemanales(8, OFFSETS, 8).map((p) => p.split(" "));
    for (let i = 1; i < patrones.length; i++) {
      const previa = patrones[i - 1] ?? [];
      const actual = patrones[i] ?? [];
      expect(actual.slice(1)).toEqual(previa.slice(0, 6));
    }
    expect(patrones.map((p) => p.filter((d) => d === "W").length)).toEqual([
      4, 4, 4, 4, 3, 3, 3, 3,
    ]);
  });
});

describe("acotado del ciclo: ancla, ventana y límite", () => {
  const OFFSETS = [0, 1, 4, 5, 6, 9, 10];

  it("no se generan fechas anteriores al ancla aunque la ventana empiece antes", () => {
    const fechas = fechasDeCiclo({
      cycleLengthDays: 14,
      dayOffsets: OFFSETS,
      ancla: ANCLA,
      ventana: { desde: D("2026-07-01"), hasta: D("2026-08-06") },
    }).map((f) => f.toString());
    expect(fechas).toEqual(["2026-08-03", "2026-08-04"]);
  });

  it("una ventana que empieza a mitad de ciclo conserva la fase", () => {
    // La consulta no puede mover el patrón: la fase la fija el ancla, no por dónde se mire. Es
    // la misma propiedad que en `RRULE` sostiene que `COUNT` se gaste fuera de la ventana.
    const fechas = fechasDeCiclo({
      cycleLengthDays: 14,
      dayOffsets: OFFSETS,
      ancla: ANCLA,
      ventana: { desde: D("2026-08-12"), hasta: D("2026-08-20") },
    }).map((f) => f.toString());
    expect(fechas).toEqual(["2026-08-12", "2026-08-13", "2026-08-17", "2026-08-18"]);
  });

  it("el límite inclusivo corta antes que la ventana", () => {
    const fechas = fechasDeCiclo({
      cycleLengthDays: 14,
      dayOffsets: OFFSETS,
      ancla: ANCLA,
      ventana: { desde: ANCLA, hasta: D("2026-09-01") },
      limite: D("2026-08-08"),
    }).map((f) => f.toString());
    expect(fechas).toEqual(["2026-08-03", "2026-08-04", "2026-08-07", "2026-08-08"]);
  });

  it("una ventana vacía devuelve el conjunto vacío", () => {
    expect(
      fechasDeCiclo({
        cycleLengthDays: 14,
        dayOffsets: OFFSETS,
        ancla: ANCLA,
        ventana: { desde: ANCLA, hasta: ANCLA },
      }),
    ).toEqual([]);
  });

  it("un turno sin días (`dayOffsets` vacío) no genera nada, y no es un error", () => {
    expect(
      fechasDeCiclo({
        cycleLengthDays: 14,
        dayOffsets: [],
        ancla: ANCLA,
        ventana: { desde: ANCLA, hasta: ANCLA.add({ weeks: 4 }) },
      }),
    ).toEqual([]);
  });

  it("un ciclo de un solo día genera todos los días", () => {
    expect(
      fechasDeCiclo({
        cycleLengthDays: 1,
        dayOffsets: [0],
        ancla: ANCLA,
        ventana: { desde: ANCLA, hasta: ANCLA.add({ days: 3 }) },
      }).map((f) => f.toString()),
    ).toEqual(["2026-08-03", "2026-08-04", "2026-08-05"]);
  });
});

describe("un patrón que no describe un ciclo se rechaza nombrando el campo", () => {
  const base = { ancla: ANCLA, ventana: { desde: ANCLA, hasta: ANCLA.add({ weeks: 4 }) } };

  it.each([0, -7, 1.5])("`cycleLengthDays = %s`", (cycleLengthDays) => {
    expect(() => fechasDeCiclo({ ...base, cycleLengthDays, dayOffsets: [0] })).toThrow(
      ErrorRecurrencia,
    );
  });

  it.each([14, -1, 1.5])("`dayOffsets` con %s fuera de [0, 14)", (offset) => {
    // Un offset fuera del ciclo generaría fechas que el patrón no describe, y en silencio: el
    // módulo nunca devuelve 14, así que ese turno simplemente no existiría.
    expect(() => fechasDeCiclo({ ...base, cycleLengthDays: 14, dayOffsets: [0, offset] })).toThrow(
      ErrorRecurrencia,
    );
  });

  it("el error nombra el campo, no un mensaje genérico", () => {
    const propiedadDe = (fn: () => unknown): string => {
      try {
        fn();
        return "";
      } catch (error) {
        return error instanceof ErrorRecurrencia ? error.propiedad : "";
      }
    };
    expect(propiedadDe(() => fechasDeCiclo({ ...base, cycleLengthDays: 0, dayOffsets: [0] }))).toBe(
      "cycleLengthDays",
    );
    expect(
      propiedadDe(() => fechasDeCiclo({ ...base, cycleLengthDays: 14, dayOffsets: [99] })),
    ).toBe("dayOffsets");
  });
});

describe("el ciclo no depende de la aritmética de meses ni de años bisiestos", () => {
  it("un ciclo de 8 días atraviesa febrero de 2028 sin descolocarse", () => {
    // `until(...).days` cuenta días de calendario, así que el 29 de febrero no desplaza el
    // ciclo. Se comprueba contra la definición —diferencia de días módulo 8— y no contra una
    // tabla escrita a mano, que sería la misma cuenta hecha dos veces.
    const ancla = D("2028-02-01");
    const fechas = fechasDeCiclo({
      cycleLengthDays: 8,
      dayOffsets: [0, 1, 2, 3],
      ancla,
      ventana: { desde: ancla, hasta: D("2028-04-01") },
    });
    for (const fecha of fechas) {
      const dias = ancla.until(fecha, { largestUnit: "day" }).days;
      expect(dias % 8).toBeLessThan(4);
    }
    // 60 días de ventana (febrero de 2028 tiene 29) = 7 ciclos completos × 4 + los 4 días de
    // trabajo del ciclo que queda a medias.
    expect(fechas).toHaveLength(7 * 4 + 4);
    expect(Temporal.PlainDate.compare(fechas[0] ?? ancla, ancla)).toBe(0);
  });
});
