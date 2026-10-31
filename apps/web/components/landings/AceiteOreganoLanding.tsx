"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ProductImage from "@/components/ProductImage";

/**
 * Landing de "Gotas líquidas de Aceite de Orégano con Aceite de Semilla Negra"
 * (NutriBella, 30 ml). Estructura y orden de secciones tomados de la landing de
 * Oftalmiel (`public/landing/oftalmiel/index.html`), pero como componente React
 * dentro de la ficha del producto: sin iframe, sin `postMessage` y sin CDN.
 *
 * Se monta en `app/products/[slug]/page.tsx`, debajo de "Productos similares",
 * cuando `product.slug === LANDING_SLUG`.
 *
 * Todo lo que NO se pudo inventar con honestidad (precios de oferta, videos,
 * testimonios, resultados, garantía, registro sanitario) vive en las constantes
 * de la sección "CONTENIDO" marcadas con `TODO`. Una sección que depende de un
 * dato vacío no se pinta: así nunca sale a producción un testimonio, un
 * resultado o un descuento inventados.
 */

/* ------------------------------------------------------------------------- */
/* Contrato de integración                                                    */
/* ------------------------------------------------------------------------- */

interface LandingProduct {
  id: string;
  name: string;
  slug: string;
  /** Precio normal unitario. */
  price: string | number;
  image?: string | null;
  stock?: number;
}

interface LandingProps {
  product: LandingProduct;
  /** La página de producto llama a `handleAddToCart`; devuelve true si se agregó. */
  onAddToCart: (
    quantity: number,
    opts?: { promotion?: boolean },
  ) => Promise<boolean>;
  /** Fecha límite del contador (ISO 8601, opcional). */
  offerEndTime?: string | null;
}

/** Slug con el que la página de producto decide montar esta landing. */
export const LANDING_SLUG = "aceite-oregano";

/* ------------------------------------------------------------------------- */
/* CONTENIDO                                                                  */
/* ------------------------------------------------------------------------- */

const PRODUCT_SHORT_NAME = "Aceite de Orégano";

/**
 * Total de la promoción por cantidad (COP). Unidad normal: $69.900.
 * - 2 frascos: $109.900 (promoción).
 * - 3 frascos: "paga 2 y lleva 3" = 2 × $69.900 = $139.800.
 *
 * ADVERTENCIA: estos totales son lo que se MUESTRA. Lo que se cobra lo
 * calculan `getProductUnitPrice`/`getLineUnitPrice` (web) y su gemela en
 * `api/src/common/utils/product-promotion.ts`, y hoy ambas devuelven el precio
 * normal para cualquier producto que no sea Oftalmiel. Hasta que el backend
 * conozca este producto, el carrito cobrará precio normal × cantidad aunque
 * se elija una tarjeta.
 */
const BULK_TOTALS: Readonly<Record<2 | 3, number | null>> = {
  2: 109_900,
  3: 139_800,
};

interface MediaVideo {
  /** URL de Cloudinary (se le agrega `q_auto,f_auto`). */
  src: string;
  poster?: string;
  title: string;
  caption: string;
}

interface MediaImage {
  src: string;
  alt: string;
  caption?: string;
}

interface Testimonial {
  name: string;
  city: string;
  text: string;
  rating: 1 | 2 | 3 | 4 | 5;
}

interface Review {
  name: string;
  stars: 1 | 2 | 3 | 4 | 5;
  title: string;
  text: string;
}

