"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ProductImage from "@/components/ProductImage";

interface LandingProduct {
  id: string;
  name: string;
  slug: string;
  price: string | number;
  image?: string | null;
  stock?: number;
}

interface LandingProps {
  product: LandingProduct;
  onAddToCart: (
    quantity: number,
    opts?: { promotion?: boolean },
  ) => Promise<boolean>;
  offerEndTime?: string | null;
}

export const LANDING_SLUG = "aceite-oregano";

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

const PRODUCT_SHORT_NAME = "Aceite de Orégano";

const BULK_TOTALS: Readonly<Record<2 | 3, number | null>> = {
  2: 109_900,
  3: 139_800,
};

const MAX_QUANTITY = 10;

const HERO_VIDEO: MediaVideo | null = null;

const VIDEOS: readonly MediaVideo[] = [
  {
    src: "/landings/aceite-oregano/videos/video-oregano-1.mp4",
    title: "Cómo usar el aceite de orégano",
    caption: "Tutorial rápido de aplicación y dosis diaria.",
  },
  {
    src: "/landings/aceite-oregano/videos/video-oregano-2.mp4",
    title: "Beneficios del aceite de orégano con semilla negra",
    caption: "Descubre por qué es ideal para tu rutina diaria de bienestar.",
  },
];

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

const RESULTS: readonly MediaImage[] = [];

const TESTIMONIALS: readonly Testimonial[] = [];

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
    title: "Bajas defensas",
    text: "Resfriados frecuentes, cansancio constante y falta de energía son señales de alerta.",
  },
  {
    icon: "🍽️",
    title: "Problemas digestivos",
    text: "Inflamación, pesadez estomacal y digestión lenta afectan tu día a día.",
  },
  {
    icon: "🛡️",
    title: "Sistema inmune",
    text: "Refuerza tus barreras naturales con antioxidantes y compuestos protectores.",
  },
];

const USAGE_STEPS: readonly { title: string; text: string }[] = [
  { title: "Agita", text: "Agita bien el frasco antes de cada uso." },
  { title: "Dosis", text: "Coloca las gotas indicadas bajo la lengua o en agua." },
  { title: "Rutina", text: "Tómalo diariamente, preferiblemente en ayunas." },
];

const GUARANTEE_TEXT: string | null = null;

const SANITARY_REGISTRY: string | null = null;

const DISCLAIMER = "Este producto es un suplemento dietario. No es un medicamento. No se usa para diagnosticar, tratar, curar o prevenir ninguna enfermedad. Consulta con un profesional de la salud antes de usarlo si estás embarazada, amamantando o bajo tratamiento médico.";

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

function cld(url: string): string {
  return url;
}

function formatCop(value: number): string {
  return value.toLocaleString("es-CO");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function buildTiers(unitPrice: number) {
  const regularTotal = (qty: number) => unitPrice * qty;
  return [
    {
      qty: 1,
      label: "Prueba individual",
      badge: null,
      total: unitPrice,
      regularTotal: regularTotal(1),
      note: null,
      saving: 0,
      priceText: formatCop(unitPrice),
    },
    {
      qty: 2,
      label: "Pack doble",
      badge: "Más popular",
      total: BULK_TOTALS[2]!,
      regularTotal: regularTotal(2),
      note: `Ahorras ${formatCop(regularTotal(2) - (BULK_TOTALS[2]!))}`,
      saving: regularTotal(2) - (BULK_TOTALS[2]!),
      priceText: formatCop(Math.round((BULK_TOTALS[2]! / 2))),
    },
    {
      qty: 3,
      label: "Paga 2 y lleva 3",
      badge: "Máximo ahorro",
      total: BULK_TOTALS[3]!,
      regularTotal: regularTotal(3),
      note: `¡Paga 2 y lleva 3!`,
      saving: regularTotal(3) - (BULK_TOTALS[3]!),
      priceText: formatCop(Math.round((BULK_TOTALS[3]! / 3))),
    },
  ];
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function isAceiteOreganoProduct(product: LandingProduct): boolean {
  return normalize(`${product.name} ${product.slug}`).includes("aceite de oregano");
}

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <div className="space-y-2">
      {eyebrow && (
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--nb-green-600)]">
          {eyebrow}
        </p>
      )}
      <h2 className="text-2xl font-extrabold text-gray-900 sm:text-3xl tracking-tight">
        {title}
      </h2>
      {subtitle && (
        <p className="text-sm text-gray-600 leading-relaxed max-w-2xl">
          {subtitle}
        </p>
      )}
    </div>
  );
}

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
      if (!mobile.matches || reduced.matches || pausedRef.current) {
        pos = el.scrollLeft;
        return;
      }
      pos += dt * 0.035;
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
      <div className="flex shrink-0 gap-4 pr-4 md:contents">
        {items.map((item, i) => card(item, `a-${i}`))}
      </div>
      <div className="flex shrink-0 gap-4 pr-4 md:hidden" aria-hidden="true">
        {items.map((item, i) => card(item, `b-${i}`))}
      </div>
    </div>
  );
}

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
      pos += dt * 0.04;
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
    <div className="space-y-3 rounded-3xl border border-green-100 bg-green-50/50 p-6 text-center transition-shadow hover:shadow-md sm:p-8">
      <h3 className="text-lg font-bold text-gray-900">{video.title}</h3>
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
      <p className="text-sm font-medium text-gray-600">{video.caption}</p>
    </div>
  );
}

