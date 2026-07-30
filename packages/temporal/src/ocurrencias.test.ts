// Casos T-6, T-11, T-12 y T-16 a T-19 de `docs/qa/fase-1-nucleo-temporal.md`: la etapa 2 de
// ADR-018 (resolución a instantes) y los tres valores de `anchor` de ADR-003.

import { describe, expect, it } from "vitest";
import { D, I, T, ZONA } from "./fixtures.ts";
import { type Anclaje, resolverOcurrencia } from "./ocurrencias.ts";
import { DESAMBIGUACION, type OverrideZona, zonedDe } from "./zona.ts";

/** El viaje de T-16/17/18: una semana en Madrid, declarada como intervalo de instantes. */
const VIAJE: readonly OverrideZona[] = [
  {
    during: { desde: I("2026-08-10T00:00:00Z"), hasta: I("2026-08-17T00:00:00Z") },
    timezone: ZONA.DST_UE,
  },
];

describe("T-6 — un turno de 720 min dura 720 minutos REALES, no 12 h de reloj de pared", () => {
  const turno = (fecha: string) =>
    resolverOcurrencia({
      fecha: D(fecha),
      horaLocal: T("19:00"),
      duracionMinutes: 720,
      zonaRegla: ZONA.DST_EEUU,
      anclaje: "FIXED_ZONE",
      overridesZona: [],
    });

  it("Lectura B — la noche ANTERIOR al adelanto: termina a las 08:00 locales, no a las 07:00", () => {
    const o = turno("2026-03-07");
    expect(o?.inicio.toString()).toBe(I("2026-03-08T01:00:00Z").toString());
    expect(o?.fin.toString()).toBe(I("2026-03-08T13:00:00Z").toString());
    expect(o?.fin.toZonedDateTimeISO(ZONA.DST_EEUU).toPlainTime().toString()).toBe("08:00:00");
  });

  it("Lectura A — el día del cambio: 07:00, y NO discrimina nada (por eso no es la fixture)", () => {
    // Queda escrita a propósito. Las 02:00 son antes que las 19:00, así que este turno ya dejó
    // atrás la transición: da el mismo 07:00 que la suma ingenua en hora de pared, y un motor
    // que ignore el DST por completo lo "pasa" igual. Ver el hallazgo 4 de la auditoría de QA.
    const o = turno("2026-03-08");
    expect(o?.fin.toZonedDateTimeISO(ZONA.DST_EEUU).toPlainTime().toString()).toBe("07:00:00");
  });
});

describe("T-12 — control negativo: la trampa de conversión de ADR-018 §4, escrita y comparada", () => {
  it("volver a hora de pared para sumar da 07:00 donde la respuesta es 08:00", () => {
    const inicio = zonedDe(D("2026-03-07"), T("19:00"), ZONA.DST_EEUU);

    const correcto = inicio.add({ minutes: 720 });
    const conTrampa = inicio
      .toPlainDateTime()
      .add({ minutes: 720 })
      .toZonedDateTime(ZONA.DST_EEUU, { disambiguation: DESAMBIGUACION });

    expect(correcto.toPlainTime().toString()).toBe("08:00:00");
    expect(conTrampa.toPlainTime().toString()).toBe("07:00:00");
    // El par de valores que discrimina. Si algún día coinciden, la trampa volvió a entrar.
    expect(conTrampa.toInstant().toString()).not.toBe(correcto.toInstant().toString());
  });
});

