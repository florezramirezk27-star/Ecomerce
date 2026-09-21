"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import { addToGuestCart } from "@/lib/guest-cart";
import CandleInfographic from "@/components/CandleInfographic";
import CandleArtisanalInfographic from "@/components/CandleArtisanalInfographic";
import CountdownTimer from "@/components/CountdownTimer";

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: string | number;
  stock: number;
  image: string;
  gallery: string[];
  video?: string;
  videos?: string[];
  category?: {
    id: string;
    name: string;
    slug: string;
  };
  similarProducts?: Product[];
}

function getYouTubeEmbed(url: string) {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/,
  );
  return match
    ? `https://www.youtube.com/embed/${match[1]}`
    : null;
}

function getVimeoEmbed(url: string) {
  const match = url.match(/vimeo\.com\/(\d+)/);
  return match
    ? `https://player.vimeo.com/video/${match[1]}`
    : null;
}

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cartLoading, setCartLoading] = useState(false);
  const [cartMessage, setCartMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);

  const fallbackImg =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600' fill='%23f3f4f6'%3E%3Crect width='600' height='600'/%3E%3Ctext x='50%25' y='50%25' fill='%239ca3af' font-size='18' text-anchor='middle' dy='.3em'%3ESin imagen%3C/text%3E%3C/svg%3E";

  function handleImgError(
    e: React.SyntheticEvent<HTMLImageElement>,
  ) {
    e.currentTarget.src = fallbackImg;
  }

  const allImages = product
    ? [product.image, ...(product.gallery || [])].filter(Boolean)
    : [];

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch(`/products/${slug}`);
        setProduct(data);
        setQuantity(1);
        setError(null);
      } catch {
        setError("No pudimos cargar el producto. Intenta más tarde.");
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const handleAddToCart = async () => {
    if (!isAuthenticated()) {
      if (!product) return;
      addToGuestCart({
        productId: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        slug: product.slug,
        quantity,
      });
      setCartMessage({
        type: "success",
        text: `✓ ${quantity} ${quantity === 1 ? "unidad" : "unidades"} agregadas al carrito`,
      });
      setTimeout(() => setCartMessage(null), 3000);
      return;
    }

    setCartLoading(true);
    try {
      await apiFetch("/cart/add", {
        method: "POST",
        body: JSON.stringify({
          productId: product?.id,
          quantity,
        }),
      });

      setCartMessage({
        type: "success",
        text: `✓ ${quantity} ${quantity === 1 ? "unidad" : "unidades"} agregadas al carrito`,
      });
      setTimeout(() => setCartMessage(null), 3000);
    } catch (err) {
      setCartMessage({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Error al agregar al carrito",
      });
    } finally {
      setCartLoading(false);
    }
  };

  const handleBuyNow = async () => {
    if (!product || !inStock) return;

    if (!isAuthenticated()) {
      addToGuestCart({
        productId: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        slug: product.slug,
        quantity,
      });
      router.push("/cart");
      return;
    }

    setCartLoading(true);
    try {
      await apiFetch("/cart/add", {
        method: "POST",
        body: JSON.stringify({
          productId: product?.id,
          quantity,
        }),
      });
      router.push("/cart");
    } catch (err) {
      setCartMessage({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Error al agregar al carrito",
      });
    } finally {
      setCartLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-orange-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-gray-600">Cargando producto...</p>
        </div>
      </main>
    );
  }

  if (error || !product) {
    return (
      <main className="min-h-screen bg-orange-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
            <h1 className="text-xl font-bold text-red-900 mb-2">
              {error ||
                "Producto no encontrado"}
            </h1>
            <p className="text-red-700 mb-4">
              Intenta buscar otro producto
            </p>
            <Link
              href="/"
              className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Volver al inicio
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const inStock = product.stock > 0;
  const stockPercent = Math.min(
    100,
    (product.stock / 20) * 100,
  );
  const priceFormatted = Number(
    product.price,
  ).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }) + " COP";

  function formatDateRange(startDays: number, endDays: number) {
  const start = new Date();
  start.setDate(start.getDate() + startDays);
  const end = new Date();
  end.setDate(end.getDate() + endDays);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const dayOpts: Intl.DateTimeFormatOptions = { weekday: "short" };
  const startStr = start.toLocaleDateString("es-CO", dayOpts) + " " + start.toLocaleDateString("es-CO", opts);
  const endStr = end.toLocaleDateString("es-CO", opts);
  if (start.getMonth() === end.getMonth()) {
    return `${start.toLocaleDateString("es-CO", dayOpts)} ${start.getDate()} - ${end.getDate()} ${end.toLocaleDateString("es-CO", { month: "short" })}`;
  }
  return `${startStr} - ${endStr}`;
}

type MediaItem =
  | { kind: "image"; src: string }
  | { kind: "video"; src: string; embed: string | null };

const mediaItems: MediaItem[] = [];
if (product) {
  for (const src of [product.image, ...(product.gallery || [])].filter(
    Boolean,
  )) {
    if (!mediaItems.some((m) => m.src === src)) {
      mediaItems.push({ kind: "image", src });
    }
  }
  const videoSources = [
    ...(product.videos || []),
    ...(product.video ? [product.video] : []),
  ].filter(Boolean);
  for (const src of videoSources) {
    if (!mediaItems.some((m) => m.src === src)) {
      mediaItems.push({
        kind: "video",
        src,
        embed: getYouTubeEmbed(src) || getVimeoEmbed(src),
      });
    }
  }
}

const selectedMedia = mediaItems[selectedIndex] ?? null;

  return (
    <main className="min-h-screen bg-orange-50">
      <div className="bg-white border-b border-gray-200">
        <nav className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-2 text-sm">
          <Link
            href="/"
            className="text-blue-600 hover:underline"
          >
            Inicio
          </Link>
          <span className="text-gray-400">/</span>
          {product.category && (
            <>
              <span className="text-gray-600">
                {product.category.name}
              </span>
              <span className="text-gray-400">/</span>
            </>
          )}
          <span className="text-gray-900 font-medium truncate">
            {product.name}
          </span>
        </nav>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Volver
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-4 h-full">
<div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-200 h-full">
              {selectedMedia?.kind === "video" ? (
                selectedMedia.embed ? (
                  <div className="aspect-video h-full">
                    <iframe
                      src={selectedMedia.embed}
                      className="w-full h-full"
                      allowFullScreen
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    />
                  </div>
                ) : (
                  <video
                    key={selectedMedia.src}
                    src={selectedMedia.src}
                    controls
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-contain bg-black"
                  />
                )
              ) : (
                <img
                  src={selectedMedia?.src || product.image}
                  alt={product.name}
                  onError={handleImgError}
                  className="w-full h-full object-cover"
                />
              )}
            </div>

            {mediaItems.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {mediaItems.map((item, i) =>
                  item.kind === "video" ? (
                    <button
                      key={item.src}
                      type="button"
                      onClick={() => setSelectedIndex(i)}
                      className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 bg-gray-900 flex items-center justify-center transition-all ${
                        selectedIndex === i
                          ? "border-blue-500 ring-2 ring-blue-200"
                          : "border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      key={item.src}
                      type="button"
                      onClick={() => setSelectedIndex(i)}
                      className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                        selectedIndex === i
                          ? "border-blue-500 ring-2 ring-blue-200"
                          : "border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      <img
                        src={item.src}
                        alt={`${product.name} ${i + 1}`}
                        onError={handleImgError}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ),
                )}
              </div>
            )}

            {mediaItems.some((m) => m.kind === "video") &&
              allImages.length <= 1 &&
              selectedMedia?.kind !== "video" && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedIndex(
                      mediaItems.findIndex((m) => m.kind === "video"),
                    )
                  }
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-semibold"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Ver video del producto
                </button>
              )}
            </div>

          <div className="flex flex-col justify-between gap-6">
            <div className="flex flex-col gap-5">
            {product.category && (
              <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-3 py-1 rounded-full w-fit">
                {product.category.name}
              </span>
            )}

            <div>
              <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
                {product.name}
              </h1>
              {product.description && (
                <p className="text-gray-600 mt-3 leading-relaxed">
                  {product.description}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="text-3xl font-extrabold text-gray-900">
                {priceFormatted}
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Mejor precio
              </span>
            </div>

            <CountdownTimer />

            <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-sm text-gray-600 font-medium">
                  Disponibilidad
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 text-sm font-bold ${
                    !inStock
                      ? "text-red-600"
                      : product.stock <= 10
                        ? "text-red-500"
                        : product.stock <= 20
                          ? "text-orange-500"
                          : "text-green-600"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      !inStock
                        ? "bg-red-500"
                        : product.stock <= 10
                          ? "bg-red-500 animate-pulse"
                          : product.stock <= 20
                            ? "bg-orange-400"
                            : "bg-green-500"
                    }`}
                  />
                  {!inStock
                    ? "Agotado"
                    : product.stock <= 10
                      ? `¡Solo quedan ${product.stock} unidades disponibles!`
                      : `${product.stock} en stock`}
                </span>
              </div>
              {inStock && (
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      product.stock <= 10
                        ? "bg-red-500"
                        : product.stock <= 20
                          ? "bg-orange-400"
                          : "bg-green-500"
                    }`}
                    style={{ width: `${stockPercent}%` }}
                  />
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 pt-4 pb-3 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-800">
                  Cantidad
                </span>
              </div>
              <div className="px-5 py-3.5 flex items-center justify-between">
                <span className="text-xs text-gray-500">Selecciona cuántas unidades quieres</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={!inStock}
                    className="w-9 h-9 rounded-lg border border-gray-300 hover:border-blue-500 hover:text-blue-600 disabled:opacity-40 flex items-center justify-center text-lg font-bold text-gray-700 transition"
                    aria-label="Disminuir cantidad"
                  >
                    −
                  </button>
                  <span className="w-10 text-center text-lg font-bold text-gray-900 tabular-nums">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setQuantity((q) => Math.min(product.stock, q + 1))
                    }
                    disabled={!inStock || quantity >= product.stock}
                    className="w-9 h-9 rounded-lg border border-gray-300 hover:border-blue-500 hover:text-blue-600 disabled:opacity-40 flex items-center justify-center text-lg font-bold text-gray-700 transition"
                    aria-label="Aumentar cantidad"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {cartMessage && (
              <div
                className={`p-4 rounded-lg text-sm ${
                  cartMessage.type === "success"
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                {cartMessage.text}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={handleAddToCart}
                disabled={!inStock || cartLoading}
                className={`w-full py-4 px-6 rounded-xl font-bold text-white transition-all duration-200 flex items-center justify-center gap-2 shadow-lg ${
                  inStock
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-blue-600/25 hover:shadow-blue-600/40 active:scale-[0.99]"
                    : "bg-gray-400 cursor-not-allowed"
                } ${
                  cartLoading ? "opacity-75 cursor-wait" : ""
                }`}
              >
                {cartLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Agregando...
                  </>
                ) : inStock ? (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                    </svg>
                    Agregar al carrito
                  </>
                ) : (
                  "Producto agotado"
                )}
              </button>

              <button
                onClick={handleBuyNow}
                disabled={!inStock || cartLoading}
                className="w-full py-4 px-6 rounded-xl font-bold text-blue-700 border-2 border-blue-200 hover:border-blue-500 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Comprar ahora
              </button>
            </div>


            <div className="border-t border-gray-200 pt-5">
              <h3 className="text-xs font-semibold text-gray-900 mb-4 uppercase tracking-wider">
                Lo que necesitas saber
              </h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 shadow-md shadow-blue-200 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
                    </svg>
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-800 leading-tight">Despacho rápido</p>
                    <p className="text-xs text-gray-500 leading-tight">Sale de bodega en 24 horas</p>
                    <span className="inline-block mt-1 text-[11px] font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                      Llega {formatDateRange(1, 2)}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-md shadow-emerald-200 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
                    </svg>
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-800 leading-tight">Envío gratis</p>
                    <p className="text-xs text-gray-500 leading-tight">En cualquier ciudad de Colombia</p>
                    <span className="inline-block mt-1 text-[11px] font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                      Llega {formatDateRange(3, 5)}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 shadow-md shadow-purple-200 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-800 leading-tight">Pago seguro</p>
                    <p className="text-xs text-gray-500 leading-tight">Pagas solo cuando recibes tu pedido</p>
                    <span className="inline-block mt-1 text-[11px] font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                      Llega {formatDateRange(5, 7)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            </div>

          </div>
        </div>
      </div>

      {product.similarProducts && product.similarProducts.length > 0 && (
        <div className="max-w-7xl mx-auto px-6 pb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Productos similares</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {product.similarProducts.map((sp) => (
              <Link
                key={sp.id}
                href={`/products/${sp.slug}`}
                className="group bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-all hover:-translate-y-1"
              >
                <div className="aspect-square bg-gray-100 overflow-hidden">
                  <img
                    src={sp.image}
                    alt={sp.name}
                    onError={handleImgError}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium text-gray-900 truncate">{sp.name}</p>
                  <p className="text-sm font-bold text-blue-600 mt-1">
                    {Number(sp.price).toLocaleString("es-CO")} COP
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {product.name === "Set de Velas Aromáticas" && <CandleInfographic />}
      {product.name === "Set de Velas Aromáticas" && <CandleArtisanalInfographic />}

    </main>
  );
}
