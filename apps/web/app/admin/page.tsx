'use client';

import { useEffect, useState } from 'react';
import {
  apiFetch,
  DashboardStats,
  formatPrice,
  formatDate,
} from '@/lib/admin';

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedInsight, setSelectedInsight] = useState('Ventas del día');

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true);
        const data = await apiFetch('/dashboard/stats');
        setStats(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Error al cargar métricas',
        );
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-72">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-72">
        <div className="text-center p-8 bg-red-50 rounded-2xl border border-red-200">
          <p className="text-red-700 font-semibold">{error}</p>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const avgOrderValue = stats.totalOrders > 0
    ? Math.round(stats.totalRevenue / stats.totalOrders)
    : 0;
  const conversionRate = stats.totalUsers > 0
    ? ((stats.totalOrders / stats.totalUsers) * 100).toFixed(1)
    : '0.0';

  const statCards = [
    {
      id: 'Ventas del día',
      label: 'Ventas del día',
      value: formatPrice(stats.dailyRevenue),
      hint: 'Ingreso generado hoy',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'Ventas del mes',
      label: 'Ventas del mes',
      value: formatPrice(stats.monthlyRevenue),
      hint: 'Ingreso acumulado del mes',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      id: 'Pedidos pendientes',
      label: 'Pedidos pendientes',
      value: stats.pendingOrders,
      hint: 'Órdenes por procesar',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'Usuarios registrados',
      label: 'Usuarios registrados',
      value: stats.totalUsers,
      hint: 'Cuentas creadas',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
      ),
    },
    {
      id: 'Órdenes totales',
      label: 'Órdenes totales',
      value: stats.totalOrders,
      hint: 'Histórico completo',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      ),
    },
  ];

  const insightDetail = {
    'Ventas del día': {
      title: 'Ingreso del día',
      description: `Ventas totales procesadas hoy: ${formatPrice(stats.dailyRevenue)}. Representa el ${stats.monthlyRevenue > 0 ? ((stats.dailyRevenue / stats.monthlyRevenue) * 100).toFixed(1) : 0}% del ingreso mensual.`,
    },
    'Ventas del mes': {
      title: 'Ingreso del mes',
      description: `Ventas acumuladas en el mes actual: ${formatPrice(stats.monthlyRevenue)}. Día promedio: ${formatPrice(avgOrderValue)} por orden.`,
    },
    'Pedidos pendientes': {
      title: 'Pedidos pendientes',
      description: `Tienes ${stats.pendingOrders} pedidos esperando procesamiento de ${stats.totalOrders} totales. Revisa el panel de órdenes para gestionarlos.`,
    },
    'Usuarios registrados': {
      title: 'Usuarios registrados',
      description: `${stats.totalUsers} usuarios registrados. Tasa de conversión general: ${conversionRate}% (${stats.totalOrders} órdenes entre ${stats.totalUsers} usuarios).`,
    },
    'Órdenes totales': {
      title: 'Órdenes totales',
      description: `La tienda ha procesado ${stats.totalOrders} órdenes. Valor promedio por orden: ${formatPrice(avgOrderValue)}. Ingreso total: ${formatPrice(stats.totalRevenue)}.`,
    },
  }[selectedInsight];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="min-h-screen">
        <main className="space-y-8">
          <section className="grid gap-4 xl:grid-cols-5">
            {statCards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => setSelectedInsight(card.id)}
                className={`group relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-8 shadow-lg shadow-slate-200/60 transition duration-300 ${
                  selectedInsight === card.id
                    ? 'ring-2 ring-blue-300/40'
                    : 'hover:-translate-y-1 hover:ring-2 hover:ring-slate-300/40'
                }`}
              >
                <div className="absolute inset-x-4 top-4 h-24 rounded-full blur-3xl opacity-60 bg-gradient-to-r from-sky-200/40 to-cyan-200/20"></div>
                <div className="relative flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                      {card.label}
                    </p>
                    <p className="mt-4 text-4xl font-bold text-slate-900">
                      {typeof card.value === 'number' ? card.value.toLocaleString('es-CO') : card.value}
                    </p>
                  </div>
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-900 shadow-inner shadow-slate-200/50">
                    {card.icon}
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between gap-4">
                  <p className="text-sm text-slate-500">{card.hint}</p>
                  <span className="text-sm text-blue-500">Ver</span>
                </div>
                <div className="mt-6 h-20 rounded-3xl bg-slate-100 p-3">
                  <div className="h-full rounded-3xl bg-gradient-to-r from-sky-300 to-cyan-300 opacity-90"></div>
                </div>
              </button>
            ))}
          </section>

          {stats.lowStockProducts.length > 0 && (
            <section className="rounded-[2rem] border border-red-200 bg-red-50 p-8 shadow-lg">
              <div className="flex items-center gap-3 mb-6">
                <span className="text-2xl">⚠️</span>
                <div>
                  <h2 className="text-xl font-bold text-red-800">
                    Alertas de inventario
                  </h2>
                  <p className="text-sm text-red-600">
                    {stats.lowStockProducts.filter((p) => p.stock <= 0).length > 0
                      ? `${stats.lowStockProducts.filter((p) => p.stock <= 0).length} producto(s) agotado(s)`
                      : `${stats.lowStockProducts.length} producto(s) con stock bajo`}
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                {stats.lowStockProducts.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between rounded-xl px-5 py-3 ${
                      p.stock <= 0
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={p.stock <= 0 ? 'text-red-600' : 'text-yellow-600'}>
                        {p.stock <= 0 ? '🚫' : '⚠️'}
                      </span>
                      <div>
                        <p className="font-semibold">{p.name}</p>
                        <p className="text-sm opacity-80">
                          {p.stock <= 0
                            ? 'Agotado'
                            : `Stock: ${p.stock} (límite: ${p.threshold})`}
                        </p>
                      </div>
                    </div>
                    <a
                      href={`/admin/products/edit/${p.id}`}
                      className="text-sm font-medium underline hover:no-underline"
                    >
                      Reponer
                    </a>
                  </div>
                ))}
              </div>
            </section>
          )}

          {insightDetail && (
            <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-lg shadow-slate-200/60 transition-all duration-300">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                    Detalle seleccionado
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold text-slate-900">
                    {insightDetail.title}
                  </h2>
                </div>
                <span className="rounded-full bg-slate-50 px-3 py-1 text-sm font-semibold text-blue-600 ring-1 ring-blue-100">
                  {selectedInsight}
                </span>
              </div>
              <p className="mt-4 max-w-3xl text-slate-600 whitespace-pre-line">
                {insightDetail.description}
              </p>
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[1.8fr_1.2fr]">
            <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-lg shadow-slate-200/70">
              <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
                    Métricas clave
                  </p>
                  <h2 className="mt-3 text-3xl font-bold text-slate-900">
                    Resumen general
                  </h2>
                </div>
                <div className="rounded-3xl bg-slate-50 px-5 py-3 text-sm uppercase tracking-[0.2em] text-blue-600 shadow-inner shadow-blue-100">
                  Datos reales
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 mb-6">
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50">
                  <p className="text-sm text-slate-500">Valor promedio por orden</p>
                  <p className="mt-3 text-2xl font-semibold text-slate-900">{formatPrice(avgOrderValue)}</p>
                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${Math.min((avgOrderValue / 500000) * 100, 100)}%` }} />
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50">
                  <p className="text-sm text-slate-500">Tasa de conversión</p>
                  <p className="mt-3 text-2xl font-semibold text-slate-900">{conversionRate}%</p>
                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-purple-400 to-fuchsia-500" style={{ width: `${Math.min(Number(conversionRate) * 10, 100)}%` }} />
                  </div>
                </div>
              </div>

              <div className="relative mx-auto flex h-[420px] w-[420px] items-center justify-center rounded-full bg-slate-100 shadow-[0_0_120px_rgba(56,189,248,0.12)]">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-sky-200/40 via-cyan-100/40 to-transparent blur-3xl"></div>
                <div className="absolute h-[360px] w-[360px] rounded-full border border-slate-200"></div>
                <div className="absolute h-[280px] w-[280px] rounded-full border border-slate-300"></div>
                <div className="absolute h-[200px] w-[200px] rounded-full border border-slate-300/70"></div>
                <div className="relative flex h-[180px] w-[180px] items-center justify-center rounded-full bg-white text-center text-slate-900 shadow-xl shadow-slate-200/40">
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-blue-600">
                      Ingreso total
                    </p>
                    <p className="mt-1 text-3xl font-extrabold text-slate-900">{formatPrice(stats.totalRevenue)}</p>
                    <p className="mt-1 text-xs text-slate-500">{stats.totalOrders} órdenes</p>
                  </div>
                </div>
              </div>
            </section>

            <div className="space-y-6">
              <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-lg shadow-slate-200/60">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
                      Productos más vendidos
                    </p>
                    <h3 className="mt-3 text-2xl font-bold text-slate-900">
                      Top {stats.topProducts.length}
                    </h3>
                  </div>
                  <span className="rounded-full bg-slate-50 px-3 py-1 text-sm uppercase tracking-[0.2em] text-blue-600">
                    En vivo
                  </span>
                </div>
                <div className="space-y-4">
                  {stats.topProducts.length === 0 ? (
                    <p className="text-slate-500 text-sm text-center py-8">Aún no hay ventas</p>
                  ) : (
                    stats.topProducts.map((product, i) => {
                      const maxRevenue = Math.max(...stats.topProducts.map(p => p.revenue));
                      const widthPercent = maxRevenue > 0 ? (product.revenue / maxRevenue) * 100 : 0;
                      return (
                        <div key={product.id} className="rounded-3xl border border-slate-200 bg-white p-6 transition hover:border-sky-300/50">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                                {i + 1}
                              </span>
                              <div>
                                <p className="text-sm text-slate-500">{product.name}</p>
                                <p className="mt-1 text-xl font-semibold text-slate-900">
                                  {formatPrice(product.revenue)}
                                </p>
                              </div>
                            </div>
                            <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-slate-100 text-sm font-semibold text-blue-600">
                              {product.totalSold} uds
                            </div>
                          </div>
                          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-cyan-400" style={{ width: `${widthPercent}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-lg shadow-slate-200/60">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-slate-400">
                      Pedidos recientes
                    </p>
                    <h3 className="mt-3 text-2xl font-bold text-slate-900">
                      Actividad de pedidos
                    </h3>
                  </div>
                  <span className="rounded-full bg-slate-50 px-3 py-1 text-sm uppercase tracking-[0.2em] text-emerald-600">
                    Tiempo real
                  </span>
                </div>
                <div className="space-y-4">
                  {stats.recentOrders.length === 0 ? (
                    <p className="text-slate-500 text-sm text-center py-8">No hay pedidos recientes</p>
                  ) : (
                    stats.recentOrders.map((order) => (
                      <div key={order.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5 transition hover:border-sky-300/50">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold text-slate-900">Pedido {order.id.slice(0, 8)}...</p>
                            <p className="text-sm text-slate-500">{order.customerName}</p>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            order.status === 'PENDING' ? 'bg-orange-100 text-orange-600' :
                            order.status === 'PAID' ? 'bg-blue-100 text-blue-700' :
                            order.status === 'SHIPPED' ? 'bg-purple-100 text-purple-700' :
                            order.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {order.status === 'PENDING' ? 'Pendiente' :
                             order.status === 'PAID' ? 'Pagado' :
                             order.status === 'SHIPPED' ? 'Enviado' :
                             order.status === 'DELIVERED' ? 'Entregado' :
                             'Cancelado'}
                          </span>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-4 text-sm text-slate-500">
                          <p>{formatDate(order.createdAt)}</p>
                          <p className="font-semibold text-slate-900">{formatPrice(order.total)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
