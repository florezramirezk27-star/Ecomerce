'use client';

import { useEffect, useState } from 'react';
import { apiFetch, Order, formatPrice, formatDate } from '@/lib/admin';

type OrderStatus = Order['status'];

const STATUSES: OrderStatus[] = [
  'PENDING',
  'PAID',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
];

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

const STATUS_CONFIG: Record<OrderStatus, { bg: string; text: string; badge: string; label: string }> = {
  PENDING: { bg: 'bg-yellow-50', text: 'text-yellow-700', badge: 'bg-yellow-100', label: 'Pendiente' },
  PAID: { bg: 'bg-blue-50', text: 'text-blue-700', badge: 'bg-blue-100', label: 'Pagado' },
  SHIPPED: { bg: 'bg-purple-50', text: 'text-purple-700', badge: 'bg-purple-100', label: 'Enviado' },
  DELIVERED: { bg: 'bg-green-50', text: 'text-green-700', badge: 'bg-green-100', label: 'Entregado' },
  CANCELLED: { bg: 'bg-red-50', text: 'text-red-700', badge: 'bg-red-100', label: 'Cancelado' },
};

interface OrdersResponse {
  items: Order[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function AdminOrdersPage() {
  const [ordersData, setOrdersData] = useState<OrdersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [changingStatus, setChangingStatus] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ orderId: string; status: OrderStatus } | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const data = await apiFetch(`/orders?page=${page}&limit=20`);
        if (!cancelled) {
          setOrdersData(data);
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Error al cargar órdenes',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [page]);

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    if (newStatus === 'CANCELLED') {
      setCancelTarget({ orderId, status: newStatus });
      return;
    }

    setChangingStatus(`${orderId}-${newStatus}`);
    setError('');
    try {
      const updated = await apiFetch(`/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      setOrdersData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((o) =>
                o.id === orderId ? updated : o,
              ),
            }
          : prev,
      );
      setSuccessMsg(`Orden actualizada a ${STATUS_CONFIG[newStatus].label}`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al actualizar orden',
      );
    } finally {
      setChangingStatus(null);
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;

    setChangingStatus(`${cancelTarget.orderId}-${cancelTarget.status}`);
    setError('');
    try {
      const updated = await apiFetch(`/orders/${cancelTarget.orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: cancelTarget.status }),
      });
      setOrdersData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((o) =>
                o.id === cancelTarget.orderId ? updated : o,
              ),
            }
          : prev,
      );
      setSuccessMsg('Orden cancelada');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al cancelar orden',
      );
    } finally {
      setChangingStatus(null);
      setCancelTarget(null);
    }
  };

  const orders = ordersData?.items || [];
  const filteredOrders = orders.filter(
    (order) => filterStatus === 'ALL' || order.status === filterStatus,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-gray-900">
          Órdenes
        </h1>
        <p className="text-gray-600 mt-1">
          Administra todas las órdenes de tu tienda
        </p>
      </div>

      {successMsg && (
        <div className="p-4 bg-green-50 text-green-700 rounded-lg border border-green-200">
          {successMsg}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterStatus('ALL')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              filterStatus === 'ALL'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Todas ({ordersData?.total || 0})
          </button>
          {STATUSES.map((status) => {
            const count = orders.filter((o) => o.status === status).length;
            return (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  filterStatus === status
                    ? `${STATUS_CONFIG[status].badge} ${STATUS_CONFIG[status].text}`
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {STATUS_CONFIG[status].label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="p-12 text-center bg-white rounded-lg">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Cargando órdenes...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-lg text-gray-500">
            <p className="text-lg">No hay órdenes</p>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const allowedNext = VALID_TRANSITIONS[order.status];
            return (
              <div
                key={order.id}
                className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition"
              >
                <button
                  onClick={() =>
                    setExpandedOrder(
                      expandedOrder === order.id ? null : order.id,
                    )
                  }
                  className="w-full p-4 md:p-6 flex items-center justify-between hover:bg-gray-50 transition"
                >
                  <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6 flex-1 text-left min-w-0">
                    <div className="min-w-0">
                      <p className="text-xs md:text-sm font-mono text-gray-500">
                        Orden #{order.id.slice(0, 8)}
                      </p>
                      <p className="font-bold text-gray-900 text-base md:text-lg truncate">
                        {order.user?.name || 'Usuario desconocido'}
                      </p>
                    </div>
                    <div className="hidden md:block">
                      <p className="text-sm text-gray-600">Email</p>
                      <p className="font-medium text-sm truncate max-w-[200px]">{order.user?.email}</p>
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-sm text-gray-600">Fecha</p>
                      <p className="font-medium text-sm">
                        {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <div className="md:ml-auto">
                      <span
                        className={`inline-block px-3 py-1 md:px-4 md:py-2 rounded-full text-xs md:text-sm font-semibold ${STATUS_CONFIG[order.status].badge} ${STATUS_CONFIG[order.status].text}`}
                      >
                        {STATUS_CONFIG[order.status].label}
                      </span>
                    </div>
                  </div>
                  <div className="ml-2 md:ml-4 text-lg md:text-2xl font-bold text-green-600 shrink-0">
                    {formatPrice(order.total)}
                  </div>
                  <div className="ml-2 md:ml-4 text-gray-500 shrink-0">
                    {expandedOrder === order.id ? '▼' : '▶'}
                  </div>
                </button>

                {expandedOrder === order.id && (
                  <div className="border-t border-gray-200 p-6 space-y-6">
                    <div>
                      <h4 className="font-bold text-gray-900 mb-4">
                        Productos ({order.items?.length ?? 0})
                      </h4>
                      <div className="space-y-3">
                        {(order.items ?? []).map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg"
                          >
                            {item.product?.image && (
                              <img
                                src={item.product.image}
                                alt={item.product.name}
                                className="h-12 w-12 rounded object-cover"
                              />
                            )}
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">
                                {item.product?.name}
                              </p>
                              <p className="text-sm text-gray-600">
                                Cantidad: {item.quantity}
                              </p>
                            </div>
                            <p className="font-bold text-gray-900">
                              {formatPrice(item.price)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {allowedNext.length > 0 && (
                      <div>
                        <h4 className="font-bold text-gray-900 mb-3">
                          Cambiar Estado
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {allowedNext.map((status) => {
                            const isLoading = changingStatus === `${order.id}-${status}`;
                            return (
                              <button
                                key={status}
                                onClick={() => handleStatusChange(order.id, status)}
                                disabled={isLoading}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
                                  isLoading
                                    ? 'opacity-50 cursor-wait'
                                    : 'hover:opacity-90'
                                } ${
                                  status === 'CANCELLED'
                                    ? 'bg-red-500 text-white'
                                    : 'bg-blue-600 text-white'
                                }`}
                              >
                                {isLoading ? (
                                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : null}
                                {status === 'CANCELLED'
                                  ? 'Cancelar orden'
                                  : `Marcar como ${STATUS_CONFIG[status].label}`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {order.status === 'DELIVERED' && (
                      <p className="text-sm text-gray-500 italic">
                        Orden entregada. No se pueden realizar más cambios.
                      </p>
                    )}
                    {order.status === 'CANCELLED' && (
                      <p className="text-sm text-gray-500 italic">
                        Orden cancelada. No se pueden realizar más cambios.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {ordersData && ordersData.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-4 py-2 border rounded-lg disabled:opacity-50 hover:bg-gray-50 transition"
          >
            Anterior
          </button>
          {Array.from({ length: ordersData.totalPages }, (_, i) => i + 1).map(
            (p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-10 h-10 rounded-lg font-medium transition ${
                  p === page
                    ? 'bg-blue-600 text-white'
                    : 'border hover:bg-gray-50'
                }`}
              >
                {p}
              </button>
            ),
          )}
          <button
            onClick={() => setPage((p) => Math.min(ordersData.totalPages, p + 1))}
            disabled={page >= ordersData.totalPages}
            className="px-4 py-2 border rounded-lg disabled:opacity-50 hover:bg-gray-50 transition"
          >
            Siguiente
          </button>
        </div>
      )}

      {cancelTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Cancelar orden
            </h3>
            <p className="text-gray-600 mb-6">
              ¿Estás seguro de cancelar esta orden? El stock de los productos será restaurado.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setCancelTarget(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition"
              >
                No, mantener
              </button>
              <button
                onClick={confirmCancel}
                disabled={changingStatus !== null}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition disabled:opacity-50"
              >
                {changingStatus ? 'Cancelando...' : 'Sí, cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
