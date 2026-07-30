import { describe, expect, it } from "vitest";
import { Temporal } from "./index.ts";

// Sustituye al test de humo del andamiaje (`PACKAGE_ID`), que se elimina en esta fase.
// Lo que hay que comprobar del módulo único no es que exista, sino que el polyfill que
// reexporta hace la aritmética que ADR-018 le encarga. La conformidad de
// `temporal-polyfill@1.0.2` con la especificación final no se verificó contra test262 (ADR-018,
// "Lo que queda condicionado"); esto la comprueba donde nos importa, y si algún día falla, el
// módulo único hace que cambiar de polyfill sea una línea.
describe("@oa/temporal — el módulo único de Temporal", () => {
  it("reexporta un `Temporal` usable desde la superficie pública del paquete", () => {
    expect(Temporal.PlainDate.from("2026-08-03").toString()).toBe("2026-08-03");
    expect(Temporal.Instant.fromEpochMilliseconds(0).toString()).toBe("1970-01-01T00:00:00Z");
  });

  it("suma minutos reales sobre la línea de instantes al cruzar el adelanto de horario", () => {
    // ADR-018 §4, nota fechada del 2026-07-29: este es el par de valores que DISCRIMINA la
    // aritmética correcta de la trampa de hora de pared, y por eso la fixture arranca la
    // noche ANTERIOR al cambio. Un turno que empieza a las 19:00 del día del cambio ya lo dejó
    // atrás y no distingue una implementación de la otra.
    const inicio = Temporal.ZonedDateTime.from("2026-03-07T19:00:00[America/Chicago]");
    const fin = inicio.add({ minutes: 720 });

    expect(inicio.toInstant().toString()).toBe("2026-03-08T01:00:00Z");
    expect(fin.toInstant().toString()).toBe("2026-03-08T13:00:00Z");
    // 08:00 CDT. La aritmética de pared (`toPlainDateTime().add(...)`) daría 07:00.
    expect(fin.toPlainTime().toString()).toBe("08:00:00");
  });
});
