"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ProductImage from "@/components/ProductImage";

/**
 * Landing de "Glucora" (gotas líquidas de berberina, canela de Ceilán, cromo,
 * melón amargo y cúrcuma, 50 ml).
 *
 * Mismo contrato que `AceiteOreganoLanding`: se monta en
 * `app/products/[slug]/page.tsx`, debajo de "Productos similares", cuando
 * `product.slug === GLUCORA_SLUG`.
 *
 * Decisiones de diseño:
 * - La paleta sale del frasco (etiqueta granate, cúrcuma, canela, mármol).
 * - Los círculos de colores de la etiqueta (B, CR, C, BM, T) son el código
 *   visual de la página: reaparecen en los ingredientes.
 * - El selector de ofertas dibuja frascos: 1, 2 o 3, y en "paga 2 y lleva 3"
 *   el tercero va en dorado.
 *
 * Lo que no se puede afirmar sin respaldo (garantía, registro sanitario,
 * videos, dosis exacta) vive en constantes `TODO`. Una sección que depende de
 * un dato vacío no se pinta.
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

const PRODUCT_NAME = "Glucora";

/**
 * Total de la promoción por cantidad (COP). Unidad normal: $69.900.
 * - 2 frascos: $109.900.
 * - 3 frascos: "paga 2 y lleva 3" = 2 × $69.900 = $139.800.
 *
 * TODO(PRECIOS): confirmar que estos precios aplican a Glucora.
 *
 * ADVERTENCIA: son los totales que se MUESTRAN. Lo que se cobra lo calculan
 * `getProductUnitPrice`/`getLineUnitPrice` (web) y su gemela en
 * `api/src/common/utils/product-promotion.ts`, que solo conocen Oftalmiel.
 * Hasta que conozcan este producto, el carrito cobra precio normal × cantidad
 * aunque se elija una oferta.
 */
const BULK_TOTALS: Readonly<Record<2 | 3, number | null>> = {
  2: 149_900,
  3: null,
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

interface Review {
  name: string;
  stars: 1 | 2 | 3 | 4 | 5;
  title: string;
  text: string;
}

const HERO_IMAGE: MediaImage = {
  src: "/landings/glucora/images/glucora-1.png",
  alt: "Frasco gotero de Glucora de 50 ml",
};

/** Fotos de la galería (la primera carga con prioridad, el resto lazy). */
const GALLERY: readonly MediaImage[] = [
  {
    src: "/landings/glucora/images/glucora-1.png",
    alt: "Frasco gotero de Glucora de 50 ml",
  },
  {
    src: "/landings/glucora/images/glucora-2.png",
    alt: "Glucora ingredientes naturales",
  },
];

/** TODO(MEDIA): video del hero (Cloudinary). `null` = se usa la foto. */
const HERO_VIDEO: MediaVideo | null = null;

/** TODO(MEDIA): videos del producto. Vacío = sección oculta. */
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

/** TODO(RESULTADOS): fotos reales de clientes con su permiso. Vacío = oculta. */
const RESULTS: readonly MediaImage[] = [];

/** TODO(GARANTIA): texto de la garantía, solo si la tienda la ofrece de verdad. */
const GUARANTEE_TEXT: string | null = null;

/** TODO(INVIMA): registro o notificación sanitaria, si aplica. */
const SANITARY_REGISTRY: string | null = null;

/** Reseñas entregadas por el cliente (tal cual, sin ciudad ni sello de verificación). */
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
  { strong: "COMPRA SEGURA", rest: "Y RECIBE EN LA PUERTA DE TU CASA" },
  { strong: "OFERTA ESPECIAL", rest: "POR TIEMPO LIMITADO" },
];

/** Los círculos de color de la etiqueta del frasco. */
type DotId = "B" | "CR" | "C" | "BM" | "T";

const DOTS: Readonly<
  Record<DotId, { bg: string; fg: string; label: string }>
