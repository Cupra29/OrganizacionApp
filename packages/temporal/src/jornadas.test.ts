// Casos T-1, T-2, T-4 y T-5 de `docs/qa/fase-1-nucleo-temporal.md` §3.1 y §3.2, con los
// valores exactos que ese documento fija, más la cobertura de `day_exceptions`.
//
// Los cuatro se comparan contra **instantes UTC exactos**, no contra duraciones: una duración
// correcta puede esconder dos componentes equivocados que se compensan, y eso ya pasó de verdad
// en la propia fixture T-4 (nota de corrección del 2026-07-29).

import { describe, expect, it } from "vitest";
import { D, elemento, I, T, ZONA } from "./fixtures.ts";
import { construirJornadas, type ExcepcionDia, type PerfilTemporal } from "./jornadas.ts";
import { Temporal } from "./temporal.ts";

function perfil(zona: string, wake: string, sleep: string, necesidad = 480): PerfilTemporal {
  return {
    baseTimezone: zona,
    defaultWakeLocal: T(wake),
    defaultSleepLocal: T(sleep),
    sleepNeedMinutes: necesidad,
  };
}

function jornadaDe(p: PerfilTemporal, fecha: string, excepcionesDia: readonly ExcepcionDia[] = []) {
  const { jornadas, degeneradas } = construirJornadas({
    ventana: { desde: D(fecha), hasta: D(fecha).add({ days: 1 }) },
    perfil: p,
    excepcionesDia,
    overridesZona: [],
  });
  expect(jornadas).toHaveLength(1);
  expect(degeneradas).toHaveLength(0);
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
    const { jornadas } = construirJornadas({
      ventana: { desde: D("2026-08-03"), hasta: D("2026-08-05") },
      perfil: base,
      excepcionesDia: [{ localDate: D("2026-08-04"), wakeLocal: T("10:00") }],
      overridesZona: [],
    });
    const [hoy, mañana] = jornadas;
    expect(hoy?.wakeSig.toString()).toBe(I("2026-08-04T16:00:00Z").toString());
    expect(mañana?.wake.toString()).toBe(hoy?.wakeSig.toString());
    expect(hoy?.sueñoMinutes).toBe(660);
  });
});

