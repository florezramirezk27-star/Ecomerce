declare global {
  interface Window {
    fbq?: FbqFn;
    _fbq?: unknown;
  }
}

type FbqFn = { (...args: unknown[]): void } & {
  callMethod?: (...args: unknown[]) => void;
  push?: unknown;
  loaded?: boolean;
  version?: string;
  queue?: unknown[];
};

const FB_PIXEL_ID =
  process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID || "";

export function getFacebookPixelId(): string {
  return FB_PIXEL_ID;
}

export function isPixelEnabled(): boolean {
  return FB_PIXEL_ID.length > 0;
}

export function initFacebookPixel(): void {
  if (!isPixelEnabled() || typeof window === "undefined") return;
  if (window.fbq) return;

  const w = window as Window & { fbq?: FbqFn; _fbq?: unknown };
  const d = document;

  (function (
    f: Window & { fbq?: FbqFn; _fbq?: unknown },
    b: Document,
    e: string,
    v: string,
  ) {
    if (f.fbq) return;
    const n: FbqFn = (f.fbq = function (...args: unknown[]) {
      if (n.callMethod) n.callMethod(...args);
      else n.queue?.push(args);
    });
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    const t = b.createElement(e) as HTMLScriptElement;
    t.async = true;
    t.src = v;
    const s = b.getElementsByTagName(e)[0];
    s.parentNode?.insertBefore(t, s);
  })(w, d, "script", "https://connect.facebook.net/en_US/fbevents.js");

  w.fbq?.("init", FB_PIXEL_ID);
  w.fbq?.("track", "PageView");
}

export function firePixelEvent(
  name: string,
  data?: Record<string, unknown>,
): void {
  if (!isPixelEnabled() || typeof window === "undefined") return;
  if (!window.fbq) initFacebookPixel();
  window.fbq?.("track", name, data);
}

export interface MetaEventData {
  value?: number;
  currency?: string;
  content_ids?: (string | undefined)[];
  content_name?: string;
  content_type?: string;
  num_items?: number;
  email?: string;
  phone?: string;
}

/**
 * Dispara el evento en el pixel (lado cliente) y, en paralelo, lo reenvía
 * a la API de Conversiones (servidor) usando el MISMO eventID, para que Meta
 * deduplique y no cuente doble. Las credenciales (email/teléfono) se envían
 * solo al backend propio, que las hashea (SHA-256) antes de mandarlas a Meta.
 */
export async function trackMetaEvent(
  name: string,
  data: MetaEventData = {},
): Promise<void> {
  if (typeof window === "undefined") return;
  const eventId = crypto.randomUUID();

  const pixelData: Record<string, unknown> = {};
  if (data.value !== undefined) pixelData.value = data.value;
  if (data.currency) pixelData.currency = data.currency;
  if (data.content_ids) pixelData.content_ids = data.content_ids;
  if (data.content_name) pixelData.content_name = data.content_name;
  if (data.content_type) pixelData.content_type = data.content_type;
  if (data.num_items !== undefined) pixelData.num_items = data.num_items;
  pixelData.eventID = eventId;

  firePixelEvent(name, pixelData);

  try {
    const { apiFetch } = await import("./api");
    await apiFetch("/meta/track", {
      method: "POST",
      body: JSON.stringify({
        event: name,
        eventId,
        value: data.value,
        currency: data.currency,
        contentIds: data.content_ids,
        contentName: data.content_name,
        contentType: data.content_type,
        numItems: data.num_items,
        email: data.email,
        phone: data.phone,
      }),
    });
  } catch {
    // La analítica nunca debe romper la experiencia de usuario.
  }
}