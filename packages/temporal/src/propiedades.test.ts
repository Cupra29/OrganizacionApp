// Las tres propiedades del criterio de aceptación de la fase 1 (`05` §Fase 1), sobre casos
// GENERADOS. Sustituyen a la property test tautológica `sueño + vigilia == nextWake − wake`,
// que se cumple por álgebra para tres instantes cualesquiera —incluida una jornada de longitud
// cero— y por tanto no podía fallar.
//
// **Los casos se generan por producto cartesiano, no al azar.** El límite nº9 de `CLAUDE.md`
// prohíbe la aleatoriedad en el núcleo *incluso con semilla*, y una rejilla exhaustiva sobre un
// espacio elegido es además más fuerte que N extracciones: no hay ninguna combinación que se
// escape según qué día se ejecute la suite. La rejilla se elige para cubrir el borde donde
// vivía el bug real —el cambio de zona a mitad de ventana— y las cuatro formas de transición
// horaria de `07 §4.E`, incluida la de 30 minutos.

import { describe, expect, it } from "vitest";
import { D, elemento, I, offsetMinutosEn, T, ZONA } from "./fixtures.ts";
import { construirJornadas, type Jornada } from "./jornadas.ts";
import type { Temporal } from "./temporal.ts";
import { instanteDe, type OverrideZona, zonaEfectivaEn } from "./zona.ts";

const ZONAS = [
  ZONA.MEDIANOCHE_SIN_DST,
  ZONA.DST_EEUU,
  ZONA.DST_UE,
  ZONA.DST_MEDIA_HORA,
  ZONA.OFFSET_NO_ENTERO,
];

/**
 * Horarios locales válidos. Cruzan y no cruzan medianoche, con y sin minutos redondos.
 *
 * Dos exclusiones deliberadas, ninguna arbitraria: `sleep == wake` (vigilia de 24 h y sueño de
 * cero, que no es un perfil sino un dato imposible) y las vigilias de pared menores que el
 * mayor hueco de DST de la tabla, donde `disambiguation: 'compatible'` puede empujar el `wake`
 * por delante del `sleep`. Las cinco de abajo tienen 16 h o más de vigilia de pared.
 */
const HORARIOS = [
  { wake: "07:00", sleep: "23:00" },
  { wake: "07:00", sleep: "00:30" },
  { wake: "05:30", sleep: "21:45" },
  { wake: "14:00", sleep: "06:00" },
  { wake: "22:00", sleep: "14:00" },
];

/** Anclas de ventana: seis rodean una transición de alguna zona de la tabla; dos no. */
const ANCLAS = [
  "2026-01-15",
  "2026-03-06", // adelanto de America/Chicago, 03-08
  "2026-03-27", // adelanto de Europe/Madrid, 03-29
  "2026-04-03", // atraso de Australia/Lord_Howe, 04-05 (30 min)
  "2026-06-11",
  "2026-10-02", // adelanto de Australia/Lord_Howe, 10-04 (30 min)
  "2026-10-23", // atraso de Europe/Madrid, 10-25
  "2026-10-30", // atraso de America/Chicago, 11-01
];

const DIAS_POR_VENTANA = 5;

/**
 * Configuraciones de `timezone_overrides`: ninguna, una que EMPIEZA a mitad de ventana y una
 * que TERMINA a mitad de ventana, contra cada zona de destino. Es el borde exacto donde el bug
 * de `zonaSig` rompía el embaldosado, y por eso está en la rejilla y no en un caso suelto.
 */
function configuracionesDeViaje(ancla: string, zonaBase: string): readonly OverrideZona[][] {
  const corte = I(`${D(ancla).add({ days: 2 }).toString()}T00:00:00Z`);
  const lejosAntes = I("2000-01-01T00:00:00Z");
  const lejosDespues = I("2050-01-01T00:00:00Z");
  const configuraciones: OverrideZona[][] = [[]];
  for (const destino of ZONAS) {
    if (destino === zonaBase) continue;
    configuraciones.push([{ during: { desde: corte, hasta: lejosDespues }, timezone: destino }]);
    configuraciones.push([{ during: { desde: lejosAntes, hasta: corte }, timezone: destino }]);
  }
  return configuraciones;
}

interface Caso {
  readonly zonaBase: string;
  readonly wake: string;
  readonly sleep: string;
  readonly ancla: string;
  readonly overridesZona: readonly OverrideZona[];
  readonly jornadas: readonly Jornada[];
}

