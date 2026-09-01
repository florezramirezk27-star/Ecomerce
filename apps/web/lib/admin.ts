// Admin shared types and utilities

import { refreshSession } from './api';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'CUSTOMER';
  createdAt: string;
  _count?: {
    orders: number;
  };
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  createdAt: string;
  _count?: {
    products: number;
  };
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description?: string;
  price: number | string;
  stock: number;
  image?: string;
  active: boolean;
  categoryId: string;
  category?: Category;
  createdAt: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  product?: Product;
  quantity: number;
  price: string | number;
}

export interface Order {
  id: string;
  userId: string;
  user?: User;
  status:
    | 'PENDING'
    | 'PAID'
    | 'SHIPPED'
    | 'DELIVERED'
    | 'CANCELLED';
  total: number | string;
  items: OrderItem[];
  createdAt: string;
}

export interface DashboardTopProduct {
  id: string;
  name: string;
  image?: string;
  totalSold: number;
  revenue: number;
}

export interface DashboardRecentOrder {
  id: string;
  customerName: string;
  status:
    | 'PENDING'
    | 'PAID'
    | 'SHIPPED'
    | 'DELIVERED'
    | 'CANCELLED';
  total: number;
  createdAt: string;
}

export interface DashboardLowStockProduct {
  id: string;
  name: string;
  stock: number;
  threshold: number;
  slug: string;
}

export interface DashboardStats {
  dailyRevenue: number;
  monthlyRevenue: number;
  totalRevenue: number;
  totalOrders: number;
  pendingOrders: number;
  totalUsers: number;
  topProducts: DashboardTopProduct[];
  recentOrders: DashboardRecentOrder[];
  lowStockProducts: DashboardLowStockProduct[];
}

export function isAdmin() {
  if (typeof window === 'undefined') return false;

  const user = localStorage.getItem('user');

  if (!user) return false;

  return JSON.parse(user).role === 'ADMIN';
}

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  '/api/proxy';

export const getAuthHeader = (body?: BodyInit) => {
  return {
    ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
  };
};

export const formatPrice = (price: string | number) => {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(price)) + ' COP';
};

export const formatDate = (date: string) => {
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2,
): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      if (i === retries) throw error;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  throw new Error('Unreachable');
}

function getCsrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  for (const name of ['__Host-csrf-token', 'csrf-token']) {
    const matches = [
      ...document.cookie.matchAll(
        new RegExp(`(?:^|;\\s*)${name}=([^;]*)`, 'g'),
      ),
    ];
    if (matches.length > 0) {
      return decodeURIComponent(matches[matches.length - 1][1]);
    }
  }
  return null;
}

async function ensureCsrfCookie(): Promise<void> {
  if (getCsrfToken()) return;
  try {
    await fetch(`${API_BASE}/auth`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {}
}

export const apiFetch = async (
  endpoint: string,
  options?: RequestInit,
) => {
  const method = (options?.method || 'GET').toUpperCase();
  const csrfHeaders: Record<string, string> = {};

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    await ensureCsrfCookie();
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      csrfHeaders['X-CSRF-Token'] = csrfToken;
    }
  }

  const buildHeaders = () => ({
    ...getAuthHeader(options?.body ?? undefined),
    ...csrfHeaders,
    ...options?.headers,
  });

  let response = await fetchWithRetry(`${API_BASE}${endpoint}`, {
    ...options,
    headers: buildHeaders(),
  });

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && response.status === 403) {
    const errBody = await response.clone().json().catch(() => ({}));
    if (typeof errBody.message === 'string' && errBody.message.includes('CSRF')) {
      await ensureCsrfCookie();
      const fresh = getCsrfToken();
      if (fresh) csrfHeaders['X-CSRF-Token'] = fresh;
      response = await fetchWithRetry(`${API_BASE}${endpoint}`, {
        ...options,
        headers: buildHeaders(),
      });
    }
  }

  if (response.status === 401 && (await refreshSession())) {
    const freshCsrf = getCsrfToken();
    if (freshCsrf) csrfHeaders['X-CSRF-Token'] = freshCsrf;
    response = await fetchWithRetry(`${API_BASE}${endpoint}`, {
      ...options,
      headers: buildHeaders(),
      credentials: 'include',
    });
  }

  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax';
      document.cookie = 'role=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax';
      window.dispatchEvent(new Event('auth-change'));
      window.location.href = '/login';
    }
    throw new Error('Sesión expirada');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.message || `API Error: ${response.status}`,
    );
  }

  return response.json();
};
