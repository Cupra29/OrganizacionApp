// Casos T-7.1 a T-7.5 de `docs/qa/fase-1-nucleo-temporal.md`: el álgebra de intervalos.
//
// Todos los intervalos son instantes UTC y **no hay ninguna zona en este archivo**, igual que no
// la hay en el módulo que prueba. El conjunto base es el del documento de QA, literal.

import { describe, expect, it } from "vitest";
import { I } from "./fixtures.ts";
import { type IntervaloInstantes, restar, solapan, unir } from "./intervalos.ts";

/** `[desde, hasta)` desde dos cadenas ISO, para que los casos se lean como el documento. */
const iv = (desde: string, hasta: string): IntervaloInstantes => ({
  desde: I(desde),
  hasta: I(hasta),
});

/** Cada intervalo como `"desde/hasta"`, que es lo que se compara en las aserciones. */
const como = (intervalos: readonly IntervaloInstantes[]): readonly string[] =>
  intervalos.map((i) => `${i.desde.toString()}/${i.hasta.toString()}`);

const minutos = (i: IntervaloInstantes): number => i.desde.until(i.hasta).total({ unit: "minute" });

const A = iv("2026-08-03T09:00:00Z", "2026-08-03T10:00:00Z");
const B = iv("2026-08-03T09:30:00Z", "2026-08-03T10:30:00Z");
const C = iv("2026-08-03T10:00:00Z", "2026-08-03T11:00:00Z");
const D_DEGENERADO = iv("2026-08-03T12:00:00Z", "2026-08-03T12:00:00Z");
const JORNADA = iv("2026-08-03T07:00:00Z", "2026-08-03T23:00:00Z");

describe("T-7.1 — la contigüidad NO es solape", () => {
  it("un bloque que termina exactamente cuando empieza el otro no se solapa con él", () => {
    // A = [09:00, 10:00), C = [10:00, 11:00). Las 10:00 pertenecen a C y NO a A: en `[a, b)` el
    // extremo derecho está fuera. Es el caso legítimo de "compromiso seguido de su transición".
    expect(solapan(A, C)).toBe(false);
    expect(solapan(C, A)).toBe(false);
  });

  it("misma respuesta que `&&` sobre dos `tstzrange` semiabiertos (02 §6.2)", () => {
    // Si esto diera `true`, el validador del motor y la constraint de exclusión de PostgreSQL
    // discreparían sobre qué es un solape, y el desacuerdo saldría como un error de escritura en
    // producción sobre un plan que el motor considera válido.
    expect(solapan(iv("2026-08-03T07:00:00Z", "2026-08-03T09:00:00Z"), A)).toBe(false);
  });
});

describe("T-7.2 — solape parcial y contención total", () => {
  it("solape parcial", () => {
    expect(solapan(A, B)).toBe(true);
    expect(solapan(B, A)).toBe(true);
  });

  it("contención total, en los dos sentidos", () => {
    const envolvente = iv("2026-08-03T08:00:00Z", "2026-08-03T12:00:00Z");
    expect(solapan(envolvente, A)).toBe(true);
    expect(solapan(A, envolvente)).toBe(true);
  });

  it("intervalos disjuntos con hueco entre medias", () => {
    expect(solapan(A, iv("2026-08-03T11:00:00Z", "2026-08-03T12:00:00Z"))).toBe(false);
  });

  it("un intervalo vacío no solapa ni con quien lo contiene", () => {
    // La forma que circula —`a.desde < b.hasta && b.desde < a.hasta`— diría `true` aquí, y sería
    // falso: `[12:00, 12:00)` no contiene ningún instante que compartir.
    expect(solapan(D_DEGENERADO, iv("2026-08-03T11:00:00Z", "2026-08-03T13:00:00Z"))).toBe(false);
    expect(solapan(D_DEGENERADO, D_DEGENERADO)).toBe(false);
  });
});

describe("T-7.3 — unión de intervalos solapados y contiguos", () => {
  it("tres intervalos de entrada, uno de salida", () => {
    const union = unir([A, B, C]);
    expect(como(union)).toEqual(["2026-08-03T09:00:00Z/2026-08-03T11:00:00Z"]);
    expect(union.map(minutos)).toEqual([120]);
  });

  it("A y C solos: NO se solapan y aun así su unión es contigua", () => {
    // Las dos afirmaciones conviven: `solapan(A, C)` es `false` (T-7.1) y su unión es un solo
    // intervalo. Fusionar aquí es lo que evita que la resta emita un hueco de duración cero
    // entre los dos, que es el error de un minuto de este archivo.
    expect(como(unir([A, C]))).toEqual(["2026-08-03T09:00:00Z/2026-08-03T11:00:00Z"]);
  });

  it("un intervalo contenido en otro no encoge la unión", () => {
    const envolvente = iv("2026-08-03T08:00:00Z", "2026-08-03T12:00:00Z");
    expect(como(unir([envolvente, A]))).toEqual(["2026-08-03T08:00:00Z/2026-08-03T12:00:00Z"]);
  });

  it("los disjuntos siguen siendo dos, y salen ordenados aunque entren al revés", () => {
    expect(como(unir([C, A]))).toEqual(["2026-08-03T09:00:00Z/2026-08-03T11:00:00Z"]);
    expect(como(unir([iv("2026-08-03T14:00:00Z", "2026-08-03T15:00:00Z"), A]))).toEqual([
      "2026-08-03T09:00:00Z/2026-08-03T10:00:00Z",
      "2026-08-03T14:00:00Z/2026-08-03T15:00:00Z",
    ]);
  });

  it("es idempotente y no muta la entrada", () => {
    const entrada = [C, A, B];
    const una = unir(entrada);
    expect(como(unir(una))).toEqual(como(una));
    expect(como(entrada)).toEqual([
      "2026-08-03T10:00:00Z/2026-08-03T11:00:00Z",
      "2026-08-03T09:00:00Z/2026-08-03T10:00:00Z",
      "2026-08-03T09:30:00Z/2026-08-03T10:30:00Z",
    ]);
  });

  it("la unión de nada es nada", () => {
    expect(unir([])).toEqual([]);
  });
});

