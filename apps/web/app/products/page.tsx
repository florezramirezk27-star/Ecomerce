import Link from "next/link";
import { apiFetch } from "@/lib/api";

export const dynamic = 'force-dynamic';

interface ProductSummary {
  id: string;
  name: string;
  price: string | number;
  stock: number;
  image: string;
  slug: string;
  category?: { id: string; name: string };
}

interface CategoryInfo {
  id: string;
  name: string;
  slug: string;
}

async function getProducts(categoryId?: string) {
  const query = categoryId ? `?categoryId=${categoryId}` : "";
  return apiFetch(`/products${query}`) as Promise<ProductSummary[]>;
}

async function getCategory(id: string) {
  return apiFetch(`/categories/${id}`) as Promise<CategoryInfo>;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ categoryId?: string }>;
}) {
  let categoryId: string | undefined;
  try {
    const params = await searchParams;
    categoryId = params?.categoryId;
  } catch {
    categoryId = undefined;
  }

  let products: ProductSummary[] = [];
  let category: CategoryInfo | null = null;
  let error = "";

  try {
    [products, category] = await Promise.all([
      getProducts(categoryId),
      categoryId ? getCategory(categoryId) : Promise.resolve(null),
    ]);
  } catch {
    error = "Error al cargar los productos.";
  }

  return (
    <main className="min-h-screen bg-orange-50">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-12">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
              {category ? category.name : "Productos"}
            </h1>
            {category && (
              <Link
                href="/products"
                className="text-sm text-gray-500 hover:text-gray-700 hover:underline mt-2 inline-flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Ver todos los productos
              </Link>
            )}
          </div>
          <Link
            href="/products/search"
            className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-700 shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Buscar productos
          </Link>
        </div>

        {error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 mb-6">
            {error}
          </div>
        )}

        {!error && products.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products.map((product) => (
              <Link
                key={product.id}
                href={`/products/${product.slug}`}
                className="group bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100 hover:border-gray-200 flex flex-col"
              >
                <div className="relative overflow-hidden aspect-[4/3] bg-gray-100">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                  />
                  {product.stock <= 5 && product.stock > 0 && (
                    <span className="absolute top-3 left-3 bg-amber-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                      Últimas unidades
                    </span>
                  )}
                  {product.stock === 0 && (
                    <span className="absolute top-3 left-3 bg-red-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                      Agotado
                    </span>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>
                <div className="p-4 flex flex-col flex-1">
                  {product.category && (
                    <span className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">
                      {product.category.name}
                    </span>
                  )}
                  <h2 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">
                    {product.name}
                  </h2>
                  <div className="mt-auto pt-3 flex items-center justify-between">
                    <span className="text-lg font-bold text-gray-900">
                      {Number(product.price).toLocaleString("es-CO")} COP
                    </span>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      product.stock > 5
                        ? "bg-green-50 text-green-700"
                        : product.stock > 0
                        ? "bg-amber-50 text-amber-700"
                        : "bg-red-50 text-red-700"
                    }`}>
                      {product.stock > 0 ? `${product.stock} und.` : "Agotado"}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {!error && products.length === 0 && (
          <div className="text-center py-20">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-gray-500 text-lg">
              No hay productos en esta categoría.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
