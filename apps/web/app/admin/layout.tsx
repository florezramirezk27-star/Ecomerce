'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Boxes,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Image,
  LayoutDashboard,
  Loader2,
  Menu,
  Package,
  ShieldCheck,
  Store,
  Tags,
  Users,
  X,
} from 'lucide-react';
import { isAuthenticated } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { cn } from '@/components/admin/ui';

function getAdminUserFromStorage() {
  if (typeof window === 'undefined') return null;
  try {
    const user = localStorage.getItem('user');
    if (!user) return null;
    const parsed = JSON.parse(user);
    return parsed.role === 'ADMIN' ? parsed : null;
  } catch {
    return null;
  }
}

async function verifyAdminWithServer(): Promise<boolean> {
  try {
    if (!isAuthenticated()) return false;
    const data = await apiFetch('/auth/profile');
    return data.role === 'ADMIN';
  } catch {
    return false;
  }
}

const menuItems = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Productos', href: '/admin/products', icon: Package },
  { label: 'Categorías', href: '/admin/categories', icon: Tags },
  { label: 'Usuarios', href: '/admin/users', icon: Users },
  { label: 'Órdenes', href: '/admin/orders', icon: ClipboardList },
  { label: 'Logo', href: '/admin/logo', icon: Image },
  { label: 'Seguridad', href: '/admin/security', icon: ShieldCheck },
  { label: 'Dropi', href: '/admin/dropi', icon: Boxes },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminUser, setAdminUser] = useState(getAdminUserFromStorage);
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const redirecting = useRef(false);

  useEffect(() => {
    async function checkAdmin() {
      const localUser = getAdminUserFromStorage();
      if (!localUser) {
        if (!redirecting.current) {
          redirecting.current = true;
          router.replace('/login');
        }
        return;
      }

      const isServerAdmin = await verifyAdminWithServer();
      if (!isServerAdmin) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (!redirecting.current) {
          redirecting.current = true;
          router.replace('/login');
        }
        return;
      }

      setAdminUser(localUser);
    }

    checkAdmin();
  }, [router]);

  useEffect(() => {
    function handleAuthChange() {
      const user = getAdminUserFromStorage();
      if (!user && !redirecting.current) {
        redirecting.current = true;
        router.replace('/login');
      }
    }

    window.addEventListener('storage', handleAuthChange);
    window.addEventListener('auth-change', handleAuthChange);
    return () => {
      window.removeEventListener('storage', handleAuthChange);
      window.removeEventListener('auth-change', handleAuthChange);
    };
  }, [router]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          <p className="text-sm text-slate-500">Cargando panel...</p>
        </div>
      </div>
    );
  }

  if (!adminUser) {
    return null;
  }

  const sidebar = (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-slate-200 bg-white transition-all duration-300',
        collapsed ? 'w-20' : 'w-64',
      )}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-sm shadow-blue-600/30">
            <Store className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <p className="text-sm font-bold text-slate-900">Kronio Market</p>
              <p className="text-xs text-slate-400">Panel de administración</p>
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 md:block"
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          title={collapsed ? 'Expandir' : 'Colapsar'}
        >
          {collapsed ? (
            <ChevronsRight className="h-4 w-4" />
          ) : (
            <ChevronsLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav className="mt-3 flex-1 space-y-1 overflow-y-auto px-3">
        {!collapsed && (
          <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Menú
          </p>
        )}
        {menuItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (pathname.startsWith(item.href) && item.href !== '/admin');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
              title={collapsed ? item.label : ''}
            >
              {isActive && (
                <span className="absolute left-0 h-5 w-1 rounded-r-full bg-blue-600" />
              )}
              <Icon
                className={cn(
                  'h-[18px] w-[18px] shrink-0',
                  isActive
                    ? 'text-blue-600'
                    : 'text-slate-400 transition group-hover:text-slate-600',
                )}
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 shrink-0 space-y-3 border-t border-slate-100 p-3">
        <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold uppercase text-slate-600">
            {adminUser.name?.charAt(0) || adminUser.email?.charAt(0) || 'A'}
          </div>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-slate-800">
                {adminUser.name || 'Administrador'}
              </p>
              <p className="truncate text-xs text-slate-400">
                {adminUser.email}
              </p>
            </div>
          )}
        </div>
        {!collapsed && (
          <p className="px-3 text-[11px] text-slate-300">Panel de Control v1.0</p>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-slate-100">
      <div
        className={cn(
          'hidden shrink-0 transition-all duration-300 md:block',
          collapsed ? 'w-20' : 'w-64',
        )}
      >
        <div className="fixed left-0 top-0 z-40 h-full">{sidebar}</div>
      </div>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div
        className={cn(
          'fixed left-0 top-0 z-50 h-full transition-transform duration-300 md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-full">
          {sidebar}
          <button
            onClick={() => setMobileOpen(false)}
            className="flex h-10 w-10 items-center justify-center self-start text-white"
            aria-label="Cerrar menú"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      </div>

      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed bottom-4 left-4 z-50 rounded-full bg-blue-600 p-3 text-white shadow-lg shadow-blue-600/30 transition md:hidden"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}