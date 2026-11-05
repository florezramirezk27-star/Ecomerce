"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ProductImage from "@/components/ProductImage";

/**
 * Landing de "Crema aclarante Arbutin 7.0 + TXA 4.0" (TOSOWOONG, 50 g).
 *
 * Toma la estructura de `AceiteOreganoLanding` (marquesina, hero con video,
 * señales, ingredientes, modo de uso, resultados, galería, reseñas y CTA
 * final) y la viste en rosa y blanco. Las transiciones entre secciones son
 * olas SVG en movimiento continuo.
 *
 * Se monta en `app/products/[slug]/page.tsx` cuando el slug o el nombre del
 * producto coinciden con `ARBUTINA_SLUG` o con `/arbutin|tosowoong/i`.
 *
 * Las ofertas por cantidad replican el esquema de las otras landings
 * (2 unidades con descuento y "paga 2 y lleva 3") y su precio coincide con el
 * que cobra el carrito vía `lib/product-promotion.ts`.
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
export const ARBUTINA_SLUG = "crema-arbutina-tosowoong";

/* ------------------------------------------------------------------------- */
/* CONTENIDO                                                                  */
/* ------------------------------------------------------------------------- */

const PRODUCT_SHORT_NAME = "Crema Arbutina";
const PRODUCT_BRAND = "TOSOWOONG";

/**
 * Totales de promoción por cantidad (COP), iguales a los de la landing de
 * Aceite de Orégano porque la unidad también cuesta $69.900.
 * - 2 unidades: $109.900 en total.
 * - 3 unidades: $139.800 en total ("paga 2 y lleva 3").
 *
 * Deben coincidir con `ARBUTINA_OFFER_UNIT_PRICES` de `lib/product-promotion.ts`
 * y con su gemela de la API; si no, la landing mostraría un precio que el
 * carrito no cobra.
 */
const BULK_TOTALS: Readonly<Record<2 | 3, number | null>> = {
  2: 109_900,
  3: 139_800,
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
  src: "/landings/crema-arbutina/images/crema-arbutina-1.png",
  alt: `${PRODUCT_SHORT_NAME} TOSOWOONG, crema facial de 50 g`,
};

const GALLERY: readonly MediaImage[] = [
  {
    src: "/landings/crema-arbutina/images/crema-arbutina-1.png",
    alt: `${PRODUCT_SHORT_NAME} TOSOWOONG, presentación de 50 g`,
  },
  {
    src: "/landings/crema-arbutina/images/crema-arbutina-2.jpeg",
    alt: `${PRODUCT_SHORT_NAME} en rutina de cuidado facial`,
  },
  {
    src: "/landings/crema-arbutina/images/crema-arbutina-3.jpeg",
    alt: `Textura de la ${PRODUCT_SHORT_NAME}`,
  },
  {
    src: "/landings/crema-arbutina/images/crema-arbutina-4.jpeg",
    alt: `${PRODUCT_SHORT_NAME} para una piel luminosa`,
  },
];

const VIDEOS: readonly MediaVideo[] = [
  {
    src: "/landings/crema-arbutina/videos/crema-arbutina-1.mp4",
    title: "Conoce la Crema Arbutina",
    caption: "Textura, presentación y cómo incorporarla a tu rutina facial.",
  },
  {
    src: "/landings/crema-arbutina/videos/crema.mp4",
    title: "Crema Arbutina en acción",
    caption: "Demostración de aplicación y resultados en piel real.",
  },
];

/** TODO(RESULTADOS): fotos o capturas de clientes reales con su permiso. */
const RESULTS: readonly MediaImage[] = [];

/** TODO(GARANTIA): texto de la garantía, solo si la tienda la ofrece de verdad. */
const GUARANTEE_TEXT: string | null = null;

/** TODO(INVIMA): registro o notificación sanitaria, si aplica. */
const SANITARY_REGISTRY: string | null = null;

