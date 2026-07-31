// Casos T-8, T-10, T-32, T-33 y T-34 de `docs/qa/fase-1-nucleo-temporal.md`: la etapa 1 de
// `RRULE`, el conjunto de fechas civiles.
//
// La verificación cruzada contra `rrule-temporal` vive en `oraculo.test.ts` y es obligatoria
// para T-8 (ADR-018 §8): estos valores están derivados a mano y una implementación propia sin
// oráculo comete los dos errores de ADR-018 §5 con cobertura del 100 %, porque el test lo
// escribe la misma cabeza que escribió el bug.

import { describe, expect, it } from "vitest";
import { fechasDeRrule, limiteInclusivo } from "./expansion.ts";
import { D, T, ZONA } from "./fixtures.ts";
import { validarRrule } from "./rrule.ts";
import { Temporal } from "./temporal.ts";
import { fechaLimiteDeUntil } from "./zona.ts";

/** Ventana amplia por defecto: dos años, para que quien corte sea la regla y no la consulta. */
const AMPLIA = { desde: D("2026-01-01"), hasta: D("2028-01-01") };

function fechas(
  texto: string,
  ancla: string,
  ventana = AMPLIA,
  limite?: Temporal.PlainDate,
): readonly string[] {
  return fechasDeRrule({
    regla: validarRrule(texto),
    ancla: D(ancla),
    ventana,
    limite,
  }).map((f) => f.toString());
}

describe("T-8 — `FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=8` anclada en miércoles", () => {
  const ESPERADO = [
    "2026-08-05",
    "2026-08-07",
    "2026-08-17",
    "2026-08-19",
    "2026-08-21",
    "2026-08-31",
    "2026-09-02",
    "2026-09-04",
  ];

  it("produce exactamente el conjunto del criterio, en ese orden", () => {
    expect(fechas("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=8", "2026-08-05")).toEqual(ESPERADO);
  });

  it("el lunes 2026-08-03 NO está: es de la semana activa del ancla, pero anterior al ancla", () => {
    expect(fechas("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=8", "2026-08-05")).not.toContain(
      "2026-08-03",
    );
  });

  it("error clásico (a): las semanas activas se cuentan desde la SEMANA del ancla", () => {
    // Sumar `INTERVAL × 7` días a cada ocurrencia, partiendo de la secuencia semanal simple y
    // tomando una de cada dos de la lista plana, daría 03-ago y no daría 07-ago. El conjunto
    // correcto contiene 08-07 y no contiene 08-03; comprobar las dos direcciones es lo que
    // distingue este bug de un desfase cualquiera.
    const conjunto = fechas("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=8", "2026-08-05");
    expect(conjunto).toContain("2026-08-07");
    // Las semanas activas son las de índice PAR desde la del ancla: 03–09, 17–23, 31–06.
    // La semana 10–16 está entera fuera.
    expect(conjunto.filter((f) => f >= "2026-08-10" && f <= "2026-08-16")).toEqual([]);
  });

  it("error clásico (b): `COUNT` corta el conjunto ya fusionado en orden cronológico", () => {
    // Con `COUNT=7` el corte cae a MITAD de semana activa: 2+3+2. Un `COUNT` contado por día de
    // la semana (dos lunes, dos miércoles...) daría otra cosa, y con `COUNT=8` —que cae justo
    // en el borde de una semana— las dos implementaciones coinciden por casualidad.
    expect(fechas("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=7", "2026-08-05")).toEqual(
      ESPERADO.slice(0, 7),
    );
    expect(fechas("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=1", "2026-08-05")).toEqual([
      "2026-08-05",
    ]);
  });

  it("`COUNT` se gasta también con las ocurrencias anteriores a la ventana consultada", () => {
    // Es la propiedad que hace que la regla sea la fuente de verdad: consultar septiembre no
    // puede alargar la serie. Con la ventana empezando el 2026-08-18, las cinco primeras
    // ocurrencias ya se gastaron aunque no se devuelvan.
    expect(
      fechas("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=8", "2026-08-05", {
        desde: D("2026-08-18"),
        hasta: D("2028-01-01"),
      }),
    ).toEqual(["2026-08-19", "2026-08-21", "2026-08-31", "2026-09-02", "2026-09-04"]);
  });

  it("dentro de una semana activa las fechas salen en orden cronológico, no en el de `BYDAY`", () => {
    // `BYDAY=SU,WE` lista el domingo primero; el conjunto tiene que dar el miércoles primero.
    expect(fechas("FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,WE;COUNT=4", "2026-08-05")).toEqual([
      "2026-08-05",
      "2026-08-09",
      "2026-08-19",
      "2026-08-23",
    ]);
  });
});

