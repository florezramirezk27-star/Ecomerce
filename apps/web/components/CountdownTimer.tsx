"use client";

import { useState, useEffect, useRef } from "react";
import {
  getOfferEndTime,
  getOfferRemaining,
  type OfferRemaining,
} from "@/lib/offer-countdown";

/**
 * Aviso "¡Compra ya! Envio gratis si ordenas en:" con la cuenta atras de la
 * oferta.
 *
 * La hora de fin la decide `lib/offer-countdown` y se guarda en
 * `localStorage`, para que el tiempo no se reinicie al navegar. La landing del
 * producto (que vive en un iframe aislado y no puede leer ese `localStorage`)
 * recibe la misma hora por `postMessage` desde `LandingFrame`, asi que las dos
 * muestran siempre el mismo tiempo.
 */
export default function CountdownTimer({ endTime }: { endTime?: number }) {
  const endRef = useRef<number>(0);
  const [rem, setRem] = useState<OfferRemaining>(() =>
    getOfferRemaining(endTime ?? getOfferEndTime()),
  );

  useEffect(() => {
    // El padre puede fijar la hora (asi la landing y este aviso comparten el
    // mismo valor); si no, la decide el propio modulo.
    endRef.current = endTime && endTime > 0 ? endTime : getOfferEndTime();

    const tick = () => {
      const r = getOfferRemaining(endRef.current);
      setRem(r);
      // Vencida la oferta, se genera una nueva para no dejar el contador a cero.
      if (r.total <= 0) {
        endRef.current = getOfferEndTime();
      }
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endTime]);

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="border-2 border-orange-300/60 bg-gradient-to-r from-orange-50/90 to-amber-50/90 rounded-xl px-5 py-4 shadow-sm">
      <p className="text-xs sm:text-sm font-bold text-orange-700 uppercase tracking-wider mb-3 flex items-center gap-2">
        <svg className="w-4 h-4 text-orange-500 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-.5-13v4h-5v2h7V7h-2z" />
        </svg>
        ¡Compra ya! Envío gratis si ordenas en:
      </p>

      <div className="flex items-center justify-center gap-1.5 select-none">
        <div className="flex flex-col items-center">
          <span className="bg-gray-900 text-white font-bold text-3xl sm:text-4xl tabular-nums rounded-lg px-3 py-1.5 min-w-[4.5rem] text-center leading-none">
            {pad(rem.hours)}
          </span>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Horas</span>
        </div>

        <span className="text-3xl sm:text-4xl font-bold text-gray-900 mt-[-1.25rem] blinking-colon">:</span>

        <div className="flex flex-col items-center">
          <span className="bg-gray-900 text-white font-bold text-3xl sm:text-4xl tabular-nums rounded-lg px-3 py-1.5 min-w-[4.5rem] text-center leading-none">
            {pad(rem.minutes)}
          </span>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Minutos</span>
        </div>

        <span className="text-3xl sm:text-4xl font-bold text-gray-900 mt-[-1.25rem] blinking-colon">:</span>

        <div className="flex flex-col items-center">
          <span className="bg-gray-900 text-white font-bold text-3xl sm:text-4xl tabular-nums rounded-lg px-3 py-1.5 min-w-[4.5rem] text-center leading-none">
            {pad(rem.seconds)}
          </span>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">Segundos</span>
        </div>
      </div>
    </div>
  );
}
