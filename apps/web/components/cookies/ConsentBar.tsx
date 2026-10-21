"use client";

import Link from "next/link";
import type { RefObject } from "react";
import {
  acceptButton,
  BrandMark,
  CheckIcon,
  ghostButton,
  outlineButton,
  RejectIcon,
  TuneIcon,
} from "./parts";

export default function ConsentBar({
  onAccept,
  onReject,
  onCustomize,
  containerRef,
}: {
  onAccept: () => void;
  onReject: () => void;
  onCustomize: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="region"
      aria-labelledby="cookie-consent-title"
      className="animate-cookie-in fixed inset-x-0 bottom-0 z-[90] bg-white shadow-[0_-10px_40px_rgba(15,23,42,0.14)] focus:outline-none"
    >
      {/* Filete con los colores de la bandera: el aviso se reconoce como de
          la tienda y no como una ventana del navegador. */}
      <div
        aria-hidden="true"
        className="h-[3px] w-full bg-gradient-to-r from-[#FCD116] via-[#CE1126] to-[#003893]"
      />

      <div className="mx-auto max-w-6xl px-4 py-4 md:px-8 md:py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
          <div className="flex gap-4">
            {/* En movil la marca sobra: el logo ya esta en la cabecera y lo
                que hace falta es que el aviso ocupe lo menos posible. */}
            <BrandMark className="hidden h-12 w-12 sm:flex" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">
                Aviso de privacidad
              </p>
              <h2
                id="cookie-consent-title"
                className="mt-1 text-base font-extrabold leading-snug tracking-tight text-gray-900 sm:text-lg"
              >
                Tu privacidad tambi&eacute;n es negocio nuestro
              </h2>
              <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-gray-600 sm:text-[13px]">
                Usamos cookies esenciales para que la tienda funcione. Con tu
                permiso{" "}
                <strong className="font-semibold text-gray-700">
                  tambi&eacute;n
                </strong>{" "}
                usar&iacute;amos el pixel de Meta para medir el tr&aacute;fico y
                mostrarte anuncios relevantes. Puedes rechazar, elegir una por
                una o consultar el detalle exacto en la{" "}
                <Link
                  href="/privacidad#cookies"
                  className="font-semibold text-blue-600 underline decoration-blue-600/30 underline-offset-2 transition-colors hover:text-blue-700 hover:decoration-blue-600"
                >
                  pol&iacute;tica de privacidad
                </Link>
                .
              </p>
            </div>
          </div>

          {/* Las tres acciones al mismo peso. Que sea mas facil negar que
              aceptar es una de las Observationes de la SIC.

              En movil van en dos columnas (y "Personalizar" ocupa la fila
              entera): en una sola columna eran tres botones de 44px apilados
              que empujaban el aviso a media pantalla y tapaban la tienda. */}
          <div className="grid shrink-0 grid-cols-2 gap-2.5 sm:flex sm:flex-row sm:items-center lg:flex-col lg:items-stretch">
            <button
              type="button"
              onClick={onAccept}
              className={`${acceptButton} order-1 px-3 text-[13px] sm:px-5 sm:text-sm lg:order-2`}
            >
              <CheckIcon />
              Aceptar todo
            </button>
            <button
              type="button"
              onClick={onReject}
              className={`${outlineButton} order-2 px-3 text-[13px] sm:px-5 sm:text-sm lg:order-3`}
            >
              <RejectIcon />
              Rechazar todo
            </button>
            <button
              type="button"
              onClick={onCustomize}
              className={`${ghostButton} order-3 col-span-2 sm:col-span-1 lg:order-1`}
            >
              <TuneIcon />
              Personalizar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
