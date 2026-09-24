'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
import { apiFetch } from '@/lib/admin';

const periods = ['Hoy', 'Ayer', 'Últimos 7 Días', 'Mes Actual'] as const;

const periodParam: Record<(typeof periods)[number], string> = {
  'Hoy': 'today',
  'Ayer': 'yesterday',
  'Últimos 7 Días': '7days',
  'Mes Actual': 'month',
};

interface PerformancePoint {
  label: string;
  ventas: number;
  pedidos: number;
}

interface PerformanceResponse {
  period: string;
  mode: 'hour' | 'day';
  points: PerformancePoint[];
}

export default function PerformanceChart() {
  const [selectedPeriod, setSelectedPeriod] =
    useState<(typeof periods)[number]>('Mes Actual');
  const [data, setData] = useState<PerformancePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const result = (await apiFetch(
          `/dashboard/performance?period=${periodParam[selectedPeriod]}`,
        )) as PerformanceResponse;
        setData(result.points);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Error al cargar el rendimiento',
        );
        setData([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedPeriod]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(v);

  const formatShort = (v: number) =>
    v >= 1_000_000
      ? `${(v / 1_000_000).toFixed(1)}M`
      : v >= 1_000
        ? `${(v / 1_000).toFixed(0)}k`
        : `${v}`;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Rendimiento
          </p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            Ventas y Pedidos
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <Link
            href="/admin/orders"
            className="flex items-center gap-1.5 rounded-2xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo Pedido
          </Link>
          <Link
            href="/admin/orders"
            className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            <FileText className="h-3.5 w-3.5" />
            Reporte
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="h-72">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Cargando datos...
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Aún no hay ventas en este período.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
              />
              <YAxis
                yAxisId="ventas"
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => formatShort(v)}
                width={60}
              />
              <YAxis
                yAxisId="pedidos"
                orientation="right"
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                width={40}
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
                  if (name === 'ventas') return [formatCurrency(Number(value)), 'Ventas'];
                  return [value, name === 'pedidos' ? 'Pedidos' : name];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any) => (
                  <span className="text-slate-600">
                    {value === 'ventas' ? 'Ventas (COP)' : 'Pedidos'}
                  </span>
                )}
              />
              <Line
                type="monotone"
                yAxisId="ventas"
                dataKey="ventas"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={{ r: 3, fill: '#22d3ee', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#22d3ee', stroke: 'white', strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                yAxisId="pedidos"
                dataKey="pedidos"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#3b82f6', stroke: 'white', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}