"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { CATEGORIES } from "./catalog";
import {
  acceptButton,
  BrandMark,
  CheckIcon,
  ghostButton,
  outlineButton,
  RejectIcon,
  Switch,
} from "./parts";

export default function ConsentDialog({
  tracking,
  onTrackingChange,
  onReject,
  onSave,
  onClose,
  /** Cuando el aviso sigue abierto, cerrar el panel vuelve a la barra. */
  canGoBack,
}: {
  tracking: boolean;
  onTrackingChange: (value: boolean) => void;
  onReject: () => void;
  onSave: () => void;
  onClose: () => void;
  canGoBack: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Es un modal de verdad: atrapa el foco, Escape cierra y el fondo deja de
  // desplazarse. Sin esto el panel deja tabulando hacia contenido que queda
  // tapado por el fondo.
  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;

    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = node!.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), summary, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="animate-cookie-fade fixed inset-0 z-[95] flex items-end justify-center bg-gray-900/50 p-0 backdrop-blur-[3px] sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-prefs-title"
        tabIndex={-1}
        className="animate-cookie-rise flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl focus:outline-none sm:rounded-3xl"
      >
        <div
          aria-hidden="true"
          className="h-[3px] w-full shrink-0 bg-gradient-to-r from-[#FCD116] via-[#CE1126] to-[#003893]"
        />

        <header className="shrink-0 px-6 pb-5 pt-6 sm:px-8">
          <div className="flex items-start gap-4">
            <BrandMark />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">
                Centro de privacidad
              </p>
              <h2
                id="cookie-prefs-title"
                className="mt-1 text-xl font-extrabold tracking-tight text-gray-900"
              >
                Preferencias de cookies
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-gray-600">
                Decide qu&eacute; quieres que hagamos. Puedes cambiarlo cuando
                quieras desde{" "}
                <Link
                  href="/privacidad#cookies"
                  className="font-semibold text-blue-600 underline decoration-blue-600/30 underline-offset-2 hover:text-blue-700"
                >
                  el pie de la p&aacute;gina
                </Link>
                . Los datos que t&uacute; quieras autorizar se borran de tu
                navegador al instante.
              </p>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto border-t border-gray-100 px-6 py-5 sm:px-8">
          {CATEGORIES.map((category) => {
            const locked = category.locked === true;
            return (
              <section
                key={category.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white"
              >
                <div className="flex items-start justify-between gap-4 p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-gray-900">
                        {category.name}
                      </h3>
                      {category.vendor && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                          {category.vendor}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs font-medium text-blue-600">
                      {category.summary}
                    </p>
                    <p className="mt-2 text-[13px] leading-relaxed text-gray-600">
                      {category.purpose}
                    </p>
                  </div>

                  {locked ? (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                      Siempre activas
                    </span>
                  ) : (
                    <Switch
                      checked={tracking}
                      onChange={onTrackingChange}
                      label={`Permitir cookies de ${category.name.toLowerCase()}`}
                    />
                  )}
                </div>

                {/* Tabla real de cookies: nombre, para que y por cuanto. */}
                <details className="group border-t border-gray-100">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800">
                    <span>
                      {category.items.length}{" "}
                      {category.items.length === 1 ? "cookie" : "cookies"} y datos
                      guardados
                    </span>
                    <svg
                      className="h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none group-open:rotate-180"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </summary>
                  <div className="overflow-hidden border-t border-gray-100">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400">
                          <th scope="col" className="px-5 py-2 font-bold">
                            Nombre
                          </th>
                          <th scope="col" className="px-5 py-2 font-bold">
                            Para qu&eacute; sirve
                          </th>
                          <th scope="col" className="px-5 py-2 font-bold">
                            Duraci&oacute;n
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {category.items.map((item) => (
                          <tr key={item.name} className="align-top">
                            <td className="whitespace-nowrap px-5 py-2.5">
                              <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-700">
                                {item.name}
                              </code>
                            </td>
                            <td className="px-5 py-2.5 leading-relaxed text-gray-600">
                              {item.purpose}
                            </td>
                            <td className="whitespace-nowrap px-5 py-2.5 text-gray-500">
                              {item.duration}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </section>
            );
          })}

          <p className="pt-1 text-[11px] leading-relaxed text-gray-400">
            Datos tratados por Kronio Market, NIT 000.000.000-0, Bogot&aacute;,
            Colombia. Preguntas: kroniomarket@gmail.com
          </p>
        </div>

        <footer className="shrink-0 border-t border-gray-100 bg-gray-50/60 px-6 py-4 sm:px-8">
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            {canGoBack ? (
              <button
                type="button"
                onClick={onClose}
                className={ghostButton}
              >
                Volver
              </button>
            ) : (
              <span className="hidden sm:block" />
            )}

            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={onReject}
                className={outlineButton}
              >
                <RejectIcon />
                Rechazar todo
              </button>
              <button type="button" onClick={onSave} className={acceptButton}>
                <CheckIcon />
                Guardar mis preferencias
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
