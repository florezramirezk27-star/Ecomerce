"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  openCookiePreferences,
  readConsent,
  SERVER_CONSENT,
  setConsent,
  subscribeConsent,
  subscribeToConsent,
} from "@/lib/consent";

function CookieIcon({ className = "h-7 w-7 text-amber-600" }: { className?: string }) {
  return (
    <svg
      className={`shrink-0 ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.6}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3a9 9 0 109 9 4.5 4.5 0 01-4.5-4.5A4.5 4.5 0 0112 3z"
      />
      <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="15" r="1" fill="currentColor" stroke="none" />
      <circle cx="14" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function RejectIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.9 12.1a2 2 0 01-2 1.9H7.9a2 2 0 01-2-1.9L5 7m5 4v6m4-6v6M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2"
      />
    </svg>
  );
}

const acceptClass =
  "rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition-all hover:from-blue-700 hover:to-indigo-700 hover:shadow-blue-600/40 active:scale-[0.99]";

const rejectClass =
  "flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-bold text-gray-700 transition-all hover:border-gray-400 hover:bg-gray-50 active:scale-[0.99]";

export default function CookieConsent() {
  // La decision vive fuera de React (localStorage). `useSyncExternalStore` la
  // lee sin `setState` en un efecto y mantiene el panel sincronizado con
  // cualquier cambio, venga de donde venga.
  const consent = useSyncExternalStore(
    subscribeToConsent,
    readConsent,
    () => SERVER_CONSENT,
  );

  // Abrir las preferencias no viene del almacenamiento sino de un click en el
  // footer, asi que ese bit si es estado del componente. `draft` es lo que el
  // visitante movio en el interruptor y todavia no ha guardado.
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [draft, setDraft] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const movedFocus = useRef(false);

  // Sin decision guardada el aviso es obligatorio: navegar no es consentir.
  const open = consent === null || prefsOpen;

  useEffect(() => {
    return subscribeConsent((event) => {
      if (event.type === "open-preferences") {
        setDraft(readConsent()?.categories.tracking === true);
        setPrefsOpen(true);
      } else if (event.type === "decision") {
        setPrefsOpen(false);
      } else {
        setDraft(false);
      }
    });
  }, []);

  // Mueve el foco al panel la primera vez para que un lector de pantalla lo
  // anuncie. Solo una vez: al reabrirlo desde el footer no se le quita el
  // foco al visitante de donde esta.
  useEffect(() => {
    if (!open || movedFocus.current) return;
    const panel = panelRef.current;
    if (!panel) return;
    movedFocus.current = true;
    panel.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      tabIndex={-1}
      className="animate-cookie-in fixed inset-x-0 bottom-0 z-[90] border-t border-gray-200 bg-white shadow-[0_-8px_30px_rgba(15,23,42,0.12)] focus:outline-none"
    >
      <div className="mx-auto max-w-7xl px-4 py-5 md:px-10">
        {prefsOpen ? (
          <PreferencesView
            tracking={draft}
            onTrackingChange={setDraft}
            onSave={() => setConsent(draft)}
            onReject={() => setConsent(false)}
            onAccept={() => setConsent(true)}
          />
        ) : (
          <NoticeView
            onConfigure={openCookiePreferences}
            onReject={() => setConsent(false)}
            onAccept={() => setConsent(true)}
          />
        )}
      </div>
    </div>
  );
}

function NoticeView({
  onConfigure,
  onReject,
  onAccept,
}: {
  onConfigure: () => void;
  onReject: () => void;
  onAccept: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
      <div className="flex gap-3.5">
        <CookieIcon />
        <div>
          <h2 id="cookie-consent-title" className="text-sm font-bold text-gray-900">
            Usamos cookies
          </h2>
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-gray-600">
            Las cookies esenciales hacen que la tienda funcione y no se pueden
            desactivar. Con tu permiso usamos cookies de Meta (Facebook Pixel)
            para medir el tr&aacute;fico y mostrarte anuncios relevantes.{" "}
            <Link
              href="/privacidad#cookies"
              className="font-semibold text-blue-600 underline underline-offset-2 hover:text-blue-700"
            >
              M&aacute;s informaci&oacute;n
            </Link>
          </p>
        </div>
      </div>

      {/* Rechazar tiene el mismo peso visual que aceptar: la SIC exige que
          negar sea tan facil como aceptar. */}
      <div className="flex shrink-0 flex-col gap-2.5 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onConfigure}
          className="order-3 rounded-xl px-2 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 sm:order-1"
        >
          Configurar
        </button>
        <button
          type="button"
          onClick={onReject}
          className={`${rejectClass} order-1 sm:order-2`}
        >
          <RejectIcon />
          Solo esenciales
        </button>
        <button
          type="button"
          onClick={onAccept}
          className={`${acceptClass} order-2 sm:order-3`}
        >
          Aceptar todo
        </button>
      </div>
    </div>
  );
}

function PreferencesView({
  tracking,
  onTrackingChange,
  onSave,
  onReject,
  onAccept,
}: {
  tracking: boolean;
  onTrackingChange: (value: boolean) => void;
  onSave: () => void;
  onReject: () => void;
  onAccept: () => void;
}) {
  return (
    <div>
      <div className="flex items-start gap-3.5">
        <CookieIcon />
        <div>
          <h2 id="cookie-consent-title" className="text-sm font-bold text-gray-900">
            Preferencias de cookies
          </h2>
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-gray-600">
            Elige qu&eacute; categor&iacute;as permites. Puedes cambiar tu
            decisi&oacute;n cuando quieras desde{" "}
            <Link
              href="/privacidad#cookies"
              className="font-semibold text-blue-600 underline underline-offset-2 hover:text-blue-700"
            >
              nuestra pol&iacute;tica de privacidad
            </Link>
            .
          </p>
        </div>
      </div>

      <ul className="mt-5 grid gap-3 md:grid-cols-2 md:gap-4">
        <li className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
          <div>
            <p className="text-xs font-bold text-gray-900">Esenciales</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              Carrito de compras, inicio de sesi&oacute;n, token anti-CSRF y
              seguridad anti-fraude. No requieren permiso.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-gray-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Siempre activas
          </span>
        </li>

        <li className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
          <div>
            <p className="text-xs font-bold text-gray-900">
              Anal&iacute;tica y publicidad
            </p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              P&iacute;xel de Meta (Facebook Pixel) para medir el tr&aacute;fico
              y mostrarte anuncios relevantes.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={tracking}
            aria-label="Permitir cookies de analítica y publicidad"
            onClick={() => onTrackingChange(!tracking)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors motion-reduce:transition-none ${
              tracking ? "bg-blue-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 motion-reduce:transition-none ${
                tracking ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </li>
      </ul>

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:justify-end">
        <button type="button" onClick={onReject} className={rejectClass}>
          <RejectIcon />
          Solo esenciales
        </button>
        <button type="button" onClick={onSave} className={acceptClass}>
          Guardar preferencias
        </button>
        <button type="button" onClick={onAccept} className={acceptClass}>
          Aceptar todo
        </button>
      </div>
    </div>
  );
}
