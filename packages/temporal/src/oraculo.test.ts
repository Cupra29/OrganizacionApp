// **Oráculo diferencial de la etapa 1** (ADR-018 §8). `rrule-temporal@2.0.2` es una
// implementación independiente de `RRULE` y aquí solo se usa para discrepar con la nuestra.
//
// Por qué existe: la cobertura mide ramas ejecutadas, no correctitud del calendario. Los dos
// errores clásicos de ADR-018 §5 —anclar `WEEKLY;INTERVAL>1` a la ocurrencia en vez de a la
// semana, y contar `COUNT` sin fusionar cronológicamente— se cometen con cobertura del 100 %,
// porque el test lo escribe la misma cabeza que escribió el bug. Un oráculo independiente es lo
// único que rompe esa correlación.
//
// **`devDependency`, nunca producción** (ADR-018, "Alternativas consideradas"): esta biblioteca
// trae SU PROPIA implementación de `Temporal` (`globalThis.Temporal ?? temporal-polyfill/full`
// sobre un import estático), y los objetos de una no los aceptan los métodos de la otra —
// comprobación de ranura interna, que falla en ejecución y no al compilar.
//
// **De ahí las dos reglas de higiene de este archivo, que no son estilo:**
//  1. La entrada es una **cadena** (`DTSTART` + `RRULE` en texto), no un objeto nuestro.
//  2. La salida se compara por **cadena ISO**, nunca por identidad ni por métodos de `Temporal`.
//     Ningún objeto cruza la frontera en ninguna dirección.
//
// **Qué NO cubre este oráculo**, y conviene que esté escrito y no supuesto:
//  · `CYCLE`, que es nuestro por definición: no hay biblioteca que lo exprese (ADR-005 §1). Sus
//    fixtures viven en `ciclo.test.ts` y su falsificador es el periodo `L / mcd(L, 7)`.
//  · La etapa 2 entera (zonas, `disambiguation`, los tres `anchor`): aquí solo se comparan
//    FECHAS CIVILES.
//  · El validador del subconjunto: `rrule-temporal` acepta un superconjunto enorme y no ayuda a
//    rechazar. Es la mitad del trabajo que ninguna biblioteca hace por nosotros.
//  · `MONTHLY`/`YEARLY` con día de ancla inexistente, donde el oráculo **discrepa y se equivoca
//    contra RFC 5545 §3.3.10**: ver el último `describe` de este archivo.

import { RRuleTemporal } from "rrule-temporal";
import { describe, expect, it } from "vitest";
import { fechasDeRrule } from "./expansion.ts";
import { D, ZONA } from "./fixtures.ts";
import { validarRrule } from "./rrule.ts";

/** Ventana amplia: quien corta es `COUNT`, no la consulta. */
const VENTANA = { desde: D("2020-01-01"), hasta: D("2045-01-01") };

/** `2026-08-05` → `20260805T090000`, el `DTSTART` en formato básico de RFC 5545. */
function dtstart(ancla: string, hora: string): string {
  return `${ancla.replaceAll("-", "")}T${hora.replaceAll(":", "")}00`;
}

/**
 * Las fechas civiles del oráculo, **como cadenas**.
 *
 * `z.toString()` produce `2026-08-05T09:00:00+02:00[Europe/Madrid]`; los diez primeros
 * caracteres son la fecha civil en la zona de la regla, que es justamente lo que produce
 * nuestra etapa 1. Es un `slice` sobre una cadena y no una conversión de tipos: ningún objeto
 * de su `Temporal` toca el nuestro.
 */
function fechasDelOraculo(texto: string, ancla: string, zona: string, hora: string): string[] {
  const regla = new RRuleTemporal({
    rruleString: `DTSTART;TZID=${zona}:${dtstart(ancla, hora)}\nRRULE:${texto}`,
  });
  return regla.all().map((z) => z.toString().slice(0, 10));
}

function fechasNuestras(texto: string, ancla: string): string[] {
  return fechasDeRrule({ regla: validarRrule(texto), ancla: D(ancla), ventana: VENTANA }).map((f) =>
    f.toString(),
  );
}