function generarCasos(): readonly Caso[] {
  const casos: Caso[] = [];
  for (const zonaBase of ZONAS) {
    for (const { wake, sleep } of HORARIOS) {
      for (const ancla of ANCLAS) {
        for (const overridesZona of configuracionesDeViaje(ancla, zonaBase)) {
          casos.push({
            zonaBase,
            wake,
            sleep,
            ancla,
            overridesZona,
            jornadas: construirJornadas({
              ventana: {
                desde: D(ancla),
                hasta: D(ancla).add({ days: DIAS_POR_VENTANA }),
              },
              perfil: {
                baseTimezone: zonaBase,
                defaultWakeLocal: T(wake),
                defaultSleepLocal: T(sleep),
                sleepNeedMinutes: 480,
              },
              excepcionesDia: [],
              overridesZona,
            }),
          });
        }
      }
    }
  }
  return casos;
}

const CASOS = generarCasos();

const rotulo = (c: Caso, j: Jornada) =>
  `${c.zonaBase} ${c.wake}-${c.sleep} ${j.fecha.toString()} ` +
  `overrides=${c.overridesZona.map((o) => o.timezone).join(",") || "ninguno"}`;

describe("Propiedad 1 — las jornadas embaldosan la línea de tiempo", () => {
  it("genera casos suficientes, y con cambio de zona a mitad de ventana", () => {
    // Sin esto la propiedad podría pasar sobre cero casos. Es el mismo argumento que
    // `depcruise:cobertura`: un análisis que no mira nada sale en verde.
    expect(CASOS.length).toBeGreaterThan(1000);
    expect(CASOS.every((c) => c.jornadas.length === DIAS_POR_VENTANA)).toBe(true);
    expect(CASOS.some((c) => c.overridesZona.length > 0)).toBe(true);
  });

  it("`jornada[i].wakeSig == jornada[i+1].wake`, instante exacto, en TODOS los casos", () => {
    // La propiedad fuerte. Es lo que ADR-003 regla 1 afirma de verdad —que `[wake, wakeSig)`
    // PARTICIONA la línea de tiempo— y si se rompe hay minutos en dos jornadas o en ninguna:
    // capacidad contada doble o perdida, el fallo más caro posible en F1.
    for (const c of CASOS) {
      for (let i = 0; i + 1 < c.jornadas.length; i += 1) {
        const actual = elemento(c.jornadas, i);
        const siguiente = elemento(c.jornadas, i + 1);
        expect(
          actual.wakeSig.equals(siguiente.wake),
          `sin embaldosar en ${rotulo(c, actual)}: ` +
            `wakeSig=${actual.wakeSig.toString()} wake[i+1]=${siguiente.wake.toString()}`,
        ).toBe(true);
      }
    }
  });

  it("`wake < sleep`, estrictamente, en TODOS los casos", () => {
    for (const c of CASOS) {
      for (const j of c.jornadas) {
        expect(j.wake.epochNanoseconds < j.sleep.epochNanoseconds, rotulo(c, j)).toBe(true);
      }
    }
  });

  it("`sleep < wakeSig`, estrictamente, salvo cruzando una frontera de zona", () => {
    // La condición no es un parche para hacer pasar el test: es un HALLAZGO. Con un viaje
    // hacia el este que empieza en `d+1`, la jornada de `d` pierde tantas horas de sueño como
    // salte el offset, y con un salto >= la ventana de sueño el `wakeSig` cae ANTES que el
    // `sleep`. México → Madrid de un día para otro son 8 h de salto y 8 h de sueño: el sueño
    // sale exactamente 0. Ver el caso explícito de más abajo. La mitad estricta de esta
    // propiedad, tal como está escrita en `05`, es FALSA en ese escenario, y no por un bug.
    let comprobadas = 0;
    let excluidas = 0;
    for (const c of CASOS) {
      for (const j of c.jornadas) {
        const zona = zonaEfectivaEn(j.fecha, c.overridesZona, c.zonaBase);
        const zonaSig = zonaEfectivaEn(j.fecha.add({ days: 1 }), c.overridesZona, c.zonaBase);
        if (zona !== zonaSig) {
          excluidas += 1;
          continue;
        }
        comprobadas += 1;
        expect(j.sleep.epochNanoseconds < j.wakeSig.epochNanoseconds, rotulo(c, j)).toBe(true);
      }
    }
    expect(comprobadas).toBeGreaterThan(1000);
    expect(excluidas).toBeGreaterThan(0);
  });

  it("ninguna jornada es degenerada: `wake == sleep == wakeSig` no aparece nunca", () => {
    for (const c of CASOS) {
      for (const j of c.jornadas) {
        expect(j.wake.equals(j.wakeSig), rotulo(c, j)).toBe(false);
      }
    }
  });
});

