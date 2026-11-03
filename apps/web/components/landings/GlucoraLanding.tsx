"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ProductImage from "@/components/ProductImage";

/**
 * Landing de "Glucora" — cinco ingredientes en un solo gotero (50 ml).
 *
 * Reutiliza el diseño de `ArbutinaLanding` (marquesina, videos, hero, señales,
 * ingredientes, comparativa, galería, reseñas con auto-scroll y CTA final) con
 * las olas SVG animadas entre secciones y la paleta rosa/blanco de esa landing.
 *
 * Se monta en `app/products/[slug]/page.tsx` cuando el slug o el nombre del
 * producto coinciden con `GLUCORA_SLUG` o con `/glucora|berberine|berberina/i`.
 *
 * Las ofertas por cantidad usan el esquema de Glucora y su precio coincide con
 * el que cobra el carrito vía `lib/product-promotion.ts` y la API.
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
export const GLUCORA_SLUG = "glucora";

/* ------------------------------------------------------------------------- */
/* CONTENIDO                                                                  */
/* ------------------------------------------------------------------------- */

const PRODUCT_SHORT_NAME = "Glucora";
const PRODUCT_BRAND = "Glucora";

/**
 * Totales de promoción por cantidad (COP). Unidad normal: $89.900.
 * - 2 frascos: $149.900 en total.
 * - 3 frascos: "paga 2 y lleva 3" = $179.799 (el mismo total que cobra la API
 *   al aplicar $59.933 por unidad).
 *
 * Deben coincidir con `GLUCORA_OFFER_UNIT_PRICES` de `lib/product-promotion.ts`
 * y con su gemela de la API; si no, la landing mostraría un precio que el
 * carrito no cobra.
 */
const BULK_TOTALS: Readonly<Record<2 | 3, number | null>> = {
  2: 149_900,
  3: 179_799,
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
  name: string;
  stars: 1 | 2 | 3 | 4 | 5;
  title: string;
  text: string;
}

const HERO_IMAGE: MediaImage = {
  src: "/landings/glucora/images/glucora-1.png",
  alt: `${PRODUCT_SHORT_NAME} en gotero de 50 ml`,
};

const GALLERY: readonly MediaImage[] = [
  {
    src: "/landings/glucora/images/glucora-1.png",
    alt: `Frasco gotero de ${PRODUCT_SHORT_NAME} de 50 ml`,
  },
  {
    src: "/landings/glucora/images/glucora-2.png",
    alt: `${PRODUCT_SHORT_NAME} con sus ingredientes naturales`,
  },
];

const VIDEOS: readonly MediaVideo[] = [
  {
    src: "/landings/glucora/videos/glucora-video-1.mp4",
    title: "Cómo usar Glucora",
    caption: "Tutorial rápido de aplicación y dosis diaria.",
  },
  {
    src: "/landings/glucora/videos/glucora-video-2.mp4",
    title: "Beneficios de Glucora con berberina",
    caption: "Descubre por qué es ideal para tu rutina diaria de bienestar.",
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
    name: "Diana K.",
    stars: 5,
    title: "¡Excelente para la energía diaria!",
    text: "Llevo casi un mes tomando estas gotas antes del almuerzo y he notado una gran diferencia en mis niveles de energía por la tarde. Antes me daba un bajón terrible después de comer, pero desde que tomo Glucora me siento mucho más estable. Además, el formato en gotas es súper práctico.",
  },
  {
    name: "Roberto M.",
    stars: 5,
    title: "Gran combinación de ingredientes",
    text: "Buscaba un suplemento que combinara Berberina y Canela de Ceilán para no tener que comprar cápsulas por separado, y este producto dio en el blanco. Al ser líquido se siente de rápida absorción y el sabor es bastante pasable.",
  },
  {
    name: "Carolina V.",
    stars: 5,
    title: "Excelente apoyo metabólico",
    text: "Me lo recomendaron para apoyar mi bienestar metabólico y controlar los antojos de dulce a media tarde. Me ha ayudado bastante a mantener la constancia en mi alimentación diaria. Se volvió indispensable en mi rutina.",
  },
  {
    name: "Andrés P.",
    stars: 5,
    title: "Muy práctico y fácil de tomar",
    text: "A diferencia de las pastillas gigantes que cuesta tragar, el gotero de 50 ml es facilísimo de usar. Me gusta mucho que incluya melón amargo y cúrcuma. Se disuelve perfectamente en un poco de agua.",
  },
  {
    name: "Lorena T.",
    stars: 4,
    title: "Buen producto, sabor herbal",
    text: "Tiene un sabor herbal con un toque de canela y cúrcuma bastante marcado. No es desagradable, pero si prefieres bebidas neutras recomiendo diluirlo en un vaso entero de agua. En cuanto a vitalidad, se nota el cambio durante el día.",
  },
  {
    name: "Gabriel S.",
    stars: 4,
    title: "Buena absorción y calidad",
    text: "Se nota la calidad de la fórmula líquida. He estado cuidando mis hábitos y este suplemento me ha servido como un gran aliado diario para mi salud metabólica. Le pongo 4 estrellas solo porque el gotero suelta la gota algo rápido si no tienes cuidado.",
  },
  {
    name: "Martha L.",
    stars: 4,
    title: "Funciona muy bien como complemento",
    text: "Llevo 3 semanas usándolo junto con mi plan de alimentación y ejercicio. Me siento con menos fatiga y mejor digestión. La fórmula con Cromo y Vitaminas B y C es bastante completa.",
  },
  {
    name: "Patricia R.",
    stars: 5,
    title: "Sorprendida con los resultados",
    text: "Al principio tenía dudas de probar gotas para el control de azúcar y bienestar metabólico, pero la combinación de berberina y melón amargo realmente se siente. Me he sentido con mucha más energía y vitalidad en el día a día.",
  },
  {
    name: "Javier G.",
    stars: 3,
    title: "Bueno, pero requiere constancia",
    text: "Es un buen suplemento de fórmula natural, pero requiere constancia diaria. Empecé a notar los beneficios en mis niveles de energía hacia la segunda semana. Cumple bien si mantienes la rutina.",
  },
  {
    name: "Santiago E.",
    stars: 5,
    title: "100% recomendado",
    text: "El frasco de 50 ml rinde bastante bien para el uso diario. Me encanta la conveniencia del formato en gotas líquidas en comparación con las tabletas tradicionales. Una fórmula botanical de muy buena calidad.",
  },
];

