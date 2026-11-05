"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ProductImage from "@/components/ProductImage";

/**
 * Landing de "Kit Reparador de Bisagras Premium Negro".
 *
 * Toma la estructura de `ArbutinaLanding` (marquesina, hero con video,
 * señales, beneficios, comparativa, galería, reseñas y CTA final) y la viste
 * en negro carbón y acero, acorde al color del producto.
 *
 * Se monta en `app/products/[slug]/page.tsx` cuando el slug o el nombre del
 * producto coinciden con `BISAGRAS_SLUG` o con `/bisagra/i`.
 *
 * Las ofertas por cantidad son 4 x $64.900, 8 x $99.000 y 16 x $139.900
 * (COP) y coinciden con `BISAGRAS_OFFER_UNIT_PRICES` de
 * `lib/product-promotion.ts`.
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
export const BISAGRAS_SLUG = "kit-repara-bisagras-premium-negro-4y8";

/* ------------------------------------------------------------------------- */
/* CONTENIDO                                                                  */
/* ------------------------------------------------------------------------- */

const PRODUCT_SHORT_NAME = "Kit Bisagras Premium";
const PRODUCT_BRAND = "Premium Negro";

/**
 * Totales de promoción por cantidad (COP).
 * - 2 unidades: $89.900 en total. (promo 1)
 * - 3 unidades: $119.900 en total. (promo 2)
 * - 4 unidades: $159.900 en total. (promo 3)
 *
 * Deben coincidir con `BISAGRAS_OFFER_UNIT_PRICES` de
 * `lib/product-promotion.ts` y con su gemela de la API.
 *
 * Nota: el precio unitario de promocion nunca baja de $18.725 (50% del precio
 * sugerido de Dropi: $37.450) para que el proveedor acepte el pedido.
 */
const BULK_TOTALS: Readonly<Record<2 | 3 | 4, number | null>> = {
  2: 89_900,
  3: 119_900,
  4: 159_900,
};

