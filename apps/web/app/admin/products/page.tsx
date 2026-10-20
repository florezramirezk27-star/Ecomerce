'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Package,
  PackageSearch,
  Pencil,
  RefreshCw,
  Plus,
  Trash2,
} from 'lucide-react';
import { apiFetch, Product, formatPrice } from '@/lib/admin';
import {
  Alert,
  Badge,
  Card,
  ConfirmModal,
  EmptyState,
  LoadingState,
  PageHeader,
  Pagination,
  SearchInput,
  Table,
  Td,
  Th,
  THead,
  TRow,
} from '@/components/admin/ui';

/** `/products` devuelve una pagina, no un array plano. */
interface ProductsResponse {
  items: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const PAGE_SIZE = 20;

/**
 * Filtro de estado del panel.
 *
 * Por defecto el admin solo ve los productos activos. Sin esto, un producto que
 * se "elimino" pero quedo archivado (`active: false`, porque tiene pedidos
 * asociados) seguia apareciendo en la lista y parecia que el borrado no
 * funcionaba.
 */
type StatusFilter = 'active' | 'inactive' | 'all';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'active', label: 'Activos' },
  { value: 'inactive', label: 'Inactivos' },
  { value: 'all', label: 'Todos' },
];

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const data: ProductsResponse = await apiFetch(
          `/products?page=${page}&limit=${PAGE_SIZE}&status=${statusFilter}`,
        );
        if (cancelled) return;

        // `data` es la pagina, no la lista. Antes se asignaba el objeto entero a
        // `products` y el `.filter` de mas abajo reventaba en runtime.
        setProducts(data.items ?? []);
        setTotalPages(data.totalPages ?? 1);
        setError('');
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Error al cargar productos',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Sin esta guarda, al cambiar de pagina rapido una respuesta lenta de la
    // pagina anterior podria llegar despues y pisar la que ya sepidio.
    return () => {
      cancelled = true;
    };
  }, [page, statusFilter]);

  /** Cambiar de filtro vuelve a la pagina 1: la pagina actual puede no existir. */
  const handleStatusChange = (next: StatusFilter) => {
    setStatusFilter(next);
    setPage(1);
    setSuccess('');
    setError('');
  };

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      setError('');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await apiFetch(`/products/${id}`, {
        method: 'DELETE',
      });
      const restantes = products.filter((p) => p.id !== id);
      setProducts(restantes);
      setDeleteConfirm(null);
      setSuccess(
        result?.archived
          ? `"${result.name || 'Producto'}" tiene pedidos asociados, por eso no se puede borrar su historial. Quedó desactivado (lo encuentras en la pestaña "Inactivos") y ya no aparece en la tienda.`
          : 'Producto eliminado correctamente.',
      );

      // Si era el ultimo producto de esta pagina y no es la primera, la pagina
      // ya no existe. Retroceder carga la anterior en vez de dejar una tabla
      // vacia con un "no hay productos" que no es cierto.
      if (restantes.length === 0 && page > 1) {
        setPage((prev) => prev - 1);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al eliminar producto',
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleRefreshMedia = async (product: Product) => {
    try {
      setRefreshingId(product.id);
      setError('');
      setSuccess('');
      const result: { gallery?: string[]; videos?: string[] } = await apiFetch(
        `/dropi/products/${product.id}/refresh-media`,
        { method: 'POST' },
      );
      const imagenes = result?.gallery?.length ?? 0;
      const videos = result?.videos?.length ?? 0;
      setSuccess(
        `"${product.name}": imágenes actualizadas (${imagenes} foto${imagenes === 1 ? '' : 's'}${videos > 0 ? `, ${videos} video${videos === 1 ? '' : 's'}` : ''}).`,
      );
      // La URL de la foto cambio: recargar la pagina evita que la tabla siga
      // mostrando la imagen rota que ya no esta en la base de datos.
      const data: ProductsResponse = await apiFetch(
        `/products?page=${page}&limit=${PAGE_SIZE}&status=${statusFilter}`,
      );
      setProducts(data.items ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Error al re-sincronizar las imágenes',
      );
    } finally {
      setRefreshingId(null);
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

      {success && <Alert type="success">{success}</Alert>}

      <Card className="p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Buscar por nombre o slug..."
            className="max-w-md"
          />
          <div
            role="tablist"
            aria-label="Filtrar por estado"
            className="inline-flex shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-1"
          >
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                role="tab"
                aria-selected={statusFilter === tab.value}
                onClick={() => handleStatusChange(tab.value)}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                  statusFilter === tab.value
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <LoadingState label="Cargando productos..." />
        ) : filteredProducts.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title={
              searchTerm
                ? 'Sin resultados'
                : statusFilter === 'inactive'
                  ? 'No hay productos inactivos'
                  : 'No hay productos'
            }
            description={
              searchTerm
                ? 'Ningún producto coincide con la búsqueda.'
                : statusFilter === 'inactive'
                  ? 'Los productos que elimines y tengan pedidos asociados aparecerán aquí.'
                  : 'Crea tu primer producto para empezar a vender en Kronio Market.'
            }
            action={
              searchTerm || statusFilter === 'inactive' ? undefined : (
                <Link
                  href="/admin/products/new"
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  Crear el primer producto
                </Link>
              )
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
                            onClick={() => handleRefreshMedia(product)}
                            disabled={refreshingId === product.id}
                            title="Vuelve a leer de Dropi la imagen, la galería y los videos (arregla fotos rotas)"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <RefreshCw
                              className={`h-3.5 w-3.5 ${refreshingId === product.id ? 'animate-spin' : ''}`}
                            />
                            Re-sincronizar
                          </button>
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
                      onClick={() => handleRefreshMedia(product)}
                      disabled={refreshingId === product.id}
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {refreshingId === product.id
                        ? 'Sincronizando...'
                        : 'Re-sincronizar'}
                    </button>
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

      {!loading && totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onChange={(next) => {
            setPage(next);
            setSuccess('');
            setError('');
          }}
        />
      )}

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