describe("T-11 — 02:30 local con `disambiguation: 'compatible'`", () => {
  const a0230 = (fecha: string) =>
    resolverOcurrencia({
      fecha: D(fecha),
      horaLocal: T("02:30"),
      duracionMinutes: 60,
      // `Europe/Madrid` y no `America/Chicago`: con la regla de la UE el hueco Y el pliegue
      // caen los dos en 02:00–02:59. Con la de EE. UU. el pliegue cae en 01:00–01:59, así que
      // "02:30 el día del atraso" sería una hora de invierno normal y no probaría nada.
      zonaRegla: ZONA.DST_UE,
      anclaje: "FIXED_ZONE",
      overridesZona: [],
    });

  it("adelanto: la hora no existe y se desplaza adelante los 60 min del hueco", () => {
    expect(a0230("2026-03-29")?.inicio.toString()).toBe(I("2026-03-29T01:30:00Z").toString());
  });

  it("atraso: la hora ocurre dos veces y se toma la PRIMERA", () => {
    expect(a0230("2026-10-25")?.inicio.toString()).toBe(I("2026-10-25T00:30:00Z").toString());
    // La segunda, que es la que NO se elige, sería 01:30:00Z (02:30 CET).
    expect(a0230("2026-10-25")?.inicio.toString()).not.toBe(I("2026-10-25T01:30:00Z").toString());
  });

  it("ninguna de las dos falla ni lanza", () => {
    expect(a0230("2026-03-29")).toBeDefined();
    expect(a0230("2026-10-25")).toBeDefined();
  });
});

describe("Los tres valores de `anchor` contra una ventana de viaje activa", () => {
  const ocurrencia = (anclaje: Anclaje, fecha: string, hora: string) =>
    resolverOcurrencia({
      fecha: D(fecha),
      horaLocal: T(hora),
      duracionMinutes: 60,
      zonaRegla: ZONA.MEDIANOCHE_SIN_DST,
      anclaje,
      overridesZona: VIAJE,
    });

  it("T-16 `SUSPEND_WHEN_AWAY`: la ocurrencia está AUSENTE durante el viaje", () => {
    // Ausente, no movida ni marcada como cancelada: el turno en el hospital de tu ciudad no
    // ocurre a otra hora cuando viajas, sencillamente no ocurre.
    expect(ocurrencia("SUSPEND_WHEN_AWAY", "2026-08-11", "09:00")).toBeUndefined();
    expect(ocurrencia("SUSPEND_WHEN_AWAY", "2026-08-13", "09:00")).toBeUndefined();
    // Antes y después del viaje, ancladas a la zona de origen sin cambios.
    expect(ocurrencia("SUSPEND_WHEN_AWAY", "2026-08-04", "09:00")?.inicio.toString()).toBe(
      I("2026-08-04T15:00:00Z").toString(),
    );
    expect(ocurrencia("SUSPEND_WHEN_AWAY", "2026-08-18", "09:00")?.inicio.toString()).toBe(
      I("2026-08-18T15:00:00Z").toString(),
    );
  });

  it("T-17 `FIXED_ZONE`: mismo instante UTC que si no hubiera viaje", () => {
    const conViaje = ocurrencia("FIXED_ZONE", "2026-08-11", "09:00");
    const sinViaje = resolverOcurrencia({
      fecha: D("2026-08-11"),
      horaLocal: T("09:00"),
      duracionMinutes: 60,
      zonaRegla: ZONA.MEDIANOCHE_SIN_DST,
      anclaje: "FIXED_ZONE",
      overridesZona: [],
    });
    expect(conViaje?.inicio.toString()).toBe(I("2026-08-11T15:00:00Z").toString());
    expect(conViaje?.inicio.toString()).toBe(sinViaje?.inicio.toString());
    expect(conViaje?.zonaAplicada).toBe(ZONA.MEDIANOCHE_SIN_DST);
  });

  it("T-18 `LOCAL_WHEREVER`: misma hora de pared, en la zona del override", () => {
    const o = ocurrencia("LOCAL_WHEREVER", "2026-08-11", "07:00");
    expect(o?.inicio.toString()).toBe(I("2026-08-11T05:00:00Z").toString()); // 07:00 CEST
    expect(o?.zonaAplicada).toBe(ZONA.DST_UE);
    // Fuera de la ventana del override vuelve a la zona de origen sin ceremonia.
    expect(ocurrencia("LOCAL_WHEREVER", "2026-08-18", "07:00")?.inicio.toString()).toBe(
      I("2026-08-18T13:00:00Z").toString(),
    );
  });

  it("estar fuera es que haya viaje, no que la zona de destino sea otra", () => {
    // Viajar a otra ciudad del mismo huso sigue siendo estar fuera del gimnasio del barrio.
    const mismoHuso: readonly OverrideZona[] = [
      {
        during: { desde: I("2026-08-10T00:00:00Z"), hasta: I("2026-08-17T00:00:00Z") },
        timezone: ZONA.MEDIANOCHE_SIN_DST,
      },
    ];
    expect(
      resolverOcurrencia({
        fecha: D("2026-08-11"),
        horaLocal: T("09:00"),
        duracionMinutes: 60,
        zonaRegla: ZONA.MEDIANOCHE_SIN_DST,
        anclaje: "SUSPEND_WHEN_AWAY",
        overridesZona: mismoHuso,
      }),
    ).toBeUndefined();
  });
});