const MARQUEE_ITEMS: readonly { strong: string; rest: string }[] = [
  { strong: "ENVÍO GRATIS", rest: "A TODA COLOMBIA" },
  { strong: "PAGO CONTRA ENTREGA:", rest: "paga al recibir en casa" },
  { strong: "CINCO INGREDIENTES", rest: "en un solo gotero de 50 ml" },
  { strong: "FÓRMULA LÍQUIDA", rest: "sin pastillas grandes" },
];

const QUICK_BENEFITS: readonly string[] = [
  "Berberina y canela de Ceilán",
  "Cromo, melón amargo y cúrcuma",
  "Vitaminas B y C",
  "Frasco gotero de 50 ml",
];

const SIGNS: readonly { icon: string; title: string; text: string }[] = [
  {
    icon: "⚡",
    title: "El bajón después de almorzar",
    text: "Comes y una hora después el cuerpo pide pausa. Un apoyo diario antes de la comida puede ayudarte a sentir un ritmo más parejo.",
  },
  {
    icon: "🍬",
    title: "Antojos de dulce a media tarde",
    text: "Cuando la tarde se alarga, el antojo aparece. Mantener hábitos constantes es más fácil con una rutina simple.",
  },
  {
    icon: "🔋",
    title: "Energía que sube y baja",
    text: "Empiezas bien el día y llegas a la noche sin fuerzas. El bienestar metabólico también se cuida a diario.",
  },
  {
    icon: "💊",
    title: "Cápsulas y frascos por separado",
    text: "Tragar pastillas grandes o comprar cada ingrediente aparte complica la constancia. Aquí van cinco en un solo gotero.",
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
    title: "Berberina y canela de Ceilán",
    text: "El dúo que abre la etiqueta. La berberina es un compuesto vegetal muy usado en suplementos de bienestar metabólico; la canela de Ceilán es la variedad con menos cumarina que la canela común.",
  },
  {
    icon: "💧",
    title: "Cinco ingredientes, un gotero",
    text: "Berberina, canela de Ceilán, cromo, melón amargo y cúrcuma reunidos en una fórmula líquida de 50 ml, más vitaminas B y C.",
    featured: true,
  },
  {
    icon: "🌱",
    title: "Melón amargo y cúrcuma",
    text: "Dos plantas de uso tradicional. El melón amargo se usa en la cocina y la herbolaria de varias regiones; la cúrcuma aporta curcuminoides con propiedades antioxidantes.",
  },
];

