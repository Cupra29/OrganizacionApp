// Álgebra de intervalos sobre la línea de instantes: solape, unión y resta.
//
// **Aquí no hay ni una zona horaria, y no es casualidad: es el punto.** Un intervalo es un par de
// instantes absolutos, la misma semántica que `tstzrange` en el esquema (02 §6.2). Todo el
// razonamiento sobre horas locales ya ocurrió antes, en `zona.ts`; a partir de aquí un cambio de
// horario no es un caso especial, es una jornada que dura 23 h en vez de 24 y nadie se entera.
//
// **Todos los intervalos son semiabiertos `[desde, hasta)`.** De ahí sale la regla que este
// archivo tiene que acertar y que es donde se cuelan los errores de un minuto:
//
//   - Dos intervalos que se TOCAN (`a.hasta == b.desde`) **no se solapan**: no comparten ni un
//     instante. `solapan` responde `false`, igual que el operador `&&` de PostgreSQL sobre dos
//     `tstzrange` semiabiertos — y tiene que ser igual, o el validador del motor y la base de
//     datos discreparían sobre qué es un solape.
//   - Esos mismos dos intervalos SÍ se fusionan en la unión, porque el conjunto de instantes que
//     ocupan entre los dos es contiguo y no tiene ningún agujero que enseñar.
//
//   Las dos afirmaciones son compatibles porque responden a preguntas distintas: `solapan`
//   pregunta "¿hay algún instante en los dos?" y `unir` pregunta "¿qué instantes ocupan entre
//   todos?". Confundirlas produce, según en qué dirección, un hueco fantasma de duración cero o
//   un solape que no existe.
//
// Un intervalo **vacío** (`hasta <= desde`) no contiene ningún instante, así que no ocupa tiempo,
// no solapa con nada y no aporta nada a una unión. Aparece de verdad: un `OVERRIDE` con
// `new_duration_minutes = 0` es una cancelación efectiva (02 §4.2) y produce uno.

import { Temporal } from "./temporal.ts";

/** Intervalo de instantes semiabierto `[desde, hasta)`, la misma semántica que `tstzrange`. */
export interface IntervaloInstantes {
  readonly desde: Temporal.Instant;
  readonly hasta: Temporal.Instant;
}

function antes(a: Temporal.Instant, b: Temporal.Instant): boolean {
  return Temporal.Instant.compare(a, b) < 0;
}

function menor(a: Temporal.Instant, b: Temporal.Instant): Temporal.Instant {
  return antes(a, b) ? a : b;
}

function mayor(a: Temporal.Instant, b: Temporal.Instant): Temporal.Instant {
  return antes(a, b) ? b : a;
}

/** Un intervalo semiabierto está vacío cuando no contiene NI UN instante. */
function esVacio(intervalo: IntervaloInstantes): boolean {
  return !antes(intervalo.desde, intervalo.hasta);
}

/**
 * ¿Comparten `a` y `b` al menos un instante?
 *
 * Se escribe como "la intersección no está vacía" —`max(inicios) < min(finales)`— y no como
 * `a.desde < b.hasta && b.desde < a.hasta`, que es la forma que circula y que **falla con un
 * intervalo vacío**: la segunda dice que `[12:00, 12:00)` solapa con `[11:00, 13:00)`, cuando el
 * primero no contiene ningún instante que pueda compartir.
 */
export function solapan(a: IntervaloInstantes, b: IntervaloInstantes): boolean {
  return antes(mayor(a.desde, b.desde), menor(a.hasta, b.hasta));
}

/**
 * El mismo conjunto de instantes, en su forma canónica: ordenado, sin solapes y sin vacíos.
 *
 * **Idempotente** (`unir(unir(x))` es `unir(x)`), que es lo que permite que `restar` la aplique
 * a su entrada sin que quien ya la aplicó —como hace 03 §3.2— pague nada por ello.
 *
 * No muta la entrada: `filter` ya devuelve un array nuevo y es ese el que se ordena.
 */
export function unir(intervalos: readonly IntervaloInstantes[]): readonly IntervaloInstantes[] {
  const ordenados = intervalos
    .filter((i) => !esVacio(i))
    .sort((a, b) => Temporal.Instant.compare(a.desde, b.desde));

  const salida: IntervaloInstantes[] = [];
  for (const intervalo of ordenados) {
    const ultimo = salida[salida.length - 1];
    // `ultimo.hasta < intervalo.desde` ESTRICTO: si son iguales los dos se tocan y se fusionan.
    // Con `<=` aquí, dos bloques consecutivos sin hueco entre medias saldrían como dos intervalos
    // y la resta emitiría entre ellos un hueco de duración cero.
    if (ultimo === undefined || antes(ultimo.hasta, intervalo.desde)) {
      salida.push({ desde: intervalo.desde, hasta: intervalo.hasta });
    } else {
      // `mayor` y no `intervalo.hasta`: el siguiente puede estar CONTENIDO en el acumulado
      // (`[08:00, 12:00)` seguido de `[09:00, 10:00)`), y entonces la unión no encoge.
      salida[salida.length - 1] = {
        desde: ultimo.desde,
        hasta: mayor(ultimo.hasta, intervalo.hasta),
      };
    }
  }
  return salida;
}

/**
 * `base` menos todo lo que ocupan los `sustraendos`: **los huecos**.
 *
 * Es la operación que consume 03 §3.2 —`restar(intervalo(jornada.wake, jornada.sleep),
 * unir(ocupado))`— y la firma encaja con esa llamada tal cual, sin adaptador. Que la llamada
 * traiga ya `unir` aplicado es correcto y no redundante: `unir` es idempotente y aquí se aplica
 * de todos modos, porque el barrido de abajo exige la entrada ordenada y sin solapes y esa
 * precondición no puede quedar en manos de quien llame.
 *
 * **Ningún hueco de duración cero sale de aquí**, ni entre dos ocupaciones contiguas ni cuando
 * una ocupación termina exactamente en `base.hasta`. Un hueco vacío no es tiempo libre: es una
 * frontera, y el colocador que lo recibiera intentaría meter algo en cero minutos.
 */
export function restar(
  base: IntervaloInstantes,
  sustraendos: readonly IntervaloInstantes[],
): readonly IntervaloInstantes[] {
  const huecos: IntervaloInstantes[] = [];
  let cursor = base.desde;

  for (const ocupado of unir(sustraendos)) {
    // Lo que empieza en `base.hasta` o después ya no puede recortar nada, y como la entrada está
    // ordenada, lo que venga detrás tampoco.
    if (!antes(ocupado.desde, base.hasta)) {
      break;
    }
    if (antes(cursor, ocupado.desde)) {
      huecos.push({ desde: cursor, hasta: ocupado.desde });
    }
    // `mayor` y no `ocupado.hasta`: una ocupación que termina ANTES del cursor —un compromiso
    // enteramente anterior a `wake`— no puede hacerlo retroceder.
    cursor = mayor(cursor, ocupado.hasta);
  }

  if (antes(cursor, base.hasta)) {
    huecos.push({ desde: cursor, hasta: base.hasta });
  }
  return huecos;
}
