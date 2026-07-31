// Casos T-21 a T-31 de `docs/qa/fase-1-nucleo-temporal.md`: el validador del subconjunto de
// ADR-018 §3, una fila por forma rechazada.
//
// **Cada rechazo se comprueba por `error.propiedad`, no por el texto del mensaje.** El criterio
// de la fase pide "un error que nombra la propiedad exacta"; comprobarlo contra una subcadena
// del mensaje ataría la suite a la redacción, y el primero que mejore un castellano rompería
// diez tests y aprendería a no comprobar nada.

import { describe, expect, it } from "vitest";
import { D } from "./fixtures.ts";
import { ErrorRecurrencia, validarAncla, validarRrule } from "./rrule.ts";

/** La propiedad que el validador señala, o `null` si aceptó una regla que debía rechazar. */
function propiedadRechazada(texto: string): string | null {
  try {
    validarRrule(texto);
    return null;
  } catch (error) {
    if (error instanceof ErrorRecurrencia) {
      return error.propiedad;
    }
    throw error;
  }
}

describe("acepta la columna izquierda de la tabla de ADR-018 §3", () => {
  it("las cuatro frecuencias del subconjunto", () => {
    for (const freq of ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const) {
      expect(validarRrule(`FREQ=${freq}`).freq).toBe(freq);
    }
  });

  it("`INTERVAL` ausente vale 1, y nadie vuelve a decidirlo más abajo (T-30)", () => {
    expect(validarRrule("FREQ=DAILY").interval).toBe(1);
    expect(validarRrule("FREQ=DAILY;INTERVAL=1").interval).toBe(1);
    expect(validarRrule("FREQ=DAILY;INTERVAL=3").interval).toBe(3);
  });

  it("`BYDAY` sin prefijo numérico y con `WEEKLY`", () => {
    expect(validarRrule("FREQ=WEEKLY;BYDAY=MO,WE,FR").byDay).toEqual(["MO", "WE", "FR"]);
  });

  it("`COUNT` o `UNTIL`, nunca los dos", () => {
    expect(validarRrule("FREQ=WEEKLY;COUNT=8").count).toBe(8);
    expect(validarRrule("FREQ=WEEKLY;UNTIL=2026-12-31T00:00:00Z").until?.toString()).toBe(
      "2026-12-31T00:00:00Z",
    );
  });

  it("`UNTIL` en el formato básico de RFC 5545, que es el que viaja en un `.ics`", () => {
    expect(validarRrule("FREQ=WEEKLY;UNTIL=20261231T000000Z").until?.toString()).toBe(
      "2026-12-31T00:00:00Z",
    );
  });

  it("los valores enumerados son insensibles a mayúsculas, como en RFC 5545 §3.1", () => {
    const regla = validarRrule("freq=weekly;byday=mo,we");
    expect(regla.freq).toBe("WEEKLY");
    expect(regla.byDay).toEqual(["MO", "WE"]);
  });

  it("una regla aceptada no lleva `undefined` donde no había propiedad", () => {
    const regla = validarRrule("FREQ=DAILY");
    expect(regla.byDay).toBeUndefined();
    expect(regla.count).toBeUndefined();
    expect(regla.until).toBeUndefined();
  });
});

describe("T-21 a T-23 — `FREQ` fuera del subconjunto: el error nombra `FREQ`", () => {
  it.each([
    ["T-21", "FREQ=HOURLY"],
    ["T-22", "FREQ=MINUTELY"],
    ["T-23", "FREQ=SECONDLY"],
  ])("%s — %s", (_caso, texto) => {
    expect(propiedadRechazada(texto)).toBe("FREQ");
  });

  it("`FREQ` ausente también se rechaza nombrando `FREQ`: RFC 5545 la hace obligatoria", () => {
    expect(propiedadRechazada("INTERVAL=2")).toBe("FREQ");
  });
});

