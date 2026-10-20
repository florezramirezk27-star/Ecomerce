import { NextResponse } from "next/server";

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
    setInterval(send, 800);
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(start, 0);
  } else {
    document.addEventListener('DOMContentLoaded', start);
  }
})();</script>`;

/** Inserta el script de alto antes de `</body>` si existe, o al final. */
function withResizeScript(code: string): string {
  return /<\/body>/i.test(code)
    ? code.replace(/<\/body>/i, `${RESIZE_SCRIPT}</body>`)
    : `${code}${RESIZE_SCRIPT}`;
}

/** Documento minimo cuando el producto no tiene landing o no existe. */
function emptyDocument(mensaje: string): NextResponse {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:60vh;color:#94a3b8}</style>
</head><body><p>${mensaje}</p></body></html>`;
  return new NextResponse(withResizeScript(html), {
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

    const product = (await res.json()) as { landingCode?: string | null };
    const code = product?.landingCode?.trim();

    if (!code) {
      return emptyDocument("Landing no disponible.");
    }

    return new NextResponse(withResizeScript(code), {
      status: 200,
      headers: landingHeaders(),
    });
  } catch {
    return emptyDocument("Landing no disponible.");
  }
}
