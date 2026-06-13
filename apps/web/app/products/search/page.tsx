'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  apiFetch,
  Category,
  formatPrice,
  Product,
} from '@/lib/admin';

interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function ProductSearchPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sort, setSort] = useState<'priceAsc' | 'priceDesc'>('priceAsc');
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const limit = 20;

  const queryString = useMemo(() => {
    const params = new URLSearchParams();

    if (search.trim()) params.set('search', search.trim());
    if (categoryId) params.set('categoryId', categoryId);
    if (sort) params.set('sort', sort);
    params.set('page', String(page));
    params.set('limit', String(limit));

    return params.toString();
  }, [search, categoryId, sort, page]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const data = await apiFetch('/categories');
        setCategories(data);
      } catch (err) {
        console.error(err);
      }
    };

    loadCategories();
  }, []);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        setLoading(true);
        setError('');
        const endpoint = `/products?${queryString}`;
        const data = await apiFetch(endpoint);

        if (Array.isArray(data)) {
          setProducts(data);
          setPageInfo({
            total: data.length,
            page: 1,
            limit,
            totalPages: 1,
          });
        } else {
          setProducts(data.items);
          setPageInfo({
            total: data.total,
            page: data.page,
            limit: data.limit,
            totalPages: data.totalPages,
          });
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Ha ocurrido un error cargando los productos.',
        );
        setProducts([]);
        setPageInfo(null);
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, [queryString]);

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-8 lg:px-10">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
            Búsqueda de productos
          </p>
          <h1 className="mt-2 text-4xl font-bold text-slate-900">
            Explora y filtra tu catálogo
          </h1>
        </div>
        <Link
          href="/products"
          className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-300/10 transition hover:bg-slate-700"
        >
          Volver a productos
        </Link>
      </div>

      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-lg shadow-slate-200/60">
          <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="search">
                Buscar por nombre
              </label>
              <input
                id="search"
                type="text"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Ej. camiseta deportiva"
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="category">
                Filtrar por categoría
              </label>
              <select
                id="category"
                value={categoryId}
                onChange={(event) => {
                  setCategoryId(event.target.value);
                  setPage(1);
                }}
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400"
              >
                <option value="">Todas las categorías</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="sort">
                Ordenar por precio
              </label>
              <select
                id="sort"
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as 'priceAsc' | 'priceDesc');
                  setPage(1);
                }}
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400"
              >
                <option value="priceAsc">Menor a mayor</option>
                <option value="priceDesc">Mayor a menor</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
            <span className="font-semibold text-slate-900">Resultados:</span>
            <span>{products.length} producto{products.length === 1 ? '' : 's'}</span>
            {categoryId && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                Categoría: {categories.find((item) => item.id === categoryId)?.name}
              </span>
            )}
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
              Orden: {sort === 'priceAsc' ? 'Menor a mayor' : 'Mayor a menor'}
            </span>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-lg shadow-slate-200/60">
          <h2 className="text-xl font-semibold text-slate-900">Consejos de búsqueda</h2>
          <ul className="mt-4 space-y-3 text-slate-600">
            <li>Usa palabras clave del nombre del producto.</li>
            <li>Combina categoría y búsqueda para resultados más precisos.</li>
            <li>Ordena por precio para encontrar rápidamente las mejores ofertas.</li>
          </ul>
        </div>
      </section>

      <section className="mt-8">
        {loading ? (
          <div className="rounded-[2rem] border border-slate-200 bg-white p-10 shadow-lg shadow-slate-200/60 text-center text-slate-500">
            Cargando productos...
          </div>
        ) : error ? (
          <div className="rounded-[2rem] border border-red-200 bg-red-50 p-8 text-red-700 shadow-sm">
            {error}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-[2rem] border border-slate-200 bg-white p-10 shadow-lg shadow-slate-200/60 text-center text-slate-500">
            No se encontraron productos con los filtros seleccionados.
          </div>
        ) : (
          <>
            <div className="grid gap-6 xl:grid-cols-3">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                >
                <img
                  src={
                    product.image ||
                    'https://via.placeholder.com/640x480?text=Sin+imagen'
                  }
                  alt={product.name}
                  className="h-64 w-full object-cover"
                />
                <div className="p-6">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    {product.category?.name || 'Sin categoría'}
                  </p>
                  <h3 className="mt-3 text-xl font-semibold text-slate-900">
                    {product.name}
                  </h3>
                  <p className="mt-3 text-slate-600">{product.description || 'Sin descripción disponible.'}</p>
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <p className="text-2xl font-bold text-slate-900">
                      {formatPrice(product.price)}
                    </p>
                    <Link
                      href={`/products/${product.id}`}
                      className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                    >
                      Ver producto
                    </Link>
                  </div>
                </div>
              </div>
            ))}
            </div>

            {pageInfo && pageInfo.totalPages > 1 && (
              <div className="mt-8 flex flex-col items-center justify-between gap-3 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60 sm:flex-row">
                <p className="text-sm text-slate-600">
                  Página {pageInfo.page} de {pageInfo.totalPages} · Mostrando {products.length} de {pageInfo.total} resultados
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={pageInfo.page <= 1}
                    className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setPage(Math.min(pageInfo.totalPages, page + 1))}
                    disabled={pageInfo.page >= pageInfo.totalPages}
                    className="rounded-full border border-slate-300 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
