'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, PackageX } from 'lucide-react';
import {
  apiFetch,
  DashboardStats,
  formatPrice,
  formatDate,
} from '@/lib/admin';
import { Alert, Badge, Card, LoadingState } from '@/components/admin/ui';
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
    return <LoadingState label="Cargando dashboard..." />;
  }

  if (error) {
    return (
      <div className="flex justify-center p-16">
        <Alert type="error">{error}</Alert>
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
    <div className="space-y-6">
      <DashboardHeader />

      <MetricCards
        stats={stats}
        selectedInsight={selectedInsight}
        onSelectInsight={setSelectedInsight}
        formatPrice={formatPrice}
      />

      {stats.lowStockProducts.length > 0 && (
        <section className="rounded-2xl border border-red-200 bg-red-50/60 p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-red-800">
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
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={
                      p.stock <= 0
                        ? 'flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600'
                        : 'flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600'
                    }
                  >
                    {p.stock <= 0 ? (
                      <PackageX className="h-4 w-4" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                    <p className="text-xs text-slate-500">
                      {p.stock <= 0
                        ? 'Agotado'
                        : `Stock: ${p.stock} (límite: ${p.threshold})`}
                    </p>
                  </div>
                </div>
                <a
                  href={`/admin/products/edit/${p.id}`}
                  className="shrink-0 text-xs font-medium text-red-600 underline-offset-2 transition hover:text-red-700 hover:underline"
                >
                  Reponer
                </a>
              </div>
            ))}
          </div>
        </section>
      )}

      {insightDetail && (
        <Card className="p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Detalle seleccionado
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">
                {insightDetail.title}
              </h2>
            </div>
            <div>
              <Badge tone="blue">{selectedInsight}</Badge>
            </div>
          </div>
          <p className="mt-3 max-w-3xl whitespace-pre-line text-sm text-slate-600">
            {insightDetail.description}
          </p>
        </Card>
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
  );
}