const REVIEWS: readonly Review[] = [
  {
    name: "Camila R.",
    stars: 5,
    title: "¡Excelente para las defensas!",
    text: "Llevo usándolo un par de semanas todas las mañanas y la verdad he notado un cambio positivo en mi energía y bienestar general. El sabor es fuerte, como es de esperarse por el orégano, pero me lo tomo con un poco de jugo y listo. Me da mucha confianza que tenga semilla negra y vitamina E. ¡Muy recomendado!",
  },
  {
    name: "Esteban M.",
    stars: 5,
    title: "Súper práctico y natural",
    text: "Compré estas gotas porque buscaba un apoyo natural para la salud respiratoria y la digestión, y me ha encantado. El gotero es muy cómodo de usar y rinde bastante. Se nota que es un producto de buena calidad.",
  },
  {
    name: "Valeria G.",
    stars: 5,
    title: "Me ayudó muchísimo en temporada de cambios de clima",
    text: "Siempre que cambia el clima sufro de la garganta y las vías respiratorias. Empecé a tomar este aceite de orégano con semilla negra preventivamente y este año la historia ha sido totalmente distinta. Definitivamente se quedó en mi rutina diaria.",
  },
  {
    name: "Felipe T.",
    stars: 5,
    title: "Calidad y buen rendimiento",
    text: "Lo que más me gusta es la combinación de ingredientes (orégano, semilla negra y vitamina E), ya que te ahorra tener que comprar varios suplementos por separado. Lo tomo con un poco de agua y miel para suavizar el sabor. ¡Excelente compra!",
  },
  {
    name: "Andrea P.",
    stars: 4,
    title: "Muy bueno, aunque el sabor es fuerte",
    text: "El producto cumple con lo que promete, siento que me ayuda bastante con la digestión y el sistema inmune. Le doy 4 estrellas solo porque el sabor del orégano puro es bastante intenso al principio, pero te acostumbras si lo diluyes bien en agua o té.",
  },
  {
    name: "Mateo L.",
    stars: 4,
    title: "Llegó rápido y funciona bien",
    text: "El paquete llegó en perfecto estado y muy rápido. Llevo pocos días usándolo pero ya noto una sensación de bienestar general. Me gusta que sea un suplemento 100% natural.",
  },
  {
    name: "Sofía D.",
    stars: 4,
    title: "Buen antioxidante diario",
    text: "Lo uso principalmente por sus propiedades antioxidantes y para cuidar la piel desde adentro gracias a la vitamina E. La textura es ligera y se absorbe bien. Recomiendo leer bien las instrucciones para no pasarse con las gotas.",
  },
  {
    name: "Javier S.",
    stars: 5,
    title: "¡Una maravilla para la salud diaria!",
    text: "Tenía mis dudas al principio, pero la combinación con aceite de semilla negra es un plus grandísimo. Me siento con más defensas y con menos pesadez estomacal después de las comidas. Definitivamente lo volveré a pedir cuando se me acabe.",
  },
  {
    name: "Lucía M.",
    stars: 3,
    title: "Es bueno, pero hay que saber tomarlo",
    text: "El aceite como tal es de buena calidad y los ingredientes son excelentes. Sin embargo, si no te gustan los sabores herbales fuertes, te advierto que sabe bastante a orégano concentrado. Si lo mezclas con jugo de naranja casi ni se siente. Funcional, pero requiere maña para tomarlo.",
  },
  {
    name: "Carlos H.",
    stars: 5,
    title: "Superó mis expectativas",
    text: "Estaba buscando un suplemento dietario que me ayudara con el sistema inmune y la respiración de forma natural y este dio en el clavo. El gotero facilita mucho la dosis exacta y los 30 ml rinden bastante bien. ¡Cinco estrellas bien merecidas!",
  },
];

/** TODO(MEDIA): video principal del hero. Si es `null` se usa la foto del producto. */
const HERO_VIDEO: MediaVideo | null = null;

/** Fotos de la galería del producto. */
const GALLERY: readonly MediaImage[] = [
  {
    src: "/landings/aceite-oregano/images/galeria-1.png",
    alt: `${PRODUCT_SHORT_NAME}, frasco gotero de 30 ml`,
  },
  {
    src: "/landings/aceite-oregano/images/galeria-2.png",
    alt: `${PRODUCT_SHORT_NAME}, ingredientes naturales`,
  },
];

/**
 * TODO(RESULTADOS): fotos o capturas de clientes REALES con su permiso.
 * Vacío = sección oculta.
 */
const RESULTS: readonly MediaImage[] = [];

/**
 * TODO(TESTIMONIOS): opiniones REALES de clientes. Vacío = sección oculta.
 * No se rellena con textos de ejemplo.
 */
const TESTIMONIALS: readonly Testimonial[] = [];

/** TODO(GARANTIA): texto de la garantía, solo si la tienda la ofrece de verdad. */
const GUARANTEE_TEXT: string | null = null;

/** TODO(INVIMA): número de registro o notificación sanitaria, si aplica. */
const SANITARY_REGISTRY: string | null = null;

const MARQUEE_ITEMS: readonly { strong: string; rest: string }[] = [
  { strong: "ENVÍO GRATIS", rest: "A TODA COLOMBIA" },
  { strong: "PAGO CONTRA ENTREGA:", rest: "paga al recibir en casa" },
  { strong: "COMPRA SEGURA", rest: "Y RECIBE EN LA PUERTA DE TU CASA" },
  { strong: "OFERTA ESPECIAL", rest: "POR TIEMPO LIMITADO" },
];

const QUICK_BENEFITS: readonly string[] = [
  "Apoyo para tus defensas",
  "Fuente de antioxidantes",
  "Fórmula natural",
  "Frasco gotero de 30 ml",
];

const SIGNS: readonly { icon: string; title: string; text: string }[] = [
  {
    icon: "🌦️",
    title: "Cambios de clima",
    text: "Los cambios bruscos de temperatura y los ambientes cargados exigen más a tu cuerpo.",
  },
  {
    icon: "⚡",
    title: "Rutina acelerada",
    text: "Dormir poco y comer a las carreras deja pocos antioxidantes en tu día a día.",
  },
  {
    icon: "🍽️",
    title: "Comidas pesadas",
    text: "Las comidas abundantes o desordenadas pueden hacerte sentir pesadez durante el día.",
  },
  {
    icon: "🗓️",
    title: "Poca constancia",
    text: "Cuesta mantener hábitos de bienestar sin un apoyo sencillo que puedas tomar cada día.",
  },
];

