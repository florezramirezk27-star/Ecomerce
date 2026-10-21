"use client";

import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import { useMounted } from "@/lib/useMounted";

/**
 * Clave con la fecha en la que el cliente cerro el aviso.
 *
 * Se guarda una fecha y no una marca de "cerrado" para que el aviso vuelva a
 * aparecer pasado un tiempo: si el merchant cambia el mensaje (o al cliente
 * se le ofrece otra promo) no puede quedar bloqueado para siempre.
 */
const AVISO_CERRADO = "store-banner-cerrado";
/** Dias que el aviso permanece oculto despues de cerrarlo. */
const AVISO_CERRADO_DIAS = 3;

function leerCerrado(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const guardado = window.localStorage.getItem(AVISO_CERRADO);
    if (!guardado) return false;
    const fecha = Number(guardado);
    if (!Number.isFinite(fecha)) return false;
    const limite = Date.now() + AVISO_CERRADO_DIAS * 24 * 60 * 60 * 1000;
    if (fecha > limite) {
      window.localStorage.removeItem(AVISO_CERRADO);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function Flag() {
  /* El `id` del recorte tiene que ser unico: el aviso repite la bandera
     cuatro veces para que la marquesina no tenga cortes, y con un `id`
     fijo quedaban cuatro elementos con el mismo `id` en el documento. */
  const clipId = useId();

  return (
    <svg className="w-8 h-6 shrink-0 drop-shadow-md" viewBox="0 0 60 45" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <path d="M0 5 Q15 0 30 5 Q45 10 60 5 V40 Q45 35 30 40 Q15 45 0 40 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="60" height="45" fill="#FCD116" rx="2" />
        <rect y="15" width="60" height="15" fill="#003893" />
        <rect y="30" width="60" height="15" fill="#CE1126" />
      </g>
      <rect width="60" height="45" fill="none" stroke="#92400e" strokeWidth="1.5" rx="2" opacity="0.6" />
      <rect width="4" height="45" fill="#92400e" rx="1" />
      <circle cx="4" cy="22.5" r="3" fill="#d97706" stroke="#92400e" strokeWidth="0.8" />
    </svg>
  );
}

/**
 * Una copia del mensaje.
 *
 * `oculto` se usa para las copias que existen solo para que la marquesina
 * tenga material con el que desplazarse: un lector de pantalla las anuncia
 * cuatro veces seguidas si no se marcan.
 */
function Aviso({ oculto = false }: { oculto?: boolean }) {
  return (
    <span
      className="mx-4 flex items-center gap-2 shrink-0"
      aria-hidden={oculto ? "true" : undefined}
    >
      <Flag />
      <span className="font-bold text-sm md:text-base tracking-wide">
        🚚 Envíos gratis a todo Colombia, ¡solo por hoy!
      </span>
      <Flag />
    </span>
  );
}

export default function Banner() {
  const pathname = usePathname();
  /* El aviso se puede cerrar. Antes no habia forma de esconderlo: en un
     telefono el cliente perdia un alto fijo de la pantalla en cada pagina y
     no podia ni descartarlo ni seguir con lo suyo.

     El estado inicial se lee aqui y no en un efecto a proposito: como el
     banner no se pinta hasta que `useMounted()` dice que ya estamos en el
     cliente, leer `localStorage` en el inicializador no produce ningun
     desajuste de hidratacion (el servidor no pintó nada y el primer render
     del cliente tampoco). */
  const [cerrado, setCerrado] = useState(leerCerrado);

  // `usePathname()` no es fiable durante el prerenderizado estatico: en el
  // build de Vercel devuelve `null`, asi que el servidor renderiza el banner
  // como si estuviera en una ruta que no lo lleva. En el cliente devuelve "/" y
  // si lo pinta, React encuentra un arbol distinto al del servidor y lanza el
  // error de hidratacion (#418). Montamos el banner solo tras la hidratacion:
  // asi el primer render del cliente coincide con el del servidor (nada) y luego
  // aparece donde toca.
  const mounted = useMounted();
  if (!mounted) return null;
  if (cerrado) return null;
  if (pathname !== "/" && pathname !== "/products" && !pathname.startsWith("/products/")) return null;

  function cerrar() {
    setCerrado(true);
    try {
      window.localStorage.setItem(AVISO_CERRADO, String(Date.now()));
    } catch {
      // Sin `localStorage` (modo privado) el aviso se cierra solo en esta
      // pestana: es preferible a dejar el boton sin efecto.
    }
  }

  return (
    <div className="bg-gradient-to-r from-[#FCD116] via-[#FFCC00] to-[#FCD116] text-black overflow-hidden py-2.5 shadow-md border-b-2 border-[#CE1126]/40">
      <div className="flex items-center">
        <div className="animate-marquee whitespace-nowrap flex flex-1 min-w-0">
          <Aviso />
          <Aviso oculto />
          <Aviso oculto />
          <Aviso oculto />
        </div>

        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar aviso"
          className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center text-black/70 transition hover:text-black active:bg-black/10"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
