'use client';

import { DollarSign, TrendingUp, Clock, Users, ShoppingBag } from 'lucide-react';
import type { DashboardStats } from '@/lib/admin';

interface MetricCardsProps {
  stats: DashboardStats;
  selectedInsight: string;
  onSelectInsight: (id: string) => void;
  formatPrice: (v: number | string) => string;
}

export default function MetricCards({
  stats,
  selectedInsight,
  onSelectInsight,
  formatPrice,
}: MetricCardsProps) {
  const cards = [
    {
      id: 'Ventas del día',
      label: 'Ventas del día',
      value: formatPrice(stats.dailyRevenue),
      hint: 'Ingreso generado hoy',
      icon: DollarSign,
      color: 'from-cyan-400 to-blue-500',
      chart: (
        <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="3" />
          <circle
            cx="18" cy="18" r="15.5"
            fill="none" stroke="url(#dailyGrad)"
            strokeWidth="3"
            strokeDasharray={`${Math.min((stats.dailyRevenue / Math.max(stats.monthlyRevenue, 1)) * 100, 100)} 100`}
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="dailyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
        </svg>
      ),
    },
    {
      id: 'Ventas del mes',
      label: 'Ventas del mes',
      value: formatPrice(stats.monthlyRevenue),
      hint: 'Ingreso acumulado del mes',
      icon: TrendingUp,
      color: 'from-blue-400 to-indigo-500',
      chart: (
        <div className="flex h-16 items-end gap-0.5">
          {[35, 45, 30, 55, 40, 60, 50, 70, 55, 75, 65, 85, 70, 90, 80, 95, 85, 78, 92].map((h, i) => (
            <div
              key={i}
              className="w-1.5 rounded-t-sm bg-gradient-to-t from-blue-400 to-indigo-400 opacity-70"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      ),
    },
    {
      id: 'Pedidos pendientes',
      label: 'Pedidos pendientes',
      value: stats.pendingOrders,
      hint: 'Órdenes por procesar',
      icon: Clock,
      color: 'from-amber-400 to-orange-500',
      chart: (
        <svg viewBox="0 0 100 40" className="h-12 w-24">
          <polyline
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points="0,30 10,25 20,28 30,18 40,22 50,12 60,16 70,8 80,10 90,5 100,8"
          />
        </svg>
      ),
    },
    {
      id: 'Usuarios registrados',
      label: 'Usuarios registrados',
      value: stats.totalUsers,
      hint: 'Cuentas creadas',
      icon: Users,
      color: 'from-purple-400 to-fuchsia-500',
      chart: (
        <svg viewBox="0 0 100 40" className="h-12 w-24">
          <polyline
            fill="none"
            stroke="#a855f7"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points="0,35 15,30 30,32 45,25 60,28 75,20 90,22 100,18"
          />
        </svg>
      ),
    },
    {
      id: 'Órdenes totales',
      label: 'Órdenes totales',
      value: stats.totalOrders,
      hint: 'Histórico completo',
      icon: ShoppingBag,
      color: 'from-emerald-400 to-green-500',
      chart: (
        <div className="flex h-16 items-end gap-0.5">
          {[20, 40, 35, 55, 45, 65, 50, 70, 60].map((h, i) => (
            <div
              key={i}
              className="w-2 rounded-t-sm bg-gradient-to-t from-emerald-400 to-green-400 opacity-70"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      ),
    },
  ];

  return (
    <section className="grid gap-4 xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;
        const isSelected = selectedInsight === card.id;
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelectInsight(card.id)}
            className={`group relative overflow-hidden rounded-[2rem] border bg-white p-6 shadow-lg shadow-slate-200/60 transition-all duration-300 ${
              isSelected
                ? 'border-blue-200 ring-2 ring-blue-200/50'
                : 'border-slate-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl'
            }`}
          >
            <div className="absolute inset-x-0 top-0 h-32 rounded-full blur-3xl opacity-40 bg-gradient-to-r from-sky-100 to-cyan-100" />

            <div className="relative flex items-start justify-between">
              <div className="flex-1">
                <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400 font-medium">
                  {card.label}
                </p>
                <p className="mt-3 text-3xl font-bold text-slate-900">
                  {typeof card.value === 'number'
                    ? card.value.toLocaleString('es-CO')
                    : card.value}
                </p>
                <p className="mt-1.5 text-xs text-slate-500">{card.hint}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 shadow-inner">
                <Icon className="h-6 w-6" />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center opacity-80">
              {card.chart}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <span className={`text-xs font-medium ${isSelected ? 'text-blue-600' : 'text-slate-400'}`}>
                {isSelected ? 'Seleccionado' : 'Ver detalles'}
              </span>
            </div>
          </button>
        );
      })}
    </section>
  );
}
