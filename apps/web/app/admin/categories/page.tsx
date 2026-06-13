'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch, Category } from '@/lib/admin';

interface CategoryWithProducts extends Category {
  products?: Array<{
    id: string;
    name: string;
    slug: string;
    price: string | number;
    image?: string;
    stock: number;
  }>;
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [categoryProducts, setCategoryProducts] = useState<Record<string, CategoryWithProducts['products']>>({});
  const [loadingProducts, setLoadingProducts] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    loadCategories();
  }, []);

  async function loadCategories() {
    try {
      setLoading(true);
      const data = await apiFetch('/categories');
      setCategories(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al cargar categorías',
      );
    } finally {
      setLoading(false);
    }
  }

  async function toggleCategoryProducts(categoryId: string) {
    if (expandedCategory === categoryId) {
      setExpandedCategory(null);
      return;
    }

    setExpandedCategory(categoryId);

    if (!categoryProducts[categoryId]) {
      setLoadingProducts(categoryId);
      try {
        const data = await apiFetch(`/categories/${categoryId}`);
        setCategoryProducts((prev) => ({
          ...prev,
          [categoryId]: data.products || [],
        }));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Error al cargar productos',
        );
      } finally {
        setLoadingProducts(null);
      }
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/categories/${id}`, {
        method: 'DELETE',
      });
      setCategories((prev) => prev.filter((c) => c.id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al eliminar categoría',
      );
    }
  };

  const filteredCategories = categories.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.slug.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">
            Categorías
          </h1>
          <p className="text-gray-600 mt-1">
            Administra las categorías de productos
          </p>
        </div>
        <Link
          href="/admin/categories/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition shadow-md"
        >
          ➕ Nueva Categoría
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <input
          type="text"
          placeholder="Buscar por nombre o slug..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Cargando categorías...</p>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="col-span-full p-12 text-center text-gray-500">
            <p className="text-lg">No hay categorías</p>
          </div>
        ) : (
          filteredCategories.map((category) => {
            const isExpanded = expandedCategory === category.id;
            const products = categoryProducts[category.id];
            const isLoadingProducts = loadingProducts === category.id;

            return (
              <div
                key={category.id}
                className="bg-white rounded-lg shadow-md hover:shadow-lg transition"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">
                        {category.name}
                      </h3>
                      <p className="text-sm text-gray-500 font-mono mt-1">
                        {category.slug}
                      </p>
                    </div>
                    <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold whitespace-nowrap">
                      {category._count?.products || 0} productos
                    </span>
                  </div>

                  {category.description && (
                    <p className="text-gray-600 text-sm mb-4">
                      {category.description}
                    </p>
                  )}

                  <p className="text-xs text-gray-500 mb-4">
                    Creado:{' '}
                    {new Date(category.createdAt).toLocaleDateString()}
                  </p>

                  <div className="flex gap-2">
                    {(category._count?.products || 0) > 0 && (
                      <button
                        onClick={() => toggleCategoryProducts(category.id)}
                        className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition text-sm"
                      >
                        {isExpanded ? 'Ocultar productos' : 'Ver productos'}
                      </button>
                    )}
                    <Link
                      href={`/admin/categories/edit/${category.id}`}
                      className="flex-1 text-center py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 font-medium transition text-sm"
                    >
                      Editar
                    </Link>
                    <button
                      onClick={() => setDeleteConfirm(category.id)}
                      className="flex-1 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 font-medium transition text-sm"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-200 p-6">
                    <h4 className="font-semibold text-gray-900 mb-3">
                      Productos en esta categoría
                    </h4>
                    {isLoadingProducts ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                        Cargando productos...
                      </div>
                    ) : products && products.length > 0 ? (
                      <div className="space-y-2">
                        {products.map((product) => (
                          <Link
                            key={product.id}
                            href={`/admin/products/edit/${product.id}`}
                            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition border border-gray-100"
                          >
                            {product.image && (
                              <img
                                src={product.image}
                                alt={product.name}
                                className="w-10 h-10 rounded object-cover shrink-0"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {product.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {Number(product.price).toLocaleString("es-CO")} COP
                              </p>
                            </div>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              product.stock > 0
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {product.stock > 0 ? `${product.stock} uds` : 'Agotado'}
                            </span>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">
                        No hay productos en esta categoría
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (() => {
        const category = categories.find((c) => c.id === deleteConfirm);
        const productCount = category?._count?.products || 0;
        return (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl">
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  ¿Eliminar categoría?
                </h3>
                <p className="text-gray-600">
                  {category ? (
                    <>Estás a punto de eliminar <strong className="text-gray-900">&ldquo;{category.name}&rdquo;</strong></>
                  ) : (
                    '¿Estás seguro de eliminar esta categoría?'
                  )}
                </p>
              </div>
              {productCount > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-yellow-700 flex items-center gap-2">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Esta categoría tiene <strong>{productCount} producto{productCount !== 1 ? 's' : ''}</strong> asociado{productCount !== 1 ? 's' : ''}. No se podrá eliminar si tiene productos.
                  </p>
                </div>
              )}
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
                <p className="text-sm text-red-700 flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Esta acción no se puede deshacer.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition text-gray-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