interface MediaVideo {
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

interface Review {
  stars: 1 | 2 | 3 | 4 | 5;
  title: string;
  text: string;
}

const HERO_IMAGE: MediaImage = {
  src: "/landings/bisagras/images/bisagras-1.png",
  alt: `Kit Reparador de Bisagras Premium Negro, refuerzos metálicos`,
};

const GALLERY: readonly MediaImage[] = [
  {
    src: "/landings/bisagras/images/bisagras-1.png",
    alt: `${PRODUCT_SHORT_NAME}, pack de refuerzos metálicos`,
  },
  {
    src: "/landings/bisagras/images/bisagras-2.jpg",
    alt: `${PRODUCT_SHORT_NAME}, instalación en bisagra de mueble`,
  },
  {
    src: "/landings/bisagras/images/bisagras-3.png",
    alt: `Refuerzo metálico negro para bisagra`,
  },
  {
    src: "/landings/bisagras/images/bisagras-4.jpg",
    alt: `${PRODUCT_SHORT_NAME}, acabado negro premium`,
  },
];

const VIDEOS: readonly MediaVideo[] = [
  {
    src: "/landings/bisagras/videos/bisagras-1.mp4",
    title: "Conoce el Kit Bisagras Premium",
    caption: "Refuerzos metálicos negros y tornillos incluidos, listos para instalar.",
  },
  {
    src: "/landings/bisagras/videos/bisagras-2.mp4",
    title: "Bisagras Premium en acción",
    caption: "Demostración de reparación antes y después en puerta de mueble.",
  },
];

/** TODO(GARANTIA): texto de la garantía, solo si la tienda la ofrece de verdad. */
const GUARANTEE_TEXT: string | null = null;

/** TODO(INVIMA): registro o notificación sanitaria, si aplica. */
const SANITARY_REGISTRY: string | null = null;

const REVIEWS: readonly Review[] = [
  {
    stars: 5,
    title: "Puerta de cocina como nueva",
    text: "Tenía una puerta de la cocina que se caía y no cerraba bien. Con este kit la arreglé en minutos, sin llamar al carpintero. Los refuerzos negros se ven sólidos y los tornillos vienen incluidos.",
  },
  {
    stars: 5,
    title: "Ahorré cambiar el gabinete entero",
    text: "Mis bisagras estaban flojas y la madera ya no agarraba tornillo. Probé este kit y funcionó perfecto. No tuve que comprar mueble nuevo ni pagar reparación costosa. Muy recomendado.",
  },
  {
    stars: 5,
    title: "Fácil de instalar, sin experiencia",
    text: "Nunca había hecho reparaciones en casa, pero este kit es súper sencillo. Viene con todo lo necesario y la puerta quedó firme otra vez. El acabado negro le da un toque elegante.",
  },
  {
    stars: 5,
    title: "Ideal para varios muebles",
    text: "Compré el pack de 8 y me alcanzó para reparar las bisagras de la cocina, el baño y el clóset. Calidad del acero muy buena y el recubrimiento negro evita la corrosión.",
  },
  {
    stars: 5,
    title: "Calidad premium a buen precio",
    text: "Los refuerzos son de acero inoxidable y se sienten resistentes. La instalación fue rápida y las puertas ya no se mueven. Excelente relación calidad-precio.",
  },
  {
    stars: 5,
    title: "Solución rápida para bisagras flojas",
    text: "Tenía tres puertas con bisagras flojas y este kit las dejó como nuevas. No necesita herramientas especiales, solo el destornillador. Muy satisfecho con la compra.",
  },
  {
    stars: 5,
    title: "Buen acabado y durabilidad",
    text: "El color negro queda muy bien en mis gabinetes modernos y no se ve barato. El acero inoxidable con recubrimiento negro promete durar mucho tiempo sin oxidarse.",
  },
  {
    stars: 5,
    title: "Pack de 8 rindió para toda la casa",
    text: "Reparé las bisagras de la cocina, el baño y dos puertas del clóset con un solo pack. Viene con tornillos suficientes y la instalación no tomó más de 10 minutos por puerta.",
  },
  {
    stars: 5,
    title: "Sin necesidad de carpintero",
    text: "Iba a llamar a un carpintero pero encontré este kit antes. Lo instalé yo mismo y quedó perfecto. Las puertas cierran bien y no se caen. Ahorré mucho dinero.",
  },
  {
    stars: 5,
    title: "Producto tal como se describe",
    text: "Llegó rápido, con los refuerzos metálicos y tornillos incluidos. La calidad del acero es buena y el acabado negro es uniforme. Volvería a comprar para otros muebles.",
  },
];

const MARQUEE_ITEMS: readonly { strong: string; rest: string }[] = [
  { strong: "ENVÍO GRATIS", rest: "A TODA COLOMBIA" },
  { strong: "PAGO CONTRA ENTREGA:", rest: "paga al recibir en casa" },
  { strong: "KIT BISAGRAS PREMIUM NEGRO", rest: "repara sin reemplazar muebles" },
  { strong: "2 X $89.900 · 3 X $119.900 · 4 X $159.900", rest: "ahorra en packs" },
];

const QUICK_BENEFITS: readonly string[] = [
  "Acero inoxidable con recubrimiento negro",
  "Tornillos incluidos para instalación inmediata",
  "Compatible con bisagras estándar de muebles",
  "Repara bisagras flojas y madera dañada",
];

const SIGNS: readonly { icon: string; title: string; text: string }[] = [
  {
    icon: "🚪",
    title: "Bisagras flojas",
    text: "Puertas que no cierran bien, se caen o se mueven al abrirlas.",
  },
  {
    icon: "🪵",
    title: "Madera dañada",
    text: "Los tornillos ya no agarran porque el agujero de la bisagra está desgastado.",
  },
  {
    icon: "💸",
    title: "Reparación costosa",
    text: "Llamar a un carpintero o cambiar la puerta o mueble completo sale caro.",
  },
  {
    icon: "🛠️",
    title: "Sin solución DIY",
    text: "Falta un kit práctico y listo para usar que cualquiera pueda instalar.",
  },
  {
    icon: "🏠",
    title: "Hogar y carpintería",
    text: "Ideal para cocinas, baños, clósets, gabinetes y muebles de oficina.",
  },
  {
    icon: "⚫",
    title: "Acabado premium",
    text: "Color negro elegante y recubrimiento resistente a la corrosión.",
  },
];

const BENEFITS: readonly {
  icon: string;
  title: string;
  text: string;
  featured?: boolean;
}[] = [
  {
    icon: "🔩",
    title: "Acero inoxidable",
    text: "Refuerzos metálicos de alta resistencia que recuperan la firmeza de la bisagra sin deformarse.",
  },
  {
    icon: "⚫",
    title: "Recubrimiento negro",
    text: "Acabado elegante y mayor durabilidad frente a la corrosión y el uso diario.",
    featured: true,
  },
  {
    icon: "🔧",
    title: "Listo para instalar",
    text: "Incluye tornillos para instalación inmediata, sin necesidad de comprar accesorios adicionales.",
  },
  {
    icon: "🪑",
    title: "Compatibilidad amplia",
    text: "Funciona con la mayoría de bisagras estándar de muebles, gabinetes y clósets del hogar.",
  },
];

const SALES_BENEFITS: readonly string[] = [
  "Soluciona bisagras flojas y puertas que no cierran.",
  "Evita reemplazar puertas, gabinetes o muebles completos.",
  "Instalación rápida sin experiencia previa.",
  "Color negro con acabado premium y alta durabilidad.",
  "Ideal para upsell con brocas, destornilladores y kits hogar.",
  "Excelente para packs 4x, 8x y 16x con ahorro por unidad.",
];

type ComparisonValue = "yes" | "varies" | "no";

interface ComparisonRow {
  feature: string;
  ours: ComparisonValue;
  carpintero: ComparisonValue;
  muebleNuevo: ComparisonValue;
}

const COMPARISON_ROWS: readonly ComparisonRow[] = [
  {
    feature: "Repara sin reemplazar el mueble",
    ours: "yes",
    carpintero: "yes",
    muebleNuevo: "no",
  },
  {
    feature: "Instalación DIY sin experiencia",
    ours: "yes",
    carpintero: "varies",
    muebleNuevo: "yes",
  },
  {
    feature: "Tornillos incluidos",
    ours: "yes",
    carpintero: "varies",
    muebleNuevo: "varies",
  },
  {
    feature: "Ticket bajo y conversión rápida",
    ours: "yes",
    carpintero: "no",
    muebleNuevo: "no",
  },
  {
    feature: "Acero inoxidable con recubrimiento negro",
    ours: "yes",
    carpintero: "varies",
    muebleNuevo: "varies",
  },
  {
    feature: "Packs 4x, 8x y 16x con ahorro",
    ours: "yes",
    carpintero: "no",
    muebleNuevo: "no",
  },
];

const DISCLAIMER =
  "Producto de ferretería para reparación de muebles. Los resultados pueden variar según el estado de la madera y la correcta instalación. Revisa la compatibilidad con tus bisagras antes de comprar.";

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
  qty: 2 | 3 | 4;
  /** Lo que se muestra como total de la tarjeta. */
  total: number;
  /** `precio normal × cantidad`, para mostrar el ahorro. */
  regularTotal: number;
  label: string;
  badge?: string;
  /** Texto que reemplaza a "Ahorras $X" (p. ej. "Paga 4 y lleva 4"). */
  note?: string;
}

