"use client";

import Link from "next/link";
import { useRef } from "react";

interface Product {
  id: string;
  name: string;
  slug: string;
  price: string | number;
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

export default function ProductCarousel({
  products,
}: {
  products: Product[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function handleImgError(e: React.SyntheticEvent<HTMLImageElement>) {
    e.currentTarget.src =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' fill='%23f3f4f6'%3E%3Crect width='400' height='300'/%3E%3Ctext x='50%25' y='50%25' fill='%239ca3af' font-size='16' text-anchor='middle' dy='.3em'%3ESin imagen%3C/text%3E%3C/svg%3E";
  }

  function scroll(dir: "left" | "right") {
    if (!scrollRef.current) return;
    const amount = 240;
    scrollRef.current.scrollBy({
      left: dir === "left" ? -amount : amount,
      behavior: "smooth",
    });
  }

  return (
    <div className="relative group">
      <button
        onClick={() => scroll("left")}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 size-10 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-50 cursor-pointer"
        aria-label="Anterior"
      >
        <svg className="w-5 h-5 text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      <div
        ref={scrollRef}
        className="flex overflow-x-auto gap-5 -mx-6 px-6 scrollbar-none"
        style={{ scrollbarWidth: "none" }}
      >
        {products.map((product) => (
          <Link
            key={product.id}
            href={`/products/${product.slug}`}
            className="group/card bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-lg hover:border-blue-200 transition-all duration-200 flex flex-col min-w-[220px] max-w-[220px] shrink-0"
          >
            <div className="aspect-[4/3] overflow-hidden bg-gray-100 relative">
              <img
                src={product.image}
                alt={product.name}
                onError={handleImgError}
                className="w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-300"
              />
              {product.gallery && product.gallery.length > 0 && (
                <img
                  src={product.gallery[0]}
                  alt=""
                  onError={handleImgError}
                  className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover/card:opacity-100 transition-opacity duration-300"
                />
              )}
            </div>

            <div className="p-4 flex flex-col flex-1">
              {product.category && (
                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full w-fit mb-2">
                  {product.category.name}
                </span>
              )}

              <h2 className="font-semibold text-gray-900 group-hover/card:text-blue-600 transition-colors line-clamp-2">
                {product.name}
              </h2>

              <div className="mt-auto pt-3">
                <span className="text-xl font-bold text-gray-900">
                  {formatPrice(product.price)}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <button
        onClick={() => scroll("right")}
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 size-10 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-50 cursor-pointer"
        aria-label="Siguiente"
      >
        <svg className="w-5 h-5 text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </div>
  );
}