describe("T-24 a T-26 — `BYDAY`: el error nombra `BYDAY`", () => {
  it("T-24 — `YEARLY` con `BYDAY` (no solo `MONTHLY` está prohibido)", () => {
    expect(propiedadRechazada("FREQ=YEARLY;BYDAY=MO")).toBe("BYDAY");
  });

  it("`MONTHLY;BYDAY=MO` se rechaza aunque sea equivalente a `WEEKLY;BYDAY=MO`", () => {
    // Una forma canónica por patrón. La equivalencia es justo la razón del rechazo, no una
    // objeción a él: aceptar las dos duplicaría el camino de expansión más caro.
    expect(propiedadRechazada("FREQ=MONTHLY;BYDAY=MO")).toBe("BYDAY");
    expect(validarRrule("FREQ=WEEKLY;BYDAY=MO").byDay).toEqual(["MO"]);
  });

  it("`DAILY` con `BYDAY` tampoco", () => {
    expect(propiedadRechazada("FREQ=DAILY;BYDAY=MO")).toBe("BYDAY");
  });

  it("T-25 — prefijo numérico positivo (`3TU`)", () => {
    expect(propiedadRechazada("FREQ=WEEKLY;BYDAY=3TU")).toBe("BYDAY");
  });

  it("T-26 — prefijo numérico negativo (`-1FR`): el signo no es una vía de escape", () => {
    expect(propiedadRechazada("FREQ=WEEKLY;BYDAY=-1FR")).toBe("BYDAY");
  });

  it("un token que no es día de la semana, y uno vacío", () => {
    expect(propiedadRechazada("FREQ=WEEKLY;BYDAY=XX")).toBe("BYDAY");
    expect(propiedadRechazada("FREQ=WEEKLY;BYDAY=")).toBe("BYDAY");
  });

  it("un día repetido: se rechaza en vez de deduplicar en silencio", () => {
    expect(propiedadRechazada("FREQ=WEEKLY;BYDAY=MO,MO")).toBe("BYDAY");
  });

  it("los dos mensajes de prefijo y de basura son distintos, porque son dos errores distintos", () => {
    const conPrefijo = propiedadRechazadaConMensaje("FREQ=WEEKLY;BYDAY=3TU");
    const basura = propiedadRechazadaConMensaje("FREQ=WEEKLY;BYDAY=XX");
    expect(conPrefijo).toContain("posicional");
    expect(basura).not.toContain("posicional");
  });
});