const REVIEWS: readonly Review[] = [
  {
    stars: 5,
    title: "Manchas visiblemente más claras",
    text: "Llevo usando esta crema un par de semanas y he notado que las manchitas oscuras en mis mejillas se ven mucho más claras. La combinación de Arbutina al 7% y Ácido Tranexámico realmente funciona. ¡Súper recomendada!",
  },
  {
    stars: 5,
    title: "Textura cremosa y ligera",
    text: "Me encanta la textura cremosa que tiene. No deja sensación grasosa y se absorbe súper rápido. Además de ayudarme con el tono desigual, me deja la piel muy hidratada y suave en mi rutina de mañana y noche.",
  },
  {
    stars: 5,
    title: "Ideal para marcas de acné",
    text: "Compré este producto buscando algo para las marcas que me dejó el acné y me ha sorprendido. Mi piel se ve mucho más uniforme y luminosa. Es un básico en mi cuidado facial ahora.",
  },
  {
    stars: 5,
    title: "Un básico del skincare asiático",
    text: "Soy fan del skincare asiático y esta crema tiene los ingredientes perfectos. Me deja un efecto de piel radiante y sana. El tamaño de 50 g rinde bastante porque con una pequeña cantidad se cubre bien el rostro.",
  },
  {
    stars: 5,
    title: "Piel luminosa y renovada",
    text: "Mi cutis estaba muy opaco y sin vida. Desde que la incorporé a mi rutina, he notado un cambio increíble en la luminosidad de mi cara. ¡La piel se siente renovada y el tono más parejo!",
  },
  {
    stars: 5,
    title: "Fácil de aplicar y muy gentil",
    text: "Excelente crema aclarante. Vi un video de la rutina con este producto, me animé a pedirla y no me arrepiento. Es fácil de aplicar, no me irritó y las zonas oscuras se están difuminando.",
  },
  {
    stars: 5,
    title: "Tono más uniforme",
    text: "Me ha ayudado muchísimo a igualar el tono de mi piel, especialmente en la zona de la frente y el contorno de la boca. Es muy gentil, aporta una hidratación súper rica y deja el rostro liso.",
  },
  {
    stars: 5,
    title: "Perfecta para la rutina antimanchas",
    text: "¡Es un 10/10! Quería algo para complementar mi rutina antimanchas y esta crema encajó perfecto. Las manchas de sol se ven mucho menos marcadas y mi piel se siente suave todo el día.",
  },
  {
    stars: 5,
    title: "Resultados en cara y cuello",
    text: "La he estado usando religiosamente en la mañana y en la noche. Las zonas oscuras que tenía en la cara y el cuello han disminuido visualmente. Me gusta que es muy amigable con la piel.",
  },
  {
    stars: 5,
    title: "Hidrata sin resecar",
    text: "Cumple lo que promete. Buscaba un tratamiento para manchas que no me resecara la cara y esta crema hace todo lo contrario. Me deja el rostro súper luminoso, hidratado y sin marcas rojizas.",
  },
];

const MARQUEE_ITEMS: readonly { strong: string; rest: string }[] = [
  { strong: "ENVÍO GRATIS", rest: "A TODA COLOMBIA" },
  { strong: "PAGO CONTRA ENTREGA:", rest: "paga al recibir en casa" },
  { strong: "ARBUTINA 7.0 + TXA 4.0", rest: "cuidado facial diario" },
  { strong: "CONTENIDO 50 G", rest: "textura cremosa" },
];

const QUICK_BENEFITS: readonly string[] = [
  "Arbutina 7.0 + TXA 4.0",
  "Ayuda con la apariencia de manchas",
  "Tono más uniforme y luminoso",
  "Contenido 50 g",
];