const SALES_BENEFITS: readonly string[] = [
  "Cinco ingredientes principales en un solo frasco gotero.",
  "Fórmula líquida, sin pastillas grandes ni cápsulas difíciles de tragar.",
  "Incluye cromo y vitaminas B y C.",
  "Presentación práctica de 50 ml para el uso diario.",
  "Fácil de diluir en agua e incorporar a tu rutina.",
  "Envío gratis y pago contra entrega en toda Colombia.",
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
    feature: "Berberina",
    ours: "yes",
    otherAntiSpots: "varies",
    basicCream: "no",
  },
  {
    feature: "Canela de Ceilán",
    ours: "yes",
    otherAntiSpots: "varies",
    basicCream: "no",
  },
  {
    feature: "Cromo",
    ours: "yes",
    otherAntiSpots: "varies",
    basicCream: "no",
  },
  {
    feature: "Melón amargo y cúrcuma",
    ours: "yes",
    otherAntiSpots: "varies",
    basicCream: "no",
  },
  {
    feature: "Vitaminas B y C",
    ours: "yes",
    otherAntiSpots: "varies",
    basicCream: "no",
  },
  {
    feature: "Cinco ingredientes en un solo producto",
    ours: "yes",
    otherAntiSpots: "varies",
    basicCream: "no",
  },
  {
    feature: "Formato líquido con gotero",
    ours: "yes",
    otherAntiSpots: "varies",
    basicCream: "varies",
  },
  {
    feature: "Frasco de 50 ml",
    ours: "yes",
    otherAntiSpots: "varies",
    basicCream: "varies",
  },
];

