"use client";

import { useState } from "react";

/**
 * Video embebido de terceros (YouTube, Vimeo) que no carga hasta que el
 * visitante pulsa reproducir.
 *
 * Un `<iframe>` con `loading="lazy"` sigue descargando solo: el tercero recibe
 * la IP, instala cookies y puede seguir la visita antes de que nadie haya
 * aceptado nada. Con esta fachada no sale ni una sola peticion a Google o
 * Vimeo hasta que hay un clic, que es el consentimiento que la Ley 1581 pide
 * para ese tratamiento. La miniatura tampoco se pide a `i.ytimg.com` por el
 * mismo motivo: se usa un fondo propio.
 */
export default function VideoEmbed({
  src,
  title,
}: {
  src: string;
  title: string;
}) {
  const [activate, setActivate] = useState(false);

  if (activate) {
    return (
      <iframe
        src={src}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="h-full w-full border-0"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setActivate(true)}
      className="group flex h-full w-full flex-col items-center justify-center gap-3 bg-gray-900 px-6 text-center text-white transition-colors hover:bg-gray-800"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-gray-900 shadow-xl transition-transform group-hover:scale-105">
        <svg className="ml-1 h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5.14v13.72a1 1 0 001.53.85l10.79-6.86a1 1 0 000-1.7L9.53 4.29A1 1 0 008 5.14z" />
        </svg>
      </span>
      <span className="text-sm font-bold">Ver el video</span>
      <span className="max-w-sm text-[11px] leading-relaxed text-white/70">
        Al reproducirlo se carga desde YouTube, que instalar&aacute; cookies
        propias. M&aacute;s informaci&oacute;n en nuestra pol&iacute;tica de
        privacidad.
      </span>
    </button>
  );
}
