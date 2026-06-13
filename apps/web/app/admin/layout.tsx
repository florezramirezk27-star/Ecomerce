'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { serverLogout } from '@/lib/auth';

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

const menuItems = [
  { label: 'Dashboard', href: '/admin', icon: '📊' },
  { label: 'Productos', href: '/admin/products', icon: '📦' },
  { label: 'Categorías', href: '/admin/categories', icon: '🏷️' },
  { label: 'Usuarios', href: '/admin/users', icon: '👥' },
  { label: 'Órdenes', href: '/admin/orders', icon: '📋' },
  { label: 'Logo', href: '/admin/logo', icon: '🖼️' },
  { label: 'Seguridad', href: '/admin/security', icon: '🔐' },
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
  const [hydrated, setHydrated] = useState(false);
  const redirecting = useRef(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    function handleAuthChange() {
      setAdminUser(getAdminUserFromStorage());
    }

    window.addEventListener('storage', handleAuthChange);
    window.addEventListener('auth-change', handleAuthChange);
    return () => {
      window.removeEventListener('storage', handleAuthChange);
      window.removeEventListener('auth-change', handleAuthChange);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!adminUser && !redirecting.current) {
      redirecting.current = true;
      router.replace('/login');
    }
  }, [adminUser, router, hydrated]);

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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!adminUser) {
    return null;
  }

  const sidebar = (
    <aside
      className={`${
        collapsed ? 'w-20' : 'w-64'
      } bg-gradient-to-b from-slate-900 to-slate-800 text-white transition-all duration-300 h-full flex flex-col`}
    >
      <div className="p-4 flex items-center justify-between border-b border-slate-700 shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="bg-blue-500 p-2 rounded-lg">
              <span className="text-xl font-bold">📱</span>
            </div>
            <h2 className="text-xl font-bold">Admin</h2>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 hover:bg-slate-700 rounded-lg transition hidden md:block"
        >
          {collapsed ? '→' : '←'}
        </button>
      </div>

      <nav className="flex flex-col gap-2 p-4 mt-6 flex-1 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (pathname.startsWith(item.href) &&
              item.href !== '/admin');
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-slate-300 hover:bg-slate-700'
              }`}
              title={collapsed ? item.label : ''}
            >
              <span className="text-xl">{item.icon}</span>
              {!collapsed && (
                <span className="font-medium">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 p-3 bg-slate-700 rounded-lg text-sm mx-4 mb-4">
        {!collapsed && (
          <p className="text-slate-300">
            Panel de Control v1.0
          </p>
        )}
      </div>

      <button
        onClick={() => { serverLogout(); }}
        className="shrink-0 mx-4 mb-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition text-center"
      >
        {collapsed ? '×' : 'Cerrar sesión'}
      </button>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <div className={`hidden md:block ${collapsed ? 'w-20' : 'w-64'} shrink-0 transition-all duration-300`}>
        <div className="fixed h-full left-0 top-0 z-40">
          {sidebar}
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div
        className={`fixed left-0 top-0 h-full z-50 md:hidden transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebar}
      </div>

      {/* Mobile toggle button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed bottom-4 left-4 z-50 md:hidden bg-slate-900 text-white p-3 rounded-full shadow-lg"
        aria-label="Abrir menú"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <main className="flex-1 min-w-0">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
