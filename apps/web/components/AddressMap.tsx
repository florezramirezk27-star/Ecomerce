"use client";

import { useEffect, useState } from "react";

/**
 * Llave de Google Maps (Maps Embed API).
 *
 * Es PUBLICA por definicion: viaja al navegador y cualquiera puede leerla. Lo
 * que la protege es la restriccion por referrer configurada en la consola de
 * Google Cloud (dominio de Vercel + localhost), no el hecho de estar aca.
 *
 * Se usa el Embed API y no la Maps JavaScript API + Geocoding porque esas dos
 * exigen billing habilitado y con la misma llave devuelven REQUEST_DENIED; el
 * embed resuelve la direccion del servidor y no cobra.
 */
const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

/**
 * Espera (ms) despues de la ultima tecla antes de recargar el iframe. Cada
 * tecla disparando una carga completa del embed es lo que hacia que el mapa
 * se viera trabado; 500ms es lo justo para que no recargue en cada pulsacion
 * y aun asi el mapa salga pronto.
 */
const DEBOUNCE_MS = 500;

/**
 * Consulta con la que se precarga el embed apenas se abre el modal de checkout.
 * Vive fuera de pantalla y no se ve: solo sirve para dejar en el cache del
 * navegador el JS del embed y abrir la conexion con Google, de modo que cuando
 * la direccion si este completa el mapa salga casi de una.
 */
const WARMUP_QUERY = "Colombia";

interface AddressMapProps {
  address: string;
  city: string;
  state: string;
}

function buildUrl(query: string): string {
  if (!MAPS_KEY) {
    // Respaldo sin llave. Solo pasa si falta la variable de entorno; el
    // camino normal es el embed con la llave.
    return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed&hl=es`;
  }
  const params = new URLSearchParams({
    key: MAPS_KEY,
    q: query,
    language: "es",
    region: "co",
  });
  return `https://www.google.com/maps/embed/v1/place?${params.toString()}`;
}

/**
 * Vista previa del mapa con la direccion de entrega.
 *
 * No pinta nada hasta que el cliente tiene direccion + ciudad + departamento,
 * que es cuando la referencia sirve para confirmar el lugar.
 */
export default function AddressMap({ address, city, state }: AddressMapProps) {
  const trimmedAddress = address.trim();
  const trimmedCity = city.trim();
  const trimmedState = state.trim();
  const complete = Boolean(trimmedAddress && trimmedCity && trimmedState);
  const query = `${trimmedAddress}, ${trimmedCity}, ${trimmedState}, Colombia`;

  const [src, setSrc] = useState<string | null>(null);
  // La precarga corre una sola vez por apertura del modal: despues de eso ya
  // esta el JS de Google en cache y volver a cargarla no sirve de nada.
  const [warmed, setWarmed] = useState(false);

  useEffect(() => {
    // El reset tambien pasa por un temporizador: llamar a setSrc en el cuerpo
    // del effect dispara renders en cascada y eslint lo rechaza.
    const timer = setTimeout(
      () => setSrc(complete ? buildUrl(query) : null),
      complete ? DEBOUNCE_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [complete, query]);

  return (
    <>
      {/* Abrir la conexion con Google antes de que el iframe la necesite baja el
          tiempo de carga: DNS y TLS quedan resueltos de antemano. */}
      <link rel="preconnect" href="https://www.google.com" />
      <link rel="preconnect" href="https://maps.googleapis.com" />
      <link rel="preconnect" href="https://maps.gstatic.com" />

      {/* Precarga invisible: se monta al abrir el modal, mientras el cliente
          todavía no ha escrito la dirección, y se va al terminar de cargar. */}
      {!src && !warmed && (
        <iframe
          aria-hidden="true"
          tabIndex={-1}
          title="Precarga del mapa"
          src={buildUrl(WARMUP_QUERY)}
          onLoad={() => setWarmed(true)}
          style={{
            position: "absolute",
            width: 0,
            height: 0,
            border: 0,
            opacity: 0,
            overflow: "hidden",
            pointerEvents: "none",
          }}
        />
      )}

      {complete && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-700">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Ubicaci&oacute;n en el mapa
            </p>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs font-medium text-blue-600 transition hover:text-blue-700 hover:underline"
            >
              Abrir en Google Maps
            </a>
          </div>

          <div className="relative h-56 bg-gray-100 sm:h-64">
            {src ? (
              <iframe
                key={src}
                src={src}
                title={`Mapa de ${query}`}
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-gray-500">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                Buscando la direcci&oacute;n en el mapa&hellip;
              </div>
            )}
          </div>

          <p className="border-t border-gray-100 px-4 py-2.5 text-xs text-gray-400">
            Revisa que el pin caiga sobre tu direcci&oacute;n; as&iacute; el courier llega sin llamadas de confirmaci&oacute;n.
          </p>
        </div>
      )}
    </>
  );
}
