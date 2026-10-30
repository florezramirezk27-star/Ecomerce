"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  /**
   * Se llama cuando la landing pide agregar su producto al carrito. La landing
   * vive en un iframe con origen opaco (sin `allow-same-origin`), asi que no
   * puede tocar el carrito ni las cookies de la tienda por si misma: solo puede
   * mandar un mensaje. El padre —que si tiene la sesion— decide que hacer.
   */
  onAddToCart?: (payload: LandingAddToCart) => boolean | Promise<boolean>;
  /**
   * Hora de fin (milisegundos) de la oferta, para que el contador de la landing
   * marque el mismo tiempo que el aviso "¡Compra ya!" de la ficha. La landing no
   * puede leer el `localStorage` de la tienda, asi que se lo manda el padre.
   */
  offerEndTime?: number;
}

/** Lo que una landing puede pedir al pulsar su boton de compra. */
export interface LandingAddToCart {
  productSlug?: string;
  comboName?: string;
  comboPrice?: number;
  quantity?: number;
  /**
   * `true` cuando la peticion sale del selector de promociones de la landing.
   * Solo en ese caso aplica el precio de oferta por cantidad: quien compra
   * desde la ficha del producto paga el precio normal por unidad aunque pida
   * las mismas unidades.
   */
  promotion?: boolean;
}

/**
 * Marca de los mensajes de alto. Debe coincidir con la del script que inyecta
 * `app/landing/[slug]/route.ts` para el modo `src`.
 */
const HEIGHT_MESSAGE = "kronio-landing-height";

/**
 * Marca del mensaje con el que la landing pide agregar al carrito. El boton de
 * compra de una landing que solo es HTML no tiene sesion ni acceso al carrito,
 * asi que manda esto al padre para que use la misma logica que el boton de la
 * ficha.
 */
const ADD_TO_CART_MESSAGE = "kronio-add-to-cart";

/**
 * Marca del mensaje con el que se manda a la landing la hora de fin de la
 * oferta. Debe coincidir con la del script que inyecta
 * `app/landing/[slug]/route.ts`.
 *
 * La landing vive en un iframe con origen opaco y NO puede leer el
 * `localStorage` de la tienda, asi que su contador no puede consultar la hora
 * que la tienda ya tiene guardada. Sin este mensaje cada uno contaba por su
 * cuenta y el aviso "¡Compra ya!" y el reloj de la landing marcaban horas
 * distintas; con el, los dos muestran exactamente el mismo tiempo.
 */
const DEADLINE_MESSAGE = "kronio-landing-deadline";

/** Alto minimo y maximo, para que un codigo con `height:100000px` no rompa la pagina. */
const MIN_HEIGHT = 240;
const MAX_HEIGHT = 20000;

/**
 * Script que manda el alto de la landing al padre. Solo se usa en el modo
 * `code` (vista previa); en el modo `src` el script ya lo inyecta la ruta.
 */