const SIGNS: readonly { icon: string; title: string; text: string }[] = [
  {
    icon: "🫧",
    title: "Manchas visibles",
    text: "Te preocupa la apariencia de manchas y marcas visibles en el rostro.",
  },
  {
    icon: "🌤️",
    title: "Tono desigual",
    text: "Notas zonas del rostro con un tono distinto y buscas un aspecto más uniforme.",
  },
  {
    icon: "✨",
    title: "Marcas post-acné",
    text: "Buscas un producto que complemente el cuidado de la apariencia de marcas post-acné.",
  },
  {
    icon: "🌸",
    title: "Skincare asiático",
    text: "Te interesa el cuidado coreano o asiático y disfrutas las rutinas de skincare.",
  },
  {
    icon: "💧",
    title: "Piel luminosa",
    text: "Quieres una piel con apariencia más luminosa, hidratada y cuidada.",
  },
  {
    icon: "🧴",
    title: "Rutina antimanchas",
    text: "Ya usas sérums, cremas antimanchas y productos de cuidado facial.",
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
    title: "Arbutina 7.0",
    text: "Activo popular en productos cosméticos para el cuidado de la piel y la apariencia de la pigmentación.",
  },
  {
    icon: "✨",
    title: "Arbutina + TXA",
    text: "Fórmula que combina Arbutina 7.0 y Ácido Tranexámico 4.0 para complementar rutinas enfocadas en manchas y tono desigual.",
    featured: true,
  },
  {
    icon: "🧴",
    title: "Textura 50 g",
    text: "Crema de textura suave y fácil aplicación que aporta hidratación y puede incorporarse a la rutina de mañana y noche.",
  },
];

const SALES_BENEFITS: readonly string[] = [
  "Ayuda a mejorar la apariencia de manchas y marcas visibles.",
  "Favorece un tono de piel con aspecto más uniforme.",
  "Ayuda a disminuir visualmente zonas oscuras y opacas.",
  "Aporta una apariencia más luminosa y radiante.",
  "Ideal para complementar rutinas de cuidado antimanchas.",
  "Presentación práctica de 50 g.",
  "Fácil de incorporar a tu rutina facial diaria.",
];

type ComparisonValue = "yes" | "varies" | "no";

interface ComparisonRow {
  feature: string;
  ours: ComparisonValue;
  otherAntiSpots: ComparisonValue;
  basicCream: ComparisonValue;
}

/**
 * Comparativa orientativa. Las columnas de la competencia usan "varía" en los
 * atributos que dependen de cada marca; no se afirma nada que no se pueda
 * comprobar en la etiqueta del producto.
 */
const COMPARISON_ROWS: readonly ComparisonRow[] = [
  {
    feature: "Arbutina 7.0",
    ours: "yes",
    otherAntiSpots: "varies",
    basicCream: "no",
  },
  {
    feature: "Ácido Tranexámico 4.0",
    ours: "yes",
    otherAntiSpots: "varies",
    basicCream: "no",
  },
  {
    feature: "Dos activos en una sola crema",
    ours: "yes",
    otherAntiSpots: "varies",
    basicCream: "no",
  },
  {
    feature: "Textura cremosa de rápida absorción",
    ours: "yes",
    otherAntiSpots: "varies",
    basicCream: "varies",
  },
  {
    feature: "Enfoque en apariencia de manchas y tono uniforme",
    ours: "yes",
    otherAntiSpots: "varies",
    basicCream: "no",
  },
  {
    feature: "Presentación de 50 g",
    ours: "yes",
    otherAntiSpots: "varies",
    basicCream: "varies",
  },
  {
    feature: "Uso mañana y noche",
    ours: "yes",
    otherAntiSpots: "varies",
    basicCream: "varies",
  },
  {
    feature: "Fácil de incorporar a la rutina facial",
    ours: "yes",
    otherAntiSpots: "varies",
    basicCream: "varies",
  },
];

const DISCLAIMER =
  "Producto cosmético de uso externo. No es un medicamento ni sustituye la valoración de un especialista. Evita el contacto con los ojos. Si presentas irritación, suspende su uso. Los resultados pueden variar de una persona a otra.";

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
            ? "bg-[var(--aw-rose-700)] text-white shadow-sm"
            : "bg-rose-100 text-[var(--aw-rose-700)]"
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
        title="Varía según la marca y la fórmula"
      >
        ≈<span className="sr-only">Varía según la marca y la fórmula</span>
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
      <span className="inline-block rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-[var(--aw-rose-700)]">
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
      className="overflow-hidden whitespace-nowrap bg-[var(--aw-rose-900)] py-2.5 text-[11px] font-medium text-white sm:text-sm"
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
      className="flex w-80 shrink-0 flex-col justify-between rounded-2xl border border-rose-200 bg-white p-5 shadow-sm"
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
      <figcaption className="mt-4 flex items-center gap-2 border-t border-rose-200 pt-3 text-xs font-semibold text-[var(--aw-rose-700)]">
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
    <div className="space-y-3 rounded-3xl border border-rose-100 bg-rose-50/60 p-6 text-center transition-shadow hover:shadow-md sm:p-8">
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