function buildTiers(unitPrice: number): OfferTier[] {
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return [];

  const tiers: OfferTier[] = [
    { qty: 2, total: BULK_TOTALS[2] ?? 0, regularTotal: unitPrice * 2, label: "Pack inicial" },
  ];
  const three = BULK_TOTALS[3];
  if (three !== null) {
    tiers.push({
      qty: 3,
      total: three,
      regularTotal: unitPrice * 3,
      label: "Pack familiar",
      badge: "Más popular",
    });
  }
  const four = BULK_TOTALS[4];
  if (four !== null) {
    tiers.push({
      qty: 4,
      total: four,
      regularTotal: unitPrice * 4,
      label: "Pack master",
      badge: "Máximo ahorro",
      note: "Mejor precio por unidad",
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

function ComparisonCell({
  value,
  highlight = false,
}: {
  value: ComparisonValue;
  highlight?: boolean;
}) {
  if (value === "yes") {
    return (
      <span
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
          highlight
            ? "bg-[var(--aw-slate-700)] text-white shadow-sm"
            : "bg-slate-100 text-[var(--aw-slate-700)]"
        }`}
      >
        <CheckIcon className="h-4 w-4" />
        <span className="sr-only">Sí</span>
      </span>
    );
  }

  if (value === "varies") {
    return (
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-sm font-black text-gray-500"
        title="Varía según la opción"
      >
        ≈<span className="sr-only">Varía según la opción</span>
      </span>
    );
  }

  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-50 text-sm font-bold text-gray-400">
      —<span className="sr-only">No</span>
    </span>
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
      <span className="inline-block rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-[var(--aw-slate-700)]">
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
      className="overflow-hidden whitespace-nowrap bg-[var(--aw-slate-950)] py-2.5 text-[11px] font-medium text-white sm:text-sm"
      aria-label="Información de envío y pago"
    >
      <div className="flex w-max animate-marquee will-change-transform">
        {group(false)}
        {group(true)}
      </div>
    </div>
  );
}

/**
 * Ola decorativa entre secciones. Dos SVG idénticos dentro de una pista al
 * 200%: al desplazarse un 50% el empalme es invisible y el movimiento no
 * tiene saltos.
 */
function WaveDivider({
  from,
  to,
  reverse = false,
}: {
  /** Color de fondo de la sección que termina. */
  from: string;
  /** Color de la sección que empieza. */
  to: string;
  reverse?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className="relative h-12 w-full overflow-hidden sm:h-16"
      style={{ backgroundColor: from }}
    >
      <div
        className={`absolute inset-y-0 left-0 flex w-[200%] will-change-transform ${
          reverse ? "aw-wave-reverse" : "aw-wave"
        }`}
      >
        {[0, 1].map((index) => (
          <svg
            key={index}
            viewBox="0 0 1440 96"
            preserveAspectRatio="none"
            className="h-full w-1/2 shrink-0"
          >
            <path
              d="M0,56 C180,96 360,16 540,40 C720,64 900,96 1080,64 C1260,32 1360,48 1440,56 L1440,96 L0,96 Z"
              fill={to}
            />
          </svg>
        ))}
      </div>
    </div>
  );
}

/** Reseñas con auto-scroll horizontal continuo en todos los tamaños. */
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

  const card = (item: Review, key: string) => (
    <figure
      key={key}
      className="flex w-80 shrink-0 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div>
        <div
          className="mb-3 flex text-yellow-500"
          role="img"
          aria-label={`${item.stars} de 5 estrellas`}
        >
          {Array.from({ length: item.stars }, (_, index) => (
            <span key={index} aria-hidden="true">
              ★
            </span>
          ))}
        </div>
        <h3 className="mb-2 text-sm font-bold text-gray-900">{item.title}</h3>
        <blockquote className="text-sm italic text-gray-700">
          “{item.text}”
        </blockquote>
      </div>
      <figcaption className="mt-4 flex items-center gap-2 border-t border-slate-200 pt-3 text-xs font-semibold text-[var(--aw-slate-700)]">
        <CheckIcon className="h-3.5 w-3.5" />
        Compra verificada
      </figcaption>
    </figure>
  );

  return (
    <div
      ref={trackRef}
      className="aw-hide-scrollbar flex overflow-x-auto gap-4"
      onMouseEnter={pause}
      onMouseLeave={() => resume(0)}
      onTouchStart={pause}
      onTouchEnd={() => resume(2000)}
      onTouchCancel={() => resume(2000)}
      onFocus={pause}
      onBlur={() => resume(0)}
    >
      {/* Dos grupos idénticos: al terminar el primero el salto es invisible. */}
      <div className="flex shrink-0 gap-4 pr-4">
        {items.map((item, index) => card(item, `a-${index}`))}
      </div>
      <div className="flex shrink-0 gap-4 pr-4" aria-hidden="true">
        {items.map((item, index) => card(item, `b-${index}`))}
      </div>
    </div>
  );
}

function VideoCard({ video }: { video: MediaVideo }) {
  return (
    <div className="space-y-3 rounded-3xl border border-slate-100 bg-slate-50/60 p-6 text-center transition-shadow hover:shadow-md sm:p-8">
      <h3 className="text-lg font-bold text-gray-900">{video.title}</h3>
      <div className="relative mx-auto aspect-video w-full max-w-full overflow-hidden rounded-2xl border-2 border-white bg-black shadow-lg sm:max-w-5xl lg:max-w-6xl">
        <video
          controls
          playsInline
          preload="metadata"
          poster={video.poster ? cld(video.poster) : undefined}
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src={cld(video.src)} type="video/mp4" />
          Tu navegador no soporta el elemento de video.
        </video>
      </div>
      <p className="text-sm font-medium text-gray-600">{video.caption}</p>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Landing                                                                    */
/* ------------------------------------------------------------------------- */

export default function BisagrasLanding({
  product,
  onAddToCart,
}: LandingProps) {
  const router = useRouter();

  const unitPrice = Number(product.price);
  const hasPrice = Number.isFinite(unitPrice) && unitPrice > 0;
  const tiers = useMemo(() => buildTiers(unitPrice), [unitPrice]);
  const maxDiscount = useMemo(
    () =>
      tiers.reduce((max, tier) => {
        if (tier.regularTotal <= 0) return max;
        const pct = Math.round(
          ((tier.regularTotal - tier.total) / tier.regularTotal) * 100,
        );
        return Math.max(max, pct);
      }, 0),
    [tiers],
  );

  /**
   * Oferta elegida en el selector (`null` = ninguna). SOLO una tarjeta elegida
   * manda `promotion: true`; sin tarjeta, la compra va a precio normal.
   */
  const [selectedQty, setSelectedQty] = useState<2 | 3 | 4 | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const stock = product.stock;
  const soldOut = typeof stock === "number" && stock <= 0;
  const maxQuantity =
    typeof stock === "number" && stock > 0
      ? Math.min(MAX_QUANTITY, stock)
      : MAX_QUANTITY;

  const selectedTier = tiers.find((tier) => tier.qty === selectedQty) ?? null;

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
      return `Pedir ${selectedTier.qty} unidades · ${formatCop(selectedTier.total)}`;
    }
    return hasPrice
      ? `Agregar ${quantity} al carrito · ${formatCop(unitPrice * quantity)}`
      : "Agregar al carrito";
  })();

  const heroMedia = (
    <ProductImage
      src={HERO_IMAGE.src}
      alt={HERO_IMAGE.alt}
      priority
      sizes="(max-width: 1024px) 100vw, 40vw"
      className="object-cover"
    />
  );

  return (
    <div className="aw-landing bg-[var(--aw-slate-950)] text-gray-200 antialiased">
      <style>{`
        .aw-landing {
          --aw-slate-950: #2d2d2d;
          --aw-slate-900: #1f2937;
          --aw-slate-800: #1e293b;
          --aw-slate-700: #334155;
          --aw-slate-600: #475569;
          --aw-slate-200: #cbd5e1;
          --aw-slate-100: #f1f5f9;
          --aw-gold: #f6b21b;
          --aw-steel: #64748b;
        }
        @keyframes aw-pulse {
          0% { box-shadow: 0 0 0 0 rgba(246, 178, 27, 0.45); }
          70% { box-shadow: 0 0 0 14px rgba(246, 178, 27, 0); }
          100% { box-shadow: 0 0 0 0 rgba(246, 178, 27, 0); }
        }
        @keyframes aw-wave-shift {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-50%, 0, 0); }
        }
        @keyframes aw-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .aw-landing .aw-bounce { animation: aw-bounce 3s infinite ease-in-out; }
        @keyframes aw-shine {
          0%, 55% { transform: translateX(-130%) skewX(-12deg); }
          100% { transform: translateX(130%) skewX(-12deg); }
        }
        .aw-landing .aw-pulse { animation: aw-pulse 2s infinite; }
        .aw-landing .aw-pulse:disabled { animation: none; }
        .aw-landing .aw-wave { animation: aw-wave-shift 18s linear infinite; }
        .aw-landing .aw-wave-reverse { animation: aw-wave-shift 24s linear infinite reverse; }
        .aw-landing .aw-shine { position: relative; overflow: hidden; }
        .aw-landing .aw-shine::after {
          content: "";
          position: absolute;
          top: -20%;
          bottom: -20%;
          left: 0;
          width: 45%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.18), transparent);
          animation: aw-shine 4.5s ease-in-out infinite;
          pointer-events: none;
        }
        .aw-landing .aw-hide-scrollbar { scrollbar-width: none; }
        .aw-landing .aw-hide-scrollbar::-webkit-scrollbar { display: none; }
        @media (prefers-reduced-motion: reduce) {
          .aw-landing .aw-pulse,
          .aw-landing .aw-wave,
          .aw-landing .aw-wave-reverse { animation: none; }
          .aw-landing .aw-shine::after { animation: none; opacity: 0; }
          .aw-landing { scroll-behavior: auto; }
        }
      `}</style>

      {/* 1. Marquee de urgencia */}
      <UrgencyMarquee />

      {/* 2. Hero */}
      <section className="bg-[var(--aw-slate-950)] px-4 pb-12 pt-8 sm:pt-12 lg:pb-16 lg:pt-16">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-10">
          {/* Videos del producto */}
          {VIDEOS.length > 0 ? (
            <div className="col-span-1 space-y-4 lg:col-span-12">
              <SectionHeading
                eyebrow="Míralo en acción"
                title={`Conoce la ${PRODUCT_SHORT_NAME}`}
              />
              <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
                {VIDEOS.map((video) => (
                  <VideoCard key={video.src} video={video} />
                ))}
              </div>
            </div>
          ) : null}

          <div className="lg:col-span-5">
            <div className="relative mx-auto w-full max-w-sm rounded-3xl border border-slate-700 bg-white/5 p-3 shadow-2xl">
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-slate-900">
                {heroMedia}
              </div>
              <p className="mt-3 text-center text-xs font-medium text-slate-400">
                Acero inoxidable · Recubrimiento negro · Tornillos incluidos
              </p>
            </div>
          </div>

          <div className="space-y-5 lg:col-span-7">
            <div className="space-y-4 text-center lg:text-left">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--aw-slate-400)]">
                ⚫ {PRODUCT_BRAND} · Ferretería para el hogar
              </span>
              <h1 className="text-3xl font-extrabold leading-tight text-white sm:text-4xl lg:text-5xl">
                Kit Reparador de Bisagras{" "}
                <span className="text-[var(--aw-gold)]">
                  Premium Negro
                </span>
              </h1>
              <p className="mx-auto max-w-xl text-sm text-slate-400 sm:text-lg lg:mx-0">
                Refuerzos metálicos de acero inoxidable con acabado negro para
                reparar bisagras flojas, madera dañada y puertas que no cierran.
                Incluye tornillos para instalación inmediata.
              </p>
              <p className="mx-auto max-w-xl text-xs text-slate-500 sm:text-sm lg:mx-0">
                Solución DIY que evita reparaciones costosas, cambio de puerta o
                compra de mueble nuevo. Ideal para cocina, baño, clóset y
                gabinetes.
              </p>
              <ul className="mx-auto grid max-w-md grid-cols-2 gap-2 text-left text-xs font-medium text-slate-300 sm:text-sm lg:mx-0">
                {QUICK_BENEFITS.map((benefit) => (
                  <li key={benefit} className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 shrink-0 text-[var(--aw-gold)]" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>

            {/* Selector de ofertas por cantidad */}
            <div id="ofertas" className="scroll-mt-24 space-y-3">
              {tiers.length > 1 ? (
                <div className="relative overflow-hidden rounded-3xl border border-slate-700 bg-gradient-to-b from-slate-900 via-[var(--aw-slate-950)] to-slate-900 p-4 shadow-[0_20px_55px_-28px_rgba(0,0,0,0.8)] sm:p-5">
                  {/* Brillos decorativos del panel */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-slate-700/20 blur-3xl"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-slate-600/30 blur-3xl"
                  />

                  <div className="relative mb-4 flex flex-wrap items-center justify-center gap-2 text-center">
                    <div>
                      <p className="text-base font-extrabold text-white">
                        🔥 Elige tu promoción
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Lleva más y paga menos por cada refuerzo.
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Cada unidad del paquete incluye 4 refuerzos: 1 = 4, 2 = 8,
                        3 = 12, 4 = 16 unidades.
                      </p>
                    </div>
                    {maxDiscount > 0 ? (
                      <span className="rounded-full bg-gradient-to-r from-[var(--aw-gold)] to-[var(--aw-slate-700)] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow">
                        Hasta {maxDiscount}% OFF
                      </span>
                    ) : null}
                  </div>

                  <div
                    role="radiogroup"
                    aria-label="Ofertas por cantidad"
                    className="relative grid grid-cols-1 gap-3 sm:grid-cols-3"
                  >
                    {tiers.map((tier) => {
                      const isSelected = tier.qty === selectedQty;
                      const unavailable =
                        soldOut || (typeof stock === "number" && tier.qty > stock);
                      const saving = tier.regularTotal - tier.total;
                      const discount =
                        tier.regularTotal > 0
                          ? Math.round((saving / tier.regularTotal) * 100)
                          : 0;
                      const isBest = tier.qty === 4;
                      const isFeatured = tier.qty === 3;

                      /* Colores distintivos por tarjeta de promoción */
                      const tierColors: Record<number, { bg: string; border: string; text: string; badge: string; chip: string }> = {
                        2: { bg: "bg-gradient-to-br from-blue-600/20 via-blue-700/30 to-blue-800/40", border: "border-blue-500", text: "text-blue-200", badge: "bg-blue-500 text-white", chip: "bg-blue-500 text-white" },
                        3: { bg: "bg-gradient-to-br from-emerald-600/20 via-emerald-700/30 to-emerald-800/40", border: "border-emerald-500", text: "text-emerald-200", badge: "bg-emerald-500 text-white", chip: "bg-emerald-500 text-white" },
                        4: { bg: "bg-gradient-to-br from-amber-600/20 via-amber-700/30 to-amber-800/40", border: "border-amber-500", text: "text-amber-200", badge: "bg-amber-500 text-[var(--aw-slate-950)]", chip: "bg-amber-500 text-[var(--aw-slate-950)]" },
                      };
                      const tc = tierColors[tier.qty];

                      const cardLook = isBest
                        ? `border-[var(--aw-gold)] ${tc.bg} text-white shadow-xl aw-shine`
                        : isFeatured
                          ? `border-[var(--aw-gold)] ${tc.bg} ${tc.text} shadow-lg`
                          : `${tc.border} ${tc.bg} ${tc.text} hover:border-[var(--aw-gold)] hover:shadow-md`;
                      const stateLook = isSelected
                        ? isBest
                          ? "-translate-y-1 border-[var(--aw-gold)] ring-4 ring-[var(--aw-gold)]/30 shadow-2xl"
                          : "-translate-y-1 border-[var(--aw-slate-500)] ring-4 ring-[var(--aw-slate-400)]/60 shadow-2xl"
                        : "hover:-translate-y-0.5";
                      const mutedLook = isBest ? "text-slate-300/80" : "text-slate-400";
                      const titleLook = isBest ? "text-white" : tc.text;
                      const priceLook = isBest ? "text-white" : "text-[var(--aw-gold)]";
                      const badgeLook = isBest
                        ? "bg-[var(--aw-gold)] text-[var(--aw-slate-950)]"
                        : tc.badge;
                      const chipLook = isBest
                        ? "bg-[var(--aw-gold)]/20 text-[var(--aw-gold)]"
                        : tc.chip;
                      const radioLook = isBest
                        ? isSelected
                          ? "border-[var(--aw-gold)] bg-[var(--aw-gold)]"
                          : "border-white/20"
                        : isSelected
                          ? "border-[var(--aw-gold)] bg-[var(--aw-gold)]"
                          : `${tc.border} bg-white/10`;

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
                          className={`relative flex min-h-10 sm:min-h-11 flex-col rounded-2xl border-2 p-3 sm:p-4 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aw-gold)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${cardLook} ${stateLook} aw-bounce ${isBest ? "aw-shine" : ""}`}
                        >
                          <span
                            className={`absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${radioLook}`}
                            aria-hidden="true"
                          >
                            {isSelected ? (
                              <CheckIcon
                                className={`h-3 w-3 ${
                                  isBest
                                    ? "text-[var(--aw-slate-950)]"
                                    : "text-white"
                                }`}
                              />
                            ) : null}
                          </span>

                          {tier.badge ? (
                            <span
                              className={`mb-2 inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-black uppercase tracking-[0.14em] ${badgeLook}`}
                            >
                              {tier.badge}
                            </span>
                          ) : (
                            <span
                              className="mb-2 block h-[22px]"
                              aria-hidden="true"
                            />
                          )}

                          <span
                            className={`block text-sm font-bold uppercase tracking-[0.14em] ${mutedLook}`}
                          >
                            {tier.label}
                          </span>
                          <span className={`mt-0.5 block text-base font-bold ${titleLook}`}>
                            {tier.qty} unidades
                          </span>
                          <span
                            className={`mt-2 block text-3xl font-black leading-none tracking-tight sm:text-[2rem] ${priceLook}`}
                          >
                            {formatCop(tier.total)}
                          </span>
                          <span className={`mt-1 block text-sm font-medium ${mutedLook}`}>
                            {tier.qty > 1
                              ? `${formatCop(tier.total / tier.qty)} c/u`
                              : "Precio por unidad"}
                          </span>

                          <span className="mt-3 flex flex-wrap items-center gap-1.5">
                            {saving > 0 ? (
                              <>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-sm font-black ${chipLook}`}
                                >
                                  Ahorras {formatCop(saving)}
                                </span>
                              </>
                            ) : (
                              <span className={`text-sm ${mutedLook}`}>
                                Pago contra entrega
                              </span>
                            )}
                          </span>

                          {discount > 0 ? (
                            <span
                              className={`mt-2 inline-flex w-fit rounded-md px-1.5 py-0.5 text-sm font-black ${
                                isBest
                                  ? "bg-white/15 text-white"
                                  : "bg-[var(--aw-slate-500)] text-white"
                              }`}
                            >
                              -{discount}% OFF
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  <p className="relative mt-3 text-center text-[11px] text-slate-400">
                    {selectedTier
                      ? "Toca de nuevo la oferta para quitarla y comprar a precio normal."
                      : "Sin oferta elegida pagas el precio normal por unidad."}
                  </p>
                </div>
              ) : null}

              {/* Cantidad: solo en compra normal (sin oferta elegida) */}
              {!selectedTier && hasPrice ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-white/5 px-4 py-3">
                  <div>
                    <span className="block text-xs font-bold uppercase text-slate-400">
                      Precio normal
                    </span>
                    <span className="text-xl font-extrabold text-[var(--aw-gold)]">
                      {formatCop(unitPrice)}
                    </span>
                    <span className="ml-1 text-xs text-slate-400">c/u</span>
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
                      className="flex min-h-11 w-11 items-center justify-center rounded-xl border border-slate-700 text-lg font-bold text-[var(--aw-gold)] disabled:opacity-40"
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
                      className="flex min-h-11 w-11 items-center justify-center rounded-xl border border-slate-700 text-lg font-bold text-[var(--aw-gold)] disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>
              ) : null}

              <div>
                <button
                  type="button"
                  onClick={() => void handleBuy()}
                  disabled={pending || soldOut || !hasPrice}
                  className={`aw-pulse flex min-h-14 w-full items-center justify-center rounded-2xl px-5 py-4 text-base font-bold text-white shadow-lg transition-all sm:text-lg ${
                    soldOut || !hasPrice
                      ? "cursor-not-allowed bg-slate-600"
                      : "bg-gradient-to-r from-[var(--aw-gold)] to-[var(--aw-slate-700)] hover:-translate-y-0.5"
                  } ${pending ? "cursor-wait opacity-75" : ""}`}
                >
                  {ctaLabel}
                </button>
                {failed ? (
                  <p role="alert" className="mt-2 text-center text-sm text-red-400">
                    No pudimos agregar el producto. Intenta de nuevo.
                  </p>
                ) : null}
                <p className="mt-2 text-center text-xs text-slate-400">
                  Pago contra entrega disponible en todo el país · Envío gratis
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <WaveDivider from="var(--aw-slate-950)" to="#ffffff" />

      {/* 3. Señales de que necesitas el producto */}
      <section className="bg-white px-4 py-14">
        <div className="mx-auto max-w-5xl space-y-10">
          <SectionHeading
            eyebrow="¿Te suena familiar?"
            title={`¿Para quién es la ${PRODUCT_SHORT_NAME}?`}
            subtitle="Para hogares, carpintería y mantenimiento que necesitan reparar bisagras sin reemplazar muebles."
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SIGNS.map((sign) => (
              <div
                key={sign.title}
                className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 transition-shadow hover:shadow-md"
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
          <div className="flex flex-col items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-[var(--aw-slate-800)] to-[var(--aw-slate-950)] p-6 text-white shadow-lg sm:flex-row">
            <div className="text-center sm:text-left">
              <h3 className="text-lg font-bold">Repara tus bisagras hoy</h3>
              <p className="text-xs text-slate-300 sm:text-sm">
                Kit con tornillos incluidos, envío gratis y pago contra
                entrega.
              </p>
            </div>
            <a
              href="#ofertas"
              className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-xl bg-white px-6 py-3 font-bold text-[var(--aw-slate-900)] shadow transition-colors hover:bg-slate-50"
            >
              Quiero pedirlo
            </a>
          </div>
        </div>
      </section>

      <WaveDivider from="#ffffff" to="var(--aw-slate-950)" reverse />

      {/* 4. Beneficios del producto */}
      <section className="bg-[var(--aw-slate-950)] px-4 py-16">
        <div className="mx-auto max-w-6xl space-y-10">
          <SectionHeading
            eyebrow="Calidad de ferretería"
            title="Acero inoxidable con acabado negro"
            subtitle="Refuerzos resistentes, tornillos incluidos y compatibilidad con bisagras estándar."
          />
          <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-3">
            {BENEFITS.map((benefit) =>
              benefit.featured ? (
                <div
                  key={benefit.title}
                  className="relative space-y-3 rounded-3xl border-2 border-[var(--aw-gold)] bg-gradient-to-b from-white/5 to-slate-900/40 p-8 text-center shadow-xl"
                >
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--aw-gold)] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--aw-slate-950)]">
                    Principal
                  </span>
                  <div
                    className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-slate-800 text-3xl shadow-md"
                    aria-hidden="true"
                  >
                    {benefit.icon}
                  </div>
                  <h3 className="text-xl font-extrabold text-white">
                    {benefit.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-300">
                    {benefit.text}
                  </p>
                </div>
              ) : (
                <div
                  key={benefit.title}
                  className="space-y-3 rounded-3xl border border-slate-700 bg-white/5 p-6 text-center shadow-sm transition-colors hover:border-[var(--aw-gold)]"
                >
                  <div
                    className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800 text-2xl"
                    aria-hidden="true"
                  >
                    {benefit.icon}
                  </div>
                  <h3 className="text-lg font-bold text-white">
                    {benefit.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-300">
                    {benefit.text}
                  </p>
                </div>
              ),
            )}
          </div>

          <div className="rounded-3xl border border-slate-700 bg-white/5 p-6 shadow-sm sm:p-8">
            <h3 className="text-center text-lg font-extrabold text-white">
              Beneficios principales
            </h3>
            <ul className="mt-5 grid grid-cols-1 gap-3 text-left sm:grid-cols-2">
              {SALES_BENEFITS.map((benefit) => (
                <li
                  key={benefit}
                  className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-300 sm:text-sm"
                >
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--aw-gold)]" />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <WaveDivider from="var(--aw-slate-950)" to="#ffffff" />

      {/* 5. Comparativa con otras opciones */}
      <section className="bg-white px-4 py-14">
        <div className="mx-auto max-w-5xl space-y-8">
          <SectionHeading
            eyebrow="Comparativa"
            title="¿Por qué elegir el Kit Bisagras Premium?"
            subtitle="Refuerzos metálicos con tornillos incluidos frente a llamar al carpintero o comprar mueble nuevo."
          />

          <div className="relative overflow-hidden rounded-3xl border border-slate-200 shadow-[0_24px_60px_-32px_rgba(0,0,0,0.1)]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-slate-100/60 blur-3xl"
            />

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <caption className="sr-only">
                  Comparación del Kit Bisagras Premium con otras opciones
                </caption>
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="w-[31%] bg-slate-50 px-4 py-5 text-[11px] font-black uppercase tracking-widest text-slate-500"
                    >
                      Característica
                    </th>
                    <th
                      scope="col"
                      className="relative w-[27%] bg-gradient-to-b from-[var(--aw-slate-800)] to-[var(--aw-slate-950)] px-4 py-4 text-center text-white"
                    >
                      <span className="mx-auto mb-1.5 block w-fit rounded-full bg-[var(--aw-gold)] px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-[var(--aw-slate-950)] shadow">
                        La mejor opción
                      </span>
                      <span className="block text-sm font-extrabold leading-tight">
                        Kit Bisagras Premium
                      </span>
                      <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-300/80">
                        Acero inoxidable · Negro
                      </span>
                    </th>
                    <th
                      scope="col"
                      className="w-[21%] bg-slate-50 px-3 py-5 text-center text-[11px] font-bold leading-snug text-slate-600"
                    >
                      Carpintero
                      <span className="block font-semibold text-slate-400">
                        a domicilio
                      </span>
                    </th>
                    <th
                      scope="col"
                      className="w-[21%] bg-slate-50 px-3 py-5 text-center text-[11px] font-bold leading-snug text-slate-600"
                    >
                      Mueble
                      <span className="block font-semibold text-slate-400">
                        nuevo
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row, index) => (
                    <tr
                      key={row.feature}
                      className={index % 2 === 0 ? "bg-white" : "bg-slate-50/40"}
                    >
                      <th
                        scope="row"
                        className="border-t border-slate-100 px-4 py-3 text-xs font-semibold leading-snug text-gray-800 sm:text-sm"
                      >
                        {row.feature}
                      </th>
                      <td className="border-x-2 border-t border-slate-200 bg-slate-50/70 px-3 py-3 text-center">
                        <ComparisonCell value={row.ours} highlight />
                      </td>
                      <td className="border-t border-slate-100 px-3 py-3 text-center">
                        <ComparisonCell value={row.carpintero} />
                      </td>
                      <td className="border-t border-slate-100 px-3 py-3 text-center">
                        <ComparisonCell value={row.muebleNuevo} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] font-medium text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[var(--aw-slate-700)]"
                aria-hidden="true"
              >
                <CheckIcon className="h-3.5 w-3.5" />
              </span>
              Sí
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-sm font-black text-slate-500"
                aria-hidden="true"
              >
                ≈
              </span>
              Varía según la opción
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-50 text-sm font-bold text-slate-400"
                aria-hidden="true"
              >
                —
              </span>
              No
            </span>
            <span className="sm:hidden">Desliza para comparar →</span>
          </div>

          <p className="mx-auto max-w-3xl text-center text-[11px] leading-relaxed text-slate-500">
            La información de las otras columnas es referencial y puede variar
            según el profesional o el mueble. Verifica siempre la compatibilidad
            con tus bisagras antes de comprar.
          </p>

          <div className="text-center">
            <a
              href="#ofertas"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-[var(--aw-gold)] to-[var(--aw-slate-700)] px-8 py-3 text-base font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
            >
              Quiero mi Kit Bisagras
            </a>
          </div>
        </div>
      </section>

      {/* 6. Galería de imágenes */}
      <section className="bg-[var(--aw-slate-950)] px-4 py-14">
        <div className="mx-auto max-w-6xl space-y-8">
          <SectionHeading
            eyebrow="Galería"
            title={`Conoce la ${PRODUCT_SHORT_NAME}`}
          />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {GALLERY.map((image, index) => (
              <div
                key={image.src}
                className="group relative aspect-square overflow-hidden rounded-xl border border-slate-700 bg-slate-900"
              >
                <ProductImage
                  src={cld(image.src)}
                  alt={image.alt}
                  priority={index === 0}
                  sizes="(max-width: 640px) 50vw, 25vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <WaveDivider from="var(--aw-slate-950)" to="#ffffff" />

      {/* 7. Reseñas de clientes (auto-scroll horizontal) */}
      {REVIEWS.length > 0 ? (
        <section className="overflow-hidden bg-white px-4 py-14">
          <div className="mx-auto max-w-6xl space-y-8">
            <SectionHeading
              eyebrow="Reseñas de clientes"
              title="Lo que dicen quienes ya lo probaron"
              subtitle="Opiniones de personas que repararon sus bisagras con este kit."
            />
            <ReviewsCarousel items={REVIEWS} />
          </div>
        </section>
      ) : null}

      <WaveDivider from="#ffffff" to="var(--aw-slate-900)" />

      {/* 8. CTA final + garantía */}
      <section className="bg-gradient-to-b from-[var(--aw-slate-900)] to-[var(--aw-slate-950)] px-4 py-14 text-center text-white">
        <div className="mx-auto max-w-3xl space-y-5">
          <h2 className="text-2xl font-extrabold sm:text-4xl">
            Bisagras firmes, puertas como nuevas
          </h2>
          <p className="text-sm text-slate-300 sm:text-base">
            Pide hoy tu {PRODUCT_SHORT_NAME} con envío gratis y paga al recibir
            en la puerta de tu casa.
          </p>
          <a
            href="#ofertas"
            className="aw-pulse inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-white px-8 py-4 text-lg font-bold text-[var(--aw-slate-900)] shadow-lg transition-transform hover:-translate-y-0.5 sm:w-auto"
          >
            Quiero mi Kit Bisagras
          </a>
          {GUARANTEE_TEXT ? (
            <p className="mx-auto max-w-xl rounded-2xl border border-white/20 bg-white/10 p-4 text-sm">
              {GUARANTEE_TEXT}
            </p>
          ) : null}
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-2 text-xs font-medium text-slate-300">
            <li>🚚 Envío gratis</li>
            <li>🤝 Pago contra entrega</li>
            <li>🔒 Compra segura</li>
          </ul>
          <p className="mx-auto max-w-2xl pt-4 text-[11px] leading-relaxed text-slate-400/80">
            {DISCLAIMER}
            {SANITARY_REGISTRY ? ` ${SANITARY_REGISTRY}` : ""}
          </p>
        </div>
      </section>
    </div>
  );
}
