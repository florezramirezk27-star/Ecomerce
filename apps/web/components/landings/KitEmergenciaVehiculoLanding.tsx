"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ProductImage from "@/components/ProductImage";

/**
 * Landing de "Kit de Emergencia para Vehículo".
 *
 * Toma la estructura de `ArbutinaLanding` (marquesina, hero con video,
 * señales, beneficios, galería, reseñas y CTA final) y la viste en rojo y
 * naranja suaves, acorde al color del producto.
 *
 * No tiene promociones por cantidad: solo compra normal a precio unitario.
 *
 * Se monta en `app/products/[slug]/page.tsx` cuando el slug o el nombre del
 * producto coinciden con `KIT_EMERGENCIA_SLUG` o con
 * `/emergencia|vehiculo|vehículo|kit de emergencia/i`.
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
  onAddToCart: (quantity: number, opts?: { promotion?: boolean }) => Promise<boolean>;
  /** Fecha límite del contador (ISO 8601, opcional). */
  offerEndTime?: string | null;
}

/** Slug con el que la página de producto decide montar esta landing. */
export const KIT_EMERGENCIA_SLUG = "kit-emergencia-vehiculo";

/* ------------------------------------------------------------------------- */
/* CONTENIDO                                                                  */
/* ------------------------------------------------------------------------- */

const PRODUCT_SHORT_NAME = "Kit de Emergencia para Vehículo";
const PRODUCT_BRAND = "Seguridad Vial";

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
  src: "/landings/kit-emergencia-vehiculo/images/kit-emergencia-1.png",
  alt: `${PRODUCT_SHORT_NAME}, estuche rígido con herramientas de seguridad`,
};

const GALLERY: readonly MediaImage[] = [
  {
    src: "/landings/kit-emergencia-vehiculo/images/kit-emergencia-1.png",
    alt: `${PRODUCT_SHORT_NAME}, presentación completa`,
  },
  {
    src: "/landings/kit-emergencia-vehiculo/images/kit-emergencia-2.png",
    alt: `${PRODUCT_SHORT_NAME}, contenido del estuche`,
  },
  {
    src: "/landings/kit-emergencia-vehiculo/images/kit-emergencia-3.jpg",
    alt: `Herramientas de seguridad para el vehículo`,
  },
  {
    src: "/landings/kit-emergencia-vehiculo/images/kit-emergencia-4.jpg",
    alt: `${PRODUCT_SHORT_NAME}, chaleco reflectivo y conos`,
  },
];

const VIDEOS: readonly MediaVideo[] = [
  {
    src: "/landings/kit-emergencia-vehiculo/videos/kit-emergencia-1.mp4",
    title: "Conoce el Kit de Emergencia para Vehículo",
    caption: "Estuche rígido portátil con todo lo necesario para emergencias en carretera.",
  },
  {
    src: "/landings/kit-emergencia-vehiculo/videos/kit-emergencia-2.mp4",
    title: "Kit de Emergencia en acción",
    caption: "Demostración de uso de las herramientas en una situación real.",
  },
];

/** TODO(GARANTIA): texto de la garantía, solo si la tienda la ofrece de verdad. */
const GUARANTEE_TEXT: string | null = null;

/** TODO(INVIMA): registro o notificación sanitaria, si aplica. */
const SANITARY_REGISTRY: string | null = null;

const REVIEWS: readonly Review[] = [
  {
    stars: 5,
    title: "Me salvó en un pinchazo",
    text: "Me quedé varado en la carretera con una llanta ponchada y este kit me salvó. Tenía todo lo necesario para señalizar y manejar la situación con calma. Muy recomendado para cualquier conductor.",
  },
  {
    stars: 5,
    title: "Completo y bien organizado",
    text: "El estuche es rígido y resistente, y cada herramienta tiene su lugar. Viene con chaleco reflectivo, cono, cable de arranque y más. Lo llevo en el baúl y viajo más tranquilo.",
  },
  {
    stars: 5,
    title: "Ideal para viajes largos",
    text: "Compré este kit antes de un viaje por carretera y no me arrepiento. El martillo de emergencia, el manómetro y la linterna me dan mucha seguridad. Producto completo y de buena calidad.",
  },
  {
    stars: 5,
    title: "Alta visibilidad y seguridad",
    text: "El chaleco reflectivo y el cono plegable son excelentes para señalizar si te detienes en la vía. Los materiales se ven resistentes y el estuche es compacto. Muy satisfecho.",
  },
  {
    stars: 5,
    title: "Buena relación calidad-precio",
    text: "Tiene todo lo básico para una emergencia: cables, linterna, alicate, cutter, destornillador, guantes y cinta de remolque. No hace falta comprar nada por separado.",
  },
  {
    stars: 5,
    title: "Fácil de guardar y transportar",
    text: "El estuche es compacto y cabe perfecto en el baúl del auto. El peso es ligero y las herramientas son de acero. Lo recomiendo para taxis y vehículos particulares.",
  },
  {
    stars: 5,
    title: "Me dio tranquilidad en el camino",
    text: "Saber que tengo este kit en el carro me da mucha paz mental. El rompevidrios y el manómetro son detalles que marcan la diferencia. Calidad premium a buen precio.",
  },
  {
    stars: 5,
    title: "Producto tal como se describe",
    text: "Llegó rápido y con todo el contenido prometido. El estuche rígido protege bien las herramientas y los colores naranja y negro son muy visibles. Volvería a comprar.",
  },
];