export default function ArbutinaLanding({
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
      const units = selectedTier.qty === 1 ? "unidad" : "unidades";
      return `Pedir ${selectedTier.qty} ${units} · ${formatCop(selectedTier.total)}`;
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
    <div className="aw-landing bg-[var(--aw-blush)] text-gray-800 antialiased">
      <style>{`
        .aw-landing {
          --aw-rose-950: #451025;
          --aw-rose-900: #671635;
          --aw-rose-800: #8d1c49;
          --aw-rose-700: #b32561;
          --aw-rose-600: #d43d7a;
          --aw-rose-500: #ef6fa3;
          --aw-rose-200: #f9c7da;
          --aw-rose-100: #fde7f0;
          --aw-blush: #fff6f9;
          --aw-gold: #f6b21b;
        }
        @keyframes aw-pulse {
          0% { box-shadow: 0 0 0 0 rgba(212, 61, 122, 0.45); }
          70% { box-shadow: 0 0 0 14px rgba(212, 61, 122, 0); }
          100% { box-shadow: 0 0 0 0 rgba(212, 61, 122, 0); }
        }
        @keyframes aw-wave-shift {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-50%, 0, 0); }
        }
        @keyframes aw-shine {
          0%, 55% { transform: translateX(-130%) skewX(-12deg); }
          100% { transform: translateX(130%) skewX(-12deg); }
        }
        @keyframes aw-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .aw-landing .aw-bounce { animation: aw-bounce 1.5s infinite ease-in-out; }
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
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.28), transparent);
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
      <section className="bg-[var(--aw-blush)] px-4 pb-12 pt-8 sm:pt-12 lg:pb-16 lg:pt-16">
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
            <div className="relative mx-auto w-full max-w-sm rounded-3xl border border-rose-200 bg-white p-3 shadow-xl">
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-rose-50">
                {heroMedia}
              </div>
              <p className="mt-3 text-center text-xs font-medium text-gray-500">
                Contenido 50 g · Uso facial
              </p>
            </div>
          </div>

          <div className="space-y-5 lg:col-span-7">
            <div className="space-y-4 text-center lg:text-left">
              <span className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--aw-rose-800)]">
                ✨ {PRODUCT_BRAND} · Skincare facial
              </span>
              <h1 className="text-3xl font-extrabold leading-tight text-gray-900 sm:text-4xl lg:text-5xl">
                Crema aclarante{" "}
                <span className="text-[var(--aw-rose-700)]">
                  Arbutin 7.0 + TXA 4.0
                </span>
              </h1>
              <p className="mx-auto max-w-xl text-sm text-gray-600 sm:text-lg lg:mx-0">
                Crema facial formulada con Arbutina 7.0 + Ácido Tranexámico
                4.0, ideal para complementar rutinas de cuidado enfocadas en
                mejorar la apariencia de manchas y lograr un tono de piel más
                uniforme.
              </p>
              <p className="mx-auto max-w-xl text-xs text-gray-500 sm:text-sm lg:mx-0">
                Su fórmula ayuda a dejar la piel con una apariencia más
                luminosa, uniforme y cuidada, mientras aporta hidratación y
                suavidad.
              </p>
              <ul className="mx-auto grid max-w-md grid-cols-2 gap-2 text-left text-xs font-medium text-gray-700 sm:text-sm lg:mx-0">
                {QUICK_BENEFITS.map((benefit) => (
                  <li key={benefit} className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 shrink-0 text-[var(--aw-rose-600)]" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>

            {/* Selector de ofertas por cantidad */}
            <div id="ofertas" className="scroll-mt-24 space-y-3">
              {tiers.length > 1 ? (
                <div className="relative overflow-hidden rounded-3xl border border-rose-200 bg-gradient-to-b from-rose-50 via-white to-rose-50 p-4 shadow-[0_20px_55px_-28px_rgba(179,37,97,0.65)] sm:p-5">
                  {/* Brillos decorativos del panel */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-rose-300/30 blur-3xl"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-rose-200/40 blur-3xl"
                  />

                  <div className="relative mb-4 flex flex-wrap items-center justify-center gap-2 text-center">
                    <div>
                      <p className="text-base font-extrabold text-gray-900">
                        🔥 Elige tu promoción
                      </p>
                      <p className="text-[11px] text-gray-500">
                        Lleva más y paga menos por cada crema.
                      </p>
                    </div>
                    {maxDiscount > 0 ? (
                      <span className="rounded-full bg-gradient-to-r from-[var(--aw-rose-600)] to-[var(--aw-rose-800)] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow">
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
                      const isBest = tier.qty === 3;
                      const isFeatured = tier.qty === 2;

                      const cardLook = isBest
                        ? "border-[var(--aw-rose-800)] bg-gradient-to-br from-[var(--aw-rose-800)] via-[var(--aw-rose-900)] to-[var(--aw-rose-950)] text-white shadow-xl"
                        : isFeatured
                          ? "border-[var(--aw-rose-400)] bg-gradient-to-b from-white to-rose-100 shadow-lg"
                          : "border-rose-200 bg-white hover:border-rose-400 hover:shadow-md";
                      const stateLook = isSelected
                        ? isBest
                          ? "-translate-y-1 border-[var(--aw-gold)] ring-4 ring-[var(--aw-gold)]/30 shadow-2xl"
                          : "-translate-y-1 border-[var(--aw-rose-600)] ring-4 ring-[var(--aw-rose-300)]/60 shadow-2xl"
                        : "hover:-translate-y-0.5";
                      const mutedLook = isBest ? "text-rose-100/80" : "text-gray-500";
                      const titleLook = isBest ? "text-white" : "text-gray-900";
                      const priceLook = isBest
                        ? "text-white"
                        : "text-[var(--aw-rose-700)]";
                      const badgeLook = isBest
                        ? "bg-[var(--aw-gold)] text-[var(--aw-rose-950)]"
                        : isFeatured
                          ? "bg-[var(--aw-rose-600)] text-white"
                          : "bg-rose-100 text-[var(--aw-rose-800)]";
                      const chipLook = isBest
                        ? "bg-[var(--aw-gold)]/90 text-[var(--aw-rose-950)]"
                        : "bg-rose-100 text-[var(--aw-rose-800)]";
                      const radioLook = isBest
                        ? isSelected
                          ? "border-[var(--aw-gold)] bg-[var(--aw-gold)]"
                          : "border-white/60"
                        : isSelected
                          ? "border-[var(--aw-rose-600)] bg-[var(--aw-rose-600)]"
                          : "border-gray-300 bg-white";

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
                          className={`relative flex min-h-10 sm:min-h-11 flex-col rounded-2xl border-2 p-3 sm:p-4 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aw-rose-500)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${cardLook} ${stateLook} aw-bounce ${isBest ? "aw-shine" : ""}`}
                        >
                          <span
                            className={`absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${radioLook}`}
                            aria-hidden="true"
                          >
                            {isSelected ? (
                              <CheckIcon
                                className={`h-3 w-3 ${
                                  isBest
                                    ? "text-[var(--aw-rose-950)]"
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
                            {tier.qty} {tier.qty === 1 ? "unidad" : "unidades"}
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
                                <del className={`text-sm ${mutedLook}`}>
                                  {formatCop(tier.regularTotal)}
                                </del>
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
                                  : "bg-[var(--aw-rose-700)] text-white"
                              }`}
                            >
                              -{discount}% OFF
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  <p className="relative mt-3 text-center text-[11px] text-gray-500">
                    {selectedTier
                      ? "Toca de nuevo la oferta para quitarla y comprar a precio normal."
                      : "Sin oferta elegida pagas el precio normal por unidad."}
                  </p>
                </div>
              ) : null}

              {/* Cantidad: solo en compra normal (sin oferta elegida) */}
              {!selectedTier && hasPrice ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-white px-4 py-3">
                  <div>
                    <span className="block text-xs font-bold uppercase text-gray-500">
                      Precio normal
                    </span>
                    <span className="text-xl font-extrabold text-[var(--aw-rose-700)]">
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
                      className="flex min-h-11 w-11 items-center justify-center rounded-xl border border-rose-200 text-lg font-bold text-[var(--aw-rose-800)] disabled:opacity-40 aw-bounce"
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
                      className="flex min-h-11 w-11 items-center justify-center rounded-xl border border-rose-200 text-lg font-bold text-[var(--aw-rose-800)] disabled:opacity-40 aw-bounce"
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
                className={`aw-pulse flex min-h-14 w-full items-center justify-center rounded-2xl px-5 py-4 text-base font-bold text-white shadow-lg transition-all sm:text-lg ${
                  soldOut || !hasPrice
                    ? "cursor-not-allowed bg-gray-400"
                    : "bg-gradient-to-r from-[var(--aw-rose-600)] to-[var(--aw-rose-900)] hover:-translate-y-0.5"
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

      <WaveDivider from="var(--aw-blush)" to="#ffffff" />

      {/* 3. Señales de que necesitas el producto */}
      <section className="bg-white px-4 py-14">
        <div className="mx-auto max-w-5xl space-y-10">
          <SectionHeading
            eyebrow="¿Te suena familiar?"
            title={`¿Para quién es la ${PRODUCT_SHORT_NAME}?`}
            subtitle="Para rutinas que buscan mejorar la apariencia de manchas, zonas oscuras y tono desigual."
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SIGNS.map((sign) => (
              <div
                key={sign.title}
                className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5 transition-shadow hover:shadow-md"
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
          <div className="flex flex-col items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-[var(--aw-rose-700)] to-[var(--aw-rose-950)] p-6 text-white shadow-lg sm:flex-row">
            <div className="text-center sm:text-left">
              <h3 className="text-lg font-bold">Complementa tu rutina facial</h3>
              <p className="text-xs text-rose-100 sm:text-sm">
                Una crema de 50 g fácil de incorporar, con envío gratis y pago
                contra entrega.
              </p>
            </div>
            <a
              href="#ofertas"
              className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-xl bg-white px-6 py-3 font-bold text-[var(--aw-rose-800)] shadow transition-colors hover:bg-rose-50 aw-bounce"
            >
              Quiero pedirla
            </a>
          </div>
        </div>
      </section>

      <WaveDivider from="#ffffff" to="var(--aw-blush)" reverse />

      {/* 4. Ingredientes y beneficios */}
      <section className="bg-[var(--aw-blush)] px-4 py-16">
        <div className="mx-auto max-w-6xl space-y-10">
          <SectionHeading
            eyebrow="Fórmula de tratamiento"
            title="Arbutina + TXA, en una sola crema"
            subtitle="Activos populares en el cuidado cosmético de la piel y la apariencia de la pigmentación."
          />
          <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-3">
            {BENEFITS.map((benefit) =>
              benefit.featured ? (
                <div
                  key={benefit.title}
                  className="relative space-y-3 rounded-3xl border-2 border-[var(--aw-rose-600)] bg-gradient-to-b from-white to-rose-100 p-8 text-center shadow-xl"
                >
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--aw-rose-700)] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                    Fórmula principal
                  </span>
                  <div
                    className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-rose-200 text-3xl shadow-md"
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
                  className="space-y-3 rounded-3xl border border-rose-200 bg-white p-6 text-center shadow-sm transition-colors hover:border-[var(--aw-rose-600)]"
                >
                  <div
                    className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-2xl"
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

          <div className="rounded-3xl border border-rose-200 bg-white p-6 shadow-sm sm:p-8">
            <h3 className="text-center text-lg font-extrabold text-gray-900">
              Beneficios principales
            </h3>
            <ul className="mt-5 grid grid-cols-1 gap-3 text-left sm:grid-cols-2">
              {SALES_BENEFITS.map((benefit) => (
                <li
                  key={benefit}
                  className="flex items-start gap-2.5 text-xs leading-relaxed text-gray-700 sm:text-sm"
                >
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--aw-rose-600)]" />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <WaveDivider from="var(--aw-blush)" to="#ffffff" />

      {/* 5. Comparativa con otras cremas */}
      <section className="bg-white px-4 py-14">
        <div className="mx-auto max-w-5xl space-y-8">
          <SectionHeading
            eyebrow="Comparativa"
            title="¿Por qué elegir la Crema Arbutina?"
            subtitle="Una fórmula con Arbutina 7.0 + TXA 4.0 y presentación de 50 g frente a otras opciones del mercado."
          />

          <div className="relative overflow-hidden rounded-3xl border border-rose-200 shadow-[0_24px_60px_-32px_rgba(179,37,97,0.55)]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-rose-200/40 blur-3xl"
            />

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <caption className="sr-only">
                  Comparación de la Crema Arbutina TOSOWOONG con otras cremas
                </caption>
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="w-[31%] bg-rose-50 px-4 py-5 text-[11px] font-black uppercase tracking-widest text-gray-500"
                    >
                      Característica
                    </th>
                    <th
                      scope="col"
                      className="relative w-[27%] bg-gradient-to-b from-[var(--aw-rose-800)] to-[var(--aw-rose-950)] px-4 py-4 text-center text-white"
                    >
                      <span className="mx-auto mb-1.5 block w-fit rounded-full bg-[var(--aw-gold)] px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-[var(--aw-rose-950)] shadow">
                        La mejor opción
                      </span>
                      <span className="block text-sm font-extrabold leading-tight">
                        Crema Arbutina
                      </span>
                      <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wider text-rose-100/80">
                        TOSOWOONG · 50 g
                      </span>
                    </th>
                    <th
                      scope="col"
                      className="w-[21%] bg-rose-50 px-3 py-5 text-center text-[11px] font-bold leading-snug text-gray-600"
                    >
                      Otras cremas
                      <span className="block font-semibold text-gray-400">
                        antimanchas
                      </span>
                    </th>
                    <th
                      scope="col"
                      className="w-[21%] bg-rose-50 px-3 py-5 text-center text-[11px] font-bold leading-snug text-gray-600"
                    >
                      Cremas
                      <span className="block font-semibold text-gray-400">
                        básicas
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row, index) => (
                    <tr
                      key={row.feature}
                      className={index % 2 === 0 ? "bg-white" : "bg-rose-50/40"}
                    >
                      <th
                        scope="row"
                        className="border-t border-rose-100 px-4 py-3 text-xs font-semibold leading-snug text-gray-800 sm:text-sm"
                      >
                        {row.feature}
                      </th>
                      <td className="border-x-2 border-t border-rose-200 bg-rose-50/70 px-3 py-3 text-center">
                        <ComparisonCell value={row.ours} highlight />
                      </td>
                      <td className="border-t border-rose-100 px-3 py-3 text-center">
                        <ComparisonCell value={row.otherAntiSpots} />
                      </td>
                      <td className="border-t border-rose-100 px-3 py-3 text-center">
                        <ComparisonCell value={row.basicCream} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] font-medium text-gray-500">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-[var(--aw-rose-700)]"
                aria-hidden="true"
              >
                <CheckIcon className="h-3.5 w-3.5" />
              </span>
              Sí
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-sm font-black text-gray-500"
                aria-hidden="true"
              >
                ≈
              </span>
              Varía según la marca
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-50 text-sm font-bold text-gray-400"
                aria-hidden="true"
              >
                —
              </span>
              No
            </span>
            <span className="sm:hidden">Desliza para comparar →</span>
          </div>

          <p className="mx-auto max-w-3xl text-center text-[11px] leading-relaxed text-gray-500">
            La información de las otras columnas es referencial y puede variar
            según la marca y la fórmula. Verifica siempre la etiqueta del
            producto antes de usarlo.
          </p>

          <div className="text-center">
            <a
              href="#ofertas"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-[var(--aw-rose-600)] to-[var(--aw-rose-900)] px-8 py-3 text-base font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
            >
              Quiero mi Crema Arbutina
            </a>
          </div>
        </div>
      </section>

      {/* 6. Resultados reales (solo con material real) */}
      {RESULTS.length > 0 ? (
        <>
          <WaveDivider from="#ffffff" to="var(--aw-blush)" />
          <section className="bg-[var(--aw-blush)] px-4 py-14">
            <div className="mx-auto max-w-6xl space-y-8">
              <SectionHeading
                eyebrow="Resultados reales"
                title="Clientes que ya la usan"
                subtitle="Los resultados pueden variar de una persona a otra."
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {RESULTS.map((result) => (
                  <figure
                    key={result.src}
                    className="overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-sm"
                  >
                    <div className="relative aspect-[4/5] bg-rose-50">
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
        </>
      ) : (
        <WaveDivider from="#ffffff" to="var(--aw-blush)" reverse />
      )}

      {/* 7. Galería de imágenes */}
      <section className="bg-[var(--aw-blush)] px-4 py-14">
        <div className="mx-auto max-w-6xl space-y-8">
          <SectionHeading
            eyebrow="Galería"
            title={`Conoce la ${PRODUCT_SHORT_NAME}`}
          />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {GALLERY.map((image, index) => (
              <div
                key={image.src}
                className="group relative aspect-square overflow-hidden rounded-xl border border-rose-200 bg-rose-50"
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

      <WaveDivider from="var(--aw-blush)" to="#ffffff" />

      {/* 8. Reseñas de clientes (auto-scroll horizontal) */}
      {REVIEWS.length > 0 ? (
        <section className="overflow-hidden bg-white px-4 py-14">
          <div className="mx-auto max-w-6xl space-y-8">
            <SectionHeading
              eyebrow="Reseñas de clientes"
              title="Lo que dicen quienes ya la probaron"
              subtitle="Opiniones de personas que incorporaron la crema a su rutina facial."
            />
            <ReviewsCarousel items={REVIEWS} />
          </div>
        </section>
      ) : null}

      <WaveDivider from="#ffffff" to="var(--aw-rose-900)" />

      {/* 9. CTA final + garantía */}
      <section className="bg-gradient-to-b from-[var(--aw-rose-900)] to-[var(--aw-rose-950)] px-4 py-14 text-center text-white">
        <div className="mx-auto max-w-3xl space-y-5">
          <h2 className="text-2xl font-extrabold sm:text-4xl">
            Una piel con aspecto más uniforme y luminoso
          </h2>
          <p className="text-sm text-rose-100 sm:text-base">
            Pide hoy tu {PRODUCT_SHORT_NAME} con envío gratis y paga al recibir
            en la puerta de tu casa.
          </p>
          <a
            href="#ofertas"
            className="aw-pulse inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-white px-8 py-4 text-lg font-bold text-[var(--aw-rose-800)] shadow-lg transition-transform hover:-translate-y-0.5 sm:w-auto"
          >
            Quiero mi {PRODUCT_SHORT_NAME}
          </a>
          {GUARANTEE_TEXT ? (
            <p className="mx-auto max-w-xl rounded-2xl border border-white/20 bg-white/10 p-4 text-sm">
              {GUARANTEE_TEXT}
            </p>
          ) : null}
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-2 text-xs font-medium text-rose-100">
            <li>🚚 Envío gratis</li>
            <li>🤝 Pago contra entrega</li>
            <li>🔒 Compra segura</li>
          </ul>
          <p className="mx-auto max-w-2xl pt-4 text-[11px] leading-relaxed text-rose-200/80">
            {DISCLAIMER}
            {SANITARY_REGISTRY ? ` ${SANITARY_REGISTRY}` : ""}
          </p>
        </div>
      </section>
    </div>
  );
}
