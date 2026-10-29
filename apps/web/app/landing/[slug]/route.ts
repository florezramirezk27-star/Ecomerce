import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Sirve la landing larga de un producto (HTML/CSS/JS pegado por el admin) como
 * un documento aparte, para incrustarla en la ficha con `iframe`.
 *
 * Por que una ruta y no `srcdoc` en el cliente:
 * un iframe `srcdoc` HEREDA la CSP del documento padre, y la tienda tiene
 * `script-src 'self' 'unsafe-inline'` y `style-src 'self'`, asi que cualquier
 * landing que cargue un CDN (Tailwind, fuentes de Google, iconos) veria ese
 * recurso bloqueado y se romperia. Un documento servido desde su propia URL
 * puede traer SU PROPIA CSP permisiva, que aplica solo a la landing. La tienda
 * conserva su CSP estricta; el aislamiento real lo da el atributo `sandbox`
 * del iframe.
 *
 * Seguridad:
 * - La CSP permisiva solo cubre este documento; no toca al resto del sitio.
 * - El iframe va con `sandbox` y sin `allow-same-origin`, asi que la landing
 *   queda en un origen opaco: no lee cookies, ni `localStorage`, ni el DOM de
 *   la tienda, y no puede navegar a la tienda ni al panel.
 * - Solo se devuelve el `landingCode` de productos con landing; el resto
 *   responde un documento vacio, para que esto no funcione como proxy abierto.
 */

// La landing se configura desde el panel, asi que no se cachea en build. Se
// cachea en el edge un minuto para no pegarle al API en cada visita.
export const revalidate = 60;

const API_URL = process.env.API_URL || "http://localhost:3001";

/**
 * CSP de la landing. Es a proposito abierta: el codigo es del admin y puede
 * traer cualquier CDN. Lo que protege de verdad es el `sandbox` del iframe.
 * Igual se cierran las puertas que no hacen falta: nada de `frame-ancestors`
 * externos (`frame-ancestors 'self'` evita que otro sitio incruste la landing)
 * y `base-uri`/`form-action` acotados a si mismo.
 */
const LANDING_CSP = [
  "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'",
  "img-src * data: blob:",
  "media-src * data: blob:",
  "frame-ancestors 'self'",
];

/** Marca de los mensajes de alto; el padre ignora cualquier otro `postMessage`. */
const HEIGHT_MESSAGE = "kronio-landing-height";

/**
 * Marca del mensaje con el que la tienda manda la hora de fin de la oferta.
 *
 * La landing no puede leer el `localStorage` de la tienda (vive en un iframe
 * con origen opaco), asi que su contador se enteraba del tiempo por su cuenta y
 * marcaba horas distintas a las del aviso "¡Compra ya!" de la ficha. Con este
 * mensaje las dos cuentas atras son la misma: el padre manda su `endTime` y la
 * landing lo usa.
 */
const DEADLINE_MESSAGE = "kronio-landing-deadline";

/**
 * Script que guarda en `window.__kronioOfferDeadline` la hora de fin que manda
 * la tienda. Se inyecta ANTES que el codigo de la landing para que su contador
 * pueda leerlo en cuanto arranque; si el padre lo manda despues, tambien se
 * guarda y la landing puede escuchar `kronio-landing-deadline` para
 * actualizarse.
 *
 * Es agnostico del contador: la landing decide como usarlo. Si no dice nada, no
 * pasa nada: la landing se queda con su valor por defecto.
 */
const DEADLINE_BRIDGE_SCRIPT = `<script>(function(){
  window.__kronioOfferDeadline = window.__kronioOfferDeadline || 0;
  window.addEventListener('message', function(e){
    var d = e && e.data;
    if (d && d.type === '${DEADLINE_MESSAGE}' && Number(d.endTime) > 0) {
      window.__kronioOfferDeadline = Number(d.endTime);
      try {
        window.dispatchEvent(new CustomEvent('kronio-landing-deadline', { detail: Number(d.endTime) }));
      } catch(err){}
    }
  });
})();</script>`;

/**
 * Script que la landing ejecuta para avisar a la tienda de su alto real.
 *
 * Hace falta porque el iframe no puede leer el alto de un documento en origen
 * opaco: sin esto habria que fijar un alto a ojo y la landing saldria cortada o
 * con una franja blanca enorme. Se reenvía en cada cambio (`ResizeObserver`) y
 * por intervalo, para cubrir tambien acordeones y pestañas.
 *
 * El alto se mide como el borde inferior mas lejano de los hijos del `body`, no
 * con `scrollHeight`: `scrollHeight` nunca baja del alto del propio iframe, asi
 * que si el iframe empieza alto y el contenido es corto, jamas encogeria y
 * quedaria una franja blanca. Midiendo los hijos, el alto sigue al contenido en
 * ambos sentidos.
 */