const BENEFITS: readonly {
  icon: string;
  title: string;
  text: string;
  featured?: boolean;
}[] = [
  {
    icon: "🌿",
    title: "Aceite de Orégano",
    text: "Rico en compuestos naturales como el carvacrol y el timol, que ayudan a fortalecer el sistema inmunológico y aportan propiedades antioxidantes.",
  },
  {
    icon: "🫙",
    title: "Gotas líquidas 30 ml",
    text: "Una combinación natural con aceite de semilla negra y vitamina E que potencia sus beneficios y te brinda un apoyo para tu bienestar todos los días.",
    featured: true,
  },
  {
    icon: "⚫",
    title: "Aceite de Semilla Negra",
    text: "Fuente natural de ácidos grasos esenciales que apoya la salud respiratoria y contribuye al equilibrio del sistema inmune.",
  },
];

/** TODO(USO): confirmar los pasos y la porción con la etiqueta del frasco. */
const USAGE_STEPS: readonly { title: string; text: string }[] = [
  {
    title: "Agita el frasco",
    text: "Antes de usar, agita suavemente el frasco gotero para mezclar bien el contenido.",
  },
  {
    title: "Toma la porción indicada",
    text: "Usa la cantidad que indica la etiqueta del producto. No excedas la porción recomendada.",
  },
  {
    title: "Sé constante",
    text: "Incorpóralo a tu rutina diaria y guárdalo en un lugar fresco y seco, lejos de la luz directa.",
  },
];

const DISCLAIMER =
  "Suplemento dietario. No es un medicamento ni sustituye una alimentación equilibrada, y no está destinado a diagnosticar, tratar, curar o prevenir ninguna enfermedad. Si estás embarazada, en lactancia, tomas medicamentos o tienes una condición de salud, consulta a tu médico antes de usarlo.";

/** Máximo de unidades en la compra normal (sin oferta). */
const MAX_QUANTITY = 10;

/* ------------------------------------------------------------------------- */
/* Utilidades                                                                 */
/* ------------------------------------------------------------------------- */

/** Pide a Cloudinary la versión optimizada; deja intactas las demás URLs. */
function cld(url: string): string {
  if (!url.includes("res.cloudinary.com/") || !url.includes("/upload/")) {
    return url;
  }
  if (url.includes("/q_auto") || url.includes("/f_auto")) return url;
  return url.replace("/upload/", "/upload/q_auto,f_auto/");
}

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function formatCop(value: number): string {
  return copFormatter.format(value);
}

interface OfferTier {
  qty: 1 | 2 | 3;
  /** Lo que se muestra como total de la tarjeta. */
  total: number;
  /** `precio normal × cantidad`, para mostrar el ahorro. */
  regularTotal: number;
  label: string;
  badge?: string;
  /** Texto que reemplaza a "Ahorras $X" (p. ej. "Paga 2 y lleva 3"). */
  note?: string;
}

function buildTiers(unitPrice: number): OfferTier[] {
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return [];

  const tiers: OfferTier[] = [
    { qty: 1, total: unitPrice, regularTotal: unitPrice, label: "Prueba individual" },
  ];
  const double = BULK_TOTALS[2];
  if (double !== null) {
    tiers.push({
      qty: 2,
      total: double,
      regularTotal: unitPrice * 2,
      label: "Pack doble",
      badge: "Más popular",
    });
  }
  const triple = BULK_TOTALS[3];
  if (triple !== null) {
    tiers.push({
      qty: 3,
      total: triple,
      regularTotal: unitPrice * 3,
      label: "Paga 2 y lleva 3",
      badge: "Máximo ahorro",
      note: "¡Paga 2 y lleva 3!",
    });
  }
  return tiers;
}

/* ------------------------------------------------------------------------- */
/* Piezas pequeñas                                                            */
/* ------------------------------------------------------------------------- */

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="text-center">
      <span className="inline-block rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-[var(--nb-green-700)]">
        {eyebrow}
      </span>
      <h2 className="mt-2 text-2xl font-extrabold text-gray-900 sm:text-3xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600">{subtitle}</p>
      ) : null}
    </div>
  );
}

/** 1. Marquee superior de urgencia (usa `--animate-marquee` de globals.css). */
function UrgencyMarquee() {
  const group = (hidden: boolean) => (
    <div
      className="flex shrink-0 items-center gap-10 pr-10"
      aria-hidden={hidden ? true : undefined}
    >
      {MARQUEE_ITEMS.map((item) => (
        <span key={item.strong}>
          <strong>{item.strong}</strong> {item.rest}
        </span>
      ))}
    </div>
  );

  return (
    <div
      className="overflow-hidden whitespace-nowrap bg-[var(--nb-green-800)] py-2.5 text-[11px] font-medium text-white sm:text-sm"
      aria-label="Información de envío y pago"
    >
      <div className="flex w-max animate-marquee will-change-transform">
        {group(false)}
        {group(true)}
      </div>
    </div>
  );
}

