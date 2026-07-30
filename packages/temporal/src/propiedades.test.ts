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
//
// **Y una cuarta propiedad que `05` no enuncia, porque el embaldosado no la implica**: que
// `[wake, sleep)` de una jornada no invada la siguiente. El embaldosado va de despertar a
// despertar y no dice nada de dónde cae `sleep` — el doble conteo de capacidad vivía justo ahí.

import { describe, expect, it } from "vitest";
import { D, elemento, I, offsetMinutosEn, T, ZONA } from "./fixtures.ts";
import {
  construirJornadas,
  type Jornada,
  type JornadaDegenerada,
  type PerfilTemporal,
} from "./jornadas.ts";
import { Temporal } from "./temporal.ts";
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
 *
 * El salto máximo del conjunto es México (−6) → Lord Howe (+11), 17 h: menos de 24, así que la
 * rejilla nunca produce una `JornadaDegenerada`. Que no la produzca es una **aserción**, no un
 * supuesto — ver la primera propiedad.
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
  readonly degeneradas: readonly JornadaDegenerada[];
}

const perfilDe = (zona: string, wake: string, sleep: string): PerfilTemporal => ({
  baseTimezone: zona,
  defaultWakeLocal: T(wake),
  defaultSleepLocal: T(sleep),
  sleepNeedMinutes: 480,
});

