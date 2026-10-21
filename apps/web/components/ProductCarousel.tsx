"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
} from "lucide-react";
import SectionHeader from "@/components/SectionHeader";
import ProductImage from "@/components/ProductImage";
import { apiFetch } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import { addToGuestCart } from "@/lib/guest-cart";
import { trackMetaEvent } from "@/lib/facebook-pixel";

interface Product {
  id: string;
  name: string;
  slug: string;
  price: string | number;
  oldPrice?: string | number | null;
  image: string;
  stock?: number;
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
  /** Id del producto que se esta agregando ahora mismo. */
  const [addingId, setAddingId] = useState<string | null>(null);
  /** Id del producto que se acaba de agregar (muestra el visto). */
  const [addedId, setAddedId] = useState<string | null>(null);

  function scrollByDir(dir: "left" | "right") {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.75;
    scrollRef.current.scrollBy({
      left: dir === "left" ? -amount : amount,
      behavior: "smooth",
    });
  }

  /**
   * Agrega el producto al carrito de verdad.
   *
   * Antes esto era un `<span>` dentro de un `<Link>`: no hacia nada, solo
   * parecian un boton. Un `<button>` dentro de un `<Link>` tampoco seria
   * valido (HTML no permite anidar controles interactivos), asi que la
   * tarjeta ahora es un `<div>` y la imagen y el titulo son enlaces aparte.
   */
  async function handleAddToCart(product: Product) {
    if (addingId) return;

    const agotado = typeof product.stock === "number" && product.stock <= 0;
    if (agotado) return;

    setAddingId(product.id);
    try {
      if (isAuthenticated()) {
        await apiFetch("/cart/add", {
          method: "POST",
          body: JSON.stringify({ productId: product.id, quantity: 1 }),
        });
        /* El carrito de invitado dispara este evento por su cuenta en
           `lib/guest-cart.ts`; el del servidor hay que avisarlo a mano para
           que el contador de la cabecera se actualice. */
        window.dispatchEvent(new Event("cart-change"));
      } else {
        addToGuestCart({
          productId: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
          slug: product.slug,
          quantity: 1,
        });
      }

      void trackMetaEvent("AddToCart", {
        content_ids: [product.id],
        content_name: product.name,
        content_type: "product",
        value: Number(product.price),
        currency: "COP",
      });

      setAddedId(product.id);
      window.setTimeout(() => {
        setAddedId((current) => (current === product.id ? null : current));
      }, 1800);
    } catch {
      // Si falla (sesion caducada, producto sin stock, API caida) el boton
      // vuelve a su estado normal y no se muestra ningun visto: mejor no
      // confirmar algo que no ocurrio.
    } finally {
      setAddingId(null);
    }
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
            const agotado = typeof product.stock === "number" && product.stock <= 0;
            const agregando = addingId === product.id;
            const agregado = addedId === product.id;

            return (
              <div
                key={product.id}
                className="group/card relative flex min-w-[232px] max-w-[232px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-2xl hover:shadow-blue-100/70"
              >
                <Link
                  href={`/products/${product.slug}`}
                  className="relative block aspect-[4/3] overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100"
                >
                  <ProductImage
                    src={product.image}
                    alt={product.name}
                    sizes="232px"
                    className="object-cover transition-transform duration-500 group-hover/card:scale-110"
                  />

                  {product.gallery && product.gallery.length > 0 && (
                    <ProductImage
                      src={product.gallery[0]}
                      alt=""
                      sizes="232px"
                      className="object-cover opacity-0 transition-opacity duration-300 group-hover/card:opacity-100 group-hover/card:scale-110"
                    />
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover/card:opacity-100" />

                  {discount > 0 && (
                    <span className="absolute left-3 top-3 z-10 rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-2.5 py-1 text-xs font-extrabold text-white shadow-md shadow-rose-500/30">
                      -{discount}%
                    </span>
                  )}

                  {agotado && (
                    <span className="absolute right-3 top-3 z-10 rounded-full bg-gray-900/80 px-2.5 py-1 text-[11px] font-bold text-white shadow-md">
                      Agotado
                    </span>
                  )}
                </Link>

                <div className="flex flex-1 flex-col gap-1.5 p-4">
                  {product.category && (
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-blue-600">
                      {product.category.name}
                    </span>
                  )}

                  <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900 transition-colors group-hover/card:text-blue-600">
                    <Link href={`/products/${product.slug}`}>{product.name}</Link>
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
                    <button
                      type="button"
                      onClick={() => void handleAddToCart(product)}
                      disabled={agotado || agregando}
                      aria-label={
                        agotado
                          ? `${product.name} agotado`
                          : `Agregar ${product.name} al carrito`
                      }
                      className={`flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all duration-300 ${
                        agotado
                          ? "cursor-not-allowed bg-gray-100 text-gray-400"
                          : agregado
                            ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
                            : "bg-slate-100 text-slate-600 hover:bg-gradient-to-r hover:from-blue-600 hover:to-indigo-600 hover:text-white hover:shadow-lg hover:shadow-blue-600/30"
                      }`}
                    >
                      {agregado ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Agregado
                        </>
                      ) : (
                        <>
                          <ShoppingBag className="h-3.5 w-3.5" />
                          {agotado ? "Agotado" : "Agregar al carrito"}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
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