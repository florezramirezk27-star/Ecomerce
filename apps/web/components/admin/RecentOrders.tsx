'use client';

import { Package, CheckCircle, Truck, XCircle, Clock } from 'lucide-react';
import type { DashboardRecentOrder } from '@/lib/admin';

interface RecentOrdersProps {
  orders: DashboardRecentOrder[];
  formatDate: (d: string) => string;
  formatPrice: (v: number | string) => string;
}

const statusConfig: Record<
  string,
  { label: string; icon: typeof Package; bg: string; text: string; ring: string }
> = {
  PENDING: {
    label: 'Pendiente',
    icon: Clock,
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    ring: 'ring-amber-200',
  },
  PAID: {
    label: 'Pagado',
    icon: CheckCircle,
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    ring: 'ring-blue-200',
  },
  SHIPPED: {
    label: 'Enviado',
    icon: Truck,
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    ring: 'ring-purple-200',
  },
  DELIVERED: {
    label: 'Entregado',
    icon: Package,
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    ring: 'ring-emerald-200',
  },
  CANCELLED: {
    label: 'Cancelado',
    icon: XCircle,
    bg: 'bg-red-50',
    text: 'text-red-700',
    ring: 'ring-red-200',
  },
};

export default function RecentOrders({ orders, formatDate, formatPrice }: RecentOrdersProps) {
  if (orders.length === 0) {
    return (
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60">
        <p className="text-center py-12 text-sm text-slate-500">No hay pedidos recientes</p>
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400 font-medium">
            Pedidos recientes
          </p>
          <h3 className="mt-1.5 text-xl font-bold text-slate-900">
            Actividad de pedidos
          </h3>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 ring-1 ring-emerald-200">
          Tiempo real
        </span>
      </div>

      <div className="space-y-3">
        {orders.map((order) => {
          const cfg = statusConfig[order.status] || statusConfig.PENDING;
          const StatusIcon = cfg.icon;

          return (
            <div
              key={order.id}
              className="group rounded-2xl border border-slate-100 bg-white p-4 transition hover:border-slate-200 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    Pedido #{order.id.slice(0, 8)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {order.customerName}
                  </p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${cfg.bg} ${cfg.text} ${cfg.ring}`}
                >
                  <StatusIcon className="h-3.5 w-3.5" />
                  {cfg.label}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-xs text-slate-400">
                  {formatDate(order.createdAt)}
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {formatPrice(order.total)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