const DISCLAIMER =
  "Suplemento dietario. No es un medicamento y no está destinado a diagnosticar, tratar, curar ni prevenir ninguna enfermedad. Si tienes diabetes, tomas medicamentos (en especial para la glucosa), estás embarazada o en lactancia, consulta a tu médico antes de usarlo. Las opiniones son experiencias personales y los resultados pueden variar.";

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
            ? "bg-[var(--gl-garnet)] text-white shadow-sm"
            : "bg-[var(--gl-bone)] text-[var(--gl-garnet)]"
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
      <span className="inline-block rounded-full border border-[var(--gl-stone-2)] bg-[var(--gl-bone)] px-3 py-1 text-xs font-bold uppercase tracking-widest text-[var(--gl-garnet)]">
        {eyebrow}
      </span>
      <h2 className="mt-2 text-2xl font-extrabold text-[var(--gl-ink)] sm:text-3xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="mx-auto mt-2 max-w-2xl text-sm text-[var(--gl-ink)]/65">{subtitle}</p>
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
      className="overflow-hidden whitespace-nowrap bg-[var(--gl-wine-950)] py-2.5 text-[11px] font-medium text-[var(--gl-bone)] sm:text-sm"
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
          reverse ? "gl-wave-reverse" : "gl-wave"
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
      className="flex w-80 shrink-0 flex-col justify-between rounded-2xl border border-[var(--gl-stone-2)] bg-white p-5 shadow-sm"
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
        <h3 className="mb-2 text-sm font-bold text-[var(--gl-ink)]">{item.title}</h3>
        <blockquote className="text-sm italic text-[var(--gl-ink)]/65">
          “{item.text}”
        </blockquote>
      </div>
      <figcaption className="mt-4 flex items-center gap-2 border-t border-[var(--gl-stone-2)] pt-3 text-xs font-semibold text-[var(--gl-garnet)]">
        <span>{item.name}</span>
        <span className="font-normal text-[var(--gl-ink)]/40">· Opinión de cliente</span>
      </figcaption>
    </figure>
  );

  return (
    <div
      ref={trackRef}
      className="gl-hide-scrollbar flex overflow-x-auto gap-4"
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
    <div className="space-y-3 rounded-3xl border border-[var(--gl-stone-2)] bg-[var(--gl-bone)]/60 p-6 text-center transition-shadow hover:shadow-md sm:p-8">
      <h3 className="text-lg font-bold text-[var(--gl-ink)]">{video.title}</h3>
      <div className="relative mx-auto aspect-video w-full max-w-4xl overflow-hidden rounded-2xl border-2 border-white bg-black shadow-lg sm:max-w-3xl">
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
      <p className="text-sm font-medium text-[var(--gl-ink)]/70">{video.caption}</p>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Landing                                                                    */
/* ------------------------------------------------------------------------- */

export default function GlucoraLanding({
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
      const units = selectedTier.qty === 1 ? "frasco" : "frascos";
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
    <div className="gl-landing bg-[var(--gl-stone)] text-[var(--gl-ink)] antialiased">
      <style>{`
        .gl-landing {
          --gl-wine-950: #150409;
          --gl-wine-900: #290710;
          --gl-wine-800: #480d1c;
          --gl-garnet: #b3122f;
          --gl-garnet-soft: #d24b60;
          --gl-turmeric: #f6b21b;
          --gl-turmeric-soft: #f8d488;
          --gl-cinnamon: #a0643a;
          --gl-bone: #f7f0e7;
          --gl-stone: #faf8f4;
          --gl-stone-2: #e8e1d6;
          --gl-ink: #1c1115;
        }
        @keyframes gl-pulse {
          0% { box-shadow: 0 0 0 0 rgba(210, 75, 96, 0.45); }
          70% { box-shadow: 0 0 0 14px rgba(210, 75, 96, 0); }
          100% { box-shadow: 0 0 0 0 rgba(210, 75, 96, 0); }
        }
        @keyframes gl-wave-shift {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-50%, 0, 0); }
        }
        @keyframes gl-shine {
          0%, 55% { transform: translateX(-130%) skewX(-12deg); }
          100% { transform: translateX(130%) skewX(-12deg); }
        }
        .gl-landing .gl-pulse { animation: gl-pulse 2s infinite; }
        .gl-landing .gl-pulse:disabled { animation: none; }
        .gl-landing .gl-wave { animation: gl-wave-shift 18s linear infinite; }
        .gl-landing .gl-wave-reverse { animation: gl-wave-shift 24s linear infinite reverse; }
        .gl-landing .gl-shine { position: relative; overflow: hidden; }
        .gl-landing .gl-shine::after {
          content: "";
          position: absolute;
          top: -20%;
          bottom: -20%;
          left: 0;
          width: 45%;
          background: linear-gradient(90deg, transparent, rgba(246, 178, 27, 0.28), transparent);
          animation: gl-shine 4.5s ease-in-out infinite;
          pointer-events: none;
        }
        .gl-landing .gl-hide-scrollbar { scrollbar-width: none; }
        .gl-landing .gl-hide-scrollbar::-webkit-scrollbar { display: none; }
        @media (prefers-reduced-motion: reduce) {
          .gl-landing .gl-pulse,
          .gl-landing .gl-wave,
          .gl-landing .gl-wave-reverse { animation: none; }
          .gl-landing .gl-shine::after { animation: none; opacity: 0; }
          .gl-landing { scroll-behavior: auto; }
        }
      `}</style>

      {/* 1. Marquee de urgencia */}
      <UrgencyMarquee />

      {/* 2. Hero */}
      <section className="bg-[var(--gl-stone)] px-4 pb-12 pt-8 sm:pt-12 lg:pb-16 lg:pt-16">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-10">
          {/* Videos del producto */}
          {VIDEOS.length > 0 ? (
            <div className="col-span-1 space-y-4 lg:col-span-12">
              <SectionHeading
                eyebrow="Míralo en acción"
                title={`Conoce ${PRODUCT_SHORT_NAME}`}
              />
              <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
                {VIDEOS.map((video) => (
                  <VideoCard key={video.src} video={video} />
                ))}
              </div>
            </div>
          ) : null}

          <div className="lg:col-span-5">
            <div className="relative mx-auto w-full max-w-sm rounded-3xl border border-[var(--gl-stone-2)] bg-white p-3 shadow-xl">
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-[var(--gl-bone)]">
                {heroMedia}
              </div>
              <p className="mt-3 text-center text-xs font-medium text-[var(--gl-ink)]/50">
                Contenido 50 ml · Gotas líquidas
              </p>
            </div>
          </div>

          <div className="space-y-5 lg:col-span-7">
            <div className="space-y-4 text-center lg:text-left">
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--gl-stone-2)] bg-[var(--gl-bone)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--gl-wine-800)]">
                ✨ {PRODUCT_BRAND} · Bienestar metabólico
              </span>
              <h1 className="text-3xl font-extrabold leading-tight text-[var(--gl-ink)] sm:text-4xl lg:text-5xl">
                Cinco ingredientes{" "}
                <span className="text-[var(--gl-garnet)]">
                  en un solo gotero
                </span>
              </h1>
              <p className="mx-auto max-w-xl text-sm text-[var(--gl-ink)]/70 sm:text-lg lg:mx-0">
                Berberina, canela de Ceilán, cromo, melón amargo y cúrcuma en
                gotas líquidas de 50 ml, para acompañar tu bienestar metabólico
                todos los días.
              </p>
              <p className="mx-auto max-w-xl text-xs text-[var(--gl-ink)]/60 sm:text-sm lg:mx-0">
                Una fórmula líquida práctica, con vitaminas B y C, pensada para
                quienes prefieren un gotero antes que cápsulas difíciles de
                tragar.
              </p>
              <ul className="mx-auto grid max-w-md grid-cols-2 gap-2 text-left text-xs font-medium text-[var(--gl-ink)]/75 sm:text-sm lg:mx-0">
                {QUICK_BENEFITS.map((benefit) => (
                  <li key={benefit} className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 shrink-0 text-[var(--gl-garnet)]" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>

            {/* Selector de ofertas por cantidad */}
            <div id="ofertas" className="scroll-mt-24 space-y-3">
              {tiers.length > 1 ? (
                <div className="relative overflow-hidden rounded-3xl border border-[var(--gl-stone-2)] bg-gradient-to-b from-[var(--gl-bone)] via-white to-[var(--gl-bone)] p-4 shadow-[0_20px_55px_-28px_rgba(179,18,47,0.65)] sm:p-5">
                  {/* Brillos decorativos del panel */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[var(--gl-garnet-soft)]/30 blur-3xl"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-[var(--gl-stone-2)]/40 blur-3xl"
                  />

                  <div className="relative mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-base font-extrabold text-[var(--gl-ink)]">
                        🔥 Elige tu promoción
                      </p>
                      <p className="text-[11px] text-[var(--gl-ink)]/50">
                        Lleva más y paga menos por cada frasco.
                      </p>
                    </div>
                    {maxDiscount > 0 ? (
                      <span className="rounded-full bg-gradient-to-r from-[var(--gl-garnet-soft)] to-[var(--gl-wine-800)] px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow">
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
                        ? "border-[var(--gl-wine-800)] bg-gradient-to-br from-[var(--gl-wine-800)] via-[var(--gl-wine-900)] to-[var(--gl-wine-950)] text-white shadow-xl"
                        : isFeatured
                          ? "border-[var(--gl-garnet-soft)] bg-gradient-to-b from-white to-[var(--gl-bone)] shadow-lg"
                          : "border-[var(--gl-stone-2)] bg-white hover:border-[var(--gl-garnet-soft)] hover:shadow-md";
                      const stateLook = isSelected
                        ? isBest
                          ? "-translate-y-1 border-[var(--gl-turmeric)] ring-4 ring-[var(--gl-turmeric)]/30 shadow-2xl"
                          : "-translate-y-1 border-[var(--gl-garnet-soft)] ring-4 ring-[var(--gl-garnet)]/60 shadow-2xl"
                        : "hover:-translate-y-0.5";
                      const mutedLook = isBest ? "text-[var(--gl-bone)]/80" : "text-[var(--gl-ink)]/50";
                      const titleLook = isBest ? "text-white" : "text-[var(--gl-ink)]";
                      const priceLook = isBest
                        ? "text-white"
                        : "text-[var(--gl-garnet)]";
                      const badgeLook = isBest
                        ? "bg-[var(--gl-turmeric)] text-[var(--gl-wine-950)]"
                        : isFeatured
                          ? "bg-[var(--gl-garnet-soft)] text-white"
                          : "bg-[var(--gl-bone)] text-[var(--gl-wine-800)]";
                      const chipLook = isBest
                        ? "bg-[var(--gl-turmeric)]/90 text-[var(--gl-wine-950)]"
                        : "bg-[var(--gl-bone)] text-[var(--gl-wine-800)]";
                      const radioLook = isBest
                        ? isSelected
                          ? "border-[var(--gl-turmeric)] bg-[var(--gl-turmeric)]"
                          : "border-white/60"
                        : isSelected
                          ? "border-[var(--gl-garnet-soft)] bg-[var(--gl-garnet-soft)]"
                          : "border-[var(--gl-stone-2)] bg-white";

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
                          className={`relative flex min-h-11 flex-col rounded-2xl border-2 p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gl-garnet)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${cardLook} ${stateLook} ${isBest ? "gl-shine" : ""}`}
                        >
                          <span
                            className={`absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${radioLook}`}
                            aria-hidden="true"
                          >
                            {isSelected ? (
                              <CheckIcon
                                className={`h-3 w-3 ${
                                  isBest
                                    ? "text-[var(--gl-wine-950)]"
                                    : "text-white"
                                }`}
                              />
                            ) : null}
                          </span>

                          {tier.badge ? (
                            <span
                              className={`mb-2 inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${badgeLook}`}
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
                            className={`block text-[10px] font-bold uppercase tracking-[0.14em] ${mutedLook}`}
                          >
                            {tier.label}
                          </span>
                          <span className={`mt-0.5 block text-sm font-bold ${titleLook}`}>
                            {tier.qty} {tier.qty === 1 ? "frasco" : "frascos"}
                          </span>
                          <span
                            className={`mt-2 block text-2xl font-black leading-none tracking-tight sm:text-[1.6rem] ${priceLook}`}
                          >
                            {formatCop(tier.total)}
                          </span>
                          <span className={`mt-1 block text-[11px] font-medium ${mutedLook}`}>
                            {tier.qty > 1
                              ? `${formatCop(tier.total / tier.qty)} c/u`
                              : "Precio por unidad"}
                          </span>

                          <span className="mt-3 flex flex-wrap items-center gap-1.5">
                            {saving > 0 ? (
                              <>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-black ${chipLook}`}
                                >
                                  Ahorras {formatCop(saving)}
                                </span>
                                <del className={`text-[10px] ${mutedLook}`}>
                                  {formatCop(tier.regularTotal)}
                                </del>
                              </>
                            ) : (
                              <span className={`text-[10px] ${mutedLook}`}>
                                Pago contra entrega
                              </span>
                            )}
                          </span>

                          {discount > 0 ? (
                            <span
                              className={`mt-2 inline-flex w-fit rounded-md px-1.5 py-0.5 text-[10px] font-black ${
                                isBest
                                  ? "bg-white/15 text-white"
                                  : "bg-[var(--gl-garnet)] text-white"
                              }`}
                            >
                              -{discount}% OFF
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  <p className="relative mt-3 text-center text-[11px] text-[var(--gl-ink)]/50">
                    {selectedTier
                      ? "Toca de nuevo la oferta para quitarla y comprar a precio normal."
                      : "Sin oferta elegida pagas el precio normal por unidad."}
                  </p>
                </div>
              ) : null}

              {/* Cantidad: solo en compra normal (sin oferta elegida) */}
              {!selectedTier && hasPrice ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--gl-stone-2)] bg-white px-4 py-3">
                  <div>
                    <span className="block text-xs font-bold uppercase text-[var(--gl-ink)]/50">
                      Precio normal
                    </span>
                    <span className="text-xl font-extrabold text-[var(--gl-garnet)]">
                      {formatCop(unitPrice)}
                    </span>
                    <span className="ml-1 text-xs text-[var(--gl-ink)]/50">c/u</span>
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
                      className="flex min-h-11 w-11 items-center justify-center rounded-xl border border-[var(--gl-stone-2)] text-lg font-bold text-[var(--gl-wine-800)] disabled:opacity-40"
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
                      className="flex min-h-11 w-11 items-center justify-center rounded-xl border border-[var(--gl-stone-2)] text-lg font-bold text-[var(--gl-wine-800)] disabled:opacity-40"
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
                className={`gl-pulse flex min-h-14 w-full items-center justify-center rounded-2xl px-5 py-4 text-base font-bold text-white shadow-lg transition-all sm:text-lg ${
                  soldOut || !hasPrice
                    ? "cursor-not-allowed bg-gray-400"
                    : "bg-gradient-to-r from-[var(--gl-garnet-soft)] to-[var(--gl-wine-900)] hover:-translate-y-0.5"
                } ${pending ? "cursor-wait opacity-75" : ""}`}
              >
                {ctaLabel}
              </button>
              {failed ? (
                <p role="alert" className="mt-2 text-center text-sm text-red-600">
                  No pudimos agregar el producto. Intenta de nuevo.
                </p>
              ) : null}
              <p className="mt-2 text-center text-xs text-[var(--gl-ink)]/50">
                Pago contra entrega disponible en todo el país · Envío gratis
              </p>
            </div>
          </div>
        </div>
      </section>

      <WaveDivider from="var(--gl-stone)" to="#ffffff" />

      {/* 3. Señales de que necesitas el producto */}
      <section className="bg-white px-4 py-14">
        <div className="mx-auto max-w-5xl space-y-10">
          <SectionHeading
            eyebrow="¿Te suena familiar?"
            title={`¿Para quién es ${PRODUCT_SHORT_NAME}?`}
            subtitle="Situaciones del día a día donde un apoyo constante y fácil de tomar hace la diferencia."
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SIGNS.map((sign) => (
              <div
                key={sign.title}
                className="rounded-2xl border border-[var(--gl-stone-2)] bg-[var(--gl-bone)]/60 p-5 transition-shadow hover:shadow-md"
              >
                <div
                  className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg"
                  aria-hidden="true"
                >
                  {sign.icon}
                </div>
                <h3 className="mb-1 font-bold text-[var(--gl-ink)]">{sign.title}</h3>
                <p className="text-xs leading-relaxed text-[var(--gl-ink)]/65">{sign.text}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-[var(--gl-garnet)] to-[var(--gl-wine-950)] p-6 text-white shadow-lg sm:flex-row">
            <div className="text-center sm:text-left">
              <h3 className="text-lg font-bold">Acompaña tu bienestar diario</h3>
              <p className="text-xs text-[var(--gl-bone)]/80 sm:text-sm">
                Cinco ingredientes en un gotero de 50 ml, con envío gratis y
                pago contra entrega.
              </p>
            </div>
            <a
              href="#ofertas"
              className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-xl bg-white px-6 py-3 font-bold text-[var(--gl-wine-800)] shadow transition-colors hover:bg-[var(--gl-bone)]"
            >
              Quiero mi Glucora
            </a>
          </div>
        </div>
      </section>

      <WaveDivider from="#ffffff" to="var(--gl-stone)" reverse />

      {/* 4. Ingredientes y beneficios */}
      <section className="bg-[var(--gl-stone)] px-4 py-16">
        <div className="mx-auto max-w-6xl space-y-10">
          <SectionHeading
            eyebrow="Fórmula líquida"
            title="Cinco ingredientes, un solo gotero"
            subtitle="Una fórmula práctica con berberina, canela de Ceilán, cromo, melón amargo, cúrcuma y vitaminas B y C."
          />
          <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-3">
            {BENEFITS.map((benefit) =>
              benefit.featured ? (
                <div
                  key={benefit.title}
                  className="relative space-y-3 rounded-3xl border-2 border-[var(--gl-garnet-soft)] bg-gradient-to-b from-white to-[var(--gl-bone)] p-8 text-center shadow-xl"
                >
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--gl-garnet)] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                    Fórmula principal
                  </span>
                  <div
                    className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-[var(--gl-stone-2)] text-3xl shadow-md"
                    aria-hidden="true"
                  >
                    {benefit.icon}
                  </div>
                  <h3 className="text-xl font-extrabold text-[var(--gl-ink)]">
                    {benefit.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-[var(--gl-ink)]/70">
                    {benefit.text}
                  </p>
                </div>
              ) : (
                <div
                  key={benefit.title}
                  className="space-y-3 rounded-3xl border border-[var(--gl-stone-2)] bg-white p-6 text-center shadow-sm transition-colors hover:border-[var(--gl-garnet-soft)]"
                >
                  <div
                    className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--gl-bone)] text-2xl"
                    aria-hidden="true"
                  >
                    {benefit.icon}
                  </div>
                  <h3 className="text-lg font-bold text-[var(--gl-ink)]">
                    {benefit.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-[var(--gl-ink)]/70">
                    {benefit.text}
                  </p>
                </div>
              ),
            )}
          </div>

          <div className="rounded-3xl border border-[var(--gl-stone-2)] bg-white p-6 shadow-sm sm:p-8">
            <h3 className="text-center text-lg font-extrabold text-[var(--gl-ink)]">
              Beneficios principales
            </h3>
            <ul className="mt-5 grid grid-cols-1 gap-3 text-left sm:grid-cols-2">
              {SALES_BENEFITS.map((benefit) => (
                <li
                  key={benefit}
                  className="flex items-start gap-2.5 text-xs leading-relaxed text-[var(--gl-ink)]/70 sm:text-sm"
                >
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--gl-garnet)]" />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <WaveDivider from="var(--gl-stone)" to="#ffffff" />

      {/* 5. Comparativa con otros suplementos */}
      <section className="bg-white px-4 py-14">
        <div className="mx-auto max-w-5xl space-y-8">
          <SectionHeading
            eyebrow="Comparativa"
            title="¿Por qué elegir Glucora?"
            subtitle="Una fórmula líquida con cinco ingredientes y frasco gotero de 50 ml frente a otras opciones del mercado."
          />

          <div className="relative overflow-hidden rounded-3xl border border-[var(--gl-stone-2)] shadow-[0_24px_60px_-32px_rgba(179,18,47,0.55)]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-[var(--gl-stone-2)]/40 blur-3xl"
            />

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <caption className="sr-only">
                  Comparación de Glucora con otros suplementos y con los
                  ingredientes por separado
                </caption>
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="w-[31%] bg-[var(--gl-bone)] px-4 py-5 text-[11px] font-black uppercase tracking-widest text-[var(--gl-ink)]/50"
                    >
                      Característica
                    </th>
                    <th
                      scope="col"
                      className="relative w-[27%] bg-gradient-to-b from-[var(--gl-wine-800)] to-[var(--gl-wine-950)] px-4 py-4 text-center text-white"
                    >
                      <span className="mx-auto mb-1.5 block w-fit rounded-full bg-[var(--gl-turmeric)] px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-[var(--gl-wine-950)] shadow">
                        La mejor opción
                      </span>
                      <span className="block text-sm font-extrabold leading-tight">
                        Glucora
                      </span>
                      <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--gl-bone)]/80">
                        Cinco ingredientes · 50 ml
                      </span>
                    </th>
                    <th
                      scope="col"
                      className="w-[21%] bg-[var(--gl-bone)] px-3 py-5 text-center text-[11px] font-bold leading-snug text-[var(--gl-ink)]/60"
                    >
                      Otros suplementos
                      <span className="block font-semibold text-[var(--gl-ink)]/40">
                        del mercado
                      </span>
                    </th>
                    <th
                      scope="col"
                      className="w-[21%] bg-[var(--gl-bone)] px-3 py-5 text-center text-[11px] font-bold leading-snug text-[var(--gl-ink)]/60"
                    >
                      Ingredientes
                      <span className="block font-semibold text-[var(--gl-ink)]/40">
                        por separado
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row, index) => (
                    <tr
                      key={row.feature}
                      className={index % 2 === 0 ? "bg-white" : "bg-[var(--gl-bone)]/40"}
                    >
                      <th
                        scope="row"
                        className="border-t border-[var(--gl-stone-2)] px-4 py-3 text-xs font-semibold leading-snug text-[var(--gl-ink)] sm:text-sm"
                      >
                        {row.feature}
                      </th>
                      <td className="border-x-2 border-t border-[var(--gl-stone-2)] bg-[var(--gl-bone)]/70 px-3 py-3 text-center">
                        <ComparisonCell value={row.ours} highlight />
                      </td>
                      <td className="border-t border-[var(--gl-stone-2)] px-3 py-3 text-center">
                        <ComparisonCell value={row.otherAntiSpots} />
                      </td>
                      <td className="border-t border-[var(--gl-stone-2)] px-3 py-3 text-center">
                        <ComparisonCell value={row.basicCream} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] font-medium text-[var(--gl-ink)]/50">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--gl-bone)] text-[var(--gl-garnet)]"
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

          <p className="mx-auto max-w-3xl text-center text-[11px] leading-relaxed text-[var(--gl-ink)]/50">
            La información de las otras columnas es referencial y puede variar
            según la marca y la fórmula. Verifica siempre la etiqueta del
            producto antes de usarlo.
          </p>

          <div className="text-center">
            <a
              href="#ofertas"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-[var(--gl-garnet-soft)] to-[var(--gl-wine-900)] px-8 py-3 text-base font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
            >
              Quiero mi Glucora
            </a>
          </div>
        </div>
      </section>

      {/* 6. Resultados reales (solo con material real) */}
      {RESULTS.length > 0 ? (
        <>
          <WaveDivider from="#ffffff" to="var(--gl-stone)" />
          <section className="bg-[var(--gl-stone)] px-4 py-14">
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
                    className="overflow-hidden rounded-2xl border border-[var(--gl-stone-2)] bg-white shadow-sm"
                  >
                    <div className="relative aspect-[4/5] bg-[var(--gl-bone)]">
                      <ProductImage
                        src={cld(result.src)}
                        alt={result.alt}
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover"
                      />
                    </div>
                    {result.caption ? (
                      <figcaption className="p-3 text-center text-xs text-[var(--gl-ink)]/60">
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
        <WaveDivider from="#ffffff" to="var(--gl-stone)" reverse />
      )}

      {/* 7. Galería de imágenes */}
      <section className="bg-[var(--gl-stone)] px-4 py-14">
        <div className="mx-auto max-w-6xl space-y-8">
          <SectionHeading
            eyebrow="Galería"
            title={`Conoce ${PRODUCT_SHORT_NAME}`}
          />
          <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
            {GALLERY.map((image, index) => (
              <div
                key={image.src}
                className="group relative aspect-square overflow-hidden rounded-xl border border-[var(--gl-stone-2)] bg-[var(--gl-bone)]"
              >
                <ProductImage
                  src={cld(image.src)}
                  alt={image.alt}
                  priority={index === 0}
                  sizes="(max-width: 640px) 100vw, 50vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <WaveDivider from="var(--gl-stone)" to="#ffffff" />

      {/* 8. Reseñas de clientes (auto-scroll horizontal) */}
      {REVIEWS.length > 0 ? (
        <section className="overflow-hidden bg-white px-4 py-14">
          <div className="mx-auto max-w-6xl space-y-8">
            <SectionHeading
              eyebrow="Reseñas de clientes"
              title="Lo que dicen quienes ya lo probaron"
              subtitle="Opiniones de personas que incorporaron Glucora a su rutina diaria."
            />
            <ReviewsCarousel items={REVIEWS} />
          </div>
        </section>
      ) : null}

      <WaveDivider from="#ffffff" to="var(--gl-wine-950)" />

      {/* 9. CTA final + garantía */}
      <section className="bg-gradient-to-b from-[var(--gl-wine-900)] to-[var(--gl-wine-950)] px-4 py-14 text-center text-white">
        <div className="mx-auto max-w-3xl space-y-5">
          <h2 className="text-2xl font-extrabold sm:text-4xl">
            Tu bienestar diario, en un solo gotero
          </h2>
          <p className="text-sm text-[var(--gl-bone)]/80 sm:text-base">
            Pide hoy tu {PRODUCT_SHORT_NAME} con envío gratis y paga al recibir
            en la puerta de tu casa.
          </p>
          <a
            href="#ofertas"
            className="gl-pulse inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-white px-8 py-4 text-lg font-bold text-[var(--gl-wine-800)] shadow-lg transition-transform hover:-translate-y-0.5 sm:w-auto"
          >
            Quiero mi {PRODUCT_SHORT_NAME}
          </a>
          {GUARANTEE_TEXT ? (
            <p className="mx-auto max-w-xl rounded-2xl border border-white/20 bg-white/10 p-4 text-sm">
              {GUARANTEE_TEXT}
            </p>
          ) : null}
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-2 text-xs font-medium text-[var(--gl-bone)]/80">
            <li>🚚 Envío gratis</li>
            <li>🤝 Pago contra entrega</li>
            <li>🔒 Compra segura</li>
          </ul>
          <p className="mx-auto max-w-2xl pt-4 text-[11px] leading-relaxed text-[var(--gl-bone)]/60">
            {DISCLAIMER}
            {SANITARY_REGISTRY ? ` ${SANITARY_REGISTRY}` : ""}
          </p>
        </div>
      </section>
    </div>
  );
}
