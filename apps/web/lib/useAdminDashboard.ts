'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { apiFetch, DashboardStats, User, formatPrice } from './admin';

const POLL_INTERVAL_MS = 60_000;
const RECENT_USERS_LIMIT = 50;
const NEW_USER_WINDOW_MS = 24 * 60 * 60 * 1000;

interface AdminDashboardState {
  stats: DashboardStats | null;
  recentUsers: User[];
  loading: boolean;
  refreshing: boolean;
  error: string;
  updatedAt: number | null;
}

const initialState: AdminDashboardState = {
  stats: null,
  recentUsers: [],
  loading: true,
  refreshing: false,
  error: '',
  updatedAt: null,
};

let state = initialState;
let inFlight: Promise<void> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let subscribers = 0;

const listeners = new Set<() => void>();

function emit(patch: Partial<AdminDashboardState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => initialState;

async function load() {
  if (inFlight) return inFlight;

  const firstLoad = state.stats === null;
  emit({ loading: firstLoad, refreshing: !firstLoad });

  inFlight = (async () => {
    const [statsResult, usersResult] = await Promise.allSettled([
      apiFetch('/dashboard/stats'),
      apiFetch(`/users?page=1&limit=${RECENT_USERS_LIMIT}`),
    ]);

    const errors: string[] = [];
    let stats = state.stats;
    let recentUsers = state.recentUsers;

    if (statsResult.status === 'fulfilled') {
      stats = statsResult.value as DashboardStats;
    } else {
      errors.push(
        statsResult.reason instanceof Error
          ? statsResult.reason.message
          : 'No se pudieron cargar las métricas',
      );
    }

    if (usersResult.status === 'fulfilled') {
      const payload = usersResult.value as { items?: User[] } | User[];
      recentUsers = Array.isArray(payload) ? payload : (payload.items ?? []);
    } else {
      errors.push(
        usersResult.reason instanceof Error
          ? usersResult.reason.message
          : 'No se pudieron cargar los usuarios',
      );
    }

    emit({
      stats,
      recentUsers,
      error: errors.join(' · '),
      updatedAt: state.updatedAt,
      loading: false,
      refreshing: false,
    });
  })();

  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
}

function handleWake() {
  if (document.visibilityState === 'hidden') return;
  void load();
}

function startBackgroundRefresh() {
  pollTimer = setInterval(() => {
    void load();
  }, POLL_INTERVAL_MS);
  window.addEventListener('focus', handleWake);
  document.addEventListener('visibilitychange', handleWake);
  void load();
}

function stopBackgroundRefresh() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  window.removeEventListener('focus', handleWake);
  document.removeEventListener('visibilitychange', handleWake);
}

export function useAdminDashboard() {
  useEffect(() => {
    subscribers += 1;
    if (subscribers === 1) startBackgroundRefresh();

    return () => {
      subscribers -= 1;
      if (subscribers === 0) stopBackgroundRefresh();
    };
  }, []);

  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const refresh = useCallback(() => {
    void load();
  }, []);

  return { ...snapshot, refresh };
}

export type AdminNotificationSection = 'orders' | 'users' | 'stock';

export interface AdminNotificationItem {
  id: string;
  section: AdminNotificationSection;
  title: string;
  subtitle: string;
  createdAt: string | null;
  href: string;
}

export interface AdminNotifications {
  items: AdminNotificationItem[];
  counts: Record<AdminNotificationSection, number>;
  total: number;
  hiddenOrders: number;
}

export const ADMIN_NOTIFICATION_WINDOW_MS = NEW_USER_WINDOW_MS;

function shortOrderId(id: string) {
  return `#${id.slice(0, 8)}`;
}

export function buildAdminNotifications(
  stats: DashboardStats | null,
  recentUsers: User[],
): AdminNotifications {
  const counts: Record<AdminNotificationSection, number> = {
    orders: stats?.pendingOrders ?? 0,
    users: 0,
    stock: stats?.lowStockProducts.length ?? 0,
  };

  const items: AdminNotificationItem[] = [];

  for (const order of stats?.recentOrders ?? []) {
    if (order.status !== 'PENDING') continue;
    items.push({
      id: `order-${order.id}`,
      section: 'orders',
      title: `Pedido ${shortOrderId(order.id)}`,
      subtitle: `${order.customerName} · ${formatPrice(order.total)}`,
      createdAt: order.createdAt,
      href: '/admin/orders',
    });
  }

  const windowStart = Date.now() - NEW_USER_WINDOW_MS;
  for (const user of recentUsers) {
    const createdAt = new Date(user.createdAt).getTime();
    if (!Number.isFinite(createdAt) || createdAt < windowStart) continue;
    items.push({
      id: `user-${user.id}`,
      section: 'users',
      title: user.name,
      subtitle: user.email,
      createdAt: user.createdAt,
      href: '/admin/users',
    });
  }
  counts.users = items.filter((item) => item.section === 'users').length;

  for (const product of stats?.lowStockProducts ?? []) {
    items.push({
      id: `stock-${product.id}`,
      section: 'stock',
      title: product.name,
      subtitle:
        product.stock <= 0
          ? 'Agotado'
          : `${product.stock} uds restantes · límite ${product.threshold}`,
      createdAt: null,
      href: `/admin/products/edit/${product.id}`,
    });
  }

  const visibleOrders = items.filter(
    (item) => item.section === 'orders',
  ).length;

  return {
    items,
    counts,
    total: counts.orders + counts.users + counts.stock,
    hiddenOrders: Math.max(0, counts.orders - visibleOrders),
  };
}
