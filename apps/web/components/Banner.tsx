"use client";

import { usePathname } from "next/navigation";
import { useId } from "react";
import { useMounted } from "@/lib/useMounted";

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

  // `usePathname()` no es fiable durante el prerenderizado estatico: en el
  // build de Vercel devuelve `null`, asi que el servidor renderiza el banner
  // como si estuviera en una ruta que no lo lleva. En el cliente devuelve "/" y
  // si lo pinta, React encuentra un arbol distinto al del servidor y lanza el
  // error de hidratacion (#418). Montamos el banner solo tras la hidratacion:
  // asi el primer render del cliente coincide con el del servidor (nada) y luego
  // aparece donde toca.
  const mounted = useMounted();
  if (!mounted) return null;
  if (pathname !== "/" && pathname !== "/products" && !pathname.startsWith("/products/")) return null;

  return (
    <div className="bg-gradient-to-r from-[#FCD116] via-[#FFCC00] to-[#FCD116] text-black overflow-hidden py-2.5 shadow-md border-b-2 border-[#CE1126]/40">
      {/* El aviso ocupa todo el ancho: antes habia un boton de cerrar (una X)
          a la derecha que lo recortaba y, en el movil, se confundia con un
          boton de la tienda. El mensaje se muestra entero y sin nada mas. */}
      <div className="animate-marquee whitespace-nowrap flex">
        <Aviso />
        <Aviso oculto />
        <Aviso oculto />
        <Aviso oculto />
      </div>
    </div>
  );
}