describe("T-34 — `WKST` es `MO` y `week_starts_on` no llega nunca al expansor", () => {
  it("no existe forma de pasarlo: no está en la firma", () => {
    // La comprobación mecánica es de tipos, no de valores. Si alguien "ayuda" conectando
    // `temporal_profiles.week_starts_on` al expansor, este `@ts-expect-error` deja de tener
    // error que esperar y `pnpm typecheck` falla. Un test de valores no puede detectar la
    // aparición de un parámetro nuevo; este sí.
    const salida = fechasDeRrule({
      regla: validarRrule("FREQ=WEEKLY;BYDAY=MO"),
      ancla: D("2026-08-03"),
      ventana: { desde: D("2026-08-03"), hasta: D("2026-08-11") },
      // @ts-expect-error `weekStartsOn` no está en `EntradaRrule` y no debe estarlo nunca.
      weekStartsOn: 0,
    });
    expect(salida.map((f) => f.toString())).toEqual(["2026-08-03", "2026-08-10"]);
  });

  it("las semanas se cuentan de lunes a domingo aunque el ancla caiga en domingo", () => {
    // El caso que distingue `WKST=MO` de `WKST=SU`. Ancla domingo 2026-08-02: con `WKST=MO` su
    // semana es la del 27-jul, así que la siguiente semana activa (INTERVAL=3) empieza el
    // 17-ago y el sábado que emite es el 22. Con `WKST=SU` la semana del ancla empezaría el
    // 2-ago y el conjunto sería otro.
    expect(fechas("FREQ=WEEKLY;INTERVAL=3;BYDAY=SU,SA;COUNT=6", "2026-08-02")).toEqual([
      "2026-08-02",
      "2026-08-22",
      "2026-08-23",
      "2026-09-12",
      "2026-09-13",
      "2026-10-03",
    ]);
  });
});

