// Casos T-1, T-2, T-4 y T-5 de `docs/qa/fase-1-nucleo-temporal.md` §3.1 y §3.2, con los
// valores exactos que ese documento fija, más la cobertura de `day_exceptions`.
//
// Los cuatro se comparan contra **instantes UTC exactos**, no contra duraciones: una duración
// correcta puede esconder dos componentes equivocados que se compensan, y eso ya pasó de verdad
// en la propia fixture T-4 (nota de corrección del 2026-07-29).

import { describe, expect, it } from "vitest";
import { D, elemento, I, T, ZONA } from "./fixtures.ts";
import { construirJornadas, type ExcepcionDia, type PerfilTemporal } from "./jornadas.ts";

function perfil(zona: string, wake: string, sleep: string, necesidad = 480): PerfilTemporal {
  return {
    baseTimezone: zona,
    defaultWakeLocal: T(wake),
    defaultSleepLocal: T(sleep),
    sleepNeedMinutes: necesidad,
  };
}

function jornadaDe(p: PerfilTemporal, fecha: string, excepcionesDia: readonly ExcepcionDia[] = []) {
  const jornadas = construirJornadas({
    ventana: { desde: D(fecha), hasta: D(fecha).add({ days: 1 }) },
    perfil: p,
    excepcionesDia,
    overridesZona: [],
  });
  expect(jornadas).toHaveLength(1);
  return elemento(jornadas, 0);
}

describe("T-1 — sueño que cruza medianoche, con el DST fuera de la ecuación", () => {
  // `America/Mexico_City` a propósito: sin transiciones, aísla el bug de medianoche del de
  // horario de verano. Ver la advertencia de 07 §4.E.
  const j = jornadaDe(perfil(ZONA.MEDIANOCHE_SIN_DST, "07:00", "00:30"), "2026-08-03");

  it("empareja wake[d] con wake[d+1] y manda el sleep al día siguiente", () => {
    expect(j.wake.toString()).toBe(I("2026-08-03T13:00:00Z").toString());
    // 00:30 es MENOR que 07:00, así que la hora de dormir pertenece al día siguiente: la única
    // línea de medianoche del motor se disparó.
    expect(j.sleep.toString()).toBe(I("2026-08-04T06:30:00Z").toString());
    expect(j.wakeSig.toString()).toBe(I("2026-08-04T13:00:00Z").toString());
  });

  it("mide 1050 min de vigilia y 390 de sueño", () => {
    expect(j.vigiliaMinutes).toBe(1050);
    expect(j.sueñoMinutes).toBe(390);
  });

  it("declara el déficit de sueño con su evidencia numérica y sus dos consecuencias", () => {
    // { requerido: 480, real: 390, déficit: 90 } — la evidencia del `Finding SLEEP_DEBT`, que
    // emite la fase de diagnóstico del motor (03 §4) y no este paquete.
    expect(j.déficitSueñoMinutes).toBe(90);
    expect(j.prohibeFocoNocturno).toBe(true);
    expect(j.techoEnergía).toBe("NEUTRAL");
  });
});

describe("T-2 — la rama contraria: sueño que NO cruza medianoche", () => {
  const j = jornadaDe(perfil(ZONA.MEDIANOCHE_SIN_DST, "07:00", "23:30"), "2026-08-03");

  it("deja el sleep en el día `d` y no suma un día", () => {
    // 23:30 del propio 2026-08-03 en UTC−6 cae en 2026-08-04T05:30:00Z. La fecha CIVIL del
    // sleep sigue siendo `d`; la del instante UTC no, y eso no es cruzar medianoche.
    expect(j.sleep.toString()).toBe(I("2026-08-04T05:30:00Z").toString());
    expect(j.vigiliaMinutes).toBe(990);
    expect(j.sueñoMinutes).toBe(450);
  });

  it("no declara déficit de sueño: 450 min contra una necesidad de 450", () => {
    const holgado = jornadaDe(perfil(ZONA.MEDIANOCHE_SIN_DST, "07:00", "23:30", 450), "2026-08-03");
    expect(holgado.déficitSueñoMinutes).toBe(0);
    expect(holgado.prohibeFocoNocturno).toBe(false);
    expect(holgado.techoEnergía).toBeNull();
  });
});

