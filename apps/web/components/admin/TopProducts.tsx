'use client';

import { ShoppingCart } from 'lucide-react';
import type { DashboardTopProduct } from '@/lib/admin';

interface TopProductsProps {
  products: DashboardTopProduct[];
  formatPrice: (v: number | string) => string;
}

const productImages: Record<string, string> = {
  'Chaqueta Impermeable Hombre': 'https://picsum.photos/seed/prod2/100/100',
  'Camiseta Oversize Algodón': 'https://picsum.photos/seed/prod1/100/100',
  'Pantalón Jogger Premium': 'https://picsum.photos/seed/prod3/100/100',
};

export default function TopProducts({ products, formatPrice }: TopProductsProps) {
  if (products.length === 0) {
    return (
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60">
        <p className="text-center py-12 text-sm text-slate-500">Aún no hay ventas</p>
      </section>
    );
  }

  const maxRevenue = Math.max(...products.map((p) => p.revenue));

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400 font-medium">
            Productos más vendidos
          </p>
          <h3 className="mt-1.5 text-xl font-bold text-slate-900">
            Top {products.length}
          </h3>
        </div>
        <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-600 ring-1 ring-cyan-200">
          En vivo
        </span>
      </div>

      <div className="space-y-3">
        {products.map((product, i) => {
          const widthPercent = maxRevenue > 0 ? (product.revenue / maxRevenue) * 100 : 0;
          const imgSrc = productImages[product.name] || `https://picsum.photos/seed/${product.id}/100/100`;

          return (
            <div
              key={product.id}
              className="group rounded-2xl border border-slate-100 bg-white p-4 transition hover:border-cyan-200 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  <img
                    src={imgSrc}
                    alt={product.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                    {i + 1}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {product.name}
                  </p>
                  <p className="text-sm font-medium text-slate-700">
                    {formatPrice(product.revenue)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                  <ShoppingCart className="h-3.5 w-3.5" />
                  {product.totalSold} uds
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all"
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
