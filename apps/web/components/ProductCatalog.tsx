"use client";

import Link from "next/link";
import { useState } from "react";
import { apiFetch, type Paginated } from "@/lib/api";
import ProductImage from "@/components/ProductImage";

export interface CatalogProduct {
  id: string;
  name: string;
  price: string | number;
  stock: number;
  image: string | null;
  slug: string;
  category?: { id: string; name: string };
}

interface ProductCatalogProps {
  /** Productos de la primera pagina, ya resueltos en el servidor. */
  initialProducts: CatalogProduct[];
  /** Categoria activa, si la hay. */
  categoryId?: string;
  /** Tamano de pagina (mismo valor con el que se pidio la primera pagina). */
  pageSize: number;
  /** Total de productos que devuelve la API. */
  total: number;
}

/**
 * Catalogo con "cargar mas".
 *
 * Antes el grid mostraba una sola tanda de 24 productos y no habia forma de
 * ver el resto: en movil, con una sola columna, apenas cabian 4 productos
 * por pantalla y el cliente tenia que terminar en la pagina sin ver el
 * catalogo completo.
 *
 * La primera pagina la resuelve el servidor (la pagina sigue siendo
 * renderizada en el servidor y el HTML llega listo); las siguientes se piden
 * desde el navegador y se agregan al final de la lista.
 */
export default function ProductCatalog({
  initialProducts,
  categoryId,
  pageSize,
  total,
}: ProductCatalogProps) {
  const [products, setProducts] = useState<CatalogProduct[]>(initialProducts);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const quedan = Math.max(0, total - products.length);
  const hayMas = quedan > 0;

  async function loadMore() {
    if (loading || !hayMas) return;

    setLoading(true);
    setError("");
    try {
      const next = page + 1;
      const params = new URLSearchParams({
        limit: String(pageSize),
        page: String(next),
      });
      if (categoryId) params.set("categoryId", categoryId);

      const data = (await apiFetch(
        `/products?${params.toString()}`,
      )) as Paginated<CatalogProduct>;

      setProducts((prev) => {
        // Se filtra por id: si el catalogo cambio entre pagina y pagina, un
        // producto podria llegar dos veces y romper la key de React.
        const vistos = new Set(prev.map((p) => p.id));
        const nuevos = (data.items ?? []).filter((p) => !vistos.has(p.id));
        return [...prev, ...nuevos];
      });
      setPage(next);
    } catch {
      setError("No se pudieron cargar más productos. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Dos columnas en movil: una sola dejaba fuera de la pantalla casi
          todo el catalogo. Los precios y el texto se reducen un poco para
          que quepan en una tarjeta de ~160px de ancho. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
        {products.map((product) => (
          <Link
            key={product.id}
            href={`/products/${product.slug}`}
            className="group bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100 hover:border-gray-200 flex flex-col"
          >
            <div className="relative overflow-hidden aspect-[4/3] bg-gray-100">
              <ProductImage
                src={product.image}
                alt={product.name}
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                className="object-cover transition-transform duration-500 group-hover:scale-110"
              />
              {product.stock <= 5 && product.stock > 0 && (
                <span className="absolute top-2 left-2 sm:top-3 sm:left-3 bg-amber-500 text-white text-[10px] sm:text-xs font-semibold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full">
                  Últimas unidades
                </span>
              )}
              {product.stock === 0 && (
                <span className="absolute top-2 left-2 sm:top-3 sm:left-3 bg-red-500 text-white text-[10px] sm:text-xs font-semibold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full">
                  Agotado
                </span>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
            <div className="p-2.5 sm:p-4 flex flex-col flex-1">
              {product.category && (
                <span className="text-[10px] sm:text-xs font-medium text-blue-600 uppercase tracking-wide mb-1 truncate">
                  {product.category.name}
                </span>
              )}
              <h2 className="font-semibold text-gray-900 text-xs sm:text-sm leading-snug line-clamp-2">
                {product.name}
              </h2>
              <div className="mt-auto pt-2 sm:pt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
                <span className="text-sm sm:text-lg font-bold text-gray-900">
                  {Number(product.price).toLocaleString("es-CO")} COP
                </span>
                <span
                  className={`text-[10px] sm:text-xs font-medium px-2 py-0.5 sm:px-2 sm:py-1 rounded-full self-start ${
                    product.stock > 5
                      ? "bg-green-50 text-green-700"
                      : product.stock > 0
                        ? "bg-amber-50 text-amber-700"
                        : "bg-red-50 text-red-700"
                  }`}
                >
                  {product.stock > 0 ? `${product.stock} und.` : "Agotado"}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {error && (
        <p className="mt-6 text-center text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {hayMas && (
        <div className="mt-8 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? "Cargando..." : "Cargar más productos"}
          </button>
          <p className="text-xs text-gray-500">
            {quedan === 1
              ? "Queda 1 producto por ver"
              : `Quedan ${quedan} productos por ver`}
          </p>
        </div>
      )}
    </>
  );
}