describe("T-19 (propiedad) — exactamente un `anchor` decide, y no hay un cuarto camino", () => {
  const ANCLAJES: readonly Anclaje[] = ["FIXED_ZONE", "LOCAL_WHEREVER", "SUSPEND_WHEN_AWAY"];
  const HORAS = ["00:15", "07:00", "13:30", "23:45"];
  const DESTINOS = [ZONA.DST_UE, ZONA.DST_MEDIA_HORA, ZONA.OFFSET_NO_ENTERO, ZONA.DST_EEUU];

  /** Ventanas de viaje solapadas y no solapadas con las fechas que se resuelven. */
  const VENTANAS = [
    { desde: "2026-08-10T00:00:00Z", hasta: "2026-08-17T00:00:00Z" },
    { desde: "2026-08-11T04:00:00Z", hasta: "2026-08-12T04:00:00Z" },
    { desde: "2026-01-01T00:00:00Z", hasta: "2026-01-02T00:00:00Z" },
    { desde: "2026-08-01T00:00:00Z", hasta: "2027-01-01T00:00:00Z" },
  ];

  it("todo resultado es ausencia, el instante de origen o el instante del destino", () => {
    let ausentes = 0;
    let enOrigen = 0;
    let enDestino = 0;

    for (const anclaje of ANCLAJES) {
      for (const hora of HORAS) {
        for (const destino of DESTINOS) {
          for (const ventana of VENTANAS) {
            for (let dia = 3; dia <= 20; dia += 1) {
              const fecha = D(`2026-08-${String(dia).padStart(2, "0")}`);
              const overridesZona: readonly OverrideZona[] = [
                { during: { desde: I(ventana.desde), hasta: I(ventana.hasta) }, timezone: destino },
              ];
              const comun = {
                fecha,
                horaLocal: T(hora),
                duracionMinutes: 60,
                zonaRegla: ZONA.MEDIANOCHE_SIN_DST,
                overridesZona,
              } as const;

              const obtenido = resolverOcurrencia({ ...comun, anclaje });
              const sinViaje = zonedDe(fecha, T(hora), ZONA.MEDIANOCHE_SIN_DST).toInstant();
              const enElDestino = zonedDe(fecha, T(hora), destino).toInstant();

              if (obtenido === undefined) {
                ausentes += 1;
                expect(anclaje).toBe("SUSPEND_WHEN_AWAY");
              } else if (obtenido.inicio.equals(sinViaje)) {
                enOrigen += 1;
                expect(obtenido.zonaAplicada).toBe(ZONA.MEDIANOCHE_SIN_DST);
              } else {
                enDestino += 1;
                // El tercer camino, y no hay más: la hora de pared en la zona del override.
                expect(obtenido.inicio.toString()).toBe(enElDestino.toString());
                expect(anclaje).toBe("LOCAL_WHEREVER");
                expect(obtenido.zonaAplicada).toBe(destino);
              }
            }
          }
        }
      }
    }

    // Sin esto la propiedad sería satisfacible por vacío: tres ramas y ninguna recorrida.
    expect(ausentes).toBeGreaterThan(0);
    expect(enOrigen).toBeGreaterThan(0);
    expect(enDestino).toBeGreaterThan(0);
    expect(ausentes + enOrigen + enDestino).toBe(
      ANCLAJES.length * HORAS.length * DESTINOS.length * VENTANAS.length * 18,
    );
  });
});
