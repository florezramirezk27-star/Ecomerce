'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Plus, FileText } from 'lucide-react';

const periods = ['Hoy', 'Ayer', 'Últimos 7 Días', 'Mes Actual'] as const;

const monthlyData = [
  { day: '1', ventas: 120000, pedidos: 3, trafico: 45 },
  { day: '3', ventas: 85000, pedidos: 2, trafico: 38 },
  { day: '5', ventas: 200000, pedidos: 5, trafico: 72 },
  { day: '7', ventas: 95000, pedidos: 2, trafico: 41 },
  { day: '9', ventas: 310000, pedidos: 7, trafico: 95 },
  { day: '11', ventas: 145000, pedidos: 4, trafico: 55 },
  { day: '13', ventas: 220000, pedidos: 6, trafico: 68 },
  { day: '15', ventas: 175000, pedidos: 4, trafico: 62 },
  { day: '17', ventas: 400000, pedidos: 9, trafico: 120 },
  { day: '19', ventas: 250000, pedidos: 6, trafico: 88 },
  { day: '21', ventas: 320000, pedidos: 8, trafico: 105 },
  { day: '23', ventas: 280000, pedidos: 7, trafico: 92 },
  { day: '25', ventas: 150000, pedidos: 3, trafico: 50 },
  { day: '27', ventas: 340000, pedidos: 8, trafico: 110 },
  { day: '29', ventas: 200000, pedidos: 5, trafico: 75 },
];

export default function PerformanceChart() {
  const [selectedPeriod, setSelectedPeriod] = useState<string>('Mes Actual');

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400 font-medium">
            Rendimiento
          </p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            Rendimiento Mensual Detallado
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
            {periods.map((p) => (
              <button
                key={p}
                onClick={() => setSelectedPeriod(p)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-medium transition ${
                  selectedPeriod === p
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-1.5 rounded-2xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700">
            <Plus className="h-3.5 w-3.5" />
            Nuevo Pedido
          </button>
          <button className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50">
            <FileText className="h-3.5 w-3.5" />
            Reporte
          </button>
        </div>
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={monthlyData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 12, fill: '#94a3b8' }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              tickFormatter={(v: any) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                padding: '12px 16px',
                background: 'white',
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => {
                if (name === 'ventas') return [formatCurrency(value), 'Ventas'];
                if (name === 'trafico') return [`${value}`, 'Tráfico'];
                return [value, name === 'pedidos' ? 'Pedidos' : name];
              }}
              labelFormatter={(label) => `Día ${label}`}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => {
                const labels: Record<string, string> = {
                  ventas: 'Ventas',
                  pedidos: 'Pedidos',
                  trafico: 'Tráfico',
                };
                return <span className="text-slate-600">{labels[value] || value}</span>;
              }}
            />
            <Line
              type="monotone"
              dataKey="ventas"
              stroke="#22d3ee"
              strokeWidth={2}
              dot={{ r: 3, fill: '#22d3ee', strokeWidth: 0 }}
              activeDot={{ r: 5, fill: '#22d3ee', stroke: 'white', strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="pedidos"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }}
              activeDot={{ r: 5, fill: '#3b82f6', stroke: 'white', strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="trafico"
              stroke="#94a3b8"
              strokeWidth={2}
              dot={{ r: 3, fill: '#94a3b8', strokeWidth: 0 }}
              activeDot={{ r: 5, fill: '#94a3b8', stroke: 'white', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
