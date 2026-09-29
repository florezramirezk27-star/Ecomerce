"use client";

import Link from "next/link";
import { useRef } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import SectionHeader from "@/components/SectionHeader";
import ProductImage from "@/components/ProductImage";

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

export default function PromoGrid({ products }: { products: Product[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const maxDiscount = products.reduce(
    (max, p) => Math.max(max, discountPct(p)),
    0,
  );

  function scrollByDir(dir: "left" | "right") {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.75;
    scrollRef.current.scrollBy({
      left: dir === "left" ? -amount : amount,
      behavior: "smooth",
    });
  }

  return (
    // Contenedor plano: tarjeta blanca con un filete rose y nada mas. Antes era
    // un gradiente de tres paradas mas dos manchas de blur de 320px, y sobre el
    // fondo orange-50 de la pagina eso se leia como una plantilla pegada
    // encima, no como una seccion de la tienda. El rose se queda para el badge
    // de descuento, que es la unica señal real de la promocion.
    <section className="relative overflow-hidden rounded-2xl border border-rose-100 bg-white p-5 sm:p-7">
      <SectionHeader
        tone="rose"
        label="Oferta flash"
        title="Productos en Promoción"
        // El subtitulo absorbia el texto de la pill que se quito ("cantidades
        // limitadas"). Tres dispositivos de urgencia uno encima del otro,
        // siendo la seccion entera una oferta, es ruido.
        subtitle={
          maxDiscount > 0
            ? `Ahorra hasta -${maxDiscount}% en productos seleccionados. Cantidades limitadas, precios válidos mientras haya stock.`
            : "Precios rebajados por tiempo limitado mientras haya stock."
        }
        actionHref="/products?onSale=true"
        actionLabel="Ver todas las ofertas"
      />

      <div className="relative mt-6">
        {/* Los degradados de los bordes van en from-white porque el fondo de la
            seccion ahora es blanco. Antes ponian from-rose-50/70 sobre un
            gradiente de tres paradas, asi que el color no cuadrava con ninguna
            de las paradas y se notaba una banda rosa en los extremos. */}
        <div className="pointer-events-none absolute inset-y-0 -left-6 z-20 hidden w-16 bg-gradient-to-r from-white to-transparent md:block" />
        <div className="pointer-events-none absolute inset-y-0 -right-6 z-20 hidden w-16 bg-gradient-to-l from-white to-transparent md:block" />

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
        >
          {products.map((product) => {
            const discount = discountPct(product);
            const savings =
              product.oldPrice && discount > 0
                ? Number(product.oldPrice) - Number(product.price)
                : 0;

            const threshold = product.lowStockThreshold ?? 5;
            const isOut = product.stock <= 0;
            const isLow = !isOut && product.stock <= threshold;

            // La barra se dibuja siempre, anche cuando el stock no es bajo, para
            // que todas las tarjetas tengan la misma altura. Antes salia
            // condicional, y eso hacia que unas tarjetas tuvieran la barra y
            // otras no, con el boton descuadrado respecto a las demas.
            const stockBarWidth = isOut ? 0 : isLow ? (product.stock / threshold) * 100 : 100;
            const stockBarColor = isOut
              ? "bg-gray-300"
              : isLow
                ? "bg-orange-400"
                : "bg-emerald-400";
            const stockTextColor = isOut
              ? "text-red-600"
              : isLow
                ? "text-orange-600"
                : "text-gray-500";
            const stockDotColor = isOut
              ? "bg-red-500"
              : isLow
                ? "bg-orange-400"
                : "bg-emerald-500";

            return (
              <Link
                key={product.id}
                href={`/products/${product.slug}`}
                className="group/card relative flex min-w-[232px] max-w-[232px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-rose-200 hover:shadow-xl hover:shadow-rose-100/60"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
                  <ProductImage
                    src={product.image}
                    alt={product.name}
                    sizes="232px"
                    className="object-cover transition-transform duration-500 group-hover/card:scale-105"
                  />

                  {/* Un solo badge. Antes habia dos en la misma franja: el
                      descuento con un rayo y "En oferta" con una llama. En una
                      seccion que ya se titula "Productos en Promoción" el segundo
                      no informa de nada, y dos capsulas compitiendo en la misma
                      linea se leen como ruido. */}
                  {discount > 0 && (
                    <span className="absolute left-3 top-3 z-10 rounded-full bg-rose-600 px-2.5 py-1 text-xs font-extrabold text-white shadow-md shadow-rose-500/30">
                      -{discount}%
                    </span>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-4">
                  {product.category && (
                    <span className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                      {product.category.name}
                    </span>
                  )}

                  <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900 transition-colors group-hover/card:text-rose-600">
                    {product.name}
                  </h3>

                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-lg font-extrabold text-gray-900">
                      {formatPrice(product.price)}
                    </span>
                    {product.oldPrice && discount > 0 && (
                      <span className="text-xs font-medium text-gray-400 line-through">
                        {formatPrice(product.oldPrice)}
                      </span>
                    )}
                  </div>

                  {/* Texto plano y no otra capsula: el ahorro ya se lee en el
                      precio tachado, asi que la pill solo anadia un borde mas. */}
                  {savings > 0 && (
                    <p className="mt-1 text-[11px] font-semibold text-emerald-600">
                      Ahorras {formatPrice(savings)}
                    </p>
                  )}

                  {/* Un solo `mt-auto` para todo el pie. Antes habia dos, uno en
                      la barra de stock y otro en el boton, asi que el precio caia
                      mas alto o mas bajo segun la tarjeta. En un carrusel
                      horizontal, donde las tarjetas se comparan de lado a lado, el
                      precio desalineado es lo que mas se nota. */}
                  <div className="mt-auto pt-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                      <span className={`size-2 rounded-full ${stockDotColor}`} />
                      <span className={stockTextColor}>
                        {isOut
                          ? "Agotado"
                          : isLow
                            ? `Quedan ${product.stock}`
                            : `${product.stock} en stock`}
                      </span>
                    </div>

                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${stockBarColor}`}
                        style={{ width: `${Math.max(0, Math.min(100, stockBarWidth))}%` }}
                      />
                    </div>

                    {/* "Ver oferta" y no "Comprar ya": la tarjeta entera es un
                        Link a la ficha, no anade nada al carrito. Prometer una
                        compra que el clic no hace es lo que hace que un bloque se
                        lea como relleno. */}
                    <span className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2 text-xs font-bold text-slate-600 transition-all duration-300 group-hover/card:bg-gradient-to-r group-hover/card:from-rose-600 group-hover/card:to-rose-500 group-hover/card:text-white group-hover/card:shadow-md group-hover/card:shadow-rose-500/25">
                      Ver oferta
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/card:translate-x-0.5" />
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
    </section>
  );
}
