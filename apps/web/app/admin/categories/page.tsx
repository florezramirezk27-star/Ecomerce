'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Package, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { apiFetch, Category } from '@/lib/admin';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  LoadingState,
  PageHeader,
  SearchInput,
} from '@/components/admin/ui';

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
  const [deleting, setDeleting] = useState(false);
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
      setDeleting(true);
      await apiFetch(`/categories/${id}`, {
        method: 'DELETE',
      });
      setCategories((prev) => prev.filter((c) => c.id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al eliminar categoría',
      );
    } finally {
      setDeleting(false);
    }
  };

  const filteredCategories = categories.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.slug.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const deleteCategory = deleteConfirm
    ? categories.find((c) => c.id === deleteConfirm)
    : null;
  const deleteProductCount = deleteCategory?._count?.products || 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorías"
        subtitle="Administra las categorías de productos"
        action={
          <Link
            href="/admin/categories/new"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Nueva Categoría
          </Link>
        }
      />

      {error && <Alert type="error">{error}</Alert>}

      <Card className="p-4">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Buscar por nombre o slug..."
          className="max-w-md"
        />
      </Card>

      {loading ? (
        <LoadingState label="Cargando categorías..." />
      ) : filteredCategories.length === 0 ? (
        <Card>
          <EmptyState
            icon={Tags}
            title="No hay categorías"
            description="Crea categorías para organizar mejor tu catálogo."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredCategories.map((category) => {
            const isExpanded = expandedCategory === category.id;
            const products = categoryProducts[category.id];
            const isLoadingProducts = loadingProducts === category.id;

            return (
              <Card key={category.id} className="flex flex-col overflow-hidden">
                <div className="flex-1 p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                        <Tags className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-bold text-slate-900">
                          {category.name}
                        </h3>
                        <p className="truncate font-mono text-xs text-slate-500">
                          {category.slug}
                        </p>
                      </div>
                    </div>
                    <Badge tone="blue" className="shrink-0">
                      {category._count?.products || 0} productos
                    </Badge>
                  </div>

                  {category.description && (
                    <p className="mt-3 line-clamp-2 text-sm text-slate-600">
                      {category.description}
                    </p>
                  )}

                  <p className="mt-3 text-xs text-slate-400">
                    Creada:{' '}
                    {new Date(category.createdAt).toLocaleDateString()}
                  </p>

                  <div className="mt-4 flex gap-2">
                    {(category._count?.products || 0) > 0 && (
                      <Button
                        variant="secondary"
                        className="flex-1 px-3 py-2 text-xs"
                        onClick={() => toggleCategoryProducts(category.id)}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        {isExpanded ? 'Ocultar' : 'Ver'} productos
                      </Button>
                    )}
                    <Link
                      href={`/admin/categories/edit/${category.id}`}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-blue-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </Link>
                    <button
                      onClick={() => setDeleteConfirm(category.id)}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/60 p-6">
                    <h4 className="mb-3 text-sm font-bold text-slate-900">
                      Productos en esta categoría
                    </h4>
                    {isLoadingProducts ? (
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        Cargando productos...
                      </div>
                    ) : products && products.length > 0 ? (
                      <div className="space-y-2">
                        {products.map((product) => (
                          <Link
                            key={product.id}
                            href={`/admin/products/edit/${product.id}`}
                            className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm transition hover:border-blue-200"
                          >
                            {product.image && (
                              <img
                                src={product.image}
                                alt={product.name}
                                className="h-10 w-10 shrink-0 rounded-lg object-cover"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-900">
                                {product.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {Number(product.price).toLocaleString('es-CO')} COP
                              </p>
                            </div>
                            <Badge tone={product.stock > 0 ? 'green' : 'red'}>
                              {product.stock > 0 ? `${product.stock} uds` : 'Agotado'}
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Package className="h-4 w-4" />
                        No hay productos en esta categoría
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={!!deleteConfirm}
        title="¿Eliminar categoría?"
        description={
          deleteCategory
            ? `Estás a punto de eliminar "${deleteCategory.name}".${
                deleteProductCount > 0
                  ? ` Esta categoría tiene ${deleteProductCount} producto(s) asociados. No se podrá eliminar si tiene productos.`
                  : ' Esta acción no se puede deshacer.'
              }`
            : 'Esta acción no se puede deshacer.'
        }
        confirmLabel="Eliminar"
        loading={deleting}
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
      />
    </div>
  );
}