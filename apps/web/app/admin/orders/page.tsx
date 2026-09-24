'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Package,
  Truck,
  XCircle,
} from 'lucide-react';
import { apiFetch, Order, formatPrice, formatDate } from '@/lib/admin';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  LoadingState,
  PageHeader,
  Pagination,
} from '@/components/admin/ui';

type OrderStatus = Order['status'];
type BadgeTone = 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'cyan';

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

const STATUS_CONFIG: Record<
  OrderStatus,
  { tone: BadgeTone; label: string; icon: typeof Package }
> = {
  PENDING: { tone: 'yellow', label: 'Pendiente', icon: Clock },
  PAID: { tone: 'blue', label: 'Pagado', icon: CheckCircle2 },
  SHIPPED: { tone: 'purple', label: 'Enviado', icon: Truck },
  DELIVERED: { tone: 'green', label: 'Entregado', icon: Package },
  CANCELLED: { tone: 'red', label: 'Cancelado', icon: XCircle },
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
  const [reprocessing, setReprocessing] = useState<string | null>(null);
  const [reprocessMsg, setReprocessMsg] = useState<{ orderId: string; text: string } | null>(null);

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

  const handleReprocess = async (orderId: string) => {
    setReprocessing(orderId);
    setReprocessMsg(null);
    setError('');
    try {
      const updated = await apiFetch(
        `/orders/${orderId}/reprocess?force=true`,
        { method: 'POST' },
      );
      const dropiMsg = updated?.dropi?.message;
      setReprocessMsg({
        orderId,
        text: `Dropi: ${dropiMsg || 'enviado'}`,
      });
      setOrdersData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((o) =>
                o.id === orderId ? { ...o, ...updated } : o,
              ),
            }
          : prev,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error al reprocesar la orden',
      );
    } finally {
      setReprocessing(null);
    }
  };

  const orders = ordersData?.items || [];
  const filteredOrders = orders.filter(
    (order) => filterStatus === 'ALL' || order.status === filterStatus,
  );

  const chipClass = (active: boolean) =>
    `rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
      active
        ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Órdenes"
        subtitle="Administra todas las órdenes de tu tienda"
      />

      {successMsg && <Alert type="success">{successMsg}</Alert>}

      {error && <Alert type="error">{error}</Alert>}

      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterStatus('ALL')}
            className={chipClass(filterStatus === 'ALL')}
          >
            Todas ({ordersData?.total || 0})
          </button>
          {STATUSES.map((status) => {
            const count = orders.filter((o) => o.status === status).length;
            return (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={chipClass(filterStatus === status)}
              >
                {STATUS_CONFIG[status].label} ({count})
              </button>
            );
          })}
        </div>
      </Card>

      {loading ? (
        <Card>
          <LoadingState label="Cargando órdenes..." />
        </Card>
      ) : filteredOrders.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No hay órdenes"
            description="Cuando los clientes realicen compras, sus órdenes aparecerán aquí."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const allowedNext = VALID_TRANSITIONS[order.status];
            const cfg = STATUS_CONFIG[order.status];
            const StatusIcon = cfg.icon;
            const isExpanded = expandedOrder === order.id;

            return (
              <Card key={order.id} className="overflow-hidden">
                <button
                  onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                  className="flex w-full items-center justify-between gap-4 p-4 text-left transition hover:bg-slate-50 md:p-6"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center md:gap-6">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-slate-400">
                        Orden #{order.id.slice(0, 8)}
                      </p>
                      <p className="truncate text-base font-bold text-slate-900">
                        {order.user?.name || 'Usuario desconocido'}
                      </p>
                      <p className="truncate text-xs text-slate-500 md:hidden">
                        {order.user?.email}
                      </p>
                    </div>
                    <div className="hidden md:block">
                      <p className="text-xs text-slate-400">Email</p>
                      <p className="max-w-[200px] truncate text-sm font-medium text-slate-700">
                        {order.user?.email}
                      </p>
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-xs text-slate-400">Fecha</p>
                      <p className="text-sm font-medium text-slate-700">
                        {formatDate(order.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-4">
                    <Badge tone={cfg.tone}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {cfg.label}
                    </Badge>
                    <span className="text-base font-bold text-emerald-600 md:text-lg">
                      {formatPrice(order.total)}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-slate-400 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                </button>

                {isExpanded && (
                  <div className="space-y-6 border-t border-slate-100 p-6">
                    <div>
                      <h4 className="mb-4 text-sm font-bold text-slate-900">
                        Productos ({order.items?.length ?? 0})
                      </h4>
                      <div className="space-y-3">
                        {(order.items ?? []).map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-4 rounded-xl bg-slate-50 p-3"
                          >
                            {item.product?.image && (
                              <img
                                src={item.product.image}
                                alt={item.product.name}
                                className="h-12 w-12 rounded-lg object-cover ring-1 ring-slate-200"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-900">
                                {item.product?.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                Cantidad: {item.quantity}
                              </p>
                            </div>
                            <p className="font-bold text-slate-900">
                              {formatPrice(item.price)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {allowedNext.length > 0 && (
                      <div>
                        <h4 className="mb-3 text-sm font-bold text-slate-900">
                          Cambiar estado
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {allowedNext.map((status) => {
                            const isLoading =
                              changingStatus === `${order.id}-${status}`;
                            const nextCfg = STATUS_CONFIG[status];
                            return (
                              <Button
                                key={status}
                                variant={status === 'CANCELLED' ? 'danger' : 'primary'}
                                className="px-4 py-2.5 text-xs"
                                isLoading={isLoading}
                                disabled={changingStatus !== null}
                                onClick={() => handleStatusChange(order.id, status)}
                              >
                                {status === 'CANCELLED'
                                  ? 'Cancelar orden'
                                  : `Marcar como ${nextCfg.label}`}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div>
                      <h4 className="mb-3 text-sm font-bold text-slate-900">
                        Integraciones
                      </h4>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="secondary"
                          className="px-4 py-2.5 text-xs"
                          isLoading={reprocessing === order.id}
                          disabled={reprocessing !== null}
                          onClick={() => handleReprocess(order.id)}
                        >
                          Reenviar a Dropi / correos
                        </Button>
                        {reprocessMsg?.orderId === order.id && (
                          <span className="text-xs font-medium text-blue-600">
                            {reprocessMsg.text}
                          </span>
                        )}
                      </div>
                    </div>

                    {order.status === 'DELIVERED' && (
                      <p className="text-sm italic text-slate-500">
                        Orden entregada. No se pueden realizar más cambios.
                      </p>
                    )}
                    {order.status === 'CANCELLED' && (
                      <p className="text-sm italic text-slate-500">
                        Orden cancelada. No se pueden realizar más cambios.
                      </p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {ordersData && ordersData.totalPages > 1 && (
        <Pagination page={page} totalPages={ordersData.totalPages} onChange={setPage} />
      )}

      <ConfirmModal
        open={!!cancelTarget}
        title="Cancelar orden"
        description="¿Estás seguro de cancelar esta orden? El stock de los productos será restaurado."
        confirmLabel="Sí, cancelar"
        loading={changingStatus !== null}
        onCancel={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
      />
    </div>
  );
}