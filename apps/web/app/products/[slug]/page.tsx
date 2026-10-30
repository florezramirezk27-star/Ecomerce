"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import ProductImage from "@/components/ProductImage";
import VideoEmbed from "@/components/VideoEmbed";
import { isAuthenticated } from "@/lib/auth";
import { addToGuestCart } from "@/lib/guest-cart";
import { trackMetaEvent } from "@/lib/facebook-pixel";
import CandleInfographic from "@/components/CandleInfographic";
import CandleArtisanalInfographic from "@/components/CandleArtisanalInfographic";
import CountdownTimer from "@/components/CountdownTimer";
import { getOfferEndTime } from "@/lib/offer-countdown";
import CartToast, { useCartToast } from "@/components/CartToast";
import LandingFrame, { type LandingAddToCart } from "@/components/LandingFrame";
import { getLineUnitPrice } from "@/lib/product-promotion";

interface ProductVariation {
  id: number;
  name: string;
  stock: number;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: string | number;
  stock: number;
  image: string;
  gallery: string[];
  video?: string;
  videos?: string[];
  /** Presentaciones (talla/color) de un producto VARIABLE de Dropi. */
  variations?: ProductVariation[];
  /**
   * Landing larga pegada desde el admin (HTML/CSS/JS). Cuando viene con
   * contenido, se muestra debajo de la ficha del producto. `null`/vacio = la
   * ficha se ve normal.
   */
  landingCode?: string | null;
  category?: {
    id: string;
    name: string;
    slug: string;
  };
  similarProducts?: Product[];
}

function getYouTubeEmbed(url: string) {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/,
  );
  // `youtube-nocookie.com` es la variante que no rastrea antes de que el
  // visitante pulse reproducir. Va en el `frame-src` del CSP.
  return match
    ? `https://www.youtube-nocookie.com/embed/${match[1]}`
    : null;
}

function getVimeoEmbed(url: string) {
  const match = url.match(/vimeo\.com\/(\d+)/);
  // `dnt=1` es el equivalente en Vimeo: el reproductor no instala cookies de
  // analitica.
  return match
    ? `https://player.vimeo.com/video/${match[1]}?dnt=1`
    : null;
}

/**
 * Pide a Cloudinary la version optimizada de un video.
 *
 * Una URL de `res.cloudinary.com/.../upload/v.../archivo.mp4` sirve el MP4
 * crudo tal cual se subio: el video de Oftalmiel llega a 2.5 MB a bitrate
 * alto y el navegador tarda en arrancar la reproduccion. Con `q_auto`
 * Cloudinary entrega la version transcodificada (menos peso, arranque
 * rapido) y con `f_auto` el formato que el navegador prefiera (webm/av1 si
 * lo soporta). Si la URL ya trae transformaciones se respeta.
 */
