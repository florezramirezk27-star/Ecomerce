'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  MessageSquare,
  PackageX,
  Search,
} from 'lucide-react';
import { apiFetch, DashboardStats } from '@/lib/admin';

export default function DashboardHeader() {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch('/dashboard/stats')
      .then((data: DashboardStats) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const lowStock = stats?.lowStockProducts ?? [];
  const totalNotifs =
    (stats?.pendingOrders ?? 0) + lowStock.length;

  return (
    <header className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm shadow-slate-200/40">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 text-white text-sm font-bold shadow-sm">
            K
          </div>
          <span className="hidden text-lg font-bold text-slate-900 sm:inline">
            Kronio Market
          </span>
        </div>
      </div>

      <div className="relative hidden max-w-md flex-1 md:block">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar productos, pedidos, clientes..."
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-11 pr-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative" ref={panelRef}>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Notificaciones"
            className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-blue-600"
          >
            <Bell className="h-5 w-5" />
            {totalNotifs > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                {totalNotifs > 99 ? '99+' : totalNotifs}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-bold text-slate-900">Notificaciones</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                  {totalNotifs} {totalNotifs === 1 ? 'pendiente' : 'pendientes'}
                </span>
              </div>

              <div className="max-h-80 overflow-y-auto p-2">
                {loading ? (
                  <p className="px-3 py-4 text-center text-sm text-slate-400">
                    Cargando...
                  </p>
                ) : totalNotifs === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                      <CheckCircle2 className="h-5 w-5" />
                    </span>
                    <p className="text-sm font-medium text-slate-700">
                      Todo en orden
                    </p>
                    <p className="text-xs text-slate-400">
                      Sin pedidos pendientes ni stock bajo.
                    </p>
                  </div>
                ) : (
                  <>
                    {(stats?.pendingOrders ?? 0) > 0 && (
                      <div className="mb-1 px-1">
                        <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Pedidos
                        </p>
                        <Link
                          href="/admin/orders"
                          onClick={() => setOpen(false)}
                          className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50"
                        >
                          <span className="flex items-center gap-3">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                              <MessageSquare className="h-4 w-4" />
                            </span>
                            <span className="text-sm font-medium text-slate-700">
                              {stats?.pendingOrders}{' '}
                              {stats?.pendingOrders === 1
                                ? 'pedido por procesar'
                                : 'pedidos por procesar'}
                            </span>
                          </span>
                          <ChevronRight className="h-4 w-4 text-slate-300" />
                        </Link>
                      </div>
                    )}

                    {lowStock.length > 0 && (
                      <div className="mb-1 px-1">
                        <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Stock bajo
                        </p>
                        {lowStock.slice(0, 5).map((p) => (
                          <Link
                            key={p.id}
                            href={`/admin/products/edit/${p.id}`}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50"
                          >
                            <span
                              className={
                                p.stock <= 0
                                  ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600'
                                  : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600'
                              }
                            >
                              {p.stock <= 0 ? (
                                <PackageX className="h-4 w-4" />
                              ) : (
                                <AlertTriangle className="h-4 w-4" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-slate-700">
                                {p.name}
                              </span>
                              <span className="block text-xs text-slate-400">
                                {p.stock <= 0
                                  ? 'Agotado'
                                  : `${p.stock} uds restantes`}
                              </span>
                            </span>
                          </Link>
                        ))}
                        {lowStock.length > 5 && (
                          <Link
                            href="/admin/products"
                            onClick={() => setOpen(false)}
                            className="block px-3 py-1.5 text-xs font-medium text-blue-600 transition hover:text-blue-700"
                          >
                            Ver {lowStock.length - 5} más...
                          </Link>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="border-t border-slate-100 p-2">
                <Link
                  href="/admin/orders"
                  onClick={() => setOpen(false)}
                  className="block rounded-xl bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  Gestionar pedidos
                </Link>
              </div>
            </div>
          )}
        </div>

        <Link
          href="/admin/orders"
          className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-blue-600"
          aria-label="Pedidos"
        >
          <MessageSquare className="h-5 w-5" />
        </Link>

        <div className="ml-2 flex items-center gap-3 border-l border-slate-200 pl-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-slate-900">Admin</p>
            <p className="text-xs text-slate-500">Administrador</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 text-white text-sm font-bold shadow-sm">
            A
          </div>
        </div>
      </div>
    </header>
  );
}