const MARQUEE_ITEMS: readonly { strong: string; rest: string }[] = [
  { strong: "ENVÍO GRATIS", rest: "A TODA COLOMBIA" },
  { strong: "PAGO CONTRA ENTREGA:", rest: "paga al recibir en casa" },
  { strong: "KIT DE EMERGENCIA PARA VEHÍCULO", rest: "seguridad en carretera" },
  { strong: "ESTUCHE RÍGIDO · ROJO Y NARANJA", rest: "alta visibilidad" },
];

const QUICK_BENEFITS: readonly string[] = [
  "Estuche rígido portátil con cierre",
  "11 herramientas y elementos de seguridad",
  "Chaleco reflectivo y cono de señalización",
  "Compacto y fácil de almacenar en el baúl",
];

const SIGNS: readonly { icon: string; title: string; text: string }[] = [
  {
    icon: "🚗",
    title: "Batería descargada",
    text: "El cable de arranque te permite volver a encender el vehículo sin depender de terceros.",
  },
  {
    icon: "🛞",
    title: "Llanta pinchada",
    text: "El manómetro y las herramientas básicas te ayudan a revisar y manejar la presión de los neumáticos.",
  },
  {
    icon: "💡",
    title: "Falla nocturna",
    text: "La linterna manual ilumina el área para revisar el vehículo en la oscuridad.",
  },
  {
    icon: "🪟",
    title: "Emergencia en el habitáculo",
    text: "El martillo de emergencia rompevidrios te permite salir del vehículo si quedas atrapado.",
  },
  {
    icon: "⚠️",
    title: "Señalización vial",
    text: "El chaleco reflectivo y el cono plegable advierten a otros conductores y evitan accidentes.",
  },
  {
    icon: "🧰",
    title: "Mantenimiento básico",
    text: "Cutter, alicate, destornillador multifuncional y cinta de remolque para reparaciones rápidas.",
  },
];

const BENEFITS: readonly {
  icon: string;
  title: string;
  text: string;
  featured?: boolean;
}[] = [
  {
    icon: "🧰",
    title: "Kit completo",
    text: "11 elementos esenciales para atender emergencias básicas en carretera sin necesidad de comprar nada por separado.",
  },
  {
    icon: "⚠️",
    title: "Alta visibilidad",
    text: "Color negro con detalles en naranja y elementos reflectivos que te hacen visible en la vía.",
    featured: true,
  },
  {
    icon: "👜",
    title: "Portátil y compacto",
    text: "Estuche rígido de alta resistencia con cierre, fácil de guardar en el baúl y transportar a cualquier lugar.",
  },
  {
    icon: "🔧",
    title: "Materiales resistentes",
    text: "Herramientas de acero y plástico reforzado, chaleco de poliéster reflectivo y guantes antideslizantes.",
  },
];

const SALES_BENEFITS: readonly string[] = [
  "Atiende emergencias básicas en carretera de forma inmediata.",
  "Evita depender de grúas o asistencia externa en situaciones simples.",
  "Elementos de alta visibilidad para señalizar y prevenir accidentes.",
  "Estuche rígido y compacto, fácil de almacenar y transportar.",
  "Ideal para vehículos particulares, taxis, transporte y viajes largos.",
  "Herramientas de acero y plástico reforzado con larga durabilidad.",
];

const DISCLAIMER =
  "Producto de seguridad vial para uso en vehículos. Revisa el estado y funcionamiento de cada herramienta periódicamente. No sustituye la asistencia profesional en emergencias graves.";

