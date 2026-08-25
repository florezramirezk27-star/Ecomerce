"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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

export default function PromoGrid({ products }: { products: Product[] }) {
  const [quickViewId, setQuickViewId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  function scrollGrid(dir: "left" | "right") {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.6;
    scrollRef.current.scrollBy({
      left: dir === "left" ? -amount : amount,
      behavior: "smooth",
    });
  }

  return (
    <section ref={sectionRef} className="relative">
      <div
        className={`transition-all duration-700 ease-out ${
          visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
        }`}
      >
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Productos en Promoción
        </h2>

        <div className="relative group">
          <button
            onClick={() => scrollGrid("left")}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-5 z-20 size-12 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 cursor-pointer backdrop-blur-md bg-white/70 border border-white/40 shadow-lg hover:bg-white hover:scale-110"
            aria-label="Anterior"
          >
            <svg className="w-5 h-5 text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <div
            ref={scrollRef}
            className="flex overflow-x-auto gap-4 md:gap-5 scrollbar-none"
            style={{ scrollbarWidth: "none" }}
            onMouseLeave={() => setQuickViewId(null)}
          >
            {products.map((product, i) => {
              const isLowStock =
                product.stock > 0 &&
                product.stock <= (product.lowStockThreshold ?? 5);
              const stockPercent = Math.min(
                (product.stock / (product.lowStockThreshold ?? 5)) * 100,
                100,
              );
              const discount =
                product.oldPrice
                  ? Math.round(
                      (1 - Number(product.price) / Number(product.oldPrice)) * 100,
                    )
                  : 0;

              return (
                <Link
                  key={product.id}
                  href={`/products/${product.slug}`}
                  className={`group/card bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col min-w-[240px] max-w-[240px] shrink-0 ${
                    visible ? "animate-fade-in-up" : ""
                  }`}
                  style={{
                    animationDelay: `${i * 80}ms`,
                    animationFillMode: "both",
                  }}
                  onMouseEnter={() => setQuickViewId(product.id)}
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-gray-50">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-110"
                      loading="lazy"
                    />

                    {discount > 0 && (
                      <span className="absolute top-3 left-3 bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-md">
                        -{discount}%
                      </span>
                    )}

                    <div
                      className={`absolute inset-0 bg-black/10 flex items-center justify-center transition-all duration-300 ${
                        quickViewId === product.id
                          ? "opacity-100"
                          : "opacity-0 pointer-events-none"
                      }`}
                    >
                      <span className="flex items-center gap-2 bg-white/90 backdrop-blur-sm text-gray-800 text-sm font-semibold px-5 py-2.5 rounded-full shadow-lg hover:bg-white transition-colors">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Vista Rápida
                      </span>
                    </div>
                  </div>

                  <div className="p-4 flex flex-col flex-1 gap-1.5">
                    {product.category && (
                      <span className="text-[11px] font-semibold text-cyan-600 uppercase tracking-widest">
                        {product.category.name}
                      </span>
                    )}

                    <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2 group-hover/card:text-cyan-600 transition-colors">
                      {product.name}
                    </h3>

                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-lg font-bold text-gray-900">
                        {formatPrice(product.price)}
                      </span>
                      {product.oldPrice && (
                        <span className="text-sm text-gray-400 line-through">
                          {formatPrice(product.oldPrice)}
                        </span>
                      )}
                    </div>

                    {isLowStock && (
                      <div className="mt-auto pt-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-orange-600">
                            ¡Solo {product.stock} en stock!
                          </span>
                          <span className="text-xs text-gray-400">
                            {Math.round(stockPercent)}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-orange-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-orange-400 to-red-500 rounded-full transition-all duration-500"
                            style={{ width: `${stockPercent}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          <button
            onClick={() => scrollGrid("right")}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-5 z-20 size-12 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 cursor-pointer backdrop-blur-md bg-white/70 border border-white/40 shadow-lg hover:bg-white hover:scale-110"
            aria-label="Siguiente"
          >
            <svg className="w-5 h-5 text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
