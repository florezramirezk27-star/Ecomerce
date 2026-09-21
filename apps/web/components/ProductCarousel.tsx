"use client";

import Link from "next/link";
import { useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  ShoppingBag,
} from "lucide-react";
import SectionHeader from "@/components/SectionHeader";

interface Product {
  id: string;
  name: string;
  slug: string;
  price: string | number;
  oldPrice?: string | number | null;
  image: string;
  gallery?: string[];
  category?: {
    id: string;
    name: string;
    slug: string;
  };
}

function formatPrice(price: string | number) {
  return Number(price).toLocaleString("es-CO") + " COP";
}

function discountPct(price: string | number, oldPrice?: string | number | null) {
  const old = Number(oldPrice);
  const now = Number(price);
  if (!old || old <= 0 || now >= old) return 0;
  return Math.round((1 - now / old) * 100);
}

const FALLBACK_IMG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' fill='%23f3f4f6'%3E%3Crect width='400' height='300'/%3E%3Ctext x='50%25' y='50%25' fill='%239ca3af' font-size='16' text-anchor='middle' dy='.3em'%3ESin imagen%3C/text%3E%3C/svg%3E";

export default function ProductCarousel({
  products,
  title = "Productos",
  label = "Catálogo",
  subtitle,
  actionHref,
  actionLabel = "Ver todos",
}: {
  products: Product[];
  title?: string;
  label?: string;
  subtitle?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function handleImgError(e: React.SyntheticEvent<HTMLImageElement>) {
    e.currentTarget.src = FALLBACK_IMG;
  }

  function scrollByDir(dir: "left" | "right") {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.75;
    scrollRef.current.scrollBy({
      left: dir === "left" ? -amount : amount,
      behavior: "smooth",
    });
  }

  return (
    <section className="relative">
      <SectionHeader
        label={label}
        title={title}
        subtitle={subtitle}
        actionHref={actionHref}
        actionLabel={actionLabel}
      />

      <div className="relative mt-8">
        <div className="pointer-events-none absolute inset-y-0 -left-6 z-20 hidden w-16 bg-gradient-to-r from-white to-transparent md:block" />
        <div className="pointer-events-none absolute inset-y-0 -right-6 z-20 hidden w-16 bg-gradient-to-l from-white to-transparent md:block" />

        <button
          type="button"
          onClick={() => scrollByDir("left")}
          className="absolute left-0 top-1/2 z-30 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg ring-1 ring-gray-200 transition-all hover:scale-110 hover:bg-blue-600 hover:text-white hover:ring-blue-600 md:flex"
          aria-label="Productos anteriores"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div
          ref={scrollRef}
          className="flex snap-x snap-mandatory gap-5 overflow-x-auto scrollbar-none -mx-1 px-1 pb-2"
          style={{ scrollbarWidth: "none" }}
        >
          {products.map((product) => {
            const discount = discountPct(product.price, product.oldPrice);

            return (
              <Link
                key={product.id}
                href={`/products/${product.slug}`}
                className="group/card relative flex min-w-[232px] max-w-[232px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-2xl hover:shadow-blue-100/70"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
                  <img
                    src={product.image}
                    alt={product.name}
                    onError={handleImgError}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-110"
                    loading="lazy"
                  />

                  {product.gallery && product.gallery.length > 0 && (
                    <img
                      src={product.gallery[0]}
                      alt=""
                      onError={handleImgError}
                      className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-300 group-hover/card:opacity-100 group-hover/card:scale-110"
                    />
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover/card:opacity-100" />

                  {discount > 0 && (
                    <span className="absolute left-3 top-3 z-10 rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-2.5 py-1 text-xs font-extrabold text-white shadow-md shadow-rose-500/30">
                      -{discount}%
                    </span>
                  )}

                  <span className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full bg-white/90 shadow-md backdrop-blur transition-all duration-300 hover:scale-110 hover:bg-rose-50 hover:text-rose-500 group-hover/card:text-rose-500">
                    <Heart className="h-4 w-4 text-slate-400 transition-colors group-hover/card:text-rose-500" />
                  </span>
                </div>

                <div className="flex flex-1 flex-col gap-1.5 p-4">
                  {product.category && (
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-blue-600">
                      {product.category.name}
                    </span>
                  )}

                  <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900 transition-colors group-hover/card:text-blue-600">
                    {product.name}
                  </h3>

                  <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-lg font-extrabold text-gray-900">
                      {formatPrice(product.price)}
                    </span>
                    {discount > 0 && product.oldPrice && (
                      <span className="text-xs font-medium text-gray-400 line-through">
                        {formatPrice(product.oldPrice)}
                      </span>
                    )}
                  </div>

                  <div className="mt-auto pt-3">
                    <span className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2 text-xs font-bold text-slate-600 transition-all duration-300 group-hover/card:bg-gradient-to-r group-hover/card:from-blue-600 group-hover/card:to-indigo-600 group-hover/card:text-white group-hover/card:shadow-lg group-hover/card:shadow-blue-600/30">
                      <ShoppingBag className="h-3.5 w-3.5" />
                      Agregar al carrito
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
          className="absolute right-0 top-1/2 z-30 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg ring-1 ring-gray-200 transition-all hover:scale-110 hover:bg-blue-600 hover:text-white hover:ring-blue-600 md:flex"
          aria-label="Más productos"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
}