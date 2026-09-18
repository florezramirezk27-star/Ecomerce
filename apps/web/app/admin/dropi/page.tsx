'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Boxes,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { apiFetch, formatPrice } from '@/lib/admin';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
  Table,
  Td,
  Th,
  THead,
  TRow,
} from '@/components/admin/ui';

interface ImportedProduct {
  id: string;
  name: string;
  slug: string;
  price: string | number;
  stock: number;
  image?: string;
  category?: { name: string };
  customCode?: string;
  createdAt: string;
}

export default function AdminDropiPage() {
  const [products, setProducts] = useState<ImportedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ connected: boolean; email: string } | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const s = await apiFetch('/dropi/status');
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    apiFetch('/products?limit=10')
      .then((data) => {
        const items = Array.isArray(data) ? data : data.items || [];
        setProducts(items);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    apiFetch('/dropi/status')
      .then((s) => setStatus(s))
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleRelogin = async (force = false) => {
    setReconnecting(true);
    setStatusLoading(true);
    try {
      const endpoint = force ? '/dropi/force-relogin' : '/dropi/relogin';
      const s = await apiFetch(endpoint, { method: 'POST' });
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setReconnecting(false);
      setStatusLoading(false);
    }
  };

  const handleSyncStock = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const summary = await apiFetch('/dropi/sync-stock', { method: 'POST' });
      setSyncMessage(
        `Sincronizados ${summary.updated} de ${summary.checked} productos importados.`,
      );
      apiFetch('/products?limit=10')
        .then((data) =>
          setProducts(Array.isArray(data) ? data : data.items || []),
        )
        .catch(() => {});
    } catch {
      setSyncMessage('Error al sincronizar stock con Dropi.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dropi"
        subtitle="Importa productos del catálogo Dropi a tu tienda"
        action={
          <Link
            href="/dropi"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700"
          >
            <ExternalLink className="h-4 w-4" />
            Ir al Catálogo Dropi
          </Link>
        }
      />

      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Boxes className="h-4.5 w-4.5" />
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Conexión con Dropi
          </h2>
        </div>

        {statusLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            Verificando conexión...
          </div>
        ) : status?.connected ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Badge tone="green">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Conectado
            </Badge>
            <span className="text-sm text-slate-700">
              Correo:{' '}
              <strong className="font-semibold text-slate-900">
                {status.email}
              </strong>
            </span>
            <span className="text-xs text-slate-400">
              auto-reconecta cada 45 min
            </span>
            <Button
              variant="secondary"
              className="sm:ml-auto"
              isLoading={reconnecting}
              onClick={() => handleRelogin(false)}
            >
              <RefreshCw className="h-4 w-4" />
              Reconectar
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Badge tone="red">
              <XCircle className="h-3.5 w-3.5" />
              Desconectado
            </Badge>
            <span className="text-sm text-red-600">
              Revisa las credenciales en el archivo .env
            </span>
            <Button
              variant="secondary"
              className="sm:ml-auto"
              isLoading={reconnecting}
              onClick={() => handleRelogin(true)}
            >
              <RefreshCw className="h-4 w-4" />
              Forzar reconexión
            </Button>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Productos importados recientemente
            </h2>
            <p className="text-sm text-slate-500">
              Últimos productos sincronizados con el catálogo Dropi
            </p>
          </div>
          <Button
            variant="success"
            isLoading={syncing}
            onClick={handleSyncStock}
          >
            <RefreshCw className="h-4 w-4" />
            Sincronizar stock y precios
          </Button>
        </div>

        <div className="p-6">
          {syncMessage && (
            <Alert type={syncMessage.startsWith('Error') ? 'error' : 'success'} className="mb-4">
              {syncMessage}
            </Alert>
          )}

          {loading ? (
            <LoadingState label="Cargando productos..." />
          ) : products.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="No hay productos importados"
              description="Cuando importes productos desde el catálogo Dropi, aparecerán aquí."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <tr>
                    <Th>Producto</Th>
                    <Th>Precio</Th>
                    <Th>Stock</Th>
                    <Th>Categoría</Th>
                  </tr>
                </THead>
                <tbody>
                  {products.map((p) => (
                    <TRow key={p.id}>
                      <Td>
                        <div className="flex items-center gap-3">
                          {p.image ? (
                            <img
                              src={p.image}
                              alt={p.name}
                              className="h-10 w-10 rounded-lg object-cover ring-1 ring-slate-200"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                              <Boxes className="h-4 w-4" />
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-slate-900">{p.name}</div>
                            {p.customCode && (
                              <div className="text-xs text-slate-400">
                                SKU: {p.customCode}
                              </div>
                            )}
                          </div>
                        </div>
                      </Td>
                      <Td className="font-semibold text-emerald-600">
                        {formatPrice(p.price)}
                      </Td>
                      <Td>
                        <Badge tone={p.stock > 0 ? 'green' : 'red'}>
                          {p.stock} uds
                        </Badge>
                      </Td>
                      <Td className="text-slate-600">
                        {p.category?.name || 'N/A'}
                      </Td>
                    </TRow>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}