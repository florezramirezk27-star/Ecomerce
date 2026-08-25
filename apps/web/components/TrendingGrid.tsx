"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

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

interface CategoryTab {
  id: string;
  name: string;
}

function formatPrice(price: string | number) {
  return Number(price).toLocaleString("es-CO") + " COP";
}

export default function TrendingGrid({ products }: { products: Product[] }) {
  const [activeTab, setActiveTab] = useState("all");
  const [quickViewId, setQuickViewId] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const categories: CategoryTab[] = useMemo(
    () => [
      { id: "all", name: "Todos" },
      ...Array.from(
        new Map(
          products.map((p) => [
            p.category?.id,
            { id: p.category?.id ?? "", name: p.category?.name ?? "" },
          ]),
        ).values(),
      ).filter((c) => c.id),
    ],
    [products],
  );

  const filtered =
    activeTab === "all" ? products : products.filter((p) => p.category?.id === activeTab);

  function handleAddToCart(e: React.MouseEvent, productId: string) {
    e.preventDefault();
    e.stopPropagation();
    setAddingId(productId);
    setTimeout(() => setAddingId(null), 800);
  }

  return (
    <section className="bg-[#F8F9FA] rounded-3xl p-6 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight">
          Tendencias de Temporada
        </h2>

        <div className="relative max-w-full overflow-hidden">
          <div
            ref={tabsRef}
            className="flex gap-1.5 overflow-x-auto scrollbar-none py-1"
            style={{ scrollbarWidth: "none" }}
          >
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveTab(cat.id)}
                className={`shrink-0 px-5 py-2 text-sm font-semibold rounded-full whitespace-nowrap transition-all duration-200 cursor-pointer ${
                  activeTab === cat.id
                    ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/30"
                    : "text-gray-600 hover:text-cyan-600 hover:bg-white/60"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-12 pointer-events-none bg-gradient-to-l from-[#F8F9FA] to-transparent" />
        </div>
      </div>

      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5"
        onMouseLeave={() => setQuickViewId(null)}
      >
        {filtered.map((product) => {
          const isLowStock =
            product.stock > 0 &&
            product.stock <= (product.lowStockThreshold ?? 5);
          const stockPercent = Math.min(
            (product.stock / (product.lowStockThreshold ?? 5)) * 100,
            100,
          );
          const discount = product.oldPrice
            ? Math.round(
                (1 - Number(product.price) / Number(product.oldPrice)) * 100,
              )
            : 0;

          return (
            <Link
              key={product.id}
              href={`/products/${product.slug}`}
              className="group/card bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col"
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
                  <span className="absolute top-3 left-3 bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-md">
                    -{discount}%
                  </span>
                )}

                <div
                  className={`absolute inset-0 bg-black/15 flex items-center justify-center transition-all duration-300 ${
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
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                    {product.category.name}
                  </span>
                )}

                <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
                  {product.name}
                </h3>

                <div className="flex items-center gap-2 mt-1">
                  <span className="text-lg font-bold text-cyan-600">
                    {formatPrice(product.price)}
                  </span>
                  {product.oldPrice && (
                    <span className="text-sm text-gray-400 line-through">
                      {formatPrice(product.oldPrice)}
                    </span>
                  )}
                </div>

                {isLowStock && (
                  <div className="mt-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-orange-600">
                        ¡Solo {product.stock} unidades!
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

                <div className="mt-auto pt-3">
                  <button
                    onClick={(e) => handleAddToCart(e, product.id)}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-bold transition-all duration-300 cursor-pointer ${
                      addingId === product.id
                        ? "bg-emerald-500 scale-95"
                        : "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 hover:shadow-lg hover:shadow-cyan-500/30"
                    }`}
                  >
                    {addingId === product.id ? (
                      <>
                        <svg className="w-4 h-4 animate-bounce" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                        ¡Agregado!
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 group-hover/card:animate-bounce" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                        </svg>
                        Añadir al Carrito
                      </>
                    )}
                  </button>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