function generarCasos(): readonly Caso[] {
  const casos: Caso[] = [];
  for (const zonaBase of ZONAS) {
    for (const { wake, sleep } of HORARIOS) {
      for (const ancla of ANCLAS) {
        for (const overridesZona of configuracionesDeViaje(ancla, zonaBase)) {
          const salida = construirJornadas({
            ventana: { desde: D(ancla), hasta: D(ancla).add({ days: DIAS_POR_VENTANA }) },
            perfil: perfilDe(zonaBase, wake, sleep),
            excepcionesDia: [],
            overridesZona,
          });
          casos.push({ zonaBase, wake, sleep, ancla, overridesZona, ...salida });
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

/** `true` si la jornada de `j.fecha` cruza un cambio de huso hacia el día siguiente. */
function cruzaFronteraDeHuso(c: Caso, j: Jornada): boolean {
  const zona = zonaEfectivaEn(j.fecha, c.overridesZona, c.zonaBase);
  const zonaSig = zonaEfectivaEn(j.fecha.add({ days: 1 }), c.overridesZona, c.zonaBase);
  return zona !== zonaSig;
}

describe("Propiedad 1 — las jornadas embaldosan la línea de tiempo", () => {
  it("genera casos suficientes, con cambio de zona a mitad de ventana y sin degeneradas", () => {
    // Sin esto la propiedad podría pasar sobre cero casos. Es el mismo argumento que
    // `depcruise:cobertura`: un análisis que no mira nada sale en verde.
    expect(CASOS.length).toBeGreaterThan(1000);
    expect(CASOS.some((c) => c.overridesZona.length > 0)).toBe(true);
    // El salto máximo de la rejilla es de 17 h: ninguna ventana pierde una jornada, así que
    // comparar `jornadas[i]` con `jornadas[i+1]` es comparar días consecutivos de verdad.
    expect(CASOS.every((c) => c.jornadas.length === DIAS_POR_VENTANA)).toBe(true);
    expect(CASOS.every((c) => c.degeneradas.length === 0)).toBe(true);
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

  it("`wake < sleep <= wakeSig` en TODOS los casos, sin excepción ni condición", () => {
    // El `<=` no es una tolerancia: la igualdad es el caso REAL de la noche perdida al volar al
    // este, y con el acotado de `sleep` se cumple por construcción. Antes del acotado esta
    // propiedad era falsa —`sleep` se pasaba de `wakeSig`— y ahí vivía el doble conteo.
    let enElLimite = 0;
    for (const c of CASOS) {
      for (const j of c.jornadas) {
        expect(j.wake.epochNanoseconds < j.sleep.epochNanoseconds, rotulo(c, j)).toBe(true);
        expect(j.sleep.epochNanoseconds <= j.wakeSig.epochNanoseconds, rotulo(c, j)).toBe(true);
        if (j.sleep.equals(j.wakeSig)) enElLimite += 1;
      }
    }
    // Si nunca se alcanzara la igualdad, el `<=` sería un `<` disfrazado y la rejilla no
    // estaría ejercitando el caso por el que se relajó.
    expect(enElLimite).toBeGreaterThan(0);
  });

  it("ninguna jornada es degenerada: `wake == sleep == wakeSig` no aparece nunca", () => {
    for (const c of CASOS) {
      for (const j of c.jornadas) {
        expect(j.wake.equals(j.wakeSig), rotulo(c, j)).toBe(false);
      }
    }
  });
});

describe("El acotado impide el doble conteo — la propiedad que el embaldosado NO implica", () => {
  it("`[wake, sleep)` de una jornada nunca invade la siguiente, en TODOS los casos", () => {
    // 03 §3.2 saca los huecos de `restar(intervalo(wake, sleep), unir(ocupado))`. Si ese
    // intervalo se sale de la jornada, dos jornadas reclaman los mismos minutos y
    // `brutoAsignable` los suma dos veces. Semiabierto: no solapan si y solo si la primera
    // termina en o antes del inicio de la segunda — la misma semántica que la constraint de
    // exclusión de 02 §6.2.
    for (const c of CASOS) {
      for (let i = 0; i + 1 < c.jornadas.length; i += 1) {
        const actual = elemento(c.jornadas, i);
        const siguiente = elemento(c.jornadas, i + 1);
        expect(
          Temporal.Instant.compare(actual.sleep, siguiente.wake) <= 0,
          `[wake, sleep) invade la jornada siguiente en ${rotulo(c, actual)}: ` +
            `sleep=${actual.sleep.toString()} wake[i+1]=${siguiente.wake.toString()}`,
        ).toBe(true);
      }
    }
  });

  it("`recorteVigiliaMinutes == 0` en toda jornada que NO cruza un salto de huso", () => {
    // El control negativo masivo: la inmensa mayoría de la rejilla. Si el acotado recortara
    // algo en una jornada normal, se estaría comiendo vigilia real y esto lo dice.
    let sinFrontera = 0;
    let conRecorte = 0;
    for (const c of CASOS) {
      for (const j of c.jornadas) {
        if (cruzaFronteraDeHuso(c, j)) {
          if (j.recorteVigiliaMinutes > 0) conRecorte += 1;
          continue;
        }
        sinFrontera += 1;
        expect(j.recorteVigiliaMinutes, rotulo(c, j)).toBe(0);
      }
    }
    expect(sinFrontera).toBeGreaterThan(1000);
    // Y al menos una jornada de la rejilla sí recorta: si no, el campo nunca se ejercitaría.
    expect(conRecorte).toBeGreaterThan(0);
  });

  it("cuando hay recorte, `sleep` cae exactamente en `wakeSig` y el sueño es cero", () => {
    let vistas = 0;
    for (const c of CASOS) {
      for (const j of c.jornadas) {
        if (j.recorteVigiliaMinutes === 0) continue;
        vistas += 1;
        expect(j.sleep.equals(j.wakeSig), rotulo(c, j)).toBe(true);
        expect(j.sueñoMinutes, rotulo(c, j)).toBe(0);
        // Sueño cero es el caso extremo de `SLEEP_DEBT`, y no necesita maquinaria nueva.
        expect(j.déficitSueñoMinutes, rotulo(c, j)).toBe(480);
        expect(j.techoEnergía, rotulo(c, j)).toBe("NEUTRAL");
      }
    }
    expect(vistas).toBeGreaterThan(0);
  });
});

describe("Propiedad 1 — control negativo: el bug de `zonaSig`, escrito y comparado", () => {
  // La copia con el bug que 03 §3.1 tuvo hasta el 2026-07-29: `wakeSig` calculado con la zona
  // del día `d` en vez de la del día `d+1`. Existe para demostrar que la propiedad del
  // embaldosado NO es decorativa — que caza exactamente el defecto por el que se escribió.
  // Es el mismo papel que `guardrail:cobertura` cumple para el plugin de reloj.
  //
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
  const { jornadas } = construirJornadas({
    ventana: { desde: D("2026-08-03"), hasta: D("2026-08-05") },
    perfil: perfilDe(ZONA.MEDIANOCHE_SIN_DST, "07:00", "23:00"),
    excepcionesDia: [],
    overridesZona: viaje,
  });

  it("con la zona correcta (`d+1`) las dos jornadas encajan", () => {
    expect(elemento(jornadas, 0).wakeSig.toString()).toBe(elemento(jornadas, 1).wake.toString());
    expect(elemento(jornadas, 0).wakeSig.toString()).toBe(I("2026-08-04T05:00:00Z").toString());
  });

  it("con la zona del día `d` dejan de encajar, y el desfase es la diferencia de offsets", () => {
    const conBug = wakeSigConElBug(D("2026-08-03"), ZONA.MEDIANOCHE_SIN_DST, viaje, "07:00");
    expect(conBug.toString()).not.toBe(elemento(jornadas, 1).wake.toString());
    // 07:00 en México (UTC−6) contra 07:00 en Madrid (UTC+2): 8 h de hueco en la línea de
    // tiempo, ocho horas que no pertenecerían a ninguna jornada y que nada señalaría.
    expect(conBug.toString()).toBe(I("2026-08-04T13:00:00Z").toString());
    const desfaseMinutos = elemento(jornadas, 1).wake.until(conBug).total({ unit: "minute" });
    expect(desfaseMinutos).toBe(480);
  });
});

describe("Propiedad 2 — la jornada dura 1440 min menos el salto de offset", () => {
  const ZONAS_ANUALES = [ZONA.DST_EEUU, ZONA.DST_UE, ZONA.DST_MEDIA_HORA, ZONA.MEDIANOCHE_SIN_DST];

  const jornadasDelAño = (zona: string) =>
    construirJornadas({
      ventana: { desde: D("2026-01-01"), hasta: D("2027-01-01") },
      // 07:00 existe y es inequívoca los 365 días en las cuatro zonas: la propiedad supone que
      // la hora de pared del `wake` no cae en un hueco de DST, donde `'compatible'` la
      // desplazaría y la identidad dejaría de valer.
      perfil: perfilDe(zona, "07:00", "23:00"),
      excepcionesDia: [],
      overridesZona: [],
    }).jornadas;

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
      // Sin viajes no hay nada que recortar en ninguno de los 365 días.
      expect(j.recorteVigiliaMinutes, `${zona} ${j.fecha.toString()}`).toBe(0);
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
  it("se cumple en todos los casos generados, ahora sin ninguna condición", () => {
    // Antes del acotado había que condicionar esta propiedad a que la jornada no cruzara una
    // frontera de huso, porque `sueño` salía negativo. Con `sleep = min(sleep, wakeSig)` es
    // cierta POR CONSTRUCCIÓN, y eso es lo que la devuelve a ser un suelo de verdad.
    for (const c of CASOS) {
      for (const j of c.jornadas) {
        expect(j.vigiliaMinutes, rotulo(c, j)).toBeGreaterThanOrEqual(0);
        expect(j.sueñoMinutes, rotulo(c, j)).toBeGreaterThanOrEqual(0);
        expect(j.recorteVigiliaMinutes, rotulo(c, j)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