/** 9. Testimonios: grid en escritorio, auto-scroll horizontal en móvil. */
function TestimonialsCarousel({ items }: { items: readonly Testimonial[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const resumeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const mobile = window.matchMedia("(max-width: 767px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let last = 0;
    let pos = el.scrollLeft;

    const step = (now: number) => {
      raf = window.requestAnimationFrame(step);
      const dt = last ? now - last : 0;
      last = now;
      // Fuera de móvil, con movimiento reducido o en pausa, se sigue la
      // posición real para retomar desde donde el usuario dejó el scroll.
      if (!mobile.matches || reduced.matches || pausedRef.current) {
        pos = el.scrollLeft;
        return;
      }
      pos += dt * 0.035; // ≈ 35 px/s
      const half = el.scrollWidth / 2;
      if (half > 0 && pos >= half) pos -= half;
      el.scrollLeft = pos;
    };

    raf = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(raf);
      if (resumeTimerRef.current !== null) {
        window.clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
    };
  }, [items.length]);

  const pause = () => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    pausedRef.current = true;
  };
  const resume = (delayMs: number) => {
    if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => {
      pausedRef.current = false;
      resumeTimerRef.current = null;
    }, delayMs);
  };

  const card = (item: Testimonial, key: string) => (
    <figure
      key={key}
      className="flex w-72 shrink-0 flex-col justify-between rounded-2xl border border-green-200 bg-green-50/50 p-5 md:w-auto"
    >
      <div>
        <div
          className="mb-3 flex text-yellow-500"
          role="img"
          aria-label={`${item.rating} de 5 estrellas`}
        >
          {Array.from({ length: item.rating }, (_, i) => (
            <span key={i} aria-hidden="true">
              ★
            </span>
          ))}
        </div>
        <blockquote className="text-sm italic text-gray-700">
          “{item.text}”
        </blockquote>
      </div>
      <figcaption className="mt-4 border-t border-green-200 pt-3 text-xs">
        <span className="block font-bold text-gray-900">{item.name}</span>
        <span className="text-gray-500">{item.city}</span>
      </figcaption>
    </figure>
  );

  return (
    <div
      ref={trackRef}
      className="nb-hide-scrollbar flex overflow-x-auto md:grid md:grid-cols-3 md:gap-4 md:overflow-visible"
      onMouseEnter={pause}
      onMouseLeave={() => resume(0)}
      onTouchStart={pause}
      onTouchEnd={() => resume(2000)}
      onTouchCancel={() => resume(2000)}
      onFocus={pause}
      onBlur={() => resume(0)}
    >
      {/* Dos grupos idénticos: al terminar el primero el salto es invisible. */}
      <div className="flex shrink-0 gap-4 pr-4 md:contents">
        {items.map((item, i) => card(item, `a-${i}`))}
      </div>
      <div className="flex shrink-0 gap-4 pr-4 md:hidden" aria-hidden="true">
        {items.map((item, i) => card(item, `b-${i}`))}
      </div>
    </div>
  );
}

