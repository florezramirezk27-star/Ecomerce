import Link from "next/link";
import { apiFetch, type Paginated } from "@/lib/api";
import ProductCatalog, {
  type CatalogProduct,
} from "@/components/ProductCatalog";

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;

type ProductSummary = CatalogProduct;

interface CategoryInfo {
  id: string;
  name: string;
  slug: string;
}

async function getProducts(categoryId?: string, page = 1) {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
  if (categoryId) params.set('categoryId', categoryId);

  return apiFetch(`/products?${params.toString()}`) as Promise<Paginated<ProductSummary>>;
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
  let total = 0;
  let category: CategoryInfo | null = null;
  let error = "";

  try {
    const [catalog, categoryInfo] = await Promise.all([
      getProducts(categoryId),
      categoryId ? getCategory(categoryId) : Promise.resolve(null),
    ]);
    products = catalog.items ?? [];
    total = catalog.total ?? products.length;
    category = categoryInfo;
  } catch {
    error = "Error al cargar los productos.";
  }

  return (
    <main className="min-h-dvh bg-orange-50">
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
          <ProductCatalog
            initialProducts={products}
            categoryId={categoryId}
            pageSize={PAGE_SIZE}
            total={total}
          />
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
