"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Flame,
  Zap,
} from "lucide-react";
import SectionHeader from "@/components/SectionHeader";

interface Product {
  id: string;
  name: string;
  slug: string;
  price: string | number;
  oldPrice?: string | number | null;
  image: string;
  stock: number;
  lowStockThreshold?: number;
  category?: {
    id: string;
    name: string;
    slug: string;
  };
}

function formatPrice(price: string | number) {
  return Number(price).toLocaleString("es-CO") + " COP";
}

function discountPct(product: Product) {
  const old = Number(product.oldPrice);
  const now = Number(product.price);
  if (!old || old <= 0 || now >= old) return 0;
  return Math.round((1 - now / old) * 100);
}

const FALLBACK_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' fill='%23fff1f2'%3E%3Crect width='400' height='300'/%3E%3Ctext x='50%25' y='50%25' fill='%23fb7185' font-size='16' text-anchor='middle' dy='.3em'%3ESin imagen%3C/text%3E%3C/svg%3E";

export default function PromoGrid({ products }: { products: Product[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [quickViewId, setQuickViewId] = useState<string | null>(null);

  const maxDiscount = products.reduce(
    (max, p) => Math.max(max, discountPct(p)),
    0,
  );

  function handleImgError(e: React.SyntheticEvent<HTMLImageElement>) {
    e.currentTarget.src = FALLBACK_IMG;
  }

  function scrollByDir(dir: "left" | "right") {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.7;
    scrollRef.current.scrollBy({
      left: dir === "left" ? -amount : amount,
      behavior: "smooth",
    });
  }

  return (
    <section className="relative overflow-hidden rounded-3xl border border-rose-100 bg-gradient-to-br from-rose-50/70 via-white to-amber-50/50 p-5 sm:p-8">
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-rose-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -left-24 h-80 w-80 rounded-full bg-amber-200/40 blur-3xl" />

      <div className="relative">
        <SectionHeader
          tone="rose"
          label="Oferta flash"
          title="Productos en Promoción"
          subtitle={
            maxDiscount > 0
              ? `Ahorra hasta -${maxDiscount}% en productos seleccionados. Precios válidos mientras dure el stock.`
              : "Precios rebajados por tiempo limitado mientras haya stock."
          }
          actionHref="/products?onSale=true"
          actionLabel="Ver todas las ofertas"
        />

        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-rose-600 shadow-sm backdrop-blur">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-rose-500" />
          </span>
          Vida real · Cantidades limitadas
          <Flame className="h-3.5 w-3.5 text-orange-500" />
        </div>

        <div className="relative mt-8">
          <div className="pointer-events-none absolute inset-y-0 -left-6 z-20 hidden w-16 bg-gradient-to-r from-rose-50/70 to-transparent md:block" />
          <div className="pointer-events-none absolute inset-y-0 -right-6 z-20 hidden w-16 bg-gradient-to-l from-rose-50/70 to-transparent md:block" />

          <button
            type="button"
            onClick={() => scrollByDir("left")}
            className="absolute left-0 top-1/2 z-30 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg ring-1 ring-gray-200 transition-all hover:scale-110 hover:bg-rose-600 hover:text-white hover:ring-rose-600 md:flex"
            aria-label="Ofertas anteriores"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div
            ref={scrollRef}
            className="flex snap-x snap-mandatory gap-5 overflow-x-auto scrollbar-none -mx-1 px-1 pb-2"
            style={{ scrollbarWidth: "none" }}
            onMouseLeave={() => setQuickViewId(null)}
          >
            {products.map((product) => {
              const discount = discountPct(product);
              const savings =
                product.oldPrice && discount > 0
                  ? Number(product.oldPrice) - Number(product.price)
                  : 0;
              const isLowStock =
                product.stock > 0 &&
                product.stock <= (product.lowStockThreshold ?? 5);
              const stockPercent = Math.min(
                (product.stock / (product.lowStockThreshold ?? 5)) * 100,
                100,
              );

              return (
                <Link
                  key={product.id}
                  href={`/products/${product.slug}`}
                  className="group/card relative flex min-w-[248px] max-w-[248px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-rose-200 hover:shadow-xl hover:shadow-rose-100/70"
                  onMouseEnter={() => setQuickViewId(product.id)}
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-rose-50">
                    <img
                      src={product.image}
                      alt={product.name}
                      onError={handleImgError}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-110"
                      loading="lazy"
                    />

                    {discount > 0 && (
                      <span className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-3 py-1.5 text-sm font-extrabold text-white shadow-lg shadow-rose-500/40">
                        <Zap className="h-3.5 w-3.5" />
                        -{discount}%
                      </span>
                    )}

                    <span className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-600 shadow-md backdrop-blur">
                      <Flame className="h-3 w-3" />
                      En oferta
                    </span>

                    <div
                      className={`absolute inset-0 z-10 flex items-center justify-center transition-all duration-300 ${
                        quickViewId === product.id
                          ? "opacity-100"
                          : "pointer-events-none opacity-0"
                      }`}
                    >
                      <span className="flex items-center gap-2 rounded-full bg-white/95 px-5 py-2.5 text-sm font-bold text-gray-800 shadow-xl backdrop-blur">
                        <Eye className="h-4 w-4 text-rose-500" />
                        Vista rápida
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col gap-1.5 p-4">
                    {product.category && (
                      <span className="text-[11px] font-semibold uppercase tracking-widest text-rose-500">
                        {product.category.name}
                      </span>
                    )}

                    <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900 transition-colors group-hover/card:text-rose-600">
                      {product.name}
                    </h3>

                    <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                      <span className="text-lg font-extrabold text-rose-600">
                        {formatPrice(product.price)}
                      </span>
                      {product.oldPrice && discount > 0 && (
                        <span className="text-xs font-medium text-gray-400 line-through">
                          {formatPrice(product.oldPrice)}
                        </span>
                      )}
                    </div>

                    {savings > 0 && (
                      <span className="w-fit rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 ring-1 ring-emerald-100">
                        Ahorras {formatPrice(savings)}
                      </span>
                    )}

                    {isLowStock && (
                      <div className="mt-auto pt-1.5">
                        <div className="mb-1 flex items-center justify-between text-[11px]">
                          <span className="font-bold text-orange-600">
                            ¡Solo {product.stock} disponibles!
                          </span>
                          <span className="font-semibold text-gray-400">
                            {Math.round(stockPercent)}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-rose-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-orange-400 to-red-500 transition-all duration-700"
                            style={{ width: `${stockPercent}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="mt-auto pt-3">
                      <span className="flex items-center justify-center gap-1.5 rounded-xl bg-rose-50 py-2 text-xs font-bold text-rose-600 transition-all duration-300 group-hover/card:bg-gradient-to-r group-hover/card:from-rose-500 group-hover/card:to-orange-500 group-hover/card:text-white group-hover/card:shadow-lg group-hover/card:shadow-rose-500/30">
                        <Zap className="h-3.5 w-3.5" />
                        Comprar ya
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => scrollByDir("right")}
            className="absolute right-0 top-1/2 z-30 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg ring-1 ring-gray-200 transition-all hover:scale-110 hover:bg-rose-600 hover:text-white hover:ring-rose-600 md:flex"
            aria-label="Más ofertas"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  );
}