/**
 * El corpus. Cada fila es `[regla, ancla, zona, hora local]`.
 *
 * Las anclas incluyen **semanas de cambio de horario** en las dos familias de regla (ADR-018 §8
 * lo pide explícitamente): `2026-03-29` es el adelanto de la UE, `2026-03-08` y `2026-11-01` los
 * de EE. UU. La hora `02:30` del último caso cae dentro del hueco del adelanto: el conjunto de
 * fechas civiles no debe moverse por eso, y es la comprobación de que la etapa 1 está de verdad
 * libre de zonas.
 */
const CORPUS: readonly (readonly [string, string, string, string])[] = [
  // --- DAILY ---
  ["FREQ=DAILY;COUNT=15", "2026-08-03", ZONA.MEDIANOCHE_SIN_DST, "09:00"],
  ["FREQ=DAILY;INTERVAL=2;COUNT=15", "2026-08-03", ZONA.DST_EEUU, "09:00"],
  ["FREQ=DAILY;INTERVAL=3;COUNT=12", "2026-03-06", ZONA.DST_EEUU, "02:30"],
  ["FREQ=DAILY;INTERVAL=7;COUNT=10", "2026-10-25", ZONA.DST_UE, "09:00"],
  ["FREQ=DAILY;INTERVAL=40;COUNT=12", "2026-01-15", ZONA.OFFSET_NO_ENTERO, "23:45"],

  // --- WEEKLY sin BYDAY: el día lo pone el ancla ---
  ["FREQ=WEEKLY;COUNT=10", "2026-08-05", ZONA.DST_UE, "09:00"],
  ["FREQ=WEEKLY;INTERVAL=2;COUNT=10", "2026-08-05", ZONA.DST_UE, "09:00"],
  ["FREQ=WEEKLY;INTERVAL=5;COUNT=8", "2026-11-01", ZONA.DST_EEUU, "01:30"],

  // --- WEEKLY con BYDAY: donde viven los dos errores de ADR-018 §5 ---
  ["FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=12", "2026-08-03", ZONA.DST_UE, "09:00"],
  ["FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=8", "2026-08-05", ZONA.DST_UE, "09:00"],
  ["FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=7", "2026-08-05", ZONA.DST_UE, "09:00"],
  ["FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=1", "2026-08-05", ZONA.DST_UE, "09:00"],
  ["FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,WE;COUNT=6", "2026-03-29", ZONA.DST_UE, "09:00"],
  ["FREQ=WEEKLY;INTERVAL=3;BYDAY=SU,SA;COUNT=9", "2026-08-02", ZONA.DST_UE, "09:00"],
  ["FREQ=WEEKLY;INTERVAL=3;BYDAY=SA,SU;COUNT=9", "2026-08-02", ZONA.DST_UE, "09:00"],
  ["FREQ=WEEKLY;INTERVAL=4;BYDAY=TU,TH;COUNT=10", "2026-03-08", ZONA.DST_EEUU, "02:30"],
  ["FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU;COUNT=20", "2026-08-03", ZONA.DST_EEUU, "09:00"],
  ["FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TU,WE,TH,FR;COUNT=13", "2026-08-07", ZONA.DST_UE, "18:00"],
  ["FREQ=WEEKLY;INTERVAL=7;BYDAY=WE;COUNT=6", "2026-12-30", ZONA.DST_MEDIA_HORA, "09:00"],
  ["FREQ=WEEKLY;INTERVAL=2;BYDAY=SU;COUNT=8", "2026-10-25", ZONA.DST_UE, "02:30"],

  // --- MONTHLY y YEARLY con día ≤ 28: nunca hay fecha inexistente, así que el oráculo y
  // nosotros tenemos que coincidir. El día > 28 va en su propio `describe`, con su motivo.
  ["FREQ=MONTHLY;COUNT=15", "2026-01-28", ZONA.MEDIANOCHE_SIN_DST, "09:00"],
  ["FREQ=MONTHLY;INTERVAL=2;COUNT=12", "2026-01-15", ZONA.DST_UE, "09:00"],
  ["FREQ=MONTHLY;INTERVAL=5;COUNT=9", "2026-11-01", ZONA.DST_EEUU, "01:30"],
  ["FREQ=MONTHLY;INTERVAL=12;COUNT=6", "2026-02-28", ZONA.MEDIANOCHE_SIN_DST, "09:00"],
  ["FREQ=YEARLY;COUNT=8", "2026-08-03", ZONA.DST_EEUU, "09:00"],
  ["FREQ=YEARLY;INTERVAL=2;COUNT=8", "2026-03-08", ZONA.DST_EEUU, "02:30"],
  ["FREQ=YEARLY;INTERVAL=4;COUNT=5", "2024-02-28", ZONA.DST_UE, "09:00"],
];