describe("la ventana es semiabierta `[desde, hasta)`", () => {
  it("con `desde == hasta` no produce ninguna jornada", () => {
    const { jornadas } = construirJornadas({
      ventana: { desde: D("2026-08-03"), hasta: D("2026-08-03") },
      perfil: perfil(ZONA.MEDIANOCHE_SIN_DST, "07:00", "23:00"),
      excepcionesDia: [],
      overridesZona: [],
    });
    expect(jornadas).toHaveLength(0);
  });

  it("numera las jornadas por su posición en la ventana", () => {
    const { jornadas } = construirJornadas({
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

  it("una jornada normal no recorta nada de vigilia", () => {
    const j = jornadaDe(perfil(ZONA.MEDIANOCHE_SIN_DST, "07:00", "23:00"), "2026-08-03");
    expect(j.recorteVigiliaMinutes).toBe(0);
  });

  it("`elemento` falla con nombre si una fixture no tiene la jornada que se le pide", () => {
    // La rama de error de la ayuda de fixtures, ejercitada a propósito: sin esto queda como la
    // única rama sin cubrir del paquete, y una ayuda que nunca se ha visto fallar convierte una
    // fixture rota en un `TypeError` sin contexto a tres líneas de distancia.
    expect(() => elemento([], 0)).toThrow(/no tiene elemento 0/);
  });
});

describe("El acotado transmeridiano — `sleep = min(sleep, wakeSig)`", () => {
  // Volar al este acorta el día de verdad, y la hora de acostarse declarada puede caer DESPUÉS
  // del despertar siguiente. Sin acotar, `[wake, sleep)` se sale de la jornada e invade la
  // siguiente: las dos reclaman los mismos minutos y la capacidad se cuenta dos veces.
  const viajeDesdeMexico = (destino: string, desde: string) =>
    construirJornadas({
      ventana: { desde: D(desde), hasta: D(desde).add({ days: 2 }) },
      perfil: perfil(ZONA.MEDIANOCHE_SIN_DST, "07:00", "23:00"),
      excepcionesDia: [],
      overridesZona: [
        {
          during: {
            desde: I(`${D(desde).add({ days: 1 }).toString()}T00:00:00Z`),
            hasta: I("2027-01-01T00:00:00Z"),
          },
          timezone: destino,
        },
      ],
    });

  it("México → Madrid: 8 h de salto contra 8 h de sueño es el límite EXACTO", () => {
    const { jornadas } = viajeDesdeMexico(ZONA.DST_UE, "2026-08-03");
    const vispera = elemento(jornadas, 0);
    expect(vispera.sueñoMinutes).toBe(0);
    // Justo en el límite no hay nada que recortar: `sleep` cae exactamente en `wakeSig`.
    expect(vispera.recorteVigiliaMinutes).toBe(0);
    expect(vispera.sleep.equals(vispera.wakeSig)).toBe(true);
    expect(vispera.vigiliaMinutes).toBe(960);
    // Sueño cero es el caso extremo de `SLEEP_DEBT`, y no hace falta maquinaria nueva.
    expect(vispera.déficitSueñoMinutes).toBe(480);
    expect(vispera.prohibeFocoNocturno).toBe(true);
    expect(vispera.techoEnergía).toBe("NEUTRAL");
  });

  it("México → Lord Howe en AGOSTO: salto de 16,5 h, recorte de 510 min", () => {
    // Agosto es INVIERNO en el hemisferio sur: Lord Howe está en hora estándar (+10:30), no en
    // la de verano (+11). El salto son 16,5 h y no 17, así que el recorte son 510 min y no 540.
    const { jornadas } = viajeDesdeMexico(ZONA.DST_MEDIA_HORA, "2026-08-03");
    const vispera = elemento(jornadas, 0);
    expect(vispera.sueñoMinutes).toBe(0);
    expect(vispera.recorteVigiliaMinutes).toBe(510);
    expect(vispera.vigiliaMinutes).toBe(450); // la jornada entera dura 7 h 30 min
    expect(vispera.vigiliaMinutes + vispera.sueñoMinutes).toBe(450);
  });

  it("México → Lord Howe en ENERO: salto de 17 h, recorte de 540 min", () => {
    // Con Lord Howe en horario de verano (+11) el salto sí son 17 h: la jornada dura 7 h, la
    // vigilia declarada 16, y el recorte los 9 h = 540 min que nombra 03 §3.1.
    const { jornadas } = viajeDesdeMexico(ZONA.DST_MEDIA_HORA, "2026-01-05");
    const vispera = elemento(jornadas, 0);
    expect(vispera.sueñoMinutes).toBe(0);
    expect(vispera.recorteVigiliaMinutes).toBe(540);
    expect(vispera.vigiliaMinutes).toBe(420); // 7 h exactas
  });

  it("el acotado impide el doble conteo: `[wake, sleep)` no invade la jornada siguiente", () => {
    const { jornadas } = viajeDesdeMexico(ZONA.DST_MEDIA_HORA, "2026-01-05");
    const primera = elemento(jornadas, 0);
    const segunda = elemento(jornadas, 1);

    // Semiabierto: no solapan si y solo si la primera termina en o antes del inicio de la
    // segunda. Es la misma semántica que la constraint de exclusión de 02 §6.2.
    expect(Temporal.Instant.compare(primera.sleep, segunda.wake)).toBeLessThanOrEqual(0);
    expect(primera.wakeSig.equals(segunda.wake)).toBe(true);

    // Y la mitad que hace que el test no sea decorativo: SIN el acotado sí invadiría, y por
    // exactamente `recorteVigiliaMinutes`. Si alguien quita el `min` por parecer defensivo,
    // estas dos líneas dicen cuántos minutos se cuentan dos veces.
    const sleepSinAcotar = primera.sleep.add({ minutes: primera.recorteVigiliaMinutes });
    expect(Temporal.Instant.compare(sleepSinAcotar, segunda.wake)).toBeGreaterThan(0);
    expect(segunda.wake.until(sleepSinAcotar).total({ unit: "minute" })).toBe(540);
  });

  it("un salto de más de 24 h no emite jornada: la reporta en `degeneradas`", () => {
    // Pacific/Midway (−11) → Pacific/Kiritimati (+14) son 25 h, y los dos están habitados. La
    // jornada tendría duración NEGATIVA, que rompe el embaldosado de raíz. No lanza, no se
    // emite a medias y no desaparece: sale en un campo explícito de la salida.
    const { jornadas, degeneradas } = construirJornadas({
      ventana: { desde: D("2026-08-03"), hasta: D("2026-08-06") },
      perfil: perfil("Pacific/Midway", "07:00", "23:00"),
      excepcionesDia: [],
      overridesZona: [
        {
          during: { desde: I("2026-08-04T00:00:00Z"), hasta: I("2027-01-01T00:00:00Z") },
          timezone: "Pacific/Kiritimati",
        },
      ],
    });

    expect(degeneradas).toHaveLength(1);
    const rota = elemento(degeneradas, 0);
    expect(rota.fecha.toString()).toBe("2026-08-03");
    expect(rota.wake.toString()).toBe(I("2026-08-03T18:00:00Z").toString());
    expect(rota.wakeSig.toString()).toBe(I("2026-08-03T17:00:00Z").toString());
    expect(Temporal.Instant.compare(rota.wakeSig, rota.wake)).toBeLessThan(0);

    // La fecha rota no aparece entre las jornadas emitidas, y las que sí se emiten son sanas.
    expect(jornadas.map((j) => j.fecha.toString())).toEqual(["2026-08-04", "2026-08-05"]);
    expect(jornadas.map((j) => j.id)).toEqual([0, 1]);
    for (const j of jornadas) {
      expect(Temporal.Instant.compare(j.wake, j.wakeSig)).toBeLessThan(0);
    }
  });
});