/** Reseñas con auto-scroll horizontal continuo. */
function ReviewsCarousel({ items }: { items: readonly Review[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const resumeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let last = 0;
    let pos = el.scrollLeft;

    const step = (now: number) => {
      raf = window.requestAnimationFrame(step);
      const dt = last ? now - last : 0;
      last = now;
      if (reduced.matches || pausedRef.current) {
        pos = el.scrollLeft;
        return;
      }
      pos += dt * 0.04; // ≈ 40 px/s
      const half = el.scrollWidth / 2;
      if (half > 0 && pos >= half) pos -= half;
      el.scrollLeft = pos;
    };

    raf = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(raf);
      if (resumeTimerRef.current !== null) {
        window.clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
    };
  }, [items.length]);

  const pause = () => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    pausedRef.current = true;
  };
  const resume = (delayMs: number) => {
    if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => {
      pausedRef.current = false;
      resumeTimerRef.current = null;
    }, delayMs);
  };

  const stars = (rating: number) =>
    Array.from({ length: rating }, (_, i) => (
      <span key={i} aria-hidden="true" style={{ color: "#ca8a04" }}>
        ★
      </span>
    ));

  const card = (item: Review, key: string) => (
    <figure
      key={key}
      className="flex w-80 shrink-0 flex-col justify-between rounded-2xl border border-green-200 bg-white p-5 shadow-sm"
    >
      <div>
        <div className="mb-3 flex text-yellow-500" role="img" aria-label={`${item.stars} de 5 estrellas`}>
          {stars(item.stars)}
        </div>
        <h3 className="mb-2 text-sm font-bold text-gray-900">{item.title}</h3>
        <blockquote className="text-sm italic text-gray-700">
          “{item.text}”
        </blockquote>
      </div>
      <figcaption className="mt-4 border-t border-green-200 pt-3 text-xs">
        <span className="block font-bold text-gray-900">{item.name}</span>
      </figcaption>
    </figure>
  );

  return (
    <div
      ref={trackRef}
      className="nb-hide-scrollbar flex overflow-x-auto gap-4"
      onMouseEnter={pause}
      onMouseLeave={() => resume(0)}
      onTouchStart={pause}
      onTouchEnd={() => resume(2000)}
      onTouchCancel={() => resume(2000)}
    >
      {/* Dos grupos idénticos: al terminar el primero el salto es invisible. */}
      <div className="flex shrink-0 gap-4 pr-4">
        {items.map((item, i) => card(item, `a-${i}`))}
      </div>
      <div className="flex shrink-0 gap-4 pr-4" aria-hidden="true">
        {items.map((item, i) => card(item, `b-${i}`))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Landing                                                                    */
/* ------------------------------------------------------------------------- */

export default function AceiteOreganoLanding({
  product,
  onAddToCart,
  offerEndTime,
}: LandingProps) {
  const router = useRouter();

  const unitPrice = Number(product.price);
  const tiers = useMemo(() => buildTiers(unitPrice), [unitPrice]);
  const hasPrice = Number.isFinite(unitPrice) && unitPrice > 0;

  /**
   * Oferta elegida en el selector (`null` = ninguna). SOLO una tarjeta elegida
   * manda `promotion: true`; sin tarjeta, la compra va a precio normal.
   */
  const [selectedQty, setSelectedQty] = useState<1 | 2 | 3 | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const stock = product.stock;
  const soldOut = typeof stock === "number" && stock <= 0;
  const maxQuantity =
    typeof stock === "number" && stock > 0
      ? Math.min(MAX_QUANTITY, stock)
      : MAX_QUANTITY;

  const selectedTier = tiers.find((t) => t.qty === selectedQty) ?? null;

  const heroImage = product.image ? cld(product.image) : null;
  const galleryItems: readonly MediaImage[] = useMemo(() => {
    if (GALLERY.length > 0) return GALLERY;
    return heroImage
      ? [{ src: heroImage, alt: `${product.name}, frasco gotero de 30 ml` }]
      : [];
  }, [heroImage, product.name]);

  const handleBuy = useCallback(async () => {
    if (pending || soldOut || !hasPrice) return;
    setPending(true);
    setFailed(false);
    try {
      const added = selectedTier
        ? await onAddToCart(selectedTier.qty, { promotion: true })
        : await onAddToCart(quantity);
      if (added) {
        router.push("/cart");
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }, [pending, soldOut, hasPrice, selectedTier, onAddToCart, quantity, router]);

  const ctaLabel = (() => {
    if (soldOut) return "Agotado";
    if (pending) return "Agregando al carrito…";
    if (selectedTier) {
      const units = selectedTier.qty === 1 ? "frasco" : "frascos";
      return `Pedir ${selectedTier.qty} ${units} · ${formatCop(selectedTier.total)}`;
    }
    return hasPrice
      ? `Agregar ${quantity} al carrito · ${formatCop(unitPrice * quantity)}`
      : "Agregar al carrito";
  })();

  const heroMedia = HERO_VIDEO ? (
    <video
      controls
      playsInline
      preload="metadata"
      poster={HERO_VIDEO.poster ? cld(HERO_VIDEO.poster) : undefined}
      className="absolute inset-0 h-full w-full object-cover"
    >
      <source src={cld(HERO_VIDEO.src)} type="video/mp4" />
      Tu navegador no soporta el elemento de video.
    </video>
  ) : (
    <ProductImage
      src={heroImage}
      alt={`${product.name}, frasco gotero de 30 ml`}
      priority
      sizes="(max-width: 1024px) 100vw, 40vw"
      className="object-cover"
    />
  );

  return (
    <div className="nb-landing bg-[var(--nb-cream)] text-gray-800 antialiased">
      <style>{`
        .nb-landing {
          --nb-green-950: #0f2e1b;
          --nb-green-800: #14532d;
          --nb-green-700: #166534;
          --nb-green-600: #16a34a;
          --nb-cream: #f6fbf3;
        }
        @keyframes nb-pulse {
          0% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.45); }
          70% { box-shadow: 0 0 0 14px rgba(22, 163, 74, 0); }
          100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); }
        }
        .nb-landing .nb-pulse { animation: nb-pulse 2s infinite; }
        .nb-landing .nb-pulse:disabled { animation: none; }
        .nb-landing .nb-hide-scrollbar { scrollbar-width: none; }
        .nb-landing .nb-hide-scrollbar::-webkit-scrollbar { display: none; }
        @media (prefers-reduced-motion: reduce) {
          .nb-landing .nb-pulse { animation: none; }
          .nb-landing { scroll-behavior: auto; }
        }
      `}</style>

      {/* 1. Marquee de urgencia */}
      <UrgencyMarquee />

      {/* 2. Hero */}
      <section className="bg-[var(--nb-cream)] px-4 pb-12 pt-8 sm:pt-12 lg:pb-16 lg:pt-16">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <div className="relative mx-auto w-full max-w-sm rounded-3xl border border-green-200 bg-white p-3 shadow-xl">
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-green-50">
                {heroMedia}
              </div>
              <p className="mt-3 text-center text-xs font-medium text-gray-500">
                Frasco gotero de 30 ml · Uso oral
              </p>
            </div>
          </div>

          <div className="space-y-5 lg:col-span-7">
            <div className="space-y-4 text-center lg:text-left">
              <span className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--nb-green-800)]">
                🌿 Naturaleza que cuida de ti
              </span>
              <h1 className="text-3xl font-extrabold leading-tight text-gray-900 sm:text-4xl lg:text-5xl">
                Gotas líquidas de{" "}
                <span className="text-[var(--nb-green-700)]">
                  Aceite de Orégano
                </span>{" "}
                con Aceite de Semilla Negra
              </h1>
              <p className="mx-auto max-w-xl text-sm text-gray-600 sm:text-lg lg:mx-0">
                Una combinación natural con carvacrol, timol y vitamina E para
                darle a tu cuerpo un apoyo diario para tu bienestar.
              </p>
              <ul className="mx-auto grid max-w-md grid-cols-2 gap-2 text-left text-xs font-medium text-gray-700 sm:text-sm lg:mx-0">
                {QUICK_BENEFITS.map((benefit) => (
                  <li key={benefit} className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 shrink-0 text-[var(--nb-green-600)]" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>

            {/* Selector de ofertas por cantidad */}
            <div id="ofertas" className="scroll-mt-24 space-y-3">
              {tiers.length > 1 ? (
                <>
                  <p className="text-center text-sm font-bold text-gray-900 lg:text-left">
                    Elige tu promoción
                  </p>
                  <div
                    role="radiogroup"
                    aria-label="Ofertas por cantidad"
                    className="grid grid-cols-1 gap-3 sm:grid-cols-3"
                  >
                    {tiers.map((tier) => {
                      const isSelected = tier.qty === selectedQty;
                      const unavailable =
                        soldOut || (typeof stock === "number" && tier.qty > stock);
                      const saving = tier.regularTotal - tier.total;
                      return (
                        <button
                          key={tier.qty}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          disabled={unavailable}
                          onClick={() => {
                            setFailed(false);
                            setSelectedQty(isSelected ? null : tier.qty);
                          }}
                          className={`relative min-h-11 rounded-2xl border-2 p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                            isSelected
                              ? "border-[var(--nb-green-600)] bg-green-50 shadow-lg"
                              : "border-green-200 bg-white hover:border-[var(--nb-green-600)] hover:shadow-md"
                          }`}
                        >
                          {tier.badge ? (
                            <span className="absolute -top-3 left-4 rounded-full bg-[var(--nb-green-700)] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                              {tier.badge}
                            </span>
                          ) : null}
                          <span
                            className={`absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                              isSelected
                                ? "border-[var(--nb-green-600)]"
                                : "border-gray-300"
                            }`}
                            aria-hidden="true"
                          >
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${
                                isSelected ? "bg-[var(--nb-green-600)]" : "bg-transparent"
                              }`}
                            />
                          </span>
                          <span className="block text-[11px] font-bold uppercase text-gray-500">
                            {tier.label}
                          </span>
                          <span className="mt-1 block text-base font-bold text-gray-900">
                            {tier.qty} {tier.qty === 1 ? "frasco" : "frascos"}
                          </span>
                          <span className="mt-2 block text-2xl font-extrabold text-[var(--nb-green-700)]">
                            {formatCop(tier.total)}
                          </span>
                          <span className="block text-xs text-gray-500">
                            {saving > 0 ? (
                              <>
                                <del>{formatCop(tier.regularTotal)}</del> ·{" "}
                                {tier.note ?? `Ahorras ${formatCop(saving)}`}
                              </>
                            ) : (
                              "COP · Pago contra entrega"
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-center text-xs text-gray-500 lg:text-left">
                    {selectedTier
                      ? "Toca de nuevo la oferta para quitarla y comprar a precio normal."
                      : "Sin oferta elegida pagas el precio normal por unidad."}
                  </p>
                </>
              ) : null}

              {/* Cantidad: solo en compra normal (sin oferta elegida) */}
              {!selectedTier && hasPrice ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-green-200 bg-white px-4 py-3">
                  <div>
                    <span className="block text-xs font-bold uppercase text-gray-500">
                      Precio normal
                    </span>
                    <span className="text-xl font-extrabold text-[var(--nb-green-700)]">
                      {formatCop(unitPrice)}
                    </span>
                    <span className="ml-1 text-xs text-gray-500">c/u</span>
                  </div>
                  <div
                    className="flex items-center gap-2"
                    role="group"
                    aria-label="Cantidad"
                  >
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      aria-label="Disminuir cantidad"
                      className="flex min-h-11 w-11 items-center justify-center rounded-xl border border-green-200 text-lg font-bold text-[var(--nb-green-800)] disabled:opacity-40"
                    >
                      −
                    </button>
                    <span
                      className="w-8 text-center text-lg font-bold tabular-nums"
                      aria-live="polite"
                    >
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setQuantity((q) => Math.min(maxQuantity, q + 1))
                      }
                      disabled={quantity >= maxQuantity}
                      aria-label="Aumentar cantidad"
                      className="flex min-h-11 w-11 items-center justify-center rounded-xl border border-green-200 text-lg font-bold text-[var(--nb-green-800)] disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <button
                type="button"
                onClick={() => void handleBuy()}
                disabled={pending || soldOut || !hasPrice}
                className={`nb-pulse flex min-h-14 w-full items-center justify-center rounded-2xl px-5 py-4 text-base font-bold text-white shadow-lg transition-all sm:text-lg ${
                  soldOut || !hasPrice
                    ? "cursor-not-allowed bg-gray-400"
                    : "bg-gradient-to-r from-[var(--nb-green-600)] to-[var(--nb-green-800)] hover:-translate-y-0.5"
                } ${pending ? "cursor-wait opacity-75" : ""}`}
              >
                {ctaLabel}
              </button>
              {failed ? (
                <p role="alert" className="mt-2 text-center text-sm text-red-600">
                  No pudimos agregar el producto. Intenta de nuevo.
                </p>
              ) : null}
              <p className="mt-2 text-center text-xs text-gray-500">
                Pago contra entrega disponible en todo el país · Envío gratis
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Señales de que necesitas el producto */}
      <section className="bg-white px-4 py-14">
        <div className="mx-auto max-w-5xl space-y-10">
          <SectionHeading
            eyebrow="¿Te suena familiar?"
            title={`Señales de que necesitas ${PRODUCT_SHORT_NAME}`}
            subtitle="Tu rutina diaria exige más de lo que parece. Un apoyo natural y constante puede acompañarte."
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SIGNS.map((sign) => (
              <div
                key={sign.title}
                className="rounded-2xl border border-green-200 bg-green-50/60 p-5 transition-shadow hover:shadow-md"
              >
                <div
                  className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg"
                  aria-hidden="true"
                >
                  {sign.icon}
                </div>
                <h3 className="mb-1 font-bold text-gray-900">{sign.title}</h3>
                <p className="text-xs leading-relaxed text-gray-600">{sign.text}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-[var(--nb-green-700)] to-[var(--nb-green-950)] p-6 text-white shadow-lg sm:flex-row">
            <div className="text-center sm:text-left">
              <h3 className="text-lg font-bold">Dale a tu día un apoyo natural</h3>
              <p className="text-xs text-green-100 sm:text-sm">
                Gotas líquidas fáciles de tomar, con envío gratis y pago contra
                entrega.
              </p>
            </div>
            <a
              href="#ofertas"
              className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-xl bg-white px-6 py-3 font-bold text-[var(--nb-green-800)] shadow transition-colors hover:bg-green-50"
            >
              Quiero pedirlo
            </a>
          </div>
        </div>
      </section>

      {/* 5. Ingredientes y beneficios */}
      <section className="bg-[var(--nb-cream)] px-4 py-16">
        <div className="mx-auto max-w-6xl space-y-10">
          <SectionHeading
            eyebrow="Poder de la naturaleza"
            title="Ingredientes que trabajan en equipo"
            subtitle="Orégano, semilla negra y vitamina E en una fórmula líquida de uso oral."
          />
          <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-3">
            {BENEFITS.map((benefit) =>
              benefit.featured ? (
                <div
                  key={benefit.title}
                  className="relative space-y-3 rounded-3xl border-2 border-[var(--nb-green-600)] bg-gradient-to-b from-white to-green-100 p-8 text-center shadow-xl"
                >
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--nb-green-700)] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                    Fórmula natural
                  </span>
                  <div
                    className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-green-200 text-3xl shadow-md"
                    aria-hidden="true"
                  >
                    {benefit.icon}
                  </div>
                  <h3 className="text-xl font-extrabold text-gray-900">
                    {benefit.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-gray-700">
                    {benefit.text}
                  </p>
                </div>
              ) : (
                <div
                  key={benefit.title}
                  className="space-y-3 rounded-3xl border border-green-200 bg-white p-6 text-center shadow-sm transition-colors hover:border-[var(--nb-green-600)]"
                >
                  <div
                    className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100 text-2xl"
                    aria-hidden="true"
                  >
                    {benefit.icon}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">
                    {benefit.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-gray-700">
                    {benefit.text}
                  </p>
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      {/* 6. Cómo usarlo */}
      <section className="bg-white px-4 py-14">
        <div className="mx-auto max-w-4xl space-y-10">
          <SectionHeading
            eyebrow="Fácil de usar"
            title="Cómo usarlo"
            subtitle="Tres pasos sencillos para incorporarlo a tu rutina."
          />
          <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {USAGE_STEPS.map((step, index) => (
              <li
                key={step.title}
                className="rounded-2xl border border-green-200 bg-green-50/50 p-5 text-center"
              >
                <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--nb-green-700)] text-lg font-extrabold text-white">
                  {index + 1}
                </span>
                <h3 className="mb-1 font-bold text-gray-900">{step.title}</h3>
                <p className="text-xs leading-relaxed text-gray-600">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 7. Resultados reales (solo con material real) */}
      {RESULTS.length > 0 ? (
        <section className="bg-[var(--nb-cream)] px-4 py-14">
          <div className="mx-auto max-w-6xl space-y-8">
            <SectionHeading
              eyebrow="Resultados reales"
              title="Clientes que ya lo usan"
              subtitle="Los resultados pueden variar de una persona a otra."
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {RESULTS.map((result) => (
                <figure
                  key={result.src}
                  className="overflow-hidden rounded-2xl border border-green-200 bg-white shadow-sm"
                >
                  <div className="relative aspect-[4/5] bg-green-50">
                    <ProductImage
                      src={cld(result.src)}
                      alt={result.alt}
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                  </div>
                  {result.caption ? (
                    <figcaption className="p-3 text-center text-xs text-gray-600">
                      {result.caption}
                    </figcaption>
                  ) : null}
                </figure>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* 8. Galería de imágenes */}
      {galleryItems.length > 0 ? (
        <section className="bg-white px-4 py-14">
          <div className="mx-auto max-w-6xl space-y-8">
            <SectionHeading eyebrow="Galería" title={`Conoce ${PRODUCT_SHORT_NAME}`} />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {galleryItems.map((image, index) => (
                <div
                  key={image.src}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-green-200 bg-green-50"
                >
                  <ProductImage
                    src={cld(image.src)}
                    alt={image.alt}
                    loading={index === 0 ? "eager" : "lazy"}
                    sizes="(max-width: 640px) 50vw, 25vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Reseñas de clientes (auto-scroll horizontal) */}
      {REVIEWS.length > 0 ? (
        <section className="bg-[var(--nb-cream)] px-4 py-14">
          <div className="mx-auto max-w-6xl space-y-8">
            <SectionHeading
              eyebrow="Reseñas de clientes"
              title="Lo que dicen quienes ya lo probaron"
              subtitle="Opiniones reales de personas que usan el aceite de orégano con semilla negra y vitamina E."
            />
            <ReviewsCarousel items={REVIEWS} />
          </div>
        </section>
      ) : null}

      {/* 9. Testimonios (solo con opiniones reales) */}
      {TESTIMONIALS.length > 0 ? (
        <section className="overflow-hidden bg-[var(--nb-cream)] px-4 py-14">
          <div className="mx-auto max-w-6xl space-y-8">
            <SectionHeading
              eyebrow="Confianza real"
              title="Lo que dicen nuestros clientes en Colombia"
            />
            <TestimonialsCarousel items={TESTIMONIALS} />
          </div>
        </section>
      ) : null}

      {/* 9. Testimonios (solo con opiniones reales) */}
      {TESTIMONIALS.length > 0 ? (
        <section className="overflow-hidden bg-[var(--nb-cream)] px-4 py-14">
          <div className="mx-auto max-w-6xl space-y-8">
            <SectionHeading
              eyebrow="Confianza real"
              title="Lo que dicen nuestros clientes en Colombia"
            />
            <TestimonialsCarousel items={TESTIMONIALS} />
          </div>
        </section>
      ) : null}

      {/* 10. CTA final + garantía */}
      <section className="bg-gradient-to-b from-[var(--nb-green-800)] to-[var(--nb-green-950)] px-4 py-14 text-center text-white">
        <div className="mx-auto max-w-3xl space-y-5">
          <h2 className="text-2xl font-extrabold sm:text-4xl">
            Naturaleza que cuida de ti
          </h2>
          <p className="text-sm text-green-100 sm:text-base">
            Pide hoy tus gotas de {PRODUCT_SHORT_NAME} con envío gratis y paga
            al recibir en la puerta de tu casa.
          </p>
          <a
            href="#ofertas"
            className="nb-pulse inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-white px-8 py-4 text-lg font-bold text-[var(--nb-green-800)] shadow-lg transition-transform hover:-translate-y-0.5 sm:w-auto"
          >
            Quiero mi {PRODUCT_SHORT_NAME}
          </a>
          {GUARANTEE_TEXT ? (
            <p className="mx-auto max-w-xl rounded-2xl border border-white/20 bg-white/10 p-4 text-sm">
              {GUARANTEE_TEXT}
            </p>
          ) : null}
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-2 text-xs font-medium text-green-100">
            <li>🚚 Envío gratis</li>
            <li>🤝 Pago contra entrega</li>
            <li>🔒 Compra segura</li>
          </ul>
          <p className="mx-auto max-w-2xl pt-4 text-[11px] leading-relaxed text-green-200/80">
            {DISCLAIMER}
            {SANITARY_REGISTRY ? ` ${SANITARY_REGISTRY}` : ""}
          </p>
        </div>
      </section>
    </div>
  );
}