describe("T-4 y T-5 — la jornada que cruza un cambio de horario mide 23 h o 25 h, no 24", () => {
  const nocturno = perfil(ZONA.DST_EEUU, "07:00", "23:00");

  it("T-4: la víspera del adelanto mide 1380 min exactos", () => {
    const j = jornadaDe(nocturno, "2026-03-07");
    expect(j.wake.toString()).toBe(I("2026-03-07T13:00:00Z").toString()); // 07:00 CST
    expect(j.sleep.toString()).toBe(I("2026-03-08T05:00:00Z").toString()); // 23:00 CST
    expect(j.wakeSig.toString()).toBe(I("2026-03-08T12:00:00Z").toString()); // 07:00 CDT
    expect(j.vigiliaMinutes).toBe(960);
    expect(j.sueñoMinutes).toBe(420);
    expect(j.vigiliaMinutes + j.sueñoMinutes).toBe(1380);
  });

  it("T-5: la víspera del atraso mide 1500 min exactos", () => {
    const j = jornadaDe(nocturno, "2026-10-31");
    expect(j.wake.toString()).toBe(I("2026-10-31T12:00:00Z").toString()); // 07:00 CDT
    expect(j.wakeSig.toString()).toBe(I("2026-11-01T13:00:00Z").toString()); // 07:00 CST
    expect(j.vigiliaMinutes + j.sueñoMinutes).toBe(1500);
  });
});

describe("`day_exceptions` — el día atípico manda sobre el perfil, campo a campo", () => {
  const base = perfil(ZONA.MEDIANOCHE_SIN_DST, "07:00", "23:00");

  it("una excepción con solo `wakeLocal` deja el `sleepLocal` del perfil", () => {
    const j = jornadaDe(base, "2026-08-03", [
      { localDate: D("2026-08-03"), wakeLocal: T("05:00") },
    ]);
    expect(j.wake.toString()).toBe(I("2026-08-03T11:00:00Z").toString());
    expect(j.sleep.toString()).toBe(I("2026-08-04T05:00:00Z").toString());
    expect(j.vigiliaMinutes).toBe(1080);
  });

  it("una excepción con solo `sleepLocal` deja el `wakeLocal` del perfil", () => {
    const j = jornadaDe(base, "2026-08-03", [
      { localDate: D("2026-08-03"), sleepLocal: T("01:30") },
    ]);
    expect(j.wake.toString()).toBe(I("2026-08-03T13:00:00Z").toString());
    // 01:30 < 07:00: el `sleepLocal` de la excepción también cruza medianoche.
    expect(j.sleep.toString()).toBe(I("2026-08-04T07:30:00Z").toString());
  });

  it("la excepción del día SIGUIENTE mueve el `wakeSig`, y por tanto el sueño de hoy", () => {
    // Es el caso que fuerza a leer `excepcionDe(d+1)` y no solo `excepcionDe(d)`. Sin esa
    // lectura, `wakeSig` y el `wake` de la jornada siguiente dejan de encajar.
    const [hoy, mañana] = construirJornadas({
      ventana: { desde: D("2026-08-03"), hasta: D("2026-08-05") },
      perfil: base,
      excepcionesDia: [{ localDate: D("2026-08-04"), wakeLocal: T("10:00") }],
      overridesZona: [],
    });
    expect(hoy?.wakeSig.toString()).toBe(I("2026-08-04T16:00:00Z").toString());
    expect(mañana?.wake.toString()).toBe(hoy?.wakeSig.toString());
    expect(hoy?.sueñoMinutes).toBe(660);
  });
});

describe("la ventana es semiabierta `[desde, hasta)`", () => {
  it("con `desde == hasta` no produce ninguna jornada", () => {
    const jornadas = construirJornadas({
      ventana: { desde: D("2026-08-03"), hasta: D("2026-08-03") },
      perfil: perfil(ZONA.MEDIANOCHE_SIN_DST, "07:00", "23:00"),
      excepcionesDia: [],
      overridesZona: [],
    });
    expect(jornadas).toHaveLength(0);
  });

  it("numera las jornadas por su posición en la ventana", () => {
    const jornadas = construirJornadas({
      ventana: { desde: D("2026-08-03"), hasta: D("2026-08-06") },
      perfil: perfil(ZONA.MEDIANOCHE_SIN_DST, "07:00", "23:00"),
      excepcionesDia: [],
      overridesZona: [],
    });
    expect(jornadas.map((j) => j.id)).toEqual([0, 1, 2]);
    expect(jornadas.map((j) => j.fecha.toString())).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
    ]);
  });

  it("`elemento` falla con nombre si una fixture no tiene la jornada que se le pide", () => {
    // La rama de error de la ayuda de fixtures, ejercitada a propósito: sin esto queda como la
    // única rama sin cubrir del paquete, y una ayuda que nunca se ha visto fallar convierte una
    // fixture rota en un `TypeError` sin contexto a tres líneas de distancia.
    expect(() => elemento([], 0)).toThrow(/no tiene elemento 0/);
  });
});
