/**
 * Consentimiento de cookies.
 *
 * En Colombia la Ley 1581 de 2012 y el Decreto 1377 exigen consentimiento
 * previo, expreso e informed para el tratamiento de datos con fines de
 * publicidad y analisis. El banner no es decorativo: mientras no exista una
 * decision guardada, `tracking` es `false` y ningun script de terceros se
 * carga (ver `lib/facebook-pixel.ts`).
 *
 * `essentials` nunca se apaga: sin esas cookies no hay carrito, ni sesion, ni
 * proteccion CSRF. Negarlas no es una opcion legal, asi que la UI las muestra
 * como fijas.
 */

export const CONSENT_STORAGE_KEY = "kronio.consent";

/**
 * Sube este numero cuando cambie la lista de cookies o la politica. La
 * version guardada dejara de coincidir, `readConsent` devolvera `null` y se
 * volvera a preguntar a todos los visitantes. Sin esto, agregar un proveedor
 * nuevo no podria pedir permiso a quien ya habia aceptado.
 */
export const CONSENT_VERSION = 2;

export type ConsentCategory = "essentials" | "tracking";

export interface ConsentState {
  version: number;
  /** ISO 8601. Queda como constancia de cuando se tomo la decision. */
  decidedAt: string;
  categories: Record<ConsentCategory, boolean>;
}

export type ConsentEvent =
  | { type: "decision"; state: ConsentState }
  | { type: "reset" }
  | { type: "open-preferences" };

/** Cookies que escribe Meta. Se borran al revocar el consentimiento. */
const META_COOKIES = ["_fbp", "_fbc"];

type Listener = (event: ConsentEvent) => void;

const listeners = new Set<Listener>();

/**
 * Instantanea para el render en servidor. Declara "ya decidido" a proposito:
 * asi el aviso no entra en el HTML inicial (lo que leeria un motor de
 * busqueda) y no parpadea en quien ya acepto. En el cliente `readConsent`
 * devuelve `null` y el aviso aparece de inmediato.
 */
export const SERVER_CONSENT: ConsentState = {
  version: CONSENT_VERSION,
  decidedAt: "",
  categories: { essentials: true, tracking: false },
};

/**
 * `undefined` = todavia no se leyo. Distinguirlo de `null` (leido, sin
 * decision) evita volver a golpear localStorage en cada evento del pixel.
 */
let cache: ConsentState | null | undefined;

let storageListenerInstalled = false;

function installStorageListener(): void {
  if (storageListenerInstalled || typeof window === "undefined") return;
  storageListenerInstalled = true;
  // Otra pestana guardo o borro la decision: invalidamos la cache para no
  // seguir creyendo en un estado viejo.
  window.addEventListener("storage", (e) => {
    if (e.key !== CONSENT_STORAGE_KEY) return;
    cache = undefined;
    emit({ type: "reset" });
  });
}

function emit(event: ConsentEvent): void {
  for (const listener of listeners) listener(event);
}

export function subscribeConsent(listener: Listener): () => void {
  listeners.add(listener);
  installStorageListener();
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Adaptador para `useSyncExternalStore`, que pide un callback sin argumentos.
 * Se suscribe a los tres tipos de evento porque `getSnapshot` ya devuelve el
 * estado nuevo cuando React los invoca.
 */
export function subscribeToConsent(onChange: () => void): () => void {
  return subscribeConsent(() => onChange());
}

function isConsentState(value: unknown): value is ConsentState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ConsentState>;
  return (
    candidate.version === CONSENT_VERSION &&
    typeof candidate.decidedAt === "string" &&
    !!candidate.categories &&
    typeof candidate.categories.tracking === "boolean"
  );
}

/** Decision guardada, o `null` si el visitante todavia no ha decidido. */
export function readConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  if (cache !== undefined) return cache;

  let state: ConsentState | null = null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isConsentState(parsed)) state = parsed;
      // Version vieja o JSON corrupto: se descarta y se vuelve a preguntar.
    }
  } catch {
    // localStorage puede estar bloqueado (modo privado, cookies de terceros
    // desactivadas). Sin persistencia el banner volvera a preguntar en cada
    // carga, que es el comportamiento correcto antes que asumir permiso.
    state = null;
  }

  cache = state;
  return state;
}

/**
 * `true` solo con permiso expreso para rastreo. Sin decision guardada es
 * `false`: navegar no equivale a consentir.
 */
export function hasTrackingConsent(): boolean {
  return readConsent()?.categories.tracking === true;
}

/** Persiste la decision. `essentials` se fuerza a `true` siempre. */
export function setConsent(tracking: boolean): ConsentState {
  const state: ConsentState = {
    version: CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
    categories: { essentials: true, tracking },
  };

  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Sin persistencia el permiso aplica solo a esta pestana y recarga.
  }

  cache = state;
  if (!tracking) revokeMetaCookies();
  emit({ type: "decision", state });
  return state;
}

/** Borra la decision para volver a preguntar. */
export function resetConsent(): void {
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {}
  cache = null;
  revokeMetaCookies();
  emit({ type: "reset" });
}

/** Le pide al banner que se abra en modo preferencias (enlace del footer). */
export function openCookiePreferences(): void {
  emit({ type: "open-preferences" });
}

/**
 * El script de Meta ya cargado no se puede descargar de la pagina, asi que
 * revocar consiste en borrar sus cookies. La cookie `_fbp` vive en nuestro
 * dominio (la escribe el pixel como cookie de terceros) y `_fbc` se crea al
 * hacer clic en un anuncio.
 */
function revokeMetaCookies(): void {
  if (typeof document === "undefined") return;
  for (const name of META_COOKIES) {
    for (const path of ["/", "/facebook.com", "/connect.facebook.net"]) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}; SameSite=Lax`;
    }
  }
}