describe("T-7.4 — resta: los huecos, y ninguno de duración cero", () => {
  it("dos huecos alrededor del bloque ocupado", () => {
    const huecos = restar(JORNADA, unir([A, B, C]));
    expect(como(huecos)).toEqual([
      "2026-08-03T07:00:00Z/2026-08-03T09:00:00Z",
      "2026-08-03T11:00:00Z/2026-08-03T23:00:00Z",
    ]);
    expect(huecos.map(minutos)).toEqual([120, 720]);
  });

  it("un compromiso que empieza exactamente en `wake` no deja un hueco de 0 min al principio", () => {
    const huecos = restar(JORNADA, [iv("2026-08-03T07:00:00Z", "2026-08-03T09:00:00Z")]);
    expect(como(huecos)).toEqual(["2026-08-03T09:00:00Z/2026-08-03T23:00:00Z"]);
  });

  it("un compromiso que termina exactamente en `sleep` no deja un hueco de 0 min al final", () => {
    const huecos = restar(JORNADA, [iv("2026-08-03T21:00:00Z", "2026-08-03T23:00:00Z")]);
    expect(como(huecos)).toEqual(["2026-08-03T07:00:00Z/2026-08-03T21:00:00Z"]);
  });

  it("dos compromisos contiguos no dejan un hueco de 0 min entre medias", () => {
    const huecos = restar(JORNADA, [A, C]);
    expect(como(huecos)).toEqual([
      "2026-08-03T07:00:00Z/2026-08-03T09:00:00Z",
      "2026-08-03T11:00:00Z/2026-08-03T23:00:00Z",
    ]);
    expect(huecos.every((h) => minutos(h) > 0)).toBe(true);
  });

  it("la jornada ocupada de punta a punta no deja ningún hueco", () => {
    expect(restar(JORNADA, [JORNADA])).toEqual([]);
  });

  it("sin nada ocupado, el hueco es la jornada entera", () => {
    expect(como(restar(JORNADA, []))).toEqual(["2026-08-03T07:00:00Z/2026-08-03T23:00:00Z"]);
  });

  it("lo ocupado fuera de la jornada no recorta nada ni desborda los extremos", () => {
    // Por los dos lados: un turno de la madrugada anterior (que termina antes de `wake`) y uno de
    // la jornada siguiente (que empieza después de `sleep`). Ninguno puede mover el cursor hacia
    // atrás ni alargar el hueco final más allá del fin de la jornada.
    const huecos = restar(JORNADA, [
      iv("2026-08-03T03:00:00Z", "2026-08-03T05:00:00Z"),
      iv("2026-08-04T01:00:00Z", "2026-08-04T04:00:00Z"),
    ]);
    expect(como(huecos)).toEqual(["2026-08-03T07:00:00Z/2026-08-03T23:00:00Z"]);
  });

  it("lo ocupado que asoma por un extremo se recorta al extremo", () => {
    const huecos = restar(JORNADA, [
      iv("2026-08-03T05:00:00Z", "2026-08-03T08:00:00Z"),
      iv("2026-08-03T22:00:00Z", "2026-08-04T02:00:00Z"),
    ]);
    expect(como(huecos)).toEqual(["2026-08-03T08:00:00Z/2026-08-03T22:00:00Z"]);
  });

  it("acepta sustraendos sin unir, desordenados y solapados: los normaliza", () => {
    // 03 §3.2 llama `restar(…, unir(ocupado))`, pero la precondición del barrido no puede quedar
    // en manos de quien llame. Las dos formas dan lo mismo.
    expect(como(restar(JORNADA, [C, B, A]))).toEqual(como(restar(JORNADA, unir([A, B, C]))));
  });
});

describe("T-7.5 — el intervalo degenerado no ocupa tiempo", () => {
  it("no aporta nada a la unión", () => {
    // Un `OVERRIDE` con `new_duration_minutes = 0` es una cancelación efectiva y produce uno.
    expect(como(unir([A, D_DEGENERADO]))).toEqual(como(unir([A])));
    expect(unir([D_DEGENERADO])).toEqual([]);
  });

  it("no parte la jornada en dos huecos", () => {
    expect(como(restar(JORNADA, [D_DEGENERADO]))).toEqual(como(restar(JORNADA, [])));
  });

  it("tampoco cuando cae exactamente en un extremo de la jornada", () => {
    const enWake = iv("2026-08-03T07:00:00Z", "2026-08-03T07:00:00Z");
    expect(como(restar(JORNADA, [enWake]))).toEqual(como(restar(JORNADA, [])));
  });
});