export default function AceiteOreganoLanding({
  product,
  onAddToCart,
  offerEndTime,
}: LandingProps) {
  const router = useRouter();

  const unitPrice = Number(product.price);
  const tiers = useMemo(() => buildTiers(unitPrice), [unitPrice]);
  const hasPrice = Number.isFinite(unitPrice) && unitPrice > 0;

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

      <section className="relative overflow-hidden bg-[var(--nb-cream)] px-4 pt-8 sm:pt-16 lg:pt-24 pb-12">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="relative">
              {heroMedia}
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--nb-cream)]/90 to-transparent pointer-events-none" />
            </div>
            <div className="space-y-6 lg:space-y-8">
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-green-200 text-[var(--nb-green-700)] text-xs font-bold uppercase tracking-widest w-fit">
                <span className="flex h-2 w-2 rounded-full bg-[var(--nb-green-600)]" />
                <span>Disponible para envío</span>
              </div>
              <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight leading-tight sm:text-5xl lg:text-6xl">
                {product.name}
              </h1>
              {product.image && (
                <p className="text-sm text-gray-600 leading-relaxed max-w-md">
                  Gotas líquidas naturales con orégano, aceite de semilla negra y vitamina E.
                  Soporte diario para tu sistema inmune y bienestar general.
                </p>
              )}
              <div className="flex items-center gap-4">
                <span className="text-2xl font-extrabold text-[var(--nb-green-800)]">
                  $ {formatCop(unitPrice)}
                </span>
                <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  COP c/u
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                {QUICK_BENEFITS.map((benefit) => (
                  <span
                    key={benefit}
                    className="px-3 py-1 rounded-full border border-green-200 bg-white text-xs font-medium text-gray-700"
                  >
                    {benefit}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-14 border-t border-green-100">
        <div className="mx-auto max-w-7xl space-y-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div className="space-y-6">
              <SectionHeading
                eyebrow="Poder de la naturaleza"
                title="Ingredientes que trabajan en equipo"
                subtitle="Orégano, semilla negra y vitamina E en una fórmula líquida de uso oral."
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  {
                    title: "Orégano",
                    text: "Rico en carvacrol y timol, compuestos con propiedades protectoras tradicionales.",
                  },
                  {
                    title: "Semilla negra",
                    text: "Conocida por su alto contenido en timoquinona y ácidos grasos esenciales.",
                  },
                  {
                    title: "Vitamina E",
                    text: "Antioxidante que ayuda a proteger las células del estrés oxidativo.",
                  },
                ].map((ing) => (
                  <div
                    key={ing.title}
                    className="rounded-2xl border border-green-200 bg-green-50/50 p-5 text-center transition-shadow hover:shadow-sm"
                  >
                    <span className="text-2xl">{ing.title === "Orégano" ? "🌿" : ing.title === "Semilla negra" ? "🌱" : "✨"}</span>
                    <h3 className="mb-2 font-bold text-gray-900">{ing.title}</h3>
                    <p className="text-xs text-gray-600 leading-relaxed">{ing.text}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative aspect-square bg-green-50 rounded-3xl overflow-hidden border border-green-200">
              <ProductImage
                src={heroImage}
                alt={`${PRODUCT_SHORT_NAME}, fórmula`}
                sizes="(max-width: 640px) 100vw, 33vw"
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[var(--nb-cream)] px-4 py-16 border-t border-green-100">
        <div className="mx-auto max-w-7xl space-y-12">
          <SectionHeading
            eyebrow="Fácil de usar"
            title="Cómo usarlo"
            subtitle="Tres pasos sencillos para incorporarlo a tu rutina diaria."
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {USAGE_STEPS.map((step, index) => (
              <div
                key={step.title}
                className="rounded-2xl border border-green-200 bg-white p-6 text-center transition-shadow hover:shadow-sm"
              >
                <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--nb-green-700)] text-lg font-extrabold text-white">
                  {index + 1}
                </span>
                <h3 className="mb-1 font-bold text-gray-900">{step.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {RESULTS.length > 0 ? (
        <section className="bg-white px-4 py-14 border-t border-green-100">
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

      <section className="bg-white px-4 py-14 border-t border-green-100">
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

      {REVIEWS.length > 0 ? (
        <section className="bg-[var(--nb-cream)] px-4 py-14 border-t border-green-100">
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

      {TESTIMONIALS.length > 0 ? (
        <section className="overflow-hidden bg-[var(--nb-cream)] px-4 py-14 border-t border-green-100">
          <div className="mx-auto max-w-6xl space-y-8">
            <SectionHeading
              eyebrow="Confianza real"
              title="Lo que dicen nuestros clientes en Colombia"
            />
            <TestimonialsCarousel items={TESTIMONIALS} />
          </div>
        </section>
      ) : null}

      {VIDEOS.length > 0 ? (
        <section className="border-t border-green-100 bg-white px-4 py-12">
          <div className="mx-auto max-w-6xl space-y-8">
            <SectionHeading
              eyebrow="Míralo en acción"
              title={`Conoce más sobre ${PRODUCT_SHORT_NAME}`}
            />
            <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
              {VIDEOS.map((video) => (
                <VideoCard key={video.src} video={video} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="bg-gradient-to-b from-[var(--nb-green-800)] to-[var(--nb-green-950)] px-4 py-16 text-center text-white border-t border-white/10">
        <div className="mx-auto max-w-3xl space-y-6">
          <h2 className="text-2xl font-extrabold sm:text-5xl tracking-tight">
            Naturaleza que cuida de ti
          </h2>
          <p className="text-sm text-green-100 sm:text-base max-w-xl mx-auto leading-relaxed">
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