/** Máximo de unidades en la compra normal. */
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
      <span className="inline-block rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-[var(--aw-emerg-700)]">
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
      className="overflow-hidden whitespace-nowrap bg-[var(--aw-emerg-950)] py-2.5 text-[11px] font-medium text-white sm:text-sm"
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
      className="flex w-80 shrink-0 flex-col justify-between rounded-2xl border border-orange-200 bg-white p-5 shadow-sm"
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
      <figcaption className="mt-4 flex items-center gap-2 border-t border-orange-200 pt-3 text-xs font-semibold text-[var(--aw-emerg-700)]">
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
    <div className="space-y-3 rounded-3xl border border-orange-100 bg-orange-50/60 p-6 text-center transition-shadow hover:shadow-md sm:p-8">
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

export default function KitEmergenciaVehiculoLanding({
  product,
  onAddToCart,
}: LandingProps) {
  const router = useRouter();

  const unitPrice = Number(product.price);
  const hasPrice = Number.isFinite(unitPrice) && unitPrice > 0;

  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const stock = product.stock;
  const soldOut = typeof stock === "number" && stock <= 0;
  const maxQuantity =
    typeof stock === "number" && stock > 0
      ? Math.min(MAX_QUANTITY, stock)
      : MAX_QUANTITY;

  const handleBuy = useCallback(async () => {
    if (pending || soldOut || !hasPrice) return;
    setPending(true);
    setFailed(false);
    try {
      const added = await onAddToCart(quantity);
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
  }, [pending, soldOut, hasPrice, onAddToCart, quantity, router]);

  const ctaLabel = (() => {
    if (soldOut) return "Agotado";
    if (pending) return "Agregando al carrito…";
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
    <div className="aw-landing bg-[var(--aw-emerg-50)] text-gray-800 antialiased">
      <style>{`
        .aw-landing {
          --aw-emerg-50: #fef3f2;
          --aw-emerg-100: #ffe4d9;
          --aw-emerg-200: #ffd6ba;
          --aw-emerg-700: #c2410c;
          --aw-emerg-900: #9c3610;
          --aw-emerg-950: #7a2d0e;
          --aw-emerg-orange: #f97316;
        }
        @keyframes aw-pulse {
          0% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.45); }
          70% { box-shadow: 0 0 0 14px rgba(249, 115, 22, 0); }
          100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0); }
        }
        @keyframes aw-wave-shift {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-50%, 0, 0); }
        }
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
      <section className="bg-[var(--aw-emerg-50)] px-4 pb-12 pt-8 sm:pt-12 lg:pb-16 lg:pt-16">
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
            <div className="relative mx-auto w-full max-w-sm rounded-3xl border border-orange-200 bg-white p-3 shadow-xl">
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-orange-50">
                {heroMedia}
              </div>
              <p className="mt-3 text-center text-xs font-medium text-gray-500">
                Estuche rígido · Rojo y naranja · 11 herramientas de seguridad
              </p>
            </div>
          </div>

          <div className="space-y-5 lg:col-span-7">
            <div className="space-y-4 text-center lg:text-left">
              <span className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--aw-emerg-700)]">
                ⚠️ {PRODUCT_BRAND} · Seguridad vial
              </span>
              <h1 className="text-3xl font-extrabold leading-tight text-gray-900 sm:text-4xl lg:text-5xl">
                Kit de Emergencia para Vehículo
              </h1>
              <p className="mx-auto max-w-xl text-sm text-gray-600 sm:text-lg lg:mx-0">
                Set completo de herramientas y elementos de seguridad diseñado
                para atender emergencias básicas en carretera, ideal para
                vehículos particulares.
              </p>
              <p className="mx-auto max-w-xl text-xs text-gray-500 sm:text-sm lg:mx-0">
                Incluye cable de arranque, linterna, alicate, cutter, destornillador,
                martillo de emergencia, manómetro, chaleco reflectivo, guantes,
                cinta de remolque y cono de señalización.
              </p>
              <ul className="mx-auto grid max-w-md grid-cols-2 gap-2 text-left text-xs font-medium text-gray-700 sm:text-sm lg:mx-0">
                {QUICK_BENEFITS.map((benefit) => (
                  <li key={benefit} className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 shrink-0 text-[var(--aw-emerg-700)]" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>

            {/* Cantidad: compra normal (sin oferta) */}
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-orange-200 bg-white px-4 py-3">
              <div>
                <span className="block text-xs font-bold uppercase text-orange-600">
                  Precio normal
                </span>
                <span className="text-xl font-extrabold text-[var(--aw-emerg-700)]">
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
                  className="flex min-h-11 w-11 items-center justify-center rounded-xl border border-orange-200 text-lg font-bold text-[var(--aw-emerg-700)] disabled:opacity-40"
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
                  className="flex min-h-11 w-11 items-center justify-center rounded-xl border border-orange-200 text-lg font-bold text-[var(--aw-emerg-700)] disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => void handleBuy()}
                disabled={pending || soldOut || !hasPrice}
                className={`aw-pulse flex min-h-14 w-full items-center justify-center rounded-2xl px-5 py-4 text-base font-bold text-white shadow-lg transition-all sm:text-lg ${
                  soldOut || !hasPrice
                    ? "cursor-not-allowed bg-orange-300"
                    : "bg-gradient-to-r from-[var(--aw-emerg-700)] to-[var(--aw-emerg-900)] hover:-translate-y-0.5"
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

      <WaveDivider from="var(--aw-emerg-50)" to="#ffffff" />

      {/* 3. Señales de que necesitas el producto */}
      <section className="bg-white px-4 py-14">
        <div className="mx-auto max-w-5xl space-y-10">
          <SectionHeading
            eyebrow="¿Te suena familiar?"
            title={`¿Para quién es la ${PRODUCT_SHORT_NAME}?`}
            subtitle="Para conductores que quieren estar preparados ante emergencias básicas en la vía."
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SIGNS.map((sign) => (
              <div
                key={sign.title}
                className="rounded-2xl border border-orange-200 bg-orange-50/60 p-5 transition-shadow hover:shadow-md"
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
          <div className="flex flex-col items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-[var(--aw-emerg-700)] to-[var(--aw-emerg-950)] p-6 text-white shadow-lg sm:flex-row">
            <div className="text-center sm:text-left">
              <h3 className="text-lg font-bold">Viaja más tranquilo</h3>
              <p className="text-xs text-orange-100 sm:text-sm">
                Kit completo con estuche rígido, envío gratis y pago contra
                entrega.
              </p>
            </div>
            <a
              href="#contenido"
              className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-xl bg-white px-6 py-3 font-bold text-[var(--aw-emerg-900)] shadow transition-colors hover:bg-orange-50"
            >
              Quiero pedirlo
            </a>
          </div>
        </div>
      </section>

      <WaveDivider from="#ffffff" to="var(--aw-emerg-50)" reverse />

      {/* 4. Beneficios del producto */}
      <section className="bg-[var(--aw-emerg-50)] px-4 py-16">
        <div className="mx-auto max-w-6xl space-y-10">
          <SectionHeading
            eyebrow="Calidad y seguridad"
            title="Todo lo necesario para una emergencia en carretera"
            subtitle="Herramientas de acero y plástico reforzado, con elementos de alta visibilidad."
          />
          <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-3">
            {BENEFITS.map((benefit) =>
              benefit.featured ? (
                <div
                  key={benefit.title}
                  className="relative space-y-3 rounded-3xl border-2 border-[var(--aw-emerg-700)] bg-gradient-to-b from-white to-orange-50 p-8 text-center shadow-xl"
                >
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--aw-emerg-700)] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                    Principal
                  </span>
                  <div
                    className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-orange-100 text-3xl shadow-md"
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
                  className="space-y-3 rounded-3xl border border-orange-200 bg-white p-6 text-center shadow-sm transition-colors hover:border-[var(--aw-emerg-700)]"
                >
                  <div
                    className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-2xl"
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

          <div className="rounded-3xl border border-orange-200 bg-white p-6 shadow-sm sm:p-8">
            <h3 className="text-center text-lg font-extrabold text-gray-900">
              Beneficios principales
            </h3>
            <ul className="mt-5 grid grid-cols-1 gap-3 text-left sm:grid-cols-2">
              {SALES_BENEFITS.map((benefit) => (
                <li
                  key={benefit}
                  className="flex items-start gap-2.5 text-xs leading-relaxed text-gray-700 sm:text-sm"
                >
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--aw-emerg-700)]" />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <WaveDivider from="var(--aw-emerg-50)" to="#ffffff" />

      {/* 5. Contenido del kit */}
      <section id="contenido" className="bg-white px-4 py-14">
        <div className="mx-auto max-w-5xl space-y-8">
          <SectionHeading
            eyebrow="¿Qué trae el kit?"
            title="Contenido del Kit de Emergencia para Vehículo"
            subtitle="11 herramientas y elementos de seguridad listos para usar."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              "Estuche rígido portátil con cierre",
              "Cable de arranque (corriente)",
              "Linterna manual / lámpara de emergencia",
              "Alicate (pinza)",
              "Cutter / bisturí de seguridad",
              "Destornillador multifuncional",
              "Martillo de emergencia (rompevidrios)",
              "Manómetro (medidor de presión)",
              "Chaleco reflectivo",
              "Guantes de protección",
              "Cinta de remolque",
              "Cono de señalización plegable",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-xl border border-orange-100 bg-orange-50/40 p-3 text-sm"
              >
                <span className="shrink-0 text-[var(--aw-emerg-700)] font-bold">▪</span>
                {item}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-orange-200 bg-white p-4 shadow-sm">
              <h4 className="mb-1 font-bold text-gray-900">Materiales</h4>
              <ul className="text-xs text-gray-600 space-y-1 list-disc pl-4">
                <li>Estuche: plástico rígido de alta resistencia</li>
                <li>Herramientas: acero y plástico reforzado</li>
                <li>Chaleco: poliéster reflectivo</li>
                <li>Guantes: material textil antideslizante</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-orange-200 bg-white p-4 shadow-sm">
              <h4 className="mb-1 font-bold text-gray-900">Color y dimensiones</h4>
              <ul className="text-xs text-gray-600 space-y-1 list-disc pl-4">
                <li>Negro con detalles en naranja (alta visibilidad)</li>
                <li>Estuche compacto, fácil de almacenar en el baúl</li>
                <li>Ligero, fácil de transportar</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <WaveDivider from="#ffffff" to="var(--aw-emerg-50)" reverse />

      {/* 6. Galería de imágenes */}
      <section className="bg-[var(--aw-emerg-50)] px-4 py-14">
        <div className="mx-auto max-w-6xl space-y-8">
          <SectionHeading
            eyebrow="Galería"
            title={`Conoce la ${PRODUCT_SHORT_NAME}`}
          />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {GALLERY.map((image, index) => (
              <div
                key={image.src}
                className="group relative aspect-square overflow-hidden rounded-xl border border-orange-200 bg-orange-50"
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

      <WaveDivider from="var(--aw-emerg-50)" to="#ffffff" />

      {/* 7. Reseñas de clientes (auto-scroll horizontal) */}
      <section className="overflow-hidden bg-white px-4 py-14">
        <div className="mx-auto max-w-6xl space-y-8">
          <SectionHeading
            eyebrow="Reseñas de clientes"
            title="Lo que dicen quienes ya lo compraron"
            subtitle="Opiniones de conductores que llevan el kit en su vehículo."
          />
          <ReviewsCarousel items={REVIEWS} />
        </div>
      </section>

      <WaveDivider from="#ffffff" to="var(--aw-emerg-900)" />

      {/* 8. CTA final + garantía */}
      <section className="bg-gradient-to-b from-[var(--aw-emerg-900)] to-[var(--aw-emerg-950)] px-4 py-14 text-center text-white">
        <div className="mx-auto max-w-3xl space-y-5">
          <h2 className="text-2xl font-extrabold sm:text-4xl">
            Viaja más seguro y tranquilo
          </h2>
          <p className="text-sm text-orange-100 sm:text-base">
            Pide hoy tu {PRODUCT_SHORT_NAME} con envío gratis y paga al recibir
            en la puerta de tu casa.
          </p>
          <a
            href="#contenido"
            className="aw-pulse inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-white px-8 py-4 text-lg font-bold text-[var(--aw-emerg-900)] shadow-lg transition-transform hover:-translate-y-0.5 sm:w-auto"
          >
            Quiero mi Kit de Emergencia
          </a>
          {GUARANTEE_TEXT ? (
            <p className="mx-auto max-w-xl rounded-2xl border border-white/20 bg-white/10 p-4 text-sm">
              {GUARANTEE_TEXT}
            </p>
          ) : null}
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-2 text-xs font-medium text-orange-100">
            <li>🚚 Envío gratis</li>
            <li>🤝 Pago contra entrega</li>
            <li>🔒 Compra segura</li>
          </ul>
          <p className="mx-auto max-w-2xl pt-4 text-[11px] leading-relaxed text-orange-200/80">
            {DISCLAIMER}
            {SANITARY_REGISTRY ? ` ${SANITARY_REGISTRY}` : ""}
          </p>
        </div>
      </section>
    </div>
  );
}
