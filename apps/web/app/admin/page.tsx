'use client';

import { useEffect, useState } from 'react';
import {
  apiFetch,
  DashboardStats,
  formatPrice,
  formatDate,
} from '@/lib/admin';
import DashboardHeader from '@/components/admin/DashboardHeader';
import MetricCards from '@/components/admin/MetricCards';
import PerformanceChart from '@/components/admin/PerformanceChart';
import TopProducts from '@/components/admin/TopProducts';
import RecentOrders from '@/components/admin/RecentOrders';
import SalesFunnel from '@/components/admin/SalesFunnel';

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
      <div className="space-y-6">
        <DashboardHeader />

        <MetricCards
          stats={stats}
          selectedInsight={selectedInsight}
          onSelectInsight={setSelectedInsight}
          formatPrice={formatPrice}
        />

        {stats.lowStockProducts.length > 0 && (
          <section className="rounded-[2rem] border border-red-200 bg-red-50 p-6 shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-lg">
                ⚠️
              </span>
              <div>
                <h2 className="text-lg font-bold text-red-800">
                  Alertas de inventario
                </h2>
                <p className="text-sm text-red-600">
                  {stats.lowStockProducts.filter((p) => p.stock <= 0).length > 0
                    ? `${stats.lowStockProducts.filter((p) => p.stock <= 0).length} producto(s) agotado(s)`
                    : `${stats.lowStockProducts.length} producto(s) con stock bajo`}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {stats.lowStockProducts.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 ${
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
                      <p className="font-semibold text-sm">{p.name}</p>
                      <p className="text-xs opacity-80">
                        {p.stock <= 0
                          ? 'Agotado'
                          : `Stock: ${p.stock} (límite: ${p.threshold})`}
                      </p>
                    </div>
                  </div>
                  <a
                    href={`/admin/products/edit/${p.id}`}
                    className="text-xs font-medium underline hover:no-underline"
                  >
                    Reponer
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}

        {insightDetail && (
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400 font-medium">
                  Detalle seleccionado
                </p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">
                  {insightDetail.title}
                </h2>
              </div>
              <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600 ring-1 ring-blue-200">
                {selectedInsight}
              </span>
            </div>
            <p className="mt-3 max-w-3xl text-sm text-slate-600 whitespace-pre-line">
              {insightDetail.description}
            </p>
          </div>
        )}

        <PerformanceChart />

        <div className="grid gap-6 xl:grid-cols-[1.8fr_1.2fr]">
          <SalesFunnel
            avgOrderValue={avgOrderValue}
            conversionRate={conversionRate}
            totalRevenue={stats.totalRevenue}
            totalOrders={stats.totalOrders}
            formatPrice={formatPrice}
          />

          <div className="space-y-6">
            <TopProducts
              products={stats.topProducts}
              formatPrice={formatPrice}
            />
            <RecentOrders
              orders={stats.recentOrders}
              formatDate={formatDate}
              formatPrice={formatPrice}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