describe("oráculo diferencial — nuestra etapa 1 contra `rrule-temporal@2.0.2`", () => {
  it.each(CORPUS)("%s · ancla %s · %s", (texto, ancla, zona, hora) => {
    expect(fechasNuestras(texto, ancla)).toEqual(fechasDelOraculo(texto, ancla, zona, hora));
  });

  it("el corpus ejercita de verdad las cuatro frecuencias y `INTERVAL` > 1", () => {
    // Sin esto, borrar filas del corpus por accidente dejaría el oráculo en verde sin comparar
    // nada interesante. Es el mismo argumento de `depcruise:cobertura`.
    for (const freq of ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]) {
      expect(CORPUS.some(([texto]) => texto.includes(`FREQ=${freq}`))).toBe(true);
    }
    expect(CORPUS.filter(([texto]) => texto.includes("INTERVAL=")).length).toBeGreaterThan(15);
    expect(CORPUS.filter(([texto]) => texto.includes("BYDAY=")).length).toBeGreaterThan(10);
  });

  it("ninguna comparación se satisface por dos conjuntos vacíos", () => {
    // Un `slice(0, 10)` mal escrito, o un oráculo que no entendiera el `DTSTART`, daría dos
    // listas vacías y `toEqual` pasaría. La comparación tiene que tener sustancia: es el mismo
    // argumento de `depcruise:cobertura`, un ruleset que no mira nada pasa en verde.
    let total = 0;
    for (const [texto, ancla, zona, hora] of CORPUS) {
      const suyas = fechasDelOraculo(texto, ancla, zona, hora);
      expect(suyas.length).toBeGreaterThan(0);
      total += suyas.length;
    }
    expect(total).toBeGreaterThan(250);
  });
});

describe("los dos errores de ADR-018 §5, con el oráculo de árbitro", () => {
  it("`WEEKLY;INTERVAL=2` se ancla a la semana: el oráculo confirma el conjunto de T-8", () => {
    const esperado = [
      "2026-08-05",
      "2026-08-07",
      "2026-08-17",
      "2026-08-19",
      "2026-08-21",
      "2026-08-31",
      "2026-09-02",
      "2026-09-04",
    ];
    const texto = "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=8";
    expect(fechasNuestras(texto, "2026-08-05")).toEqual(esperado);
    expect(fechasDelOraculo(texto, "2026-08-05", ZONA.DST_UE, "09:00")).toEqual(esperado);
  });

  it("el conjunto que produciría la implementación ingenua NO es el de ninguno de los dos", () => {
    // La forma que ADR-018 §5 nombra literalmente: **sumar `INTERVAL × 7` días a cada
    // ocurrencia** en vez de anclar por bloques de semana. Partiendo de las ocurrencias de la
    // semana del ancla que no la preceden —{05-ago, 07-ago}— y sumando 14 a cada una, el lunes
    // desaparece de la serie PARA SIEMPRE: como el lunes 03-ago es anterior al ancla, ningún
    // lunes vuelve a aparecer nunca. El conjunto correcto sí contiene el lunes 17-ago.
    const ingenuo: string[] = [];
    for (let bloque = 0; ingenuo.length < 8; bloque++) {
      for (const semilla of ["2026-08-05", "2026-08-07"]) {
        ingenuo.push(
          D(semilla)
            .add({ days: bloque * 14 })
            .toString(),
        );
      }
    }
    const correcto = fechasNuestras("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=8", "2026-08-05");
    expect(correcto).toContain("2026-08-17");
    expect(ingenuo).not.toContain("2026-08-17");
    expect(correcto).not.toEqual(ingenuo);
  });

  it("`COUNT` corta el conjunto fusionado: el corte a mitad de semana también coincide", () => {
    const texto = "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=7";
    expect(fechasNuestras(texto, "2026-08-05")).toEqual(
      fechasDelOraculo(texto, "2026-08-05", ZONA.DST_UE, "09:00"),
    );
    expect(fechasNuestras(texto, "2026-08-05")).toHaveLength(7);
  });
});

