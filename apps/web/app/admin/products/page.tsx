'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Package, PackageSearch, Pencil, Plus, Trash2 } from 'lucide-react';
import { apiFetch, Product, formatPrice } from '@/lib/admin';
import {
  Alert,
  Badge,
  Card,
  ConfirmModal,
  EmptyState,
  LoadingState,
  PageHeader,
  SearchInput,
  Table,
  Td,
  Th,
  THead,
  TRow,
} from '@/components/admin/ui';

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      setLoading(true);
      const data = await apiFetch('/products');
      setProducts(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al cargar productos',
      );
    } finally {
      setLoading(false);
    }
  }

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      await apiFetch(`/products/${id}`, {
        method: 'DELETE',
      });
      setProducts((prev) => prev.filter((p) => p.id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al eliminar producto',
      );
    } finally {
      setDeleting(false);
    }
  };

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.slug.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const deleteProduct = deleteConfirm
    ? products.find((p) => p.id === deleteConfirm)
    : null;

  const stockTone = (stock: number): 'green' | 'yellow' | 'red' =>
    stock > 10 ? 'green' : stock > 0 ? 'yellow' : 'red';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Productos"
        subtitle="Administra tu catálogo de productos"
        action={
          <Link
            href="/admin/products/new"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Nuevo Producto
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

      <Card className="overflow-hidden">
        {loading ? (
          <LoadingState label="Cargando productos..." />
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title="No hay productos"
            description="Crea tu primer producto para empezar a vender en Kronio Market."
            action={
              <Link
                href="/admin/products/new"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Crear el primer producto
              </Link>
            }
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr>
                    <Th>Imagen</Th>
                    <Th>Nombre</Th>
                    <Th>Precio</Th>
                    <Th>Stock</Th>
                    <Th>Categoría</Th>
                    <Th>Estado</Th>
                    <Th>Acciones</Th>
                  </tr>
                </THead>
                <tbody>
                  {filteredProducts.map((product) => (
                    <TRow key={product.id}>
                      <Td>
                        {product.image ? (
                          <img
                            src={product.image}
                            alt={product.name}
                            className="h-12 w-12 rounded-xl object-cover ring-1 ring-slate-200"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 ring-1 ring-slate-200">
                            <Package className="h-5 w-5" />
                          </div>
                        )}
                      </Td>
                      <Td>
                        <div className="font-semibold text-slate-900">
                          {product.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {product.slug}
                        </div>
                      </Td>
                      <Td className="font-semibold text-emerald-600">
                        {formatPrice(product.price)}
                      </Td>
                      <Td>
                        <Badge tone={stockTone(product.stock)}>
                          {product.stock} uds
                        </Badge>
                      </Td>
                      <Td className="text-slate-600">
                        {product.category?.name || 'N/A'}
                      </Td>
                      <Td>
                        <Badge tone={product.active ? 'blue' : 'gray'}>
                          {product.active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/admin/products/edit/${product.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-blue-700"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Editar
                          </Link>
                          <button
                            onClick={() => setDeleteConfirm(product.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Eliminar
                          </button>
                        </div>
                      </Td>
                    </TRow>
                  ))}
                </tbody>
              </Table>
            </div>

            <div className="space-y-3 p-4 md:hidden">
              {filteredProducts.map((product) => (
                <Card key={product.id} className="p-4">
                  <div className="flex items-center gap-3">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-slate-200"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                        <Package className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {product.name}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {product.slug}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-slate-500">Precio: </span>
                      <span className="font-semibold text-emerald-600">
                        {formatPrice(product.price)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Stock: </span>
                      <Badge tone={stockTone(product.stock)}>
                        {product.stock}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-slate-500">Categoría: </span>
                      <span className="text-slate-700">
                        {product.category?.name || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Estado: </span>
                      <Badge tone={product.active ? 'blue' : 'gray'}>
                        {product.active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-3">
                    <Link
                      href={`/admin/products/edit/${product.id}`}
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      Editar
                    </Link>
                    <button
                      onClick={() => setDeleteConfirm(product.id)}
                      className="flex-1 rounded-xl border border-red-200 px-3 py-2 text-center text-sm font-medium text-red-600 transition hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </Card>

      <ConfirmModal
        open={!!deleteConfirm}
        title="¿Eliminar producto?"
        description={
          deleteProduct
            ? `Estás a punto de eliminar "${deleteProduct.name}". Esta acción no se puede deshacer.`
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