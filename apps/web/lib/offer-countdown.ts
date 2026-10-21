/**
 * Logica del contador de oferta, compartida por la tienda y las landings.
 *
 * El aviso "¡Compra ya! Envio gratis si ordenas en:" y el reloj de la cabecera
 * de una landing son la MISMA oferta, asi que tienen que marcar el mismo
 * tiempo. Antes cada uno contaba por su cuenta: el de la tienda sorteaba entre
 * 2 y 4 horas y el de la landing arrancaba en un valor fijo, asi que mostraban
 * horas distintas.
 *
 * Aqui vive la unica fuente de verdad: la hora de fin se guarda en
 * `localStorage` (`offer_countdown_end`) para que sobreviva a la navegacion y a
 * las recargas. La landing no puede leer ese `localStorage` (vive en un iframe
 * con origen opaco), asi que `LandingFrame` le manda el `endTime` por
 * `postMessage` y ella dibuja el mismo tiempo.
 */

export const OFFER_STORAGE_KEY = "offer_countdown_end";

/** Horas que dura la oferta cuando se genera una nueva. */
const OFFER_HOURS = 3;

/**
 * Devuelve la hora de fin de la oferta. Si ya habia una guardada y aun no ha
 * vencido, la respeta (asi el tiempo no se reinicia en cada visita). Si no hay
 * ninguna o ya vencio, crea una nueva y la guarda.
 *
 * Es idempotente dentro de una misma pagina: llamarla dos veces devuelve el
 * mismo valor mientras no venza.
 */
export function getOfferEndTime(): number {
  if (typeof window === "undefined") {
    return Date.now() + OFFER_HOURS * 3600000;
  }

  try {
    const saved = window.localStorage.getItem(OFFER_STORAGE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (Number.isFinite(parsed) && parsed > Date.now()) return parsed;
    }
  } catch {
    // `localStorage` puede estar bloqueado (modo privado, politica del
    // navegador). Sin el guardado se cae al calculo de abajo, que sigue
    // funcionando mientras la pagina viva.
  }

  const end = Date.now() + OFFER_HOURS * 3600000;
  try {
    window.localStorage.setItem(OFFER_STORAGE_KEY, String(end));
  } catch {
    // Idem: si no se puede guardar, el contador sigue andando en memoria.
  }
  return end;
}

export interface OfferRemaining {
  hours: number;
  minutes: number;
  seconds: number;
  /** Milisegundos que quedan. */
  total: number;
}

/** Descompone el tiempo restante hasta `end` en horas, minutos y segundos. */
export function getOfferRemaining(end: number): OfferRemaining {
  const total = Math.max(0, end - Date.now());
  return {
    hours: Math.floor(total / 3600000),
    minutes: Math.floor((total % 3600000) / 60000),
    seconds: Math.floor((total % 60000) / 1000),
    total,
  };
}

/** Formatea milisegundos restantes como `HH:MM:SS`. */
export function formatOfferRemaining(total: number): string {
  const safe = Math.max(0, total);
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    pad(Math.floor(safe / 3600000)),
    pad(Math.floor((safe % 3600000) / 60000)),
    pad(Math.floor((safe % 60000) / 1000)),
  ].join(":");
}