describe("DIVERGENCIA CONOCIDA — día de ancla inexistente: el oráculo no sigue RFC 5545 §3.3.10", () => {
  // ADR-018 lo dejó escrito antes de que pasara: *"cuando eso pase, la pregunta «¿quién de los
  // dos tiene razón?» hay que contestarla leyendo el RFC, no cediendo"*. Contestada:
  //
  //   RFC 5545 §3.3.10: *"Recurrence instances falling on invalid dates ... are ignored"*, y
  //   ADR-018 §3 lo adopta literalmente ("la instancia se omite, no se recorta").
  //
  // `rrule-temporal@2.0.2` hace dos cosas distintas de eso, y la segunda es la grave:
  //   1. RECORTA al último día del mes (31-ene → 28-feb) en vez de omitir; y
  //   2. **arrastra el día recortado** al resto de la serie (28-mar, 28-abr...), así que la
  //      regla deja de ser "el 31 de cada mes" para siempre después del primer mes corto.
  // El (2) no es defendible ni como interpretación alternativa: su propia opción `skip` de RFC
  // 7529 documenta `OMIT` como valor por defecto.
  //
  // Estos dos tests **fijan el comportamiento del oráculo a propósito**. Si algún día fallan es
  // que `rrule-temporal` lo arregló, y entonces estas reglas se mueven al corpus de arriba. Lo
  // que NO se hace es silenciarlos: era el otro riesgo que ADR-018 anotó.
  const ORACULO_31 = ["2026-01-31", "2026-02-28", "2026-03-28", "2026-04-28"];

  it("nosotros omitimos (RFC), el oráculo recorta y arrastra", () => {
    expect(fechasNuestras("FREQ=MONTHLY;COUNT=4", "2026-01-31")).toEqual([
      "2026-01-31",
      "2026-03-31",
      "2026-05-31",
      "2026-07-31",
    ]);
    expect(
      fechasDelOraculo("FREQ=MONTHLY;COUNT=4", "2026-01-31", ZONA.MEDIANOCHE_SIN_DST, "09:00"),
    ).toEqual(ORACULO_31);
  });

  it("lo mismo con `YEARLY` anclada un 29 de febrero", () => {
    expect(fechasNuestras("FREQ=YEARLY;COUNT=3", "2024-02-29")).toEqual([
      "2024-02-29",
      "2028-02-29",
      "2032-02-29",
    ]);
    expect(
      fechasDelOraculo("FREQ=YEARLY;COUNT=3", "2024-02-29", ZONA.MEDIANOCHE_SIN_DST, "09:00"),
    ).toEqual(["2024-02-29", "2025-02-28", "2026-02-28"]);
  });

  it("con día ≤ 28 no hay divergencia posible, y por eso el corpus se queda ahí", () => {
    const texto = "FREQ=MONTHLY;COUNT=15";
    expect(fechasNuestras(texto, "2026-01-28")).toEqual(
      fechasDelOraculo(texto, "2026-01-28", ZONA.MEDIANOCHE_SIN_DST, "09:00"),
    );
  });
});

describe("DIVERGENCIA CONOCIDA — ancla que no satisface la regla", () => {
  it("el oráculo elige por el usuario; nosotros rechazamos (ADR-018 §6)", () => {
    // Ancla en domingo con `BYDAY=MO`. `rrule-temporal` no emite el ancla y arranca el lunes
    // siguiente: una convención silenciosa donde RFC 5545 solo dice "should". `validarAncla` lo
    // rechaza al escribir, así que este conjunto no puede existir en nuestro modelo. Se compara
    // aquí para dejar constancia de que la diferencia es de DISEÑO y no un bug de expansión.
    expect(
      fechasDelOraculo("FREQ=WEEKLY;BYDAY=MO;COUNT=3", "2026-08-02", ZONA.DST_UE, "09:00"),
    ).toEqual(["2026-08-03", "2026-08-10", "2026-08-17"]);
  });
});
