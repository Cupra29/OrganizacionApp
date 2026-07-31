// El subconjunto `RRULE` de ADR-018 §3: **la tabla, hecha código**. Parsea, normaliza y
// **rechaza nombrando la propiedad exacta**.
//
// Por qué el parseo es nuestro (ADR-018, "lo que cuesta"): son cinco propiedades y un `split`.
// Lo que ninguna biblioteca hace por nosotros es la mitad que de verdad importa aquí —
// **rechazar**—, porque todas aceptan un superconjunto enorme (`BYSETPOS`, `BYWEEKNO`,
// `RSCALE`, calendarios no gregorianos) que este proyecto ha decidido no soportar.
//
// **El allowlist es la decisión de diseño, no un detalle de implementación.** Se aceptan cinco
// nombres y todo lo demás se rechaza por el nombre con que venga escrito. Una lista de
// prohibidos habría dejado pasar la siguiente propiedad que el RFC (o RFC 7529) publique, en
// silencio y con la forma equivocada.

import { Temporal } from "./temporal.ts";

/** Las cuatro frecuencias del subconjunto. `HOURLY`, `MINUTELY` y `SECONDLY` se rechazan. */
export type Frecuencia = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

/** Día de la semana **sin prefijo numérico**: `3TU` y `-1FR` están fuera del subconjunto. */
export type DiaSemana = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

/** Una `RRULE` del subconjunto, ya validada y con `INTERVAL` normalizado a su valor implícito. */
export interface ReglaRrule {
  readonly freq: Frecuencia;
  /** Entero ≥ 1. Ausente en el texto significa 1, y aquí ya vale 1: nadie vuelve a decidirlo. */
  readonly interval: number;
  /** Solo puede estar presente con `FREQ=WEEKLY`. Sin él, el día lo pone el ancla. */
  readonly byDay?: readonly DiaSemana[] | undefined;
  readonly count?: number | undefined;
  /** Instante UTC, nunca una fecha civil: ADR-003 prohíbe una fecha civil sin zona. */
  readonly until?: Temporal.Instant | undefined;
}

/**
 * Rechazo del subconjunto, **con la propiedad culpable en un campo**, no solo en el texto.
 *
 * El campo existe porque el criterio de la fase pide un error "que nombre la propiedad exacta",
 * y comprobar eso contra una subcadena del mensaje ata los tests a la redacción: cualquiera que
 * mejore el castellano de un mensaje rompería la suite y aprendería a no comprobarlo.
 */
export class ErrorRecurrencia extends Error {
  readonly propiedad: string;

  constructor(propiedad: string, detalle: string) {
    super(`${propiedad}: ${detalle}`);
    this.name = "ErrorRecurrencia";
    this.propiedad = propiedad;
  }
}

/** Las cinco propiedades aceptadas. Todo lo demás se rechaza con su propio nombre. */
const ACEPTADAS: ReadonlySet<string> = new Set(["FREQ", "INTERVAL", "BYDAY", "COUNT", "UNTIL"]);

const FRECUENCIAS: readonly string[] = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];