function cloudinaryVideoUrl(url: string) {
  if (!url.includes("res.cloudinary.com/") || !url.includes("/upload/")) {
    return url;
  }
  if (url.includes("/q_auto") || url.includes("/f_auto")) return url;
  return url.replace("/upload/", "/upload/q_auto,f_auto/");
}

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cartLoading, setCartLoading] = useState(false);
  const [cartMessage, setCartMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  /**
   * Aviso flotante de "agregado al carrito".
   *
   * El mensaje del panel (arriba) no sirve en el movil: cuando el cliente
   * toca "Agregar" en la barra fija de abajo, el panel esta fuera de la
   * pantalla y el mensaje no se ve nunca. Este aviso sale pegado a la parte
   * baja de la pantalla, justo donde esta el boton que se acaba de tocar.
   */
  const { toast, show: mostrarToast } = useCartToast();
  /** Temporizador del mensaje del panel, para que no se quede ahi forever. */
  const panelTimerRef = useRef<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  /**
   * Presentacion elegida (`variation_id` de Dropi). `null` en productos
   * simples. Se inicializa a la primera con stock para que el boton de compra
   * quede listo sin un paso extra.
   */
  const [selectedVariationId, setSelectedVariationId] = useState<number | null>(
    null,
  );
  /**
   * Barra de compra fija en movil.
   *
   * En el movil el boton de "Agregar al carrito" queda muy arriba: entre la
   * galeria, la descripcion y las variaciones hay que desplazar bastante
   * para llegar. Con esta barra el cliente puede comprar en cualquier punto
   * de la ficha.
   *
   * Solo aparece cuando el boton original NO se ve: si los dos estuvieran a
   * la vez el cliente veria dos CTA para la misma accion. Para saberlo se
   * observa el boton con un `IntersectionObserver`.
   */
  const buyButtonRef = useRef<HTMLButtonElement>(null);
  const [showBuyBar, setShowBuyBar] = useState(false);
  /** El aviso de cookies esta ahi y es obligatorio: la barra se aparta. */
  const [consentBarVisible, setConsentBarVisible] = useState(false);
  /** El chat abierto se lleva el boton de cerrar, que esta en la misma zona. */
  const [chatOpen, setChatOpen] = useState(false);

  /**
   * Hora de fin de la oferta, compartida por el aviso "¡Compra ya!" de la ficha
   * y el contador de la landing. Se resuelve tras montar (no en el primer
   * render) para no romper la hidratacion: el primer render del servidor no
   * tiene `localStorage`, asi que no puede saber la hora.
   */
  const [offerEndTime, setOfferEndTime] = useState<number | undefined>(undefined);

  useEffect(() => {
    // En un microtask para no llamar a `setState` de forma sincrona dentro del
    // efecto (eso dispara renders en cascada). El primer render —el del
    // servidor— no tiene `localStorage`, asi que la hora se resuelve aqui.
    void Promise.resolve().then(() => setOfferEndTime(getOfferEndTime()));
  }, []);

  const allImages = product
    ? [product.image, ...(product.gallery || [])].filter(Boolean)
    : [];

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch(`/products/${slug}`);
        setProduct(data);
        const variations: ProductVariation[] = Array.isArray(data?.variations)
          ? data.variations
          : [];
        const firstAvailable =
          variations.find((v) => v.stock > 0) ?? variations[0] ?? null;
        setSelectedVariationId(firstAvailable ? firstAvailable.id : null);
        setQuantity(1);
        setError(null);
      } catch {
        setError("No pudimos cargar el producto. Intenta más tarde.");
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  useEffect(() => {
    if (!product) return;
    const value = Number(product.price);
    void trackMetaEvent("ViewContent", {
      content_ids: [product.id],
      content_name: product.name,
      content_type: "product",
      value,
      currency: "COP",
    });
  }, [product]);

  /* Observa el boton de compra del panel: mientras este a la vista no hace
     falta la barra fija de abajo. El margen superior de -72px sube un poco
     el punto de corte para que la barra no aparezca en el momento exacto
     en que el boton sale por el borde superior de la pantalla. */
  useEffect(() => {
    const button = buyButtonRef.current;
    if (!button) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setShowBuyBar(!entry.isIntersecting);
      },
      { rootMargin: "-72px 0px 0px 0px", threshold: 0 },
    );

    observer.observe(button);
    return () => observer.disconnect();
  }, [product]);

  /* La barra fija ocupa la parte baja de la pantalla, justo donde esta el
     boton flotante del chat. Se avisa al chat para que se aparte mientras la
     barra este visible. Al salir de la pagina se avisa con `false` para que
     el chat vuelva a su sitio. */
  useEffect(() => {
    function avisar(visible: boolean) {
      window.dispatchEvent(
        new CustomEvent("store:bottom-bar", { detail: { visible } }),
      );
    }

    avisar(showBuyBar);
    return () => avisar(false);
  }, [showBuyBar]);

  /* El aviso de cookies tambien ocupa la parte baja de la pantalla y, como
     es obligatorio, tiene prioridad: mientras este visible la barra de
     compra se esconde para que el aviso se pueda leer y aceptar. */
  useEffect(() => {
    function onConsentBarChange(event: Event) {
      const detail = (event as CustomEvent<{ visible?: boolean }>).detail;
      setConsentBarVisible(Boolean(detail?.visible));
    }

    window.addEventListener("store:consent-bar", onConsentBarChange);
    return () =>
      window.removeEventListener("store:consent-bar", onConsentBarChange);
  }, []);

  /* Con el chat abierto su boton de cerrar queda en la parte baja de la
     pantalla, justo donde va la barra de compra. */
  useEffect(() => {
    function onChatOpen(event: Event) {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      setChatOpen(Boolean(detail?.open));
    }

    window.addEventListener("store:chat-open", onChatOpen);
    return () => window.removeEventListener("store:chat-open", onChatOpen);
  }, []);

  /**
   * Muestra el resultado de una accion en los dos sitios: el mensaje dentro
   * del panel de compra y el aviso flotante de la parte baja de la pantalla.
   */
  function mostrarAviso(type: "success" | "error", text: string) {
    setCartMessage({ type, text });
    mostrarToast(type, text);

    if (panelTimerRef.current) window.clearTimeout(panelTimerRef.current);
    panelTimerRef.current = window.setTimeout(() => {
      setCartMessage(null);
      panelTimerRef.current = null;
    }, 3000);
  }

  /* Al salir de la pagina se cancela el temporizador: si no, React avisa de
     un cambio de estado en un componente ya desmontado. */
  useEffect(() => {
    return () => {
      if (panelTimerRef.current) window.clearTimeout(panelTimerRef.current);
    };
  }, []);

  const handleAddToCart = async (
    overrideQuantity?: number,
    opts?: { promotion?: boolean },
  ) => {
    if (!product) return false;
    const qty = Math.max(1, overrideQuantity ?? quantity);
    /* Solo la compra hecha desde el selector de promociones de la landing
       trae `promotion`: esa cobra el precio de oferta por cantidad. El boton
       normal de la ficha paga el precio unitario por la cantidad pedida. */
    const promotion = opts?.promotion === true;
    const unitPrice = getLineUnitPrice(product, qty, promotion);
    const selectedVariation =
      (product.variations ?? []).find((v) => v.id === selectedVariationId) ??
      null;
    const variationId = selectedVariation?.id ?? 0;
    const variationName = selectedVariation?.name ?? null;
    const contentName = selectedVariation
      ? `${product.name} - ${selectedVariation.name}`
      : product.name;
    const unidades =
      qty === 1
        ? "1 unidad agregada al carrito"
        : `${qty} unidades agregadas al carrito`;

    if (!isAuthenticated()) {
      addToGuestCart({
        productId: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        slug: product.slug,
        quantity: qty,
        variationId,
        variationName,
        promotion,
      });
      void trackMetaEvent("AddToCart", {
        content_ids: [product.id],
        content_name: contentName,
        content_type: "product",
        value: unitPrice * qty,
        currency: "COP",
      });
      mostrarAviso("success", `✓ ${unidades}`);
      return true;
    }

    setCartLoading(true);
    try {
      await apiFetch("/cart/add", {
        method: "POST",
        body: JSON.stringify({
          productId: product.id,
          quantity: qty,
          variationId,
          promotion,
        }),
      });

      /* Avisa al resto de la pagina (p. ej. el contador del carrito en la
         cabecera) que el carrito del servidor cambio. El carrito de
         invitado ya dispara este evento por su cuenta en `lib/guest-cart.ts`. */
      window.dispatchEvent(new Event("cart-change"));

      void trackMetaEvent("AddToCart", {
        content_ids: [product.id],
        content_name: contentName,
        content_type: "product",
        value: unitPrice * qty,
        currency: "COP",
      });

      mostrarAviso("success", `✓ ${unidades}`);
      return true;
    } catch (err) {
      mostrarAviso(
        "error",
        err instanceof Error ? err.message : "Error al agregar al carrito",
      );
      return false;
    } finally {
      setCartLoading(false);
    }
  };

  const handleLandingAddToCart = async (offer: LandingAddToCart) => {
    if (!product || cartLoading) return false;

    const requestedQuantity = Number(offer.quantity);
    if (
      !Number.isInteger(requestedQuantity) ||
      requestedQuantity < 1 ||
      requestedQuantity > 3
    ) {
      mostrarAviso("error", "Selecciona una promoción válida.");
      return false;
    }

    if (requestedQuantity > product.stock) {
      mostrarAviso(
        "error",
        `Solo hay ${product.stock} unidades disponibles para esta promoción.`,
      );
      return false;
    }

    const added = await handleAddToCart(requestedQuantity, {
      promotion: offer.promotion === true,
    });
    if (added) router.push("/cart");
    return added;
  };

  if (loading) {
    return (
      <main className="min-h-dvh bg-orange-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-gray-600">Cargando producto...</p>
        </div>
      </main>
    );
  }

  if (error || !product) {
    return (
      <main className="min-h-dvh bg-orange-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
            <h1 className="text-xl font-bold text-red-900 mb-2">
              {error ||
                "Producto no encontrado"}
            </h1>
            <p className="text-red-700 mb-4">
              Intenta buscar otro producto
            </p>
            <Link
              href="/"
              className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Volver al inicio
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const variations = product.variations ?? [];
  const hasLanding =
    Boolean(product.landingCode?.trim()) ||
    /oftalmiel/i.test(`${product.name} ${product.slug}`);
  const hasVariations = variations.length > 0;
  const selectedVariation =
    variations.find((v) => v.id === selectedVariationId) ?? null;
  // Con presentacion elegida manda su stock, no el total: el total es la suma de
  // todas y dejaria comprar una variante agotada.
  const availableStock = selectedVariation
    ? selectedVariation.stock
    : product.stock;
  const inStock = availableStock > 0;
  // Escala logaritmica, no lineal. Con `stock / 20` cualquier producto con mas
  // de 20 unidades clavaba la barra al 100% y se veia siempre igual, que es lo
  // mismo que no tener barra: aqui los stock van de 1 a 1500, tres ordenes de
  // magnitud, justo el rango donde una escala lineal no distingue nada. El log
  // reparte el 0-100% para que se vea la diferencia entre 5 y 50 unidades, que
  // es la que un comprador nota al mirar la ficha.
  const STOCK_BAR_MAX = 1000;
  const stockPercent = inStock
    ? Math.min(
        100,
        Math.round(
          (Math.log10(availableStock + 1) / Math.log10(STOCK_BAR_MAX + 1)) * 100,
        ),
      )
    : 0;
  const priceFormatted = Number(
    product.price,
  ).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }) + " COP";

  function formatDateRange(startDays: number, endDays: number) {
  const start = new Date();
  start.setDate(start.getDate() + startDays);
  const end = new Date();
  end.setDate(end.getDate() + endDays);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const dayOpts: Intl.DateTimeFormatOptions = { weekday: "short" };
  const startStr = start.toLocaleDateString("es-CO", dayOpts) + " " + start.toLocaleDateString("es-CO", opts);
  const endStr = end.toLocaleDateString("es-CO", opts);
  if (start.getMonth() === end.getMonth()) {
    return `${start.toLocaleDateString("es-CO", dayOpts)} ${start.getDate()} - ${end.getDate()} ${end.toLocaleDateString("es-CO", { month: "short" })}`;
  }
  return `${startStr} - ${endStr}`;
}

  // Eran tres bloques de JSX casi identicos que solo cambiaban en el degradado,
  // el icono, los textos y el rango de fechas. Con los datos juntos el marcado
  // se reduce a un `map` y las tres variantes quedan a la vista, que es donde se
  // tocan cuando se editan.
  const beneficios = [
    {
      titulo: "Despacho rápido",
      detalle: "Sale de bodega en 1 a 5 días",
      rango: [1, 5],
      gradiente: "from-blue-400 to-blue-600 shadow-blue-200",
      icono:
        "M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z",
    },
    {
      titulo: "Envío gratis",
      detalle: "En cualquier ciudad de Colombia",
      rango: [6, 10],
      gradiente: "from-emerald-400 to-emerald-600 shadow-emerald-200",
      icono:
        "M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z",
    },
    {
      titulo: "Pago seguro",
      detalle: "Pagas solo cuando recibes tu pedido",
      rango: [11, 15],
      gradiente: "from-purple-400 to-purple-600 shadow-purple-200",
      icono:
        "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
    },
  ];

