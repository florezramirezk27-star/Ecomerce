"use client";

import { useEffect, useMemo, useRef } from "react";

/**
 * Muestra la landing de un producto (HTML/CSS/JS pegado por el admin) dentro de
 * un iframe aislado.
 *
 * Por que un iframe y no `dangerouslySetInnerHTML`:
 * - El CSS de una landing suele traer `body { ... }`, `* { ... }` y reglas
 *   globales que se filtrarian a toda la tienda y romperian el resto del sitio.
 * - Los `<script>` de la landing (contadores, selectores, acordeones) no se
 *   ejecutan con `dangerouslySetInnerHTML`: el navegador los ignora. En un
 *   iframe si corren.
 * - El `sandbox` corta lo que de verdad es peligroso: la landing NO puede
 *   navegar a la tienda ni al panel, no puede abrir ventanas, y no comparte
 *   cookies ni `localStorage` con el sitio. Se permite `allow-scripts` (para
 *   que funcione) pero a proposito NO `allow-same-origin`, que es lo que
 *   dejaria a la landing leer datos de la sesion.
 *
 * Dos modos:
 * - `src` (la tienda): apunta a `/landing/<slug>`, un documento que trae su
 *   propia CSP permisiva. Es lo que permite que la landing cargue CDNs, porque
 *   un `srcdoc` hereda la CSP estricta de la tienda y los bloquearia.
 * - `code` (vista previa del admin): el codigo aun no esta guardado, asi que se
 *   usa `srcdoc`. Aqui los CDNs externos pueden quedar bloqueados por la CSP
 *   del panel; es una limitacion conocida de la previsualizacion.
 */
interface LandingFrameProps {
  /** URL del documento de la landing (modo tienda). */
  src?: string;
  /** HTML completo de la landing (modo vista previa del admin). */
  code?: string;
  title: string;
  className?: string;
  /** Alto mientras el iframe reporta el suyo. */
  initialHeight?: number;
}

/**
 * Marca de los mensajes de alto. Debe coincidir con la del script que inyecta
 * `app/landing/[slug]/route.ts` para el modo `src`.
 */
const HEIGHT_MESSAGE = "kronio-landing-height";

/** Alto minimo y maximo, para que un codigo con `height:100000px` no rompa la pagina. */
const MIN_HEIGHT = 240;
const MAX_HEIGHT = 20000;

/**
 * Script que manda el alto de la landing al padre. Solo se usa en el modo
 * `code` (vista previa); en el modo `src` el script ya lo inyecta la ruta.
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

export default function LandingFrame({
  src,
  code,
  title,
  className,
  initialHeight = 900,
}: LandingFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  // El codigo del modo `code` se envuelve una sola vez por contenido. El iframe
  // se recrea cuando cambia (`key`), asi que no hace falta sincronizarlo a mano.
  const srcDoc = useMemo(() => {
    if (src || !code) return undefined;
    const withScript = /<\/body>/i.test(code)
      ? code.replace(/<\/body>/i, `${RESIZE_SCRIPT}</body>`)
      : `${code}${RESIZE_SCRIPT}`;
    const baseStyle =
      "<style>html,body{margin:0;padding:0;overflow-x:hidden;}</style>";
    return /<head>/i.test(withScript)
      ? withScript.replace(/<head>/i, `<head>${baseStyle}`)
      : `${baseStyle}${withScript}`;
  }, [src, code]);

  useEffect(() => {
    const frame = frameRef.current;

    function applyHeight(height: number) {
      if (!Number.isFinite(height) || height <= 0) return;
      const capped = Math.min(Math.max(height, MIN_HEIGHT), MAX_HEIGHT);
      if (frameRef.current) {
        frameRef.current.style.height = `${capped}px`;
      }
    }

    function onMessage(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { type?: string; height?: number } | null;
      if (!data || data.type !== HEIGHT_MESSAGE) return;
      applyHeight(Number(data.height));
    }

    window.addEventListener("message", onMessage);

    // Handshake: el script de la landing manda el alto en cuanto arranca, pero
    // si ese primer `postMessage` llega antes de que este listener exista, el
    // mensaje se pierde y el iframe se quedaria con el alto inicial. Al cargar
    // el iframe se le pregunta de nuevo el alto para no depender de la carrera.
    function requestHeight() {
      try {
        frameRef.current?.contentWindow?.postMessage(
          { type: `${HEIGHT_MESSAGE}-request` },
          "*",
        );
      } catch {
        // El iframe puede estar en otro origen durante la carga; se reintenta
        // con el intervalo del propio script de la landing.
      }
    }

    frame?.addEventListener("load", requestHeight);

    return () => {
      window.removeEventListener("message", onMessage);
      frame?.removeEventListener("load", requestHeight);
    };
  }, []);

  return (
    <iframe
      ref={frameRef}
      key={src ?? srcDoc}
      title={title}
      src={src}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
      // Sin `loading="lazy"`: la landing vive al final de una ficha larga y el
      // navegador no la cargaba hasta acercarse al final del scroll, asi que al
      // entrar al producto se veia un hueco en blanco y habia que recargar (con
      // el scroll ya abajo) para que apareciera. Cargarla junto a la ficha evita
      // ese "a la segunda".
      referrerPolicy="no-referrer"
      style={{ height: initialHeight }}
      className={className}
    />
  );
}