/** El mensaje completo, para los dos casos donde el texto sí discrimina algo. */
function propiedadRechazadaConMensaje(texto: string): string {
  try {
    validarRrule(texto);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe("T-27 y T-28 — `COUNT` / `UNTIL`", () => {
  it("T-27 — juntos: el error nombra la combinación, no una de las dos", () => {
    const propiedad = propiedadRechazada("FREQ=WEEKLY;COUNT=5;UNTIL=2026-12-31T00:00:00Z");
    expect(propiedad).toBe("COUNT+UNTIL");
    // Nombrar solo una de las dos dejaría al usuario quitando la que no era.
    expect(propiedadRechazadaConMensaje("FREQ=WEEKLY;COUNT=5;UNTIL=2026-12-31T00:00:00Z")).toMatch(
      /COUNT.*UNTIL/s,
    );
  });

  it("T-28 — `UNTIL` como fecha civil sin zona: el error nombra `UNTIL`", () => {
    expect(propiedadRechazada("FREQ=WEEKLY;UNTIL=2026-12-31")).toBe("UNTIL");
  });

  it("`UNTIL` con hora local pero sin zona tampoco vale", () => {
    expect(propiedadRechazada("FREQ=WEEKLY;UNTIL=2026-12-31T00:00:00")).toBe("UNTIL");
  });

  it("`UNTIL` que acaba en Z pero no es un instante: el error sigue nombrando `UNTIL`", () => {
    expect(propiedadRechazada("FREQ=WEEKLY;UNTIL=XYZ")).toBe("UNTIL");
  });

  it("`COUNT` fuera de rango se rechaza como `INTERVAL`, por la misma regla de entero ≥ 1", () => {
    expect(propiedadRechazada("FREQ=WEEKLY;COUNT=0")).toBe("COUNT");
    expect(propiedadRechazada("FREQ=WEEKLY;COUNT=-1")).toBe("COUNT");
  });
});

describe("T-29 — toda propiedad fuera del subconjunto se rechaza con SU nombre", () => {
  it.each([
    ["BYYEARDAY", "FREQ=WEEKLY;BYYEARDAY=1"],
    ["BYWEEKNO", "FREQ=WEEKLY;BYWEEKNO=1"],
    ["BYHOUR", "FREQ=WEEKLY;BYHOUR=9"],
    ["RSCALE", "FREQ=WEEKLY;RSCALE=hebrew"],
    ["BYSETPOS", "FREQ=WEEKLY;BYSETPOS=-1"],
    ["BYMONTHDAY", "FREQ=MONTHLY;BYMONTHDAY=15"],
    ["BYMONTH", "FREQ=YEARLY;BYMONTH=3"],
    ["BYMINUTE", "FREQ=WEEKLY;BYMINUTE=30"],
  ])("%s", (propiedad, texto) => {
    expect(propiedadRechazada(texto)).toBe(propiedad);
  });

  it("`WKST` se rechaza: es MO siempre y no se negocia (ADR-018 §4)", () => {
    // No se acepta ni siquiera `WKST=MO`, que sería inofensivo. Aceptarlo abriría la puerta a
    // `WKST=SU`, y con eso *qué instancias existen* pasaría a depender de un ajuste que ADR-003
    // clasifica como presentación.
    expect(propiedadRechazada("FREQ=WEEKLY;WKST=MO")).toBe("WKST");
    expect(propiedadRechazada("FREQ=WEEKLY;WKST=SU")).toBe("WKST");
  });

  it("el rechazo es por allowlist: una propiedad inventada también sale por su nombre", () => {
    // Es la propiedad de fondo, y la razón de que la lista sea de aceptados y no de prohibidos:
    // lo que RFC 7529 publique mañana se rechaza hoy, sin tocar este archivo.
    expect(propiedadRechazada("FREQ=WEEKLY;XPROPIEDADFUTURA=1")).toBe("XPROPIEDADFUTURA");
  });

  it("una propiedad repetida se rechaza en vez de quedarse con la última", () => {
    expect(propiedadRechazada("FREQ=DAILY;FREQ=WEEKLY")).toBe("FREQ");
  });

  it("un fragmento sin `=` se rechaza sin fingir que entendió algo", () => {
    expect(propiedadRechazada("FREQ=WEEKLY;BYDAY")).toBe("BYDAY");
    expect(propiedadRechazada("=WEEKLY")).toBe("=WEEKLY");
    expect(propiedadRechazada("")).toBe("(vacío)");
  });
});

describe("T-30 — límites de `INTERVAL`", () => {
  it.each(["0", "-1", "1.5", "1e3", "+2", " ", "dos"])("`INTERVAL=%s` se rechaza", (valor) => {
    expect(propiedadRechazada(`FREQ=DAILY;INTERVAL=${valor}`)).toBe("INTERVAL");
  });

  it("`1.5` es el que importa: `parseInt` lo aceptaría como 1 sin decir nada", () => {
    expect(Number.parseInt("1.5", 10)).toBe(1);
    expect(propiedadRechazada("FREQ=DAILY;INTERVAL=1.5")).toBe("INTERVAL");
  });
});

describe("T-31 — el ancla tiene que pertenecer al conjunto que la regla genera (ADR-018 §6)", () => {
  it("ancla en martes con `BYDAY=MO`: se rechaza nombrando `anchor_date`", () => {
    const regla = validarRrule("FREQ=WEEKLY;BYDAY=MO");
    expect(() => validarAncla(regla, D("2026-08-04"))).toThrow(ErrorRecurrencia);
    try {
      validarAncla(regla, D("2026-08-04"));
    } catch (error) {
      expect((error as ErrorRecurrencia).propiedad).toBe("anchor_date");
    }
  });

  it("no se corrige sola al lunes más cercano: rechaza y devuelve la pregunta", () => {
    const regla = validarRrule("FREQ=WEEKLY;BYDAY=MO");
    // El comportamiento que NO queremos: `rrule-temporal` acepta este ancla y expande desde el
    // lunes siguiente. Es una convención silenciosa; RFC 5545 solo dice "should" aquí.
    expect(() => validarAncla(regla, D("2026-08-02"))).toThrow(ErrorRecurrencia);
  });

  it("ancla que sí pertenece: pasa", () => {
    expect(() => validarAncla(validarRrule("FREQ=WEEKLY;BYDAY=MO"), D("2026-08-03"))).not.toThrow();
    expect(() =>
      validarAncla(validarRrule("FREQ=WEEKLY;BYDAY=MO,WE,FR"), D("2026-08-05")),
    ).not.toThrow();
  });

  it("sin `BYDAY` el ancla siempre pertenece: es ella quien define el conjunto", () => {
    for (const texto of ["FREQ=DAILY", "FREQ=WEEKLY", "FREQ=MONTHLY;INTERVAL=2", "FREQ=YEARLY"]) {
      expect(() => validarAncla(validarRrule(texto), D("2026-08-04"))).not.toThrow();
    }
  });
});
