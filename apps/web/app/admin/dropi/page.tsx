'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch, formatPrice } from '@/lib/admin';

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">Dropi</h1>
          <p className="text-gray-600 mt-1">
            Importa productos del catálogo Dropi a tu tienda
          </p>
        </div>
        <Link
          href="/dropi"
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition shadow-md"
        >
          Ir al Catálogo Dropi
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Conexión con Dropi
        </h2>
        {statusLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
            Verificando conexión...
          </div>
        ) : status?.connected ? (
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-sm text-gray-700">
              Conectado como <strong>{status.email}</strong>
            </span>
            <span className="text-xs text-gray-400 ml-2">(auto-reconecta cada 45 min)</span>
            <button
              onClick={() => handleRelogin(false)}
              disabled={reconnecting}
              className="ml-auto text-sm text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
            >
              {reconnecting ? 'Reconectando...' : 'Reconectar'}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-sm text-red-600">
              Desconectado — revisá las credenciales en .env
            </span>
            <button
              onClick={() => handleRelogin(true)}
              disabled={reconnecting}
              className="ml-auto text-sm text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
            >
              {reconnecting ? 'Reconectando...' : 'Forzar Reconexión'}
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Productos importados recientemente
        </h2>
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : products.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No hay productos importados aún.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Producto</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Precio</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Stock</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Categoría</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 flex items-center gap-3">
                      {p.image ? (
                        <img src={p.image} alt={p.name} className="h-10 w-10 rounded object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded bg-gray-200 flex items-center justify-center">📦</div>
                      )}
                      <div>
                        <div className="font-medium text-gray-900">{p.name}</div>
                        {p.customCode && (
                          <div className="text-xs text-gray-400">SKU: {p.customCode}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-green-600">
                      {formatPrice(p.price)}
                    </td>
                    <td className="px-4 py-3">{p.stock}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {p.category?.name || 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