> = {
  B: { bg: "#D8283C", fg: "#FFFFFF", label: "Vitamina B" },
  CR: { bg: "#6FA52E", fg: "#0F1F05", label: "Cromo" },
  C: { bg: "#F0892A", fg: "#2B1200", label: "Vitamina C" },
  BM: { bg: "#A8C23A", fg: "#1B2504", label: "Melón amargo" },
  T: { bg: "#F0A21F", fg: "#2B1A00", label: "Cúrcuma" },
};

const QUICK_FACTS: readonly string[] = [
  "Fórmula líquida, sin pastillas grandes",
  "Incluye vitaminas B y C",
  "Frasco gotero de 50 ml",
  "Pago contra entrega",
];

const SIGNS: readonly { dot: DotId; title: string; text: string }[] = [
  {
    dot: "B",
    title: "El bajón después de almorzar",
    text: "Comes y una hora después el cuerpo pide pausa. Un apoyo diario antes de la comida puede ayudarte a sentir un ritmo más parejo.",
  },
  {
    dot: "T",
    title: "Antojos de dulce a media tarde",
    text: "Cuando la tarde se alarga, el antojo aparece. Mantener hábitos constantes es más fácil con una rutina simple.",
  },
  {
    dot: "C",
    title: "Energía que sube y baja",
    text: "Empiezas bien el día y llegas a la noche sin fuerzas. El bienestar metabólico también se cuida a diario.",
  },
  {
    dot: "CR",
    title: "Cápsulas y frascos por separado",
    text: "Tragar pastillas grandes o comprar cada ingrediente aparte complica la constancia. Aquí van cinco en un solo gotero.",
  },
];

const INGREDIENT_GROUPS: readonly {
  title: string;
  dots: readonly DotId[];
  text: string;
}[] = [
  {
    title: "Berberina y canela de Ceilán",
    dots: [],
    text: "El dúo que abre la etiqueta. La berberina es un compuesto vegetal muy usado en suplementos de bienestar metabólico; la canela de Ceilán es la variedad con menos cumarina que la canela común.",
  },
  {
    title: "Cromo y vitaminas B y C",
    dots: ["CR", "B", "C"],
    text: "Micronutrientes de apoyo. El cromo es un mineral que participa en el metabolismo normal de los macronutrientes, y las vitaminas B y C completan el aporte diario.",
  },
  {
    title: "Melón amargo y cúrcuma",
    dots: ["BM", "T"],
    text: "Dos plantas de uso tradicional. El melón amargo se usa en la cocina y la herbolaria de varias regiones; la cúrcuma aporta curcuminoides con propiedades antioxidantes.",
  },
];

/** TODO(USO): confirmar la porción exacta con la etiqueta del frasco. */
const USAGE_STEPS: readonly { title: string; text: string }[] = [
  {
    title: "Agita el frasco",
    text: "Mezcla el contenido con un movimiento suave antes de abrir.",
  },
  {
    title: "Mide la porción de la etiqueta",
    text: "Llena el gotero hasta la cantidad indicada y no la superes.",
  },
  {
    title: "Diluye en agua",
    text: "Si el sabor herbal te parece fuerte, usa un vaso lleno de agua.",
  },
  {
    title: "Repite todos los días",
    text: "Los beneficios dependen de la constancia, así que elige una hora fija.",
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

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

interface OfferTier {
  qty: 1 | 2 | 3;
  /** Lo que se muestra como total. */
  total: number;
  /** `precio normal × cantidad`, para mostrar el ahorro. */
  regularTotal: number;
  note: string;
}

function buildTiers(unitPrice: number): OfferTier[] {
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return [];

  const tiers: OfferTier[] = [
    { qty: 1, total: unitPrice, regularTotal: unitPrice, note: "Precio normal" },
  ];
  const double = BULK_TOTALS[2];
  if (double !== null) {
    const saving = unitPrice * 2 - double;
    tiers.push({
      qty: 2,
      total: double,
      regularTotal: unitPrice * 2,
      note: saving > 0 ? `Promoción: ahorras ${formatCop(saving)}` : "Promoción",
    });
  }
  const triple = BULK_TOTALS[3];
  if (triple !== null) {
    const saving = unitPrice * 3 - triple;
    tiers.push({
      qty: 3,
      total: triple,
      regularTotal: unitPrice * 3,
      note: saving > 0 ? `Promoción: ahorras ${formatCop(saving)}` : "Promoción",
    });
  }
  // Combo de 3: "paga 2 y lleve 3" -> total = 2 x precio unitario
  const tripleTotal = unitPrice * 2;
  const savingTriple = unitPrice * 3 - tripleTotal;
  tiers.push({
    qty: 3,
    total: tripleTotal,
    regularTotal: unitPrice * 3,
    note: savingTriple > 0 ? `Paga 2 y lleva 3 (ahorras ${formatCop(savingTriple)})` : "Paga 2 y lleva 3",
  });
  return tiers;
}

/* ------------------------------------------------------------------------- */
/* Piezas pequeñas                                                            */
/* ------------------------------------------------------------------------- */

function DotChip({
  id,
  size = "md",
  decorative = false,
}: {
  id: DotId;
  size?: "md" | "lg";
  decorative?: boolean;
}) {
  const dot = DOTS[id];
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : dot.label}
      title={decorative ? undefined : dot.label}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-1 ring-black/10 ${
        size === "lg" ? "h-12 w-12 text-xs" : "h-7 w-7 text-[10px]"
      }`}
      style={{ backgroundColor: dot.bg, color: dot.fg }}
    >
      {id}
    </span>
  );
}

/** Frasco esquemático para el selector: `gold` marca el que va de regalo. */
function BottleGlyph({ gold }: { gold?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 36"
      className="h-9 w-5 shrink-0"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="7.5" y="0.5" width="5" height="7" rx="1.5" fill="#15090C" />
      <rect x="8.5" y="7" width="3" height="4" fill="#15090C" />
      <path
        d="M4 14.5c0-2.2 1.8-3.5 3.5-3.5h5c1.7 0 3.5 1.3 3.5 3.5V32a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"
        fill={gold ? "#F6B21B" : "#B3122F"}
      />
      <rect x="4" y="18" width="12" height="9" fill={gold ? "#FFF3D1" : "#F2E7E1"} opacity="0.92" />
    </svg>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span
      role="img"
      aria-label={`${value} de 5 estrellas`}
      className="inline-flex gap-0.5 text-base leading-none"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={i < value ? "text-[var(--gl-turmeric)]" : "text-black/15"}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function SectionHeading({
  title,
  subtitle,
  tone = "light",
  index,
}: {
  title: string;
  subtitle?: string;
  tone?: "light" | "dark";
  /** Número de capítulo, solo decorativo. */
  index?: string;
}) {
  const isDark = tone === "dark";

  return (
    <div className="max-w-xl">
      <div
        aria-hidden="true"
        className={`mb-5 flex items-center gap-3 ${
          isDark ? "text-[var(--gl-turmeric)]" : "text-[var(--gl-garnet)]"
        }`}
      >
        {index ? (
          <span className="text-[11px] font-semibold tracking-[0.28em]">
            {index}
          </span>
        ) : null}
        <span
          className={`h-px w-10 ${
            isDark ? "bg-white/25" : "bg-[var(--gl-ink)]/20"
          }`}
        />
      </div>
      <h2
        className={`gl-serif text-[1.9rem] font-semibold leading-[1.08] sm:text-[2.45rem] ${
          isDark ? "text-[var(--gl-bone)]" : "text-[var(--gl-ink)]"
        }`}
      >
        {title}
      </h2>
      {subtitle ? (
        <p
          className={`mt-4 text-[15px] leading-relaxed ${
            isDark ? "text-[var(--gl-bone)]/65" : "text-[var(--gl-ink)]/65"
          }`}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

/** 1. Marquee superior de urgencia (usa `--animate-marquee` de globals.css). */
function UrgencyMarquee() {
  const group = (hidden: boolean) => (
    <div
      className="flex shrink-0 items-center"
      aria-hidden={hidden ? true : undefined}
    >
      {MARQUEE_ITEMS.map((item) => (
        <span key={item.strong} className="flex items-center">
          <span className="px-6 text-[10px] uppercase tracking-[0.18em] sm:text-[11px]">
            <strong className="font-semibold text-[var(--gl-turmeric)]">
              {item.strong}
            </strong>{" "}
            <span className="text-[var(--gl-bone)]/60">{item.rest}</span>
          </span>
          <span
            aria-hidden="true"
            className="h-1 w-1 shrink-0 rounded-full bg-[var(--gl-turmeric)]/50"
          />
        </span>
      ))}
    </div>
  );

  return (
    <div
      className="overflow-hidden whitespace-nowrap border-b border-white/10 bg-[var(--gl-wine-950)] py-2.5"
      aria-label="Información de envío y pago"
    >
      <div className="flex w-max animate-marquee will-change-transform">
        {group(false)}
        {group(true)}
      </div>
    </div>
  );
}

/** 9. Reseñas: grid en escritorio, auto-scroll horizontal en móvil. */
function ReviewsCarousel({ items }: { items: readonly Review[] }) {
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
        if (reduced.matches || pausedRef.current) {
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

  const card = (item: Review, key: string) => (
    <figure
      key={key}
      className="flex w-[19rem] shrink-0 flex-col justify-between rounded-xl border border-[var(--gl-stone-2)] bg-white p-6 transition-colors hover:border-[var(--gl-garnet)]/35 sm:w-80"
    >
      <div>
        <Stars value={item.stars} />
        <h3 className="gl-serif mt-3 text-[1.15rem] font-semibold leading-snug text-[var(--gl-ink)]">
          {item.title}
        </h3>
        <blockquote className="mt-2 text-[13.5px] leading-relaxed text-[var(--gl-ink)]/65">
          {item.text}
        </blockquote>
      </div>
      <figcaption className="mt-5 flex items-center gap-2.5 text-xs font-semibold tracking-wide text-[var(--gl-ink)]">
        <span
          aria-hidden="true"
          className="h-px w-5 bg-[var(--gl-garnet)]/60"
        />
        {item.name}
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
        {items.map((item, i) => card(item, `a-${i}`))}
      </div>
      <div className="flex shrink-0 gap-4 pr-4" aria-hidden="true">
        {items.map((item, i) => card(item, `b-${i}`))}
      </div>
    </div>
  );
}

function VideoCard({ video }: { video: MediaVideo }) {
  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-[9/16] w-full max-w-[17rem] overflow-hidden rounded-xl bg-black ring-1 ring-black/10 sm:max-w-[18rem]">
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
      <h3 className="gl-serif text-center text-lg font-semibold text-[var(--gl-ink)]">
        {video.title}
      </h3>
      <p className="text-center text-[13px] leading-relaxed text-[var(--gl-ink)]/70">
        {video.caption}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Landing                                                                    */
/* ------------------------------------------------------------------------- */

export default function GlucoraLanding({
  product,
  onAddToCart,
  offerEndTime,
}: LandingProps) {
  const router = useRouter();

  const unitPrice = Number(product.price);
  const hasPrice = Number.isFinite(unitPrice) && unitPrice > 0;
  const tiers = useMemo(() => buildTiers(unitPrice), [unitPrice]);

  /**
   * Oferta elegida en el selector (`null` = ninguna). SOLO una oferta elegida
   * manda `promotion: true`; sin ella, la compra va a precio normal.
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

  const average = useMemo(() => {
    const sum = REVIEWS.reduce((acc, r) => acc + r.stars, 0);
    return REVIEWS.length > 0 ? sum / REVIEWS.length : 0;
  }, []);

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
      return `Pedir ${selectedTier.qty} ${units} por ${formatCop(selectedTier.total)}`;
    }
    return hasPrice
      ? `Agregar ${quantity} al carrito por ${formatCop(unitPrice * quantity)}`
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
      src={HERO_IMAGE.src}
      alt={HERO_IMAGE.alt}
      priority
      sizes="(max-width: 1024px) 100vw, 50vw"
      className="absolute inset-0 h-full w-full object-cover"
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
        .gl-landing ::selection {
          background: var(--gl-turmeric);
          color: var(--gl-wine-950);
        }
        .gl-landing .gl-serif {
          font-family: ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
          letter-spacing: -0.015em;
        }
        .gl-landing .gl-hero-glow {
          background-color: var(--gl-wine-950);
          background-image:
            radial-gradient(55% 45% at 82% 12%, rgba(246, 178, 27, 0.14), transparent 68%),
            radial-gradient(45% 40% at 4% 86%, rgba(179, 18, 47, 0.3), transparent 70%);
        }
        .gl-landing .gl-hide-scrollbar { scrollbar-width: none; }
        .gl-landing .gl-hide-scrollbar::-webkit-scrollbar { display: none; }
        .gl-landing :focus-visible {
          outline: 2px solid var(--gl-turmeric);
          outline-offset: 3px;
        }
        @media (prefers-reduced-motion: reduce) {
          .gl-landing { scroll-behavior: auto; }
        }
      `}</style>

      {/* 1. Marquee de urgencia */}
      <UrgencyMarquee />

      {/* 2. Hero */}
      <section className="gl-hero-glow relative overflow-hidden px-5 pb-16 pt-10 text-[var(--gl-bone)] sm:px-6 sm:pt-14 lg:pb-24 lg:pt-16">
        <div className="mx-auto grid max-w-6xl gap-x-12 gap-y-10 lg:grid-cols-12">
          {/* Titular */}
          <div className="lg:col-span-6 lg:col-start-1 lg:row-start-1">
            <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--gl-bone)]/60 sm:text-[11px]">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-[var(--gl-turmeric)]"
              />
              <span className="text-[var(--gl-bone)]">{PRODUCT_NAME}</span>
              <span
                aria-hidden="true"
                className="h-px w-8 bg-[var(--gl-turmeric)]/50"
              />
              <span>50 ml</span>
            </div>
            <h1 className="gl-serif mt-6 text-balance text-[2.4rem] font-semibold leading-[1] sm:text-[3.4rem] lg:text-[3.2rem] xl:text-[3.75rem]">
              Cinco ingredientes
              <span className="mt-1 block italic text-[var(--gl-turmeric)]">
                en un solo gotero
              </span>
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-[var(--gl-bone)]/70 sm:text-base">
              Berberina, canela de Ceilán, cromo, melón amargo y cúrcuma en
              gotas líquidas de 50 ml, para acompañar tu bienestar metabólico
              todos los días.
            </p>
            <ul className="mt-8 grid max-w-md grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {QUICK_FACTS.map((fact) => (
                <li
                  key={fact}
                  className="flex items-start gap-2.5 border-t border-white/12 pt-3 text-[13px] leading-snug text-[var(--gl-bone)]/75"
                >
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--gl-turmeric)]"
                  />
                  {fact}
                </li>
              ))}
            </ul>
          </div>

          {/* Imagen o video */}
          <div className="lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1">
            <div className="relative mx-auto w-full max-w-[25rem] lg:max-w-none lg:pt-2">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-2.5 rounded-[1.75rem] border border-[var(--gl-turmeric)]/25"
              />
              <div className="relative aspect-[4/5] overflow-hidden rounded-[1.4rem] bg-[var(--gl-wine-900)] ring-1 ring-white/10">
                {heroMedia}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--gl-wine-950)]/50 via-transparent to-transparent"
                />
              </div>
            </div>
          </div>

          {/* Compra */}
          <div
            id="ofertas"
            className="scroll-mt-24 space-y-3 lg:col-span-6 lg:col-start-1 lg:row-start-2"
          >
            {tiers.length > 1 ? (
              <div
                role="radiogroup"
                aria-label="Elige cuántos frascos llevar"
                className="space-y-2"
              >
                {tiers.map((tier) => {
                  const isSelected = tier.qty === selectedQty;
                  const unavailable =
                    soldOut || (typeof stock === "number" && tier.qty > stock);
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
                      className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-45 sm:gap-4 sm:px-4 ${
                        isSelected
                          ? "border-[var(--gl-turmeric)] bg-white/[0.06]"
                          : "border-white/12 hover:border-white/30 hover:bg-white/[0.03]"
                      }`}
                    >
                      <span className="flex w-16 items-end gap-0.5" aria-hidden="true">
                        {Array.from({ length: tier.qty }, (_, i) => (
                          <BottleGlyph key={i} gold={tier.qty === 3 && i === 2} />
                        ))}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold sm:text-[15px]">
                          {tier.qty} {tier.qty === 1 ? "frasco" : "frascos"}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-[var(--gl-bone)]/55">
                          {tier.note}
                        </span>
                      </span>
                      <span className="text-right">
                        <span
                          className={`gl-serif block text-lg font-semibold sm:text-xl ${
                            isSelected
                              ? "text-[var(--gl-turmeric)]"
                              : "text-[var(--gl-bone)]"
                          }`}
                        >
                          {formatCop(tier.total)}
                        </span>
                        {tier.regularTotal > tier.total ? (
                          <del className="block text-[11px] text-[var(--gl-bone)]/55">
                            {formatCop(tier.regularTotal)}
                          </del>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
                <p className="pt-1 text-[11px] leading-relaxed text-[var(--gl-bone)]/55">
                  {selectedTier
                    ? "Toca de nuevo la oferta para quitarla y comprar a precio normal."
                    : "Sin oferta elegida pagas el precio normal por unidad."}
                </p>
              </div>
            ) : null}

            {/* Cantidad: solo en compra normal (sin oferta elegida) */}
            {!selectedTier && hasPrice ? (
              <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div>
                  <span className="block text-[10px] uppercase tracking-[0.16em] text-[var(--gl-bone)]/55">
                    Precio normal por frasco
                  </span>
                  <span className="gl-serif mt-1 block text-xl font-semibold text-[var(--gl-turmeric)]">
                    {formatCop(unitPrice)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5" role="group" aria-label="Cantidad">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                    aria-label="Disminuir cantidad"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-lg font-semibold transition-colors hover:border-white/45 disabled:opacity-35"
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
                    onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                    disabled={quantity >= maxQuantity}
                    aria-label="Aumentar cantidad"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-lg font-semibold transition-colors hover:border-white/45 disabled:opacity-35"
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
                className={`group mt-1 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-5 py-4 text-[15px] font-bold tracking-wide transition-colors sm:text-base ${
                  soldOut || !hasPrice
                    ? "cursor-not-allowed bg-white/15 text-white/50"
                    : "bg-[var(--gl-turmeric)] text-[var(--gl-wine-950)] hover:bg-[var(--gl-turmeric-soft)]"
                } ${pending ? "cursor-wait opacity-75" : ""}`}
              >
                {ctaLabel}
                {!pending && !soldOut && hasPrice ? (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-4 w-4 transition-transform group-hover:translate-x-1"
                  >
                    <path
                      d="M4 10h11M11 5.5 15.5 10 11 14.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </button>
              {failed ? (
                <p role="alert" className="mt-2 text-sm text-[#ff9aa5]">
                  No pudimos agregar el producto. Intenta de nuevo.
                </p>
              ) : null}
              <p className="mt-3 text-center text-[11px] text-[var(--gl-bone)]/55">
                Paga al recibir en casa. Envío gratis a toda Colombia.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Señales de que necesitas Glucora */}
      <section className="px-5 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <SectionHeading
              index="01"
              title="Señales de que necesitas Glucora"
              subtitle="Situaciones del día a día donde un apoyo constante y fácil de tomar hace la diferencia."
            />
            <a
              href="#ofertas"
              className="group mt-8 inline-flex items-center gap-3 text-sm font-semibold text-[var(--gl-garnet)]"
            >
              Ver promociones
              <span
                aria-hidden="true"
                className="h-px w-8 bg-current transition-all group-hover:w-12"
              />
            </a>
          </div>
          <ul className="lg:col-span-7 lg:pt-2">
            {SIGNS.map((sign, index) => (
              <li
                key={sign.title}
                className="grid grid-cols-[auto_1fr] gap-4 border-t border-[var(--gl-stone-2)] py-6 last:border-b sm:gap-6 sm:py-7"
              >
                <DotChip id={sign.dot} decorative />
                <div>
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="gl-serif text-[1.2rem] font-semibold leading-snug text-[var(--gl-ink)] sm:text-[1.35rem]">
                      {sign.title}
                    </h3>
                    <span
                      aria-hidden="true"
                      className="gl-serif text-xs text-[var(--gl-ink)]/30"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <p className="mt-1.5 max-w-prose text-[13.5px] leading-relaxed text-[var(--gl-ink)]/70 sm:text-sm">
                    {sign.text}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 4. Videos del producto (solo con videos cargados) */}
      {VIDEOS.length > 0 ? (
        <section className="border-y border-[var(--gl-stone-2)] bg-white px-5 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-6xl space-y-10">
            <SectionHeading title="Mira Glucora en acción" />
            <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
              {VIDEOS.map((video) => (
                <VideoCard key={video.src} video={video} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* 5. Ingredientes */}
      <section className="gl-hero-glow relative px-5 py-20 text-[var(--gl-bone)] sm:px-6 sm:py-28">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-24">
              <SectionHeading
                tone="dark"
                index="02"
                title="Lo que dice la etiqueta, en palabras simples"
                subtitle="Los cinco ingredientes principales y las vitaminas B y C, agrupados en tres ideas. Los círculos de color son los mismos que verás en el frasco."
              />
            </div>
          </div>
          <div className="lg:col-span-8">
            <div className="border-t border-white/12">
              {INGREDIENT_GROUPS.map((group, index) => (
                <article
                  key={group.title}
                  className="grid gap-4 border-b border-white/12 py-7 sm:grid-cols-[1fr_auto] sm:items-start sm:gap-8 sm:py-8"
                >
                  <div>
                    <span
                      aria-hidden="true"
                      className="gl-serif text-xs tracking-widest text-[var(--gl-turmeric)]/80"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="gl-serif mt-2 text-[1.5rem] font-semibold leading-tight sm:text-[1.7rem]">
                      {group.title}
                    </h3>
                    <p className="mt-3 max-w-prose text-[13.5px] leading-relaxed text-[var(--gl-bone)]/65 sm:text-sm">
                      {group.text}
                    </p>
                  </div>
                  {group.dots.length > 0 ? (
                    <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                      {group.dots.map((id) => (
                        <DotChip key={id} id={id} size="lg" />
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 6. Cómo usarlo */}
      <section className="px-5 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <SectionHeading
              index="03"
              title="Cómo usarlo"
              subtitle="Un gotero, un vaso de agua y una hora fija. Eso es todo."
            />
          </div>
          <ol className="lg:col-span-7">
            {USAGE_STEPS.map((step, index) => (
              <li
                key={step.title}
                className="grid grid-cols-[auto_1fr] gap-5 border-t border-[var(--gl-stone-2)] py-6 last:border-b sm:gap-7"
              >
                <span
                  aria-hidden="true"
                  className="gl-serif text-3xl font-semibold leading-none text-[var(--gl-garnet)]/80 sm:text-4xl"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="pt-0.5">
                  <h3 className="gl-serif text-[1.2rem] font-semibold text-[var(--gl-ink)]">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 max-w-prose text-[13.5px] leading-relaxed text-[var(--gl-ink)]/70 sm:text-sm">
                    {step.text}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 7. Resultados reales (solo con material real) */}
      {RESULTS.length > 0 ? (
        <section className="border-t border-[var(--gl-stone-2)] bg-white px-5 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-6xl space-y-10">
            <SectionHeading
              title="Resultados de clientes"
              subtitle="Los resultados pueden variar de una persona a otra."
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {RESULTS.map((result) => (
                <figure
                  key={result.src}
                  className="overflow-hidden rounded-xl border border-[var(--gl-stone-2)] bg-[var(--gl-stone)]"
                >
                  <div className="relative aspect-[4/5]">
                    <ProductImage
                      src={cld(result.src)}
                      alt={result.alt}
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  </div>
                  {result.caption ? (
                    <figcaption className="p-3 text-[13px] text-[var(--gl-ink)]/70">
                      {result.caption}
                    </figcaption>
                  ) : null}
                </figure>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* 8. Galería */}
      <section className="bg-white px-5 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-6xl space-y-10">
          <SectionHeading index="04" title="Mira el frasco de cerca" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-6">
            {GALLERY.map((image, index) => (
              <div
                key={image.src}
                className="group relative aspect-[4/5] overflow-hidden rounded-xl bg-[var(--gl-wine-900)] ring-1 ring-black/5"
              >
                <ProductImage
                  src={cld(image.src)}
                  alt={image.alt}
                  priority={index === 0}
                  sizes="(max-width: 640px) 100vw, 50vw"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 9. Reseñas */}
      <section className="overflow-hidden bg-[var(--gl-stone)] px-5 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-6xl space-y-10">
          <div className="flex flex-col gap-6 border-b border-[var(--gl-stone-2)] pb-8 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeading
              index="05"
              title="Lo que dicen quienes lo usan"
            />
            <div className="flex items-end gap-4">
              <span className="gl-serif text-5xl font-semibold leading-none">
                {average.toLocaleString("es-CO", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </span>
              <div className="pb-1">
                <Stars value={Math.floor(average)} />
                <span className="mt-1 block text-xs text-[var(--gl-ink)]/65">
                  {REVIEWS.length} reseñas
                </span>
              </div>
            </div>
          </div>
          <ReviewsCarousel items={REVIEWS} />
        </div>
      </section>

      {/* 10. CTA final + garantía */}
      <section className="gl-hero-glow relative overflow-hidden px-5 py-20 text-[var(--gl-bone)] sm:px-6 sm:py-28">
        <div className="mx-auto max-w-4xl text-center">
          <span
            aria-hidden="true"
            className="mx-auto mb-8 block h-px w-16 bg-[var(--gl-turmeric)]/50"
          />
          <h2 className="gl-serif text-[2.1rem] font-semibold leading-[1.05] sm:text-5xl">
            Empieza hoy con Glucora y paga al recibir
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-[var(--gl-bone)]/70 sm:text-base">
            Elige tu promoción, recibe el frasco en la puerta de tu casa y paga
            cuando llegue. El envío es gratis a toda Colombia.
          </p>
          <a
            href="#ofertas"
            className="group mt-8 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[var(--gl-turmeric)] px-8 py-4 text-base font-bold tracking-wide text-[var(--gl-wine-950)] transition-colors hover:bg-[var(--gl-turmeric-soft)] sm:w-auto"
          >
            Elegir mi promoción
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-4 w-4 transition-transform group-hover:translate-x-1"
            >
              <path
                d="M4 10h11M11 5.5 15.5 10 11 14.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
          {GUARANTEE_TEXT ? (
            <p className="mx-auto mt-8 max-w-xl rounded-xl border border-white/15 bg-white/[0.04] p-4 text-sm">
              {GUARANTEE_TEXT}
            </p>
          ) : null}
          <p className="mx-auto mt-12 max-w-2xl border-t border-white/10 pt-6 text-left text-[11px] leading-relaxed text-[var(--gl-bone)]/60">
            {DISCLAIMER}
            {SANITARY_REGISTRY ? ` ${SANITARY_REGISTRY}` : ""}
          </p>
        </div>
      </section>
    </div>
  );
}