describe("T-10 — `MONTHLY`/`YEARLY` con día inexistente: se OMITE, no se recorta", () => {
  it("ancla 2026-01-31 con `COUNT=4`: febrero, abril y junio se omiten", () => {
    // Los tres, no dos: febrero tiene 28, y abril y junio tienen 30. La primera versión del
    // caso de QA decía "febrero y abril" y se corrigió el 2026-07-29.
    expect(fechas("FREQ=MONTHLY;INTERVAL=1;COUNT=4", "2026-01-31")).toEqual([
      "2026-01-31",
      "2026-03-31",
      "2026-05-31",
      "2026-07-31",
    ]);
  });

  it("un mes omitido NO gasta `COUNT` ni desplaza la serie al día 28", () => {
    // Recortar al último día del mes sería la otra regla, y la de verdad peligrosa es la
    // variante que además ARRASTRA el día recortado: 31-ene → 28-feb → 28-mar → 28-abr, que es
    // lo que hace el oráculo (ver `oraculo.test.ts`). Con ocho ocurrencias la diferencia entre
    // omitir y arrastrar es imposible de confundir.
    expect(fechas("FREQ=MONTHLY;COUNT=8", "2026-01-31")).toEqual([
      "2026-01-31",
      "2026-03-31",
      "2026-05-31",
      "2026-07-31",
      "2026-08-31",
      "2026-10-31",
      "2026-12-31",
      "2027-01-31",
    ]);
  });

  it("día 30: solo febrero se omite", () => {
    expect(fechas("FREQ=MONTHLY;COUNT=4", "2026-01-30")).toEqual([
      "2026-01-30",
      "2026-03-30",
      "2026-04-30",
      "2026-05-30",
    ]);
  });

  it("día 29 en año común: febrero se omite; en año bisiesto no", () => {
    expect(fechas("FREQ=MONTHLY;COUNT=3", "2026-01-29")).toEqual([
      "2026-01-29",
      "2026-03-29",
      "2026-04-29",
    ]);
    expect(
      fechas("FREQ=MONTHLY;COUNT=3", "2024-01-29", {
        desde: D("2024-01-01"),
        hasta: D("2025-01-01"),
      }),
    ).toEqual(["2024-01-29", "2024-02-29", "2024-03-29"]);
  });

  it("`YEARLY` anclada un 29 de febrero solo produce años bisiestos", () => {
    expect(
      fechas("FREQ=YEARLY;COUNT=3", "2024-02-29", {
        desde: D("2024-01-01"),
        hasta: D("2040-01-01"),
      }),
    ).toEqual(["2024-02-29", "2028-02-29", "2032-02-29"]);
  });

  it("`MONTHLY;INTERVAL=2` desde el 31 de enero nunca pisa un mes corto", () => {
    expect(fechas("FREQ=MONTHLY;INTERVAL=2;COUNT=4", "2026-01-31")).toEqual([
      "2026-01-31",
      "2026-03-31",
      "2026-05-31",
      "2026-07-31",
    ]);
  });
});

describe("las cuatro frecuencias, con y sin `INTERVAL`", () => {
  it("`DAILY`", () => {
    expect(fechas("FREQ=DAILY;COUNT=3", "2026-08-03")).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
    ]);
    expect(fechas("FREQ=DAILY;INTERVAL=3;COUNT=3", "2026-08-03")).toEqual([
      "2026-08-03",
      "2026-08-06",
      "2026-08-09",
    ]);
  });

  it("`WEEKLY` sin `BYDAY`: el día de la semana lo pone el ancla", () => {
    expect(fechas("FREQ=WEEKLY;INTERVAL=2;COUNT=3", "2026-08-05")).toEqual([
      "2026-08-05",
      "2026-08-19",
      "2026-09-02",
    ]);
  });

  it("`YEARLY;INTERVAL=2`", () => {
    expect(
      fechas("FREQ=YEARLY;INTERVAL=2;COUNT=3", "2026-08-03", {
        desde: D("2026-01-01"),
        hasta: D("2040-01-01"),
      }),
    ).toEqual(["2026-08-03", "2028-08-03", "2030-08-03"]);
  });
});

describe("la ventana acota, pero no altera el conjunto", () => {
  it("una regla sin `COUNT` ni `UNTIL` se corta en el fin de la ventana, no antes", () => {
    expect(
      fechas("FREQ=DAILY", "2026-08-03", { desde: D("2026-08-03"), hasta: D("2026-08-06") }),
    ).toEqual(["2026-08-03", "2026-08-04", "2026-08-05"]);
  });

  it("la ventana es semiabierta: `hasta` no se incluye", () => {
    expect(
      fechas("FREQ=DAILY", "2026-08-03", { desde: D("2026-08-03"), hasta: D("2026-08-04") }),
    ).toEqual(["2026-08-03"]);
  });

  it("una ventana vacía o anterior al ancla devuelve el conjunto vacío", () => {
    expect(
      fechas("FREQ=DAILY", "2026-08-03", { desde: D("2026-08-03"), hasta: D("2026-08-03") }),
    ).toEqual([]);
    expect(
      fechas("FREQ=DAILY", "2026-08-03", { desde: D("2026-07-01"), hasta: D("2026-08-01") }),
    ).toEqual([]);
  });

  it("una ventana que empieza antes del ancla no inventa ocurrencias previas", () => {
    expect(
      fechas("FREQ=DAILY;COUNT=2", "2026-08-03", {
        desde: D("2026-07-01"),
        hasta: D("2026-09-01"),
      }),
    ).toEqual(["2026-08-03", "2026-08-04"]);
  });

  it("el corte por ventana cae a mitad de una semana activa sin desbaratar el resto", () => {
    expect(
      fechas("FREQ=WEEKLY;BYDAY=MO,WE,FR", "2026-08-03", {
        desde: D("2026-08-03"),
        hasta: D("2026-08-13"),
      }),
    ).toEqual(["2026-08-03", "2026-08-05", "2026-08-07", "2026-08-10", "2026-08-12"]);
  });
});

