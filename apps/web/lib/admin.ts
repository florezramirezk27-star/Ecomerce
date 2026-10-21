// Admin shared types and utilities

import { API_URL, apiFetch, refreshSession } from './api';

// Se reexporta `refreshSession` por compatibilidad: algun componente pudo
// importarlo desde aqui historicamente.
export { refreshSession };

// `lib/admin.ts` reexporta `apiFetch` para no cambiar los imports existentes de
// los componentes. La implementación vive en `lib/api.ts`, que es la unica: antes
// habia dos copias con dos `refreshPromise` distintos y al abrir /admin las
// peticiones en paralelo lanzaban dos refrescos que se anulaban entre si,
// dejando 401 en la consola estando el usuario logueado.
export { apiFetch };

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
  /** Presentacion elegida (talla/color). Ausente en productos simples. */
  variationName?: string | null;
}

export interface OrderTrackingInfo {
  id: string;
  orderId: string;
  dropiOrderId?: string | null;
  dropiGuideId?: string | null;
  carrier?: string | null;
  status?: string | null;
  lastEvent?: string | null;
  checkedAt?: string | null;
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
  shippingEmail?: string | null;
  tracking?: OrderTrackingInfo | null;
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

  try {
    return JSON.parse(user)?.role === 'ADMIN';
  } catch {
    localStorage.removeItem('user');
    return false;
  }
}

export const API_BASE = API_URL;

// Solo el Content-Type. El token ya no se manda aqui: viaja en la cookie
// httpOnly y estas peticiones llevan credentials: 'include' mas abajo.
export const getAuthHeader = (body?: BodyInit) => {
  const headers: Record<string, string> = {
    ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
  };

  return headers;
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

export const timeAgo = (date: string, now: number = Date.now()) => {
  const timestamp = new Date(date).getTime();
  if (!Number.isFinite(timestamp)) return '';

  const diffMs = now - timestamp;
  if (diffMs < 60_000) return 'hace un momento';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} d`;

  const months = Math.floor(days / 30);
  return months === 1 ? 'hace 1 mes' : `hace ${months} meses`;
};