const RESIZE_SCRIPT = `<script>(function(){
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
  onAddToCart,
  offerEndTime,
}: LandingFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  /**
   * El listener de mensajes se registra una sola vez (el efecto no depende del
   * callback), asi que el callback vive en un ref para no quedar con la version
   * del primer render.
   */
  const onAddToCartRef = useRef(onAddToCart);

  useEffect(() => {
    onAddToCartRef.current = onAddToCart;
  }, [onAddToCart]);

  /**
   * La hora de fin de la oferta tambien vive en un ref: el efecto que registra
   * los listeners no depende de ella, y si cambiara (la oferta se renueva) no
   * hace falta re-registrar nada, solo reenviarla al cargar.
   */
  const offerEndTimeRef = useRef(offerEndTime);

  useEffect(() => {
    offerEndTimeRef.current = offerEndTime;
  }, [offerEndTime]);
  /**
   * `true` cuando el iframe termina de cargar. La landing tarda varios segundos
   * en pintar (su CSS y, sobre todo, su fuente de Google son render-blocking) y
   * durante ese rato el iframe se veia como un hueco; con este estado se muestra
   * un aviso de carga hasta que el documento esta listo.
   */
  const [loaded, setLoaded] = useState(false);

  // El modo `src` lo usa la tienda (fondo blanco y esquinas redondeadas); el
  // modo `code` es la vista previa del panel, que va a sangre. El `className`
  // que pase quien lo usa se anade al envoltorio (el iframe ya no lo recibe,
  // porque ahora el aspecto lo controla el contenedor).
  const wrapperClass = [
    "relative w-full overflow-hidden bg-white",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

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

    function sendCheckoutStatus(status: "loading" | "success" | "error") {
      try {
        frameRef.current?.contentWindow?.postMessage(
          { type: "kronio-checkout-status", status },
          "*",
        );
      } catch {
        // Si el iframe ya se desmonto, no hace falta notificarle.
      }
    }

    function onMessage(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as
        | { type?: string; height?: number }
        | (LandingAddToCart & { type?: string })
        | null;
      if (!data) return;

      // La landing pide agregar su producto al carrito. Se reenvia al padre por
      // el callback, que es quien tiene la sesion y la logica del carrito.
      if (data.type === ADD_TO_CART_MESSAGE) {
        const payload = data as LandingAddToCart;
        sendCheckoutStatus("loading");
        const addResult = onAddToCartRef.current?.({
          productSlug: payload.productSlug,
          comboName: payload.comboName,
          comboPrice: Number(payload.comboPrice) || undefined,
          quantity: Number(payload.quantity) || 1,
          promotion: payload.promotion === true,
        });
        Promise.resolve(addResult)
          .then((added) => sendCheckoutStatus(added ? "success" : "error"))
          .catch(() => sendCheckoutStatus("error"));
        return;
      }

      if (data.type !== HEIGHT_MESSAGE) return;
      // El script de la landing corrio: el documento ya existe, asi que el
      // aviso de carga ya no hace falta aunque el `onLoad` tarde.
      setLoaded(true);
      applyHeight(Number((data as { height?: number }).height));
    }

    window.addEventListener("message", onMessage);

    // Handshake: el script de la landing manda el alto en cuanto arranca, pero
    // si ese primer `postMessage` llega antes de que este listener exista, el
    // mensaje se pierde y el iframe se quedaria con el alto inicial. Al cargar
    // el iframe se le pregunta de nuevo el alto para no depender de la carrera.
    //
    // Aprovecha el mismo `load` para mandar la hora de fin de la oferta: la
    // landing ya tiene su listener (el script del puente se inyecta en el
    // `<head>`), asi que este es el punto fiable para que las dos cuentas atras
    // arranquen con el mismo valor.
    function syncLanding() {
      const win = frameRef.current?.contentWindow;
      if (!win) return;
      try {
        win.postMessage({ type: `${HEIGHT_MESSAGE}-request` }, "*");
      } catch {
        // El iframe puede estar en otro origen durante la carga; se reintenta
        // con el intervalo del propio script de la landing.
      }
      const endTime = offerEndTimeRef.current;
      if (endTime && endTime > 0) {
        try {
          win.postMessage({ type: DEADLINE_MESSAGE, endTime }, "*");
        } catch {
          // Idem: si no se puede, la landing se queda con su valor por defecto.
        }
      }
    }

    frame?.addEventListener("load", syncLanding);

    return () => {
      window.removeEventListener("message", onMessage);
      frame?.removeEventListener("load", syncLanding);
    };
  }, []);

  return (
    <div
      className={wrapperClass}
      style={{ minHeight: src ? undefined : initialHeight }}
    >
      {/* Aviso de carga. La landing vive en un iframe y tarda en pintar (su
          CSS y, sobre todo, su fuente de Google son render-blocking). Sin esto
          el usuario ve un hueco del color de la tienda y cree que no cargo; con
          esto ve que esta cargando y no recarga la pagina. Se oculta en cuanto
          el iframe avisa de su alto (o de que termino de cargar). */}
      {!loaded && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Cargando la ficha del producto…</p>
        </div>
      )}
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
        onLoad={() => setLoaded(true)}
        style={{ height: initialHeight, backgroundColor: "#ffffff" }}
        className="relative block w-full border-0"
      />
    </div>
  );
}