type MediaItem =
  | { kind: "image"; src: string }
  | { kind: "video"; src: string; embed: string | null };

const mediaItems: MediaItem[] = [];
if (product) {
  for (const src of [product.image, ...(product.gallery || [])].filter(
    Boolean,
  )) {
    if (!mediaItems.some((m) => m.src === src)) {
      mediaItems.push({ kind: "image", src });
    }
  }
  const videoSources = [
    ...(product.videos || []),
    ...(product.video ? [product.video] : []),
  ].filter(Boolean);
  for (const src of videoSources) {
    if (!mediaItems.some((m) => m.src === src)) {
      mediaItems.push({
        kind: "video",
        src: cloudinaryVideoUrl(src),
        embed: getYouTubeEmbed(src) || getVimeoEmbed(src),
      });
    }
  }
}

const selectedMedia = mediaItems[selectedIndex] ?? null;

const isVideo = selectedMedia?.kind === "video";

  return (
    <main className="min-h-dvh bg-orange-50">
      <div className="bg-white border-b border-gray-200">
        <nav className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-2 text-sm">
          <Link
            href="/"
            className="text-blue-600 hover:underline"
          >
            Inicio
          </Link>
          <span className="text-gray-400">/</span>
          {product.category && (
            <>
              <span className="text-gray-600">
                {product.category.name}
              </span>
              <span className="text-gray-400">/</span>
            </>
          )}
          <span className="text-gray-900 font-medium truncate">
            {product.name}
          </span>
        </nav>
      </div>

      {/* `pb-28` en movil deja aire para la barra de compra fija de abajo,
          que si no taparia el ultimo bloque de la ficha. */}
      <div
        className={`max-w-7xl mx-auto px-6 pt-12 ${
          hasLanding ? "pb-0" : "pb-28 md:pb-12"
        }`}
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Volver
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {/* Columna de la imagen. Al ser un grid item con `align-items:stretch`
              (el default) ya mide lo que mide la columna de info, y `flex-1`
              reparte ese alto entre la imagen y las miniaturas de abajo.
              `min-h-*` es lo que impide que en movil colapse: ahi son dos
              filas, la imagen es el unico contenido en flujo de la primera y
              su alto minimo seria cero. */}
          <div className="flex flex-col gap-4">
            {/* `relative` no es cosmetico: ProductImage va con fill, que es
                position:absolute con inset:0. Sin un ancestro posicionado se
                mide contra el viewport entero y se sale de la tarjeta.

                El marco es CUADRADO y fijo para imagenes y videos: asi no
                quedan franjas blancas (o negras) cuando la media no coincide
                con la altura de la columna. `object-cover` recorta el
                sobrante en vez de dejarlo vacio. */}
            <div className="relative aspect-square w-full bg-white rounded-xl overflow-hidden shadow-sm border border-gray-200">
              {/* Se repite `selectedMedia?.kind === "video"` en vez de usar
                  `isVideo`: es esa comparacion en linea la que le dice a
                  TypeScript que `selectedMedia` no es null dentro de la rama. */}
              {selectedMedia?.kind === "video" ? (
                selectedMedia.embed ? (
                  <div className="w-full h-full">
                    <VideoEmbed
                      src={selectedMedia.embed}
                      title={`Video de ${product.name}`}
                    />
                  </div>
                ) : (
                  <video
                    key={selectedMedia.src}
                    src={selectedMedia.src}
                    controls
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover bg-black"
                  />
                )
              ) : (
                <ProductImage
                  key={selectedMedia?.src || product.image || "placeholder"}
                  src={selectedMedia?.src || product.image}
                  alt={product.name}
                  priority
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover"
                />
              )}
            </div>

            {mediaItems.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {mediaItems.map((item, i) =>
                  item.kind === "video" ? (
                    <button
                      key={item.src}
                      type="button"
                      onClick={() => setSelectedIndex(i)}
                      className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 bg-gray-900 flex items-center justify-center transition-all ${
                        selectedIndex === i
                          ? "border-blue-500 ring-2 ring-blue-200"
                          : "border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      key={item.src}
                      type="button"
                      onClick={() => setSelectedIndex(i)}
                      className={`relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                        selectedIndex === i
                          ? "border-blue-500 ring-2 ring-blue-200"
                          : "border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      <ProductImage
                        src={item.src}
                        alt={`${product.name} ${i + 1}`}
                        sizes="64px"
                        className="object-cover"
                      />
                    </button>
                  ),
                )}
              </div>
            )}

            {mediaItems.some((m) => m.kind === "video") &&
              allImages.length <= 1 &&
              selectedMedia?.kind !== "video" && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedIndex(
                      mediaItems.findIndex((m) => m.kind === "video"),
                    )
                  }
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-semibold"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Ver video del producto
                </button>
              )}
            </div>

          <div className="flex flex-col justify-between gap-6">
            {/* La ficha de compra entera (categoria, titulo, precio, contador,
                disponibilidad, cantidad, boton y "Lo que necesitas saber") va
                dentro de una tarjeta blanca para que se lea como un solo
                bloque sobre el fondo naranja de la pagina. */}
            <div className="flex flex-col gap-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            {product.category && (
              <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-3 py-1 rounded-full w-fit">
                {product.category.name}
              </span>
            )}

            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight leading-tight">
                {product.name}
              </h1>
              {product.description && (
                <p className="text-gray-600 mt-2.5 leading-relaxed">
                  {product.description}
                </p>
              )}
            </div>

            {/* El precio baja una escala y el titulo tambien, para que no
                compitan los dos. Antes los dos eran text-3xl font-extrabold y
                la mirada no sabia donde starting. */}
            <div className="flex items-end gap-3 flex-wrap">
              <div className="text-4xl font-extrabold text-gray-900 tracking-tight tabular-nums">
                {priceFormatted}
              </div>
              <span className="mb-1.5 inline-flex items-center gap-1 text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 px-2.5 py-1 rounded-full">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Mejor precio
              </span>
            </div>

            <CountdownTimer endTime={offerEndTime} />

            {/* Todo lo que ejecuta la compra vive en un solo panel: antes eran
                dos cajas (Disponibilidad y Cantidad) mas el boton suelto, y tres
                cajas apiladas se leen como adorno en vez de como una accion.
                Separadas por lineas de 1px, el panel se lee como una sola
                ficha con secciones. */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-gray-700">
                  Disponibilidad
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 text-sm font-bold ${
                    !inStock
                      ? "text-red-600"
                      : availableStock <= 10
                        ? "text-red-500"
                        : availableStock <= 20
                          ? "text-orange-500"
                          : "text-green-600"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      !inStock
                        ? "bg-red-500"
                        : availableStock <= 10
                          ? "bg-red-500 animate-pulse"
                          : availableStock <= 20
                            ? "bg-orange-400"
                            : "bg-green-500"
                    }`}
                  />
                  {!inStock
                    ? "Agotado"
                    : availableStock <= 10
                      ? `¡Solo quedan ${availableStock} unidades disponibles!`
                      : `${availableStock} en stock`}
                </span>
              </div>
              {inStock && (
                <div className="px-5 pb-4">
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-500 ${
                        availableStock <= 10
                          ? "bg-red-500"
                          : availableStock <= 20
                            ? "bg-orange-400"
                            : "bg-green-500"
                      }`}
                      style={{ width: `${stockPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {hasVariations && (
                <div className="px-5 py-3.5 border-t border-gray-100">
                  <span className="text-sm font-semibold text-gray-800">
                    Presentación
                  </span>
                  <p className="text-xs text-gray-500 mt-0.5 mb-2.5">
                    Elige la opción que quieres
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {variations.map((variation) => {
                      const isSelected = variation.id === selectedVariationId;
                      const outOfStock = variation.stock <= 0;
                      return (
                        <button
                          key={variation.id}
                          type="button"
                          onClick={() => {
                            setSelectedVariationId(variation.id);
                            setQuantity(1);
                          }}
                          disabled={outOfStock}
                          aria-pressed={isSelected}
                          className={`px-3.5 py-2 min-h-11 rounded-lg border text-sm font-medium transition ${
                            isSelected
                              ? "border-blue-600 bg-blue-50 text-blue-700"
                              : "border-gray-300 text-gray-700 hover:border-blue-400"
                          } ${
                            outOfStock
                              ? "opacity-40 cursor-not-allowed line-through"
                              : ""
                          }`}
                        >
                          {variation.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* El texto largo pasa a su propia linea en vez de competir con
                  el stepper por el ancho; con `min-w-0` el texto cede antes que
                  los botones, que son los que no deben deformarse. */}
              <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-gray-800">
                    Cantidad
                  </span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Selecciona cuántas unidades quieres
                  </p>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  {/* 44x44 (44px es el minimo que recomiendan Apple y
                      Material para un control tactil). Antes media 36px y en
                      el movil era facil tocar el boton equivocado. */}
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={!inStock}
                    className="w-11 h-11 rounded-lg border border-gray-300 hover:border-blue-500 hover:text-blue-600 active:bg-blue-50 disabled:opacity-40 flex items-center justify-center text-lg font-bold text-gray-700 transition"
                    aria-label="Disminuir cantidad"
                  >
                    −
                  </button>
                  <span className="w-10 text-center text-lg font-bold text-gray-900 tabular-nums">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setQuantity((q) => Math.min(availableStock, q + 1))
                    }
                    disabled={!inStock || quantity >= availableStock}
                    className="w-11 h-11 rounded-lg border border-gray-300 hover:border-blue-500 hover:text-blue-600 active:bg-blue-50 disabled:opacity-40 flex items-center justify-center text-lg font-bold text-gray-700 transition"
                    aria-label="Aumentar cantidad"
                  >
                    +
                  </button>
                </div>
              </div>

              {cartMessage && (
                <div
                  className={`mx-5 mb-3 p-3 rounded-lg text-sm ${
                    cartMessage.type === "success"
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  }`}
                >
                  {cartMessage.text}
                </div>
              )}

              {/* El boton va dentro del panel, con su propio padding para que
                  quede a la misma medida que las filas de arriba. `rounded-lg`
                  y no `rounded-xl` porque ya no esta suelto en la pagina: el
                  radio grande solo se nota pegado al borde del panel. */}
              <div className="p-3">
                <button
                  ref={buyButtonRef}
                  onClick={() => handleAddToCart()}
                  disabled={!inStock || cartLoading}
                  className={`w-full py-3.5 px-6 rounded-lg font-semibold text-white transition-all duration-200 flex items-center justify-center gap-2 ${
                    inStock
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-sm shadow-blue-600/20 hover:shadow-md hover:shadow-blue-600/30 active:scale-[0.99]"
                      : "bg-gray-400 cursor-not-allowed"
                  } ${
                    cartLoading ? "opacity-75 cursor-wait" : ""
                  }`}
                >
                  {cartLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Agregando...
                    </>
                  ) : inStock ? (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                      </svg>
                      Agregar al carrito
                    </>
                  ) : (
                    "Producto agotado"
                  )}
                </button>
              </div>
            </div>


            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-xs font-semibold text-gray-900 mb-4 uppercase tracking-wider text-left">
                Lo que necesitas saber
              </h3>
              {/* Los tres iconos en fila unidos por una linea, como linea de
                  tiempo. La linea va de 1/6 a 5/6 del ancho, que con tres
                  columnas iguales es justo el centro del primer y del ultimo
                  icono, y pasa por debajo del intermedio. Los iconos llevan un
                  anillo del color del fondo, asi que la linea se ve entrar y
                  salir de cada nodo en vez de cruzarlos por encima. */}
              <div className="relative">
                <div
                  aria-hidden="true"
                  className="absolute left-[16.666%] right-[16.666%] top-[18px] h-0.5 rounded-full bg-gradient-to-r from-blue-200 via-emerald-200 to-purple-200"
                />
                <div className="relative grid grid-cols-3 gap-2 sm:gap-3">
                  {beneficios.map((b) => (
                    /* `items-center` se queda aunque el texto sea izquierdo: la
                       linea de tiempo de arriba ancla los iconos al centro de su
                       columna, y si se alinearan a la izquierda la linea pasaria
                       al lado de los nodos en vez de cruzarlos. El texto si va a
                       la izquierda, y necesita `w-full` para que la alineacion se
                       note, porque sin esto el parrafo se ajusta al ancho del
                       texto y quedaria igual de centrado. */
                    <div
                      key={b.titulo}
                      className="flex flex-col items-center text-left gap-1.5"
                    >
                      <span
                        className={`w-9 h-9 shrink-0 rounded-full bg-gradient-to-br ${b.gradiente} ring-4 ring-orange-50 shadow-sm flex items-center justify-center`}
                      >
                        <svg
                          className="w-4 h-4 text-white"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d={b.icono} />
                        </svg>
                      </span>
                      <p className="w-full text-xs font-semibold text-gray-800 leading-tight">
                        {b.titulo}
                      </p>
                      <p className="w-full text-[11px] text-gray-500 leading-tight">
                        {b.detalle}
                      </p>
                      {/* Sin el "Llega" delante. Ese prefijo era lo que
                          obligaba a la pillora a letra diminuta: con tres
                          columnas y `whitespace-nowrap` la fecha completa no
                          cabia en movil y hubo que bajarla a 9px. */}
                      <span className="text-[9px] sm:text-[11px] font-semibold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                        {formatDateRange(b.rango[0], b.rango[1])}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            </div>

          </div>
        </div>
      </div>

      {/* La landing larga va DEBAJO de los productos similares, en todas las
          fichas: el visitante primero ve las alternativas (y puede salir a
          otra) y recien al final la landing completa. Antes iba antes y
          empujaba los similares fuera de pantalla. */}
      {product.similarProducts && product.similarProducts.length > 0 && (
        <div className="max-w-7xl mx-auto px-6 pb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Productos similares</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {product.similarProducts.map((sp) => (
              <Link
                key={sp.id}
                href={`/products/${sp.slug}`}
                className="group bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-all hover:-translate-y-1"
              >
                <div className="relative aspect-square bg-gray-100 overflow-hidden">
                  <ProductImage
                    src={sp.image}
                    alt={sp.name}
                    sizes="(max-width: 640px) 50vw, 25vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium text-gray-900 truncate">{sp.name}</p>
                  <p className="text-sm font-bold text-blue-600 mt-1">
                    {Number(sp.price).toLocaleString("es-CO")} COP
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {hasLanding && (
        <section className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden">
          <LandingFrame
            src={`/landing/${encodeURIComponent(product.slug)}`}
            title={`Landing de ${product.name}`}
            initialHeight={1200}
            offerEndTime={offerEndTime}
            onAddToCart={handleLandingAddToCart}
          />
        </section>
      )}

      {product.name === "Set de Velas Aromáticas" && <CandleInfographic />}
      {product.name === "Set de Velas Aromáticas" && <CandleArtisanalInfographic />}

      {/* Barra de compra fija (solo movil).
          Aparece cuando el boton del panel ya no se ve al desplazarse. Va
          por encima del chat flotante (`z-40` contra `z-50` del chat, pero el
          chat se aparta mientras esta barra este visible: se avisa con el
          evento `store:bottom-bar`). */}
      {showBuyBar && !consentBarVisible && !chatOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur md:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] text-gray-500">{product.name}</p>
              <p className="truncate text-sm font-bold text-gray-900">
                {priceFormatted}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleAddToCart()}
              disabled={!inStock || cartLoading}
              className={`flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-white transition active:scale-[0.99] ${
                inStock
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 shadow-sm shadow-blue-600/20"
                  : "bg-gray-400 cursor-not-allowed"
              } ${cartLoading ? "opacity-75 cursor-wait" : ""}`}
            >
              {cartLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Agregando...
                </>
              ) : inStock ? (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                  </svg>
                  Agregar
                </>
              ) : (
                "Agotado"
              )}
            </button>
          </div>
        </div>
      )}

      {/* Aviso flotante de "agregado al carrito".

          Sale pegado a la parte baja de la pantalla, encima de la barra de
          compra, porque es donde el cliente acaba de tocar. Es lo unico que
          se ve cuando se compra desde la barra: el mensaje del panel de
          compra esta fuera de la pantalla ahi. */}
      <CartToast toast={toast} />

    </main>
  );
}