describe("Propiedad 1 — control negativo: el bug de `zonaSig`, escrito y comparado", () => {
  // La copia con el bug que 03 §3.1 tuvo hasta el 2026-07-29: `wakeSig` calculado con la zona
  // del día `d` en vez de la del día `d+1`. Existe para demostrar que la propiedad del
  // embaldosado NO es decorativa — que caza exactamente el defecto por el que se escribió.
  // Es el mismo papel que `guardrail:cobertura` cumple para el plugin de reloj.
  // La mutación es EXACTAMENTE un argumento: `zona` donde va `zonaSig`. Nada más cambia.
  function wakeSigConElBug(
    fecha: Temporal.PlainDate,
    zonaBase: string,
    overridesZona: readonly OverrideZona[],
    horaWake: string,
  ) {
    const zonaDelDiaD = zonaEfectivaEn(fecha, overridesZona, zonaBase);
    return instanteDe(fecha.add({ days: 1 }), T(horaWake), zonaDelDiaD);
  }

  const viaje: readonly OverrideZona[] = [
    {
      during: { desde: I("2026-08-04T00:00:00Z"), hasta: I("2026-08-20T00:00:00Z") },
      timezone: ZONA.DST_UE,
    },
  ];
  const jornadas = construirJornadas({
    ventana: { desde: D("2026-08-03"), hasta: D("2026-08-05") },
    perfil: {
      baseTimezone: ZONA.MEDIANOCHE_SIN_DST,
      defaultWakeLocal: T("07:00"),
      defaultSleepLocal: T("23:00"),
      sleepNeedMinutes: 480,
    },
    excepcionesDia: [],
    overridesZona: viaje,
  });

  it("con la zona correcta (`d+1`) las dos jornadas encajan", () => {
    expect(jornadas[0]?.wakeSig.toString()).toBe(jornadas[1]?.wake.toString());
    expect(jornadas[0]?.wakeSig.toString()).toBe(I("2026-08-04T05:00:00Z").toString());
  });

  it("con la zona del día `d` dejan de encajar, y el desfase es la diferencia de offsets", () => {
    const conBug = wakeSigConElBug(D("2026-08-03"), ZONA.MEDIANOCHE_SIN_DST, viaje, "07:00");
    expect(conBug.toString()).not.toBe(jornadas[1]?.wake.toString());
    // 07:00 en México (UTC−6) contra 07:00 en Madrid (UTC+2): 8 h de hueco en la línea de
    // tiempo, ocho horas que no pertenecerían a ninguna jornada y que nada señalaría.
    expect(conBug.toString()).toBe(I("2026-08-04T13:00:00Z").toString());
    const desfaseMinutos = elemento(jornadas, 1).wake.until(conBug).total({ unit: "minute" });
    expect(desfaseMinutos).toBe(480);
  });
});

describe("El residuo de `03 §3.1`: un viaje hacia el este se come la noche", () => {
  it("México → Madrid de un día para otro deja el sueño en 0 min exactos", () => {
    // No es un bug del cálculo: los tres instantes son correctos y el embaldosado se mantiene.
    // Es que la jornada de la víspera del viaje mide 16 h y no 24, y ahí no cabe dormir. El
    // efecto de producto es correcto (déficit de 480 min, `SLEEP_DEBT`, techo NEUTRAL); lo que
    // no se sostiene es la mitad ESTRICTA de la propiedad 1 tal como `05` la enuncia.
    const jornadas = construirJornadas({
      ventana: { desde: D("2026-08-03"), hasta: D("2026-08-05") },
      perfil: {
        baseTimezone: ZONA.MEDIANOCHE_SIN_DST,
        defaultWakeLocal: T("07:00"),
        defaultSleepLocal: T("23:00"),
        sleepNeedMinutes: 480,
      },
      excepcionesDia: [],
      overridesZona: [
        {
          during: { desde: I("2026-08-04T00:00:00Z"), hasta: I("2026-08-20T00:00:00Z") },
          timezone: ZONA.DST_UE,
        },
      ],
    });
    const vispera = elemento(jornadas, 0);
    expect(vispera.sueñoMinutes).toBe(0);
    expect(vispera.sleep.equals(vispera.wakeSig)).toBe(true);
    expect(vispera.déficitSueñoMinutes).toBe(480);
    expect(vispera.techoEnergía).toBe("NEUTRAL");
    // El embaldosado NO se rompe: es la única de las dos mitades que se sostiene siempre.
    expect(vispera.wakeSig.equals(elemento(jornadas, 1).wake)).toBe(true);
  });
});

