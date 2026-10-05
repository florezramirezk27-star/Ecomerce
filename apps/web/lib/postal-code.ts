/**
 * Busqueda del codigo postal de la direccion de envio.
 *
 * Google no sirve para esto: el Geocoding API de esta cuenta devuelve
 * REQUEST_DENIED porque el proyecto no tiene billing habilitado (lo mismo le
 * pasa a la Maps JavaScript API y al Static Maps). Se usa el geocodificador de
 * OpenStreetMap: es gratis, no pide llave y deja peticiones desde el navegador
 * (Access-Control-Allow-Origin: *).
 *
 * Nominatim va primero por velocidad: en pruebas respondio ~670ms contra los
 * ~6s que se tardo Photon con la misma direccion. Photon entra como respaldo
 * cuando Nominatim no encuentra nada.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const PHOTON_URL = "https://photon.komoot.io/api/";

/** Corta una consulta que se quedo colgada: el formulario sigue escribiendo.
 * Photon se tardo ~6s en las pruebas, por eso el tope no es mas bajo. */
const TIMEOUT_MS = 8000;

export interface PostalLookup {
  /** 5 o 6 digitos, o null si ninguna fuente supo la direccion. */
  zip: string | null;
  source: "nominatim" | "photon" | null;
}

/**
 * El codigo postal colombiano tiene 5 o 6 digitos. Devolver cualquier otra
 * cosa seria meter un dato roto en un pedido que despacha la transportadora,
 * asi que lo que no cuadre se descarta.
 */
function normalizeZip(value: unknown): string | null {
  const zip = String(value ?? "").trim();
  return /^\d{5,6}$/.test(zip) ? zip : null;
}

/** Forma que interesa de la respuesta de Nominatim (viene en arreglo). */
type NominatimResponse = Array<{ address?: { postcode?: unknown } }>;

/** Forma que interesa de la respuesta de Photon. */
type PhotonResponse = {
  features?: Array<{ properties?: { postcode?: unknown } }>;
};

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  // Si quien llamo cancelo (porque el cliente siguio escribiendo), se corta
  // tambien esta peticion.
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Busca el codigo postal de una direccion ya armada
 * ("Calle 10 40-78, Medellin, Antioquia, Colombia").
 *
 * Nunca lanza: si no hay internet o las dos fuentes fallan, devuelve zip null
 * y el formulario se queda con el campo vacio, que es opcional de todos modos.
 */
export async function lookupPostalCode(
  query: string,
  signal?: AbortSignal,
): Promise<PostalLookup> {
  const address = query.trim();
  if (address.length < 5) return { zip: null, source: null };

  try {
    const data = await getJson<NominatimResponse>(
      `${NOMINATIM_URL}?q=${encodeURIComponent(address)}` +
        "&format=jsonv2&addressdetails=1&limit=1&countrycodes=co",
      signal,
    );
    const zip = normalizeZip(data[0]?.address?.postcode);
    if (zip) return { zip, source: "nominatim" };
  } catch {
    // Sigue con Photon abajo: una fuente caida no debe tumbar la otra.
  }

  try {
    const data = await getJson<PhotonResponse>(
      `${PHOTON_URL}?q=${encodeURIComponent(address)}&limit=1`,
      signal,
    );
    const zip = normalizeZip(data?.features?.[0]?.properties?.postcode);
    if (zip) return { zip, source: "photon" };
  } catch {
    // Nada que hacer: el campo queda vacio.
  }

  return { zip: null, source: null };
}
