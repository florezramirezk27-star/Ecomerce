'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  PackageX,
  RefreshCw,
  Search,
  ShoppingBag,
  UserPlus,
  Users,
  WifiOff,
} from 'lucide-react';
import { timeAgo } from '@/lib/admin';
import {
  AdminNotificationItem,
  AdminNotificationSection,
  buildAdminNotifications,
  useAdminDashboard,
} from '@/lib/useAdminDashboard';

const SECTION_META: Record<
  AdminNotificationSection,
  { label: string; icon: typeof ShoppingBag; accent: string }
> = {
  orders: {
    label: 'Pedidos',
    icon: ShoppingBag,
    accent: 'bg-amber-50 text-amber-600',
  },
  users: {
    label: 'Registro de usuarios',
    icon: UserPlus,
    accent: 'bg-emerald-50 text-emerald-600',
  },
  stock: {
    label: 'Stock bajo',
    icon: AlertTriangle,
    accent: 'bg-red-50 text-red-600',
  },
};

const SECTION_ORDER: AdminNotificationSection[] = ['orders', 'users', 'stock'];
const SECTION_LIMIT = 5;

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function notificationIcon(item: AdminNotificationItem) {
  if (item.section === 'orders') {
    return <ShoppingBag className="h-4 w-4" />;
  }
  if (item.section === 'users') {
    return <UserPlus className="h-4 w-4" />;
  }
  return item.subtitle === 'Agotado' ? (
    <PackageX className="h-4 w-4" />
  ) : (
    <AlertTriangle className="h-4 w-4" />
  );
}

export default function DashboardHeader() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { stats, recentUsers, loading, refreshing, error, updatedAt, refresh } =
    useAdminDashboard();
  const now = useNow();

  const notifications = useMemo(
    () => buildAdminNotifications(stats, recentUsers),
    [stats, recentUsers],
  );

  const handleToggle = useCallback(() => {
    setOpen((prev) => {
      if (!prev) refresh();
      return !prev;
    });
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hasData = stats !== null;
  const updatedLabel = updatedAt ? timeAgo(new Date(updatedAt).toISOString(), now) : '';
  const isStale = Boolean(error) && hasData;

  return (
    <header className="relative z-30 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm shadow-slate-200/40">
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
            ref={buttonRef}
            onClick={handleToggle}
            aria-label="Notificaciones"
            aria-expanded={open}
            aria-haspopup="dialog"
            className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-blue-600"
          >
            <Bell className="h-5 w-5" />
            {notifications.total > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                {notifications.total > 99 ? '99+' : notifications.total}
              </span>
            )}
            {refreshing && (
              <span className="absolute -bottom-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-white ring-2 ring-slate-100">
                <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />
              </span>
            )}
          </button>

          {open && (
            <div
              role="dialog"
              aria-label="Notificaciones"
              className="absolute right-0 top-full z-50 mt-2 w-[22rem] max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">
                    Notificaciones
                  </p>
                  <p className="truncate text-[11px] text-slate-400">
                    {updatedLabel
                      ? `Actualizado ${updatedLabel}`
                      : 'Sincronizando...'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                    {notifications.total}{' '}
                    {notifications.total === 1 ? 'pendiente' : 'pendientes'}
                  </span>
                  <button
                    onClick={refresh}
                    aria-label="Actualizar notificaciones"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-blue-600"
                  >
                    <RefreshCw
                      className={
                        refreshing ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'
                      }
                    />
                  </button>
                </div>
              </div>

              {isStale && (
                <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2.5">
                  <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-amber-800">
                      No se pudo actualizar. Estos datos son de{' '}
                      {updatedLabel || 'una carga anterior'}.
                    </p>
                    <button
                      onClick={refresh}
                      className="mt-0.5 text-xs font-semibold text-amber-700 underline underline-offset-2 hover:text-amber-900"
                    >
                      Reintentar
                    </button>
                  </div>
                </div>
              )}

              <div className="max-h-96 overflow-y-auto p-2">
                {loading && !hasData ? (
                  <p className="px-3 py-4 text-center text-sm text-slate-400">
                    Cargando...
                  </p>
                ) : !hasData && error ? (
                  <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
                      <WifiOff className="h-5 w-5" />
                    </span>
                    <p className="text-sm font-medium text-slate-700">
                      No se pudieron cargar las notificaciones
                    </p>
                    <p className="max-w-[16rem] text-xs text-slate-400">
                      {error}
                    </p>
                    <button
                      onClick={refresh}
                      className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Reintentar
                    </button>
                  </div>
                ) : notifications.total === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                      <CheckCircle2 className="h-5 w-5" />
                    </span>
                    <p className="text-sm font-medium text-slate-700">
                      Todo en orden
                    </p>
                    <p className="text-xs text-slate-400">
                      Sin pedidos pendientes, registros recientes ni stock bajo.
                    </p>
                  </div>
                ) : (
                  SECTION_ORDER.map((section) => {
                    const sectionItems = notifications.items.filter(
                      (item) => item.section === section,
                    );
                    if (sectionItems.length === 0) return null;

                    const meta = SECTION_META[section];
                    const SectionIcon = meta.icon;
                    const visible = sectionItems.slice(0, SECTION_LIMIT);
                    const overflow = sectionItems.length - visible.length;
                    const moreHref =
                      section === 'stock' ? '/admin/products' : visible[0].href;

                    return (
                      <div key={section} className="mb-1 px-1">
                        <div className="flex items-center gap-2 px-2 pb-1 pt-2">
                          <SectionIcon className="h-3 w-3 text-slate-400" />
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            {meta.label}
                          </p>
                          <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500">
                            {notifications.counts[section]}
                          </span>
                        </div>

                        {visible.map((item) => (
                          <Link
                            key={item.id}
                            href={item.href}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50"
                          >
                            <span
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.accent}`}
                            >
                              {notificationIcon(item)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-slate-700">
                                {item.title}
                              </span>
                              <span className="block truncate text-xs text-slate-400">
                                {item.subtitle}
                              </span>
                            </span>
                            {item.createdAt && (
                              <span className="shrink-0 text-[10px] font-medium text-slate-300">
                                {timeAgo(item.createdAt, now)}
                              </span>
                            )}
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                          </Link>
                        ))}

                        {overflow > 0 && (
                          <Link
                            href={moreHref}
                            onClick={() => setOpen(false)}
                            className="block px-3 py-1.5 text-xs font-medium text-blue-600 transition hover:text-blue-700"
                          >
                            Ver {overflow} más...
                          </Link>
                        )}

                        {section === 'orders' && notifications.hiddenOrders > 0 && (
                          <Link
                            href="/admin/orders"
                            onClick={() => setOpen(false)}
                            className="block px-3 py-1.5 text-xs font-medium text-blue-600 transition hover:text-blue-700"
                          >
                            {notifications.counts.orders} pedidos en total,{' '}
                            {notifications.hiddenOrders} no aparecen aquí
                          </Link>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-slate-100 p-2">
                <Link
                  href="/admin/users"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  <Users className="h-3.5 w-3.5" />
                  Usuarios
                </Link>
                <Link
                  href="/admin/orders"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  <ShoppingBag className="h-3.5 w-3.5" />
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
          <ShoppingBag className="h-5 w-5" />
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