/** En orden ISO: el índice es `dayOfWeek - 1`, y ese orden es el que fija `WKST=MO`. */
export const DIAS_SEMANA: readonly DiaSemana[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/** `MO` → 0 … `SU` → 6. El desplazamiento desde el lunes de su semana. */
export function desplazamientoDesdeLunes(dia: DiaSemana): number {
  return DIAS_SEMANA.indexOf(dia);
}

const CON_PREFIJO_NUMERICO = /^[+-]?\d+[A-Z]{2}$/;
const ENTERO_SIN_SIGNO = /^\d+$/;

function enteroPositivo(propiedad: string, valor: string): number {
  // Un solo regex cubre los tres rechazos de T-30 y por la misma razón: `0`, `-1` y `1.5` no
  // son "entero ≥ 1". El `1.5` es el que se cuela con `parseInt`, que devuelve 1 sin quejarse.
  if (!ENTERO_SIN_SIGNO.test(valor)) {
    throw new ErrorRecurrencia(propiedad, `"${valor}" no es un entero sin signo`);
  }
  const numero = Number(valor);
  if (numero < 1) {
    throw new ErrorRecurrencia(propiedad, `"${valor}" no es ≥ 1`);
  }
  return numero;
}

function analizarByDay(valor: string, freq: Frecuencia): readonly DiaSemana[] {
  // `FREQ=MONTHLY;BYDAY=MO` se rechaza AUNQUE sea expresable: significa "todos los lunes de
  // cada mes", que es `FREQ=WEEKLY;BYDAY=MO`. Rechazarlo deja una sola forma canónica por
  // patrón y elimina el camino de expansión más caro (ADR-018 §3).
  if (freq !== "WEEKLY") {
    throw new ErrorRecurrencia(
      "BYDAY",
      `solo se acepta con FREQ=WEEKLY, y esta regla es FREQ=${freq}; ` +
        "la forma canónica de ese patrón es FREQ=WEEKLY con el mismo BYDAY",
    );
  }

  const dias: DiaSemana[] = [];
  for (const bruto of valor.split(",")) {
    const token = bruto.trim().toUpperCase();
    if (!(DIAS_SEMANA as readonly string[]).includes(token)) {
      // Se distingue el prefijo numérico del token basura porque son dos decisiones distintas:
      // `3TU` es RFC 5545 legítimo que NOSOTROS excluimos (selección posicional, ADR-018 §3),
      // y `XX` no es nada. Quien lea el error tiene que poder saber cuál de las dos le pasó.
      throw new ErrorRecurrencia(
        "BYDAY",
        CON_PREFIJO_NUMERICO.test(token)
          ? `"${token}" lleva prefijo numérico; la selección posicional está fuera del subconjunto`
          : `"${token}" no es un día de la semana`,
      );
    }
    const dia = token as DiaSemana;
    if (dias.includes(dia)) {
      throw new ErrorRecurrencia("BYDAY", `"${dia}" aparece más de una vez`);
    }
    dias.push(dia);
  }
  return dias;
}

function analizarUntil(valor: string): Temporal.Instant {
  // Sin `Z` no es un instante. `Temporal.Instant.from` también lo rechazaría, pero con un
  // `RangeError` genérico: este mensaje dice cuál es el problema real, que es el mismo por el
  // que ADR-003 prohíbe una fecha civil sin zona en cualquier parte del modelo.
  if (!valor.endsWith("Z")) {
    throw new ErrorRecurrencia(
      "UNTIL",
      `"${valor}" no es un instante UTC: una fecha civil sin zona es ambigua (ADR-003)`,
    );
  }
  try {
    return Temporal.Instant.from(valor);
  } catch {
    throw new ErrorRecurrencia("UNTIL", `"${valor}" no es un instante ISO-8601`);
  }
}

/**
 * Texto de `RRULE` → regla del subconjunto, o `ErrorRecurrencia` nombrando la propiedad.
 *
 * Recibe el **valor** de la propiedad `RRULE` (`FREQ=WEEKLY;INTERVAL=2;…`), sin el prefijo
 * `RRULE:` ni la línea `DTSTART`, porque el ancla vive en su propia columna del modelo (02 §3)
 * y no dentro del texto de la regla.
 */
export function validarRrule(texto: string): ReglaRrule {
  const crudo = new Map<string, string>();
  for (const parte of texto.split(";")) {
    const igual = parte.indexOf("=");
    if (igual < 1) {
      throw new ErrorRecurrencia(
        parte.trim().toUpperCase() || "(vacío)",
        "no tiene la forma NOMBRE=VALOR",
      );
    }
    const nombre = parte.slice(0, igual).trim().toUpperCase();
    const valor = parte.slice(igual + 1).trim();
    if (crudo.has(nombre)) {
      // Sin esto, `FREQ=DAILY;FREQ=WEEKLY` se queda con la última en silencio.
      throw new ErrorRecurrencia(nombre, "aparece más de una vez");
    }
    if (!ACEPTADAS.has(nombre)) {
      throw new ErrorRecurrencia(
        nombre,
        "no pertenece al subconjunto de ADR-018 §3, que son exactamente " +
          "FREQ, INTERVAL, BYDAY, COUNT y UNTIL",
      );
    }
    crudo.set(nombre, valor);
  }

  const freqCrudo = crudo.get("FREQ");
  if (freqCrudo === undefined) {
    throw new ErrorRecurrencia("FREQ", "es obligatoria");
  }
  const freq = freqCrudo.toUpperCase();
  if (!FRECUENCIAS.includes(freq)) {
    throw new ErrorRecurrencia(
      "FREQ",
      `"${freqCrudo}" no está en {DAILY, WEEKLY, MONTHLY, YEARLY}`,
    );
  }

  const intervalCrudo = crudo.get("INTERVAL");
  const byDayCrudo = crudo.get("BYDAY");
  const countCrudo = crudo.get("COUNT");
  const untilCrudo = crudo.get("UNTIL");

  // RFC 5545 §3.3.10 los declara mutuamente excluyentes, y no es una formalidad: con los dos
  // presentes no hay una respuesta obvia sobre cuál manda, así que la regla se rechaza en vez
  // de elegir por el usuario.
  if (countCrudo !== undefined && untilCrudo !== undefined) {
    throw new ErrorRecurrencia(
      "COUNT+UNTIL",
      "COUNT y UNTIL son mutuamente excluyentes (RFC 5545 §3.3.10); esta regla trae los dos",
    );
  }

  return {
    freq: freq as Frecuencia,
    interval: intervalCrudo === undefined ? 1 : enteroPositivo("INTERVAL", intervalCrudo),
    byDay: byDayCrudo === undefined ? undefined : analizarByDay(byDayCrudo, freq as Frecuencia),
    count: countCrudo === undefined ? undefined : enteroPositivo("COUNT", countCrudo),
    until: untilCrudo === undefined ? undefined : analizarUntil(untilCrudo),
  };
}

/**
 * ADR-018 §6: **el ancla tiene que satisfacer la regla**, y se comprueba al escribir.
 *
 * No se "corrige sola" al lunes más cercano. RFC 5545 solo dice *should* sobre un `DTSTART` no
 * sincronizado y las bibliotecas del ecosistema **no coinciden entre sí** — `rrule-temporal`,
 * por ejemplo, acepta un ancla en domingo con `BYDAY=MO` y simplemente no la emite. Elegir por
 * el usuario sería inventarnos una convención silenciosa; rechazar es devolverle la pregunta.
 *
 * Solo `WEEKLY` con `BYDAY` puede fallar: en las otras tres frecuencias el ancla **define** el
 * día del conjunto y por tanto le pertenece siempre.
 */
export function validarAncla(regla: ReglaRrule, ancla: Temporal.PlainDate): void {
  if (regla.byDay === undefined) {
    return;
  }
  // Se compara por desplazamiento y no por nombre para no indexar `DIAS_SEMANA` con
  // `dayOfWeek - 1`: con `noUncheckedIndexedAccess` eso obliga a una rama `undefined` que
  // ningún test puede ejercitar, y una rama inalcanzable es cobertura que miente.
  const desplazamientos = new Set(regla.byDay.map((dia) => desplazamientoDesdeLunes(dia)));
  if (!desplazamientos.has(ancla.dayOfWeek - 1)) {
    throw new ErrorRecurrencia(
      "anchor_date",
      `${ancla.toString()} no pertenece al conjunto que genera la regla ` +
        `(BYDAY=${regla.byDay.join(",")})`,
    );
  }
}
