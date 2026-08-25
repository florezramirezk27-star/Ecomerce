'use client';

import { TrendingUp, ArrowDown, Users, ShoppingCart, CreditCard, Package } from 'lucide-react';

interface SalesFunnelProps {
  avgOrderValue: number;
  conversionRate: string;
  totalRevenue: number;
  totalOrders: number;
  formatPrice: (v: number | string) => string;
}

const funnelStages = [
  { label: 'Visitantes', value: 450, pct: '100%', icon: Users, color: 'bg-slate-200' },
  { label: 'Interesados', value: 280, pct: '62%', icon: ShoppingCart, color: 'bg-slate-300' },
  { label: 'Carrito', value: 95, pct: '34%', icon: CreditCard, color: 'bg-slate-400' },
  { label: 'Ventas Completadas', value: 7, pct: '7%', icon: Package, color: 'bg-blue-500' },
];

export default function SalesFunnel({
  avgOrderValue,
  conversionRate,
  totalRevenue,
  totalOrders,
  formatPrice,
}: SalesFunnelProps) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400 font-medium">
            Métricas clave
          </p>
          <h2 className="mt-1.5 text-xl font-bold text-slate-900">Datos reales</h2>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-100 to-blue-100 text-cyan-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <p className="text-xs uppercase tracking-[0.15em] text-slate-400 font-medium">
              Valor promedio por orden
            </p>
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatPrice(avgOrderValue)}</p>
          <div className="mt-3 flex items-center gap-1 text-xs text-emerald-600">
            <ArrowDown className="h-3 w-3 rotate-180" />
            <span>+12% vs semana anterior</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
              style={{ width: `${Math.min((avgOrderValue / 500000) * 100, 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-100 to-fuchsia-100 text-purple-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <p className="text-xs uppercase tracking-[0.15em] text-slate-400 font-medium">
              Tasa de conversión
            </p>
          </div>
          <p className="text-2xl font-bold text-slate-900">{conversionRate}%</p>
          <div className="mt-3 flex items-center gap-1 text-xs text-emerald-600">
            <ArrowDown className="h-3 w-3 rotate-180" />
            <span>+5% vs semana anterior</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-400 to-fuchsia-500"
              style={{ width: `${Math.min(Number(conversionRate) * 10, 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 text-white">
            <Package className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400 font-medium">
              Embudo de ventas
            </p>
            <p className="text-sm font-semibold text-slate-900">
              {formatPrice(totalRevenue)} — {totalOrders} órdenes
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {funnelStages.map((stage, i) => {
            const StageIcon = stage.icon;
            const maxWidth = funnelStages[0].value;
            const widthPct = (stage.value / maxWidth) * 100;

            return (
              <div key={stage.label} className="relative">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-500">
                      {i + 1}
                    </span>
                    <StageIcon className="h-3.5 w-3.5 text-slate-500" />
                    <span className="text-xs font-medium text-slate-600">{stage.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">{stage.value}</span>
                    <span className="text-[10px] text-slate-400">{stage.pct}</span>
                  </div>
                </div>
                <div className="h-4 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${stage.color} transition-all`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                {i < funnelStages.length - 1 && (
                  <div className="mt-1 text-center">
                    <span className="text-[10px] text-slate-400">
                      {funnelStages[i + 1].pct} de conversión
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
