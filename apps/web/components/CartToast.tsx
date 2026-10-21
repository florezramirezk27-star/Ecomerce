"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type CartToastType = "success" | "error";

export interface CartToastData {
  type: CartToastType;
  text: string;
}

/**
 * Aviso flotante de "agregado al carrito".
 *
 * Vive pegado a la parte baja de la pantalla, encima de la barra de compra,
 * porque es donde el cliente acaba de tocar. Es imprescindible en el movil:
 * cuando se compra desde la barra fija de la ficha, el panel de compra esta
 * fuera de la pantalla y el mensaje de ahi no se ve nunca.
 *
 * El boton de la tarjeta del carrusel y el de la ficha de producto usan
 * este mismo aviso, asi que la confirmacion es igual en todas partes.
 */
export default function CartToast({
  toast,
}: {
  toast: CartToastData | null;
}) {
  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      /* 6rem = 96px. Es la altura a la que hay que ponerlo para que no
         quede debajo del boton flotante del chat (64px de alto, pegado a
         24px del borde: su borde superior llega a los 88px) ni de la barra
         de compra (64px). */
      className="pointer-events-none fixed inset-x-0 z-50 mx-auto w-[calc(100%-1.5rem)] max-w-sm px-3 bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] animate-modal-in"
    >
      <div
        className={`pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl ring-1 ${
          toast.type === "success"
            ? "bg-emerald-600 text-white ring-emerald-500/40"
            : "bg-red-600 text-white ring-red-500/40"
        }`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20">
          {toast.type === "success" ? (
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          )}
        </span>

        <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">
          {toast.text}
        </p>

        <Link
          href="/cart"
          className="shrink-0 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/30 active:bg-white/40"
        >
          Ver carrito
        </Link>
      </div>
    </div>
  );
}

/**
 * Estado del aviso con auto-ocultado.
 *
 * El temporizador vive aqui y no en un `useEffect` dentro del componente
 * visible, para poder reiniciarlo en cada aviso nuevo: si el cliente toca
 * "Agregar" dos veces seguidas, el primer aviso no debe tapar al segundo.
 */
export function useCartToast(duracionMs = 3000) {
  const [toast, setToast] = useState<CartToastData | null>(null);
  const timerRef = useRef<number | null>(null);

  /* Al salir de la pagina se cancela el temporizador: si no, React avisa de
     un cambio de estado en un componente ya desmontado. */
  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  function show(type: CartToastType, text: string) {
    setToast({ type, text });

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, duracionMs);
  }

  function hide() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setToast(null);
  }

  return { toast, show, hide };
}