describe("Propiedad 2 — la jornada dura 1440 min menos el salto de offset", () => {
  const ZONAS_ANUALES = [ZONA.DST_EEUU, ZONA.DST_UE, ZONA.DST_MEDIA_HORA, ZONA.MEDIANOCHE_SIN_DST];

  const jornadasDelAño = (zona: string) =>
    construirJornadas({
      ventana: { desde: D("2026-01-01"), hasta: D("2027-01-01") },
      perfil: {
        baseTimezone: zona,
        // 07:00 existe y es inequívoca los 365 días en las cuatro zonas: la propiedad supone
        // que la hora de pared del `wake` no cae en un hueco de DST, donde `'compatible'` la
        // desplazaría y la identidad dejaría de valer.
        defaultWakeLocal: T("07:00"),
        defaultSleepLocal: T("23:00"),
        sleepNeedMinutes: 480,
      },
      excepcionesDia: [],
      overridesZona: [],
    });

  it.each(ZONAS_ANUALES)("%s: 365 días consecutivos cumplen la identidad", (zona) => {
    const jornadas = jornadasDelAño(zona);
    expect(jornadas).toHaveLength(365);
    for (const j of jornadas) {
      const salto = offsetMinutosEn(j.wakeSig, zona) - offsetMinutosEn(j.wake, zona);
      const duracion = j.wake.until(j.wakeSig).total({ unit: "minute" });
      expect(duracion, `${zona} ${j.fecha.toString()}`).toBe(1440 - salto);
      // Falla también si alguien calcula la jornada siguiente sumando 1440 min a la línea de
      // instantes en vez de un día de calendario: ahí la duración sería 1440 siempre.
      expect(duracion, `${zona} ${j.fecha.toString()}`).toBe(j.vigiliaMinutes + j.sueñoMinutes);
    }
  });

  it("las duraciones que aparecen en el año son exactamente las esperadas por zona", () => {
    const duraciones = (zona: string) =>
      [...new Set(jornadasDelAño(zona).map((j) => j.vigiliaMinutes + j.sueñoMinutes))].sort(
        (a, b) => a - b,
      );

    expect(duraciones(ZONA.MEDIANOCHE_SIN_DST)).toEqual([1440]);
    expect(duraciones(ZONA.DST_EEUU)).toEqual([1380, 1440, 1500]);
    expect(duraciones(ZONA.DST_UE)).toEqual([1380, 1440, 1500]);
    // El falsificador que ninguna otra zona aporta: un motor con `if (dst) ±60` pasa las tres
    // líneas de arriba y falla esta.
    expect(duraciones(ZONA.DST_MEDIA_HORA)).toEqual([1410, 1440, 1470]);
  });
});

describe("Propiedad 3 — el suelo: vigilia y sueño no negativos", () => {
  it("se cumple en todos los casos generados sin frontera de zona", () => {
    for (const c of CASOS) {
      for (const j of c.jornadas) {
        const zona = zonaEfectivaEn(j.fecha, c.overridesZona, c.zonaBase);
        const zonaSig = zonaEfectivaEn(j.fecha.add({ days: 1 }), c.overridesZona, c.zonaBase);
        expect(j.vigiliaMinutes, rotulo(c, j)).toBeGreaterThanOrEqual(0);
        if (zona === zonaSig) {
          expect(j.sueñoMinutes, rotulo(c, j)).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("y NO se cumple cruzando una frontera de zona con salto suficiente: es el mismo hallazgo", () => {
    // México (UTC−6) → Lord Howe (UTC+11) son 17 h de salto contra 8 h de sueño: la jornada de
    // la víspera sale con sueño NEGATIVO, que ninguna fase posterior del motor sabe interpretar.
    const jornadasDelViaje = construirJornadas({
      ventana: { desde: D("2026-08-03"), hasta: D("2026-08-05") },
      perfil: {
        baseTimezone: ZONA.MEDIANOCHE_SIN_DST,
        defaultWakeLocal: T("07:00"),
        defaultSleepLocal: T("23:00"),
        sleepNeedMinutes: 480,
      },
      excepcionesDia: [],
      overridesZona: [
        {
          during: { desde: I("2026-08-04T00:00:00Z"), hasta: I("2026-08-20T00:00:00Z") },
          timezone: ZONA.DST_MEDIA_HORA,
        },
      ],
    });
    expect(elemento(jornadasDelViaje, 0).sueñoMinutes).toBeLessThan(0);
  });
});