const RESIZE_SCRIPT = `<script>(function(){
  function contentHeight(){
    var body = document.body;
    var html = document.documentElement;
    if (!body) return 0;
    var max = 0;
    var kids = body.children;
    for (var i = 0; i < kids.length; i++) {
      var r = kids[i].getBoundingClientRect();
      var bottom = r.bottom + (window.scrollY || 0);
      if (bottom > max) max = bottom;
    }
    // Respaldo por si el body trae margen o relleno propios.
    var styles = window.getComputedStyle(body);
    var extra = parseFloat(styles.paddingBottom || '0') + parseFloat(styles.marginBottom || '0');
    if (html && html.scrollHeight > max && kids.length === 0) max = html.scrollHeight;
    return Math.ceil(max + extra);
  }
  function send(){
    try{
      parent.postMessage({ type: '${HEIGHT_MESSAGE}', height: contentHeight() }, '*');
    }catch(e){}
  }
  function start(){
    send();
    if (window.ResizeObserver) {
      try { new ResizeObserver(send).observe(document.body); } catch(e){}
    }
    window.addEventListener('load', send);
    // El padre puede pedir el alto al terminar de cargar (handshake): asi no se
    // pierde el primer aviso si llego antes de que el padre tuviera su listener.
    window.addEventListener('message', function(e){
      var d = e && e.data;
      if (d && d.type === '${HEIGHT_MESSAGE}-request') send();
    });
    setInterval(send, 800);
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(start, 0);
  } else {
    document.addEventListener('DOMContentLoaded', start);
  }
})();</script>`;

/**
 * Fondo propio de la landing.
 *
 * El iframe no tiene fondo por si mismo: mientras el documento carga (la
 * landing tarda en resolver su CSS, su fuente de Google, etc.) el iframe es
 * transparente y se ve a traves el naranja de la tienda, que parece un hueco en
 * blanco. Con este fondo, el marco se ve limpio desde el primer instante y solo
 * cambia de color cuando pinta la landing.
 *
 * Va como `style` en el `body` y `background-color` en el `html` (no como
 * `background` en un `<style>` global) para que el propio CSS de la landing,
 * que suele traer `body { background-color: ... }`, siga ganando cuando cargue.
 */
const BASE_STYLE =
  "<style>html{background-color:#fff;}body{background-color:#fff;}</style>";

/**
 * Preconnect a los CDNs tipicos de una landing.
 *
 * La fuente de Google (`fonts.googleapis.com` + `fonts.gstatic.com`) es
 * render-blocking: el navegador no pinta el `body` hasta resolverla, y eso es
 * lo que hacia que el iframe se viera vacio durante varios segundos al entrar
 * al producto. Con `preconnect` se abre la conexion (TLS incluido) mientras se
 * parsea el HTML, con lo que la fuente llega antes y el pintado se adelanta.
 *
 * Es solo una pista: si la landing no usa ninguna de estas, no pasa nada.
 */
const PRECONNECT =
  "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">" +
  "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>";

/**
 * Prepara el HTML que se sirve.
 *
 * - Inyecta el fondo para que no se vea el hueco mientras carga.
 * - Adelanta la conexion a los CDNs mas comunes (fuente de Google).
 * - Inserta el script de alto antes de `</body>` si existe, o al final.
 */
function prepareDocument(code: string): string {
  const withScript = /<\/body>/i.test(code)
    ? code.replace(/<\/body>/i, `${RESIZE_SCRIPT}</body>`)
    : `${code}${RESIZE_SCRIPT}`;

  // El estilo base y el puente del deadline van al principio del `<head>`: el
  // estilo para que cualquier regla de la landing (mas abajo) lo sobreescriba, y
  // el puente para que ya este escuchando cuando el padre mande la hora.
  return /<head[^>]*>/i.test(withScript)
    ? withScript.replace(
        /<head[^>]*>/i,
        (m) => `${m}${BASE_STYLE}${PRECONNECT}${DEADLINE_BRIDGE_SCRIPT}`,
      )
    : `${BASE_STYLE}${PRECONNECT}${DEADLINE_BRIDGE_SCRIPT}${withScript}`;
}

/** Documento minimo cuando el producto no tiene landing o no existe. */
function emptyDocument(mensaje: string): NextResponse {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:60vh;color:#94a3b8}</style>
</head><body><p>${mensaje}</p></body></html>`;
  return new NextResponse(prepareDocument(html), {
    status: 200,
    headers: landingHeaders(),
  });
}

function landingHeaders(): HeadersInit {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": LANDING_CSP.join("; "),
    // El iframe de la tienda necesita poder incrustar este documento.
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // El slug llega por la URL: solo se acepta el mismo alfabeto que usa la
  // tienda para no armar una ruta rara contra el API.
  if (!/^[a-zA-Z0-9._-]+$/.test(slug)) {
    return emptyDocument("Landing no disponible.");
  }

  try {
    const res = await fetch(
      `${API_URL}/products/${encodeURIComponent(slug)}`,
      { cache: "no-store" },
    );

    if (!res.ok) {
      return emptyDocument("Landing no disponible.");
    }

    const product = (await res.json()) as {
      name?: string;
      slug?: string;
      landingCode?: string | null;
    };
    const isOftalmiel = `${product?.name ?? ""} ${product?.slug ?? ""}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .includes("oftalmiel");
    const code = isOftalmiel
      ? await readFile(
          path.join(
            process.cwd(),
            "public",
            "landing",
            "oftalmiel",
            "index.html",
          ),
          "utf8",
        )
      : product?.landingCode?.trim();

    if (!code) {
      return emptyDocument("Landing no disponible.");
    }

    return new NextResponse(prepareDocument(code), {
      status: 200,
      headers: landingHeaders(),
    });
  } catch {
    return emptyDocument("Landing no disponible.");
  }
}