describe("T-32 y T-33 — `effective_until`, `UNTIL` y su intersección (ADR-018 §4)", () => {
  const LUNES_9 = "FREQ=WEEKLY;BYDAY=MO";
  const ANCLA = "2026-08-03";

  it("T-32 — `effective_until` es inclusivo hasta el fin de esa jornada civil", () => {
    expect(
      fechas(LUNES_9, ANCLA, { desde: D("2026-08-03"), hasta: D("2026-08-25") }, D("2026-08-17")),
    ).toEqual(["2026-08-03", "2026-08-10", "2026-08-17"]);
  });

  it("`fechaLimiteDeUntil` compara como instante, no truncando el día civil", () => {
    // La ocurrencia de los lunes es a las 09:00 de Ciudad de México = 15:00Z.
    const alas15 = Temporal.Instant.from("2026-08-17T15:00:00Z");
    const alas14 = Temporal.Instant.from("2026-08-17T14:00:00Z");
    // Igualdad exacta: `UNTIL` es inclusivo, así que la ocurrencia de ese lunes entra.
    expect(fechaLimiteDeUntil(alas15, T("09:00"), ZONA.MEDIANOCHE_SIN_DST).toString()).toBe(
      "2026-08-17",
    );
    // Una hora antes de la ocurrencia, el MISMO día civil: la ocurrencia ya no entra. Truncar
    // el instante a su fecha civil daría 2026-08-17 y la dejaría pasar.
    expect(fechaLimiteDeUntil(alas14, T("09:00"), ZONA.MEDIANOCHE_SIN_DST).toString()).toBe(
      "2026-08-16",
    );
  });

  it("`fechaLimiteDeUntil` calcula el día del `UNTIL` en la ZONA DE LA REGLA, no en UTC", () => {
    // La segunda trampa del mismo párrafo de ADR-018 §4, al lado de la del truncado. `UNTIL` es
    // un instante UTC y su día civil en UTC no es el de la zona de la regla salvo cerca de
    // Greenwich: el test de arriba usa `America/Mexico_City` y ahí los dos días coinciden, así
    // que un `until.toZonedDateTimeISO("UTC").toPlainDate()` pasaría sin enterarse.
    //
    // `Australia/Lord_Howe` los separa: a las 09:00 locales, el instante cae en el día civil
    // ANTERIOR en UTC. Y como el offset es propiedad de una zona EN UNA FECHA, van las dos
    // temporadas: +10:30 en agosto (estándar) y +11:00 en diciembre (verano austral).
    //
    // Por qué falla la versión en UTC y no se salva con la corrección de ±1 día: esa corrección
    // solo RESTA. Con la zona al este, el día en UTC va por detrás del correcto y no hay forma de
    // volver hacia delante — devuelve un límite un día corto y se pierde la última ocurrencia.
    const enAgosto = Temporal.Instant.from("2026-08-16T22:30:00Z"); // 09:00 LHST (+10:30) del 17
    expect(fechaLimiteDeUntil(enAgosto, T("09:00"), ZONA.DST_MEDIA_HORA).toString()).toBe(
      "2026-08-17",
    );
    const enDiciembre = Temporal.Instant.from("2026-12-13T22:00:00Z"); // 09:00 LHDT (+11) del 14
    expect(fechaLimiteDeUntil(enDiciembre, T("09:00"), ZONA.DST_MEDIA_HORA).toString()).toBe(
      "2026-12-14",
    );
    // El día civil en UTC de esos dos instantes, que es lo que devolvería la versión equivocada.
    expect(enAgosto.toZonedDateTimeISO("UTC").toPlainDate().toString()).toBe("2026-08-16");
    expect(enDiciembre.toZonedDateTimeISO("UTC").toPlainDate().toString()).toBe("2026-12-13");
  });

  it("hacia el OESTE el mismo error no se ve, y por eso el caso de arriba va al este", () => {
    // Control negativo, en la línea de la Lectura A de T-6: con una zona al oeste el día en UTC
    // va por DELANTE del correcto, y la corrección de ±1 día —que solo resta— lo devuelve al
    // valor bueno. Las dos implementaciones coinciden y el caso no discrimina nada. Queda escrito
    // para que nadie sustituya la fixture de Lord Howe por una de Chicago creyendo que da igual.
    const tardeEnChicago = Temporal.Instant.from("2026-08-18T02:00:00Z"); // 21:00 CDT del 17
    expect(tardeEnChicago.toZonedDateTimeISO("UTC").toPlainDate().toString()).toBe("2026-08-18");
    expect(fechaLimiteDeUntil(tardeEnChicago, T("09:00"), ZONA.DST_EEUU).toString()).toBe(
      "2026-08-17",
    );
  });

  it("T-33 — manda `UNTIL` cuando es el más restrictivo", () => {
    const porUntil = fechaLimiteDeUntil(
      Temporal.Instant.from("2026-08-17T15:00:00Z"),
      T("09:00"),
      ZONA.MEDIANOCHE_SIN_DST,
    );
    const limite = limiteInclusivo(D("2026-08-31"), porUntil);
    expect(limite?.toString()).toBe("2026-08-17");
    expect(
      fechas(LUNES_9, ANCLA, { desde: D("2026-08-03"), hasta: D("2026-09-30") }, limite),
    ).toEqual(["2026-08-03", "2026-08-10", "2026-08-17"]);
  });

  it("T-33 simétrico — manda `effective_until` cuando es el más restrictivo", () => {
    const porUntil = fechaLimiteDeUntil(
      Temporal.Instant.from("2026-08-31T15:00:00Z"),
      T("09:00"),
      ZONA.MEDIANOCHE_SIN_DST,
    );
    const limite = limiteInclusivo(D("2026-08-17"), porUntil);
    expect(limite?.toString()).toBe("2026-08-17");
    expect(
      fechas(LUNES_9, ANCLA, { desde: D("2026-08-03"), hasta: D("2026-09-30") }, limite),
    ).toEqual(["2026-08-03", "2026-08-10", "2026-08-17"]);
  });

  it("la intersección con uno solo de los dos, o con ninguno", () => {
    expect(limiteInclusivo(undefined, undefined)).toBeUndefined();
    expect(limiteInclusivo(D("2026-08-17"), undefined)?.toString()).toBe("2026-08-17");
    expect(limiteInclusivo(undefined, D("2026-08-17"))?.toString()).toBe("2026-08-17");
  });

  it("un límite posterior al fin de la ventana no alarga nada", () => {
    expect(
      fechas(LUNES_9, ANCLA, { desde: D("2026-08-03"), hasta: D("2026-08-12") }, D("2027-01-01")),
    ).toEqual(["2026-08-03", "2026-08-10"]);
  });

  it("`COUNT` y el límite conviven: corta el primero que llegue", () => {
    expect(
      fechas(
        "FREQ=WEEKLY;BYDAY=MO;COUNT=10",
        ANCLA,
        { desde: D("2026-08-03"), hasta: D("2026-12-31") },
        D("2026-08-17"),
      ),
    ).toEqual(["2026-08-03", "2026-08-10", "2026-08-17"]);
  });
});
