"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getUser, serverLogout } from "@/lib/auth";
import { API_URL } from "@/lib/api";

interface Category {
  id: string;
  name: string;
  slug: string;
  _count?: { products: number };
}

let cachedUser: ReturnType<typeof getUser> | null = null;
let lastRaw: string | null = null;

function getCurrentUser() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  if (raw === lastRaw) return cachedUser;
  lastRaw = raw;
  if (!raw) { cachedUser = null; return null; }
  try { cachedUser = JSON.parse(raw); } catch { cachedUser = null; }
  return cachedUser;
}

async function logout() {
  await serverLogout();
}

function LogoutConfirmModal({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">¿Cerrar sesión?</h3>
          <p className="mt-1 text-sm text-gray-500">
            ¿Estás seguro de que quieres cerrar sesión? Deberás iniciar sesión nuevamente para acceder a tu cuenta.
          </p>
        </div>
        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
          >
            Sí, cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryDropdown({
  categories,
  onClose,
}: {
  categories: Category[];
  onClose: () => void;
}) {
  return (
    <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-2 max-h-72 overflow-y-auto">
      {categories.length === 0 ? (
        <p className="px-4 py-2 text-sm text-gray-400">Cargando...</p>
      ) : (
        categories.map((cat) => (
          <Link
            key={cat.id}
            href={`/products?categoryId=${cat.id}`}
            onClick={onClose}
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            <span className="font-medium">{cat.name}</span>
            {cat._count && (
              <span className="text-xs text-gray-400 ml-2">
                ({cat._count.products})
              </span>
            )}
          </Link>
        ))
      )}
    </div>
  );
}

export default function Navbar() {
  const user = useSyncExternalStore(
    (callback) => {
      window.addEventListener("storage", callback);
      window.addEventListener("auth-change", callback);
      return () => {
        window.removeEventListener("storage", callback);
        window.removeEventListener("auth-change", callback);
      };
    },
    () => getCurrentUser(),
    () => null,
  );
  const [logo, setLogo] = useState<string | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [pendingLogoutCb, setPendingLogoutCb] = useState<(() => void) | null>(null);
  const catRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_URL}/categories`)
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});
  }, []);

  const pathname = usePathname();

  useEffect(() => {
    function fetchLogo() {
      fetch(`${API_URL}/settings/logo`)
        .then((r) => r.json())
        .then((data) => setLogo(data.logo))
        .catch(() => {});
    }

    fetchLogo();

    window.addEventListener("logo-change", fetchLogo);
    return () => window.removeEventListener("logo-change", fetchLogo);
  }, []);

  useEffect(() => {
    if (!logo) return;
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = logo;
  }, [logo, pathname]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (catRef.current && !catRef.current.contains(e.target as Node)) {
        setCatOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const handleLogoutClick = (cb?: () => void) => {
    setPendingLogoutCb(() => cb || null);
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    await logout();
    if (pendingLogoutCb) pendingLogoutCb();
    setPendingLogoutCb(null);
  };

  const cancelLogout = () => {
    setShowLogoutConfirm(false);
    setPendingLogoutCb(null);
  };

  return (
    <nav className="flex items-center justify-between px-4 md:px-10 py-4 border-b relative z-40">
      <Link href="/" className="font-bold text-lg shrink-0 flex items-center gap-3">
        {logo ? (
          <img src={logo} alt="Kronio Market" className="h-12 w-auto max-w-[180px] object-contain mix-blend-multiply" />
        ) : (
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-yellow-400 via-blue-500 to-red-500 flex items-center justify-center text-white text-sm font-bold shadow-sm">
            K
          </div>
        )}
        <span>Kronio Market</span>
      </Link>

      {/* Desktop nav */}
      <div className="hidden md:flex gap-4 items-center">
        <Link href="/" className="hover:underline">
          Inicio
        </Link>

        {/* Desktop category dropdown */}
        <div ref={catRef} className="relative">
          <button
            onClick={() => setCatOpen(!catOpen)}
            className="hover:underline cursor-pointer flex items-center gap-1"
          >
            Categorías
            <svg
              className={`w-3 h-3 mt-0.5 transition-transform ${catOpen ? "rotate-180" : ""}`}
              viewBox="0 0 10 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M1 1l4 4 4-4" />
            </svg>
          </button>

          {catOpen && (
            <CategoryDropdown categories={categories} onClose={() => setCatOpen(false)} />
          )}
        </div>

        <Link href="/cart" className="hover:underline">
          Carrito
        </Link>

        <Link href="/orders" className="hover:underline">
          Mis órdenes
        </Link>

        {user?.role === "ADMIN" && (
          <>
            <Link href="/admin" className="text-sm font-semibold text-blue-600 hover:underline">
              Panel Admin
            </Link>
            <Link href="/dropi" className="hover:underline">
              Dropi
            </Link>
          </>
        )}

        {user ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{user.name}</span>
            <button onClick={() => handleLogoutClick()} className="text-sm text-red-500 hover:underline">
              Cerrar sesión
            </button>
          </div>
        ) : (
          <>
            <Link href="/login" className="hover:underline">Login</Link>
            <Link href="/register" className="hover:underline">Registro</Link>
          </>
        )}
      </div>

      {/* Mobile hamburger */}
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="md:hidden p-2 cursor-pointer"
        aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
      >
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {menuOpen ? (
            <path d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Mobile drawer overlay */}
      {menuOpen && (
        <div className="fixed inset-0 top-[57px] bg-black/40 z-30 md:hidden" onClick={() => setMenuOpen(false)} />
      )}

      {/* Mobile drawer */}
      <div
        className={`fixed top-[57px] right-0 h-[calc(100vh-57px)] w-72 bg-white border-l border-gray-200 shadow-2xl z-40 transform transition-transform duration-300 md:hidden flex flex-col gap-4 p-6 overflow-y-auto ${
          menuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <Link href="/" onClick={() => setMenuOpen(false)} className="hover:underline">
          Inicio
        </Link>

        <div>
          <button
            onClick={() => setCatOpen(!catOpen)}
            className="hover:underline cursor-pointer flex items-center gap-1"
          >
            Categorías
            <svg
              className={`w-3 h-3 mt-0.5 transition-transform ${catOpen ? "rotate-180" : ""}`}
              viewBox="0 0 10 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M1 1l4 4 4-4" />
            </svg>
          </button>

          {catOpen && (
            <div className="pl-4 mt-2 space-y-2 border-l-2 border-gray-100">
              {categories.length === 0 ? (
                <p className="text-sm text-gray-400 py-1">Cargando...</p>
              ) : (
                categories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/products?categoryId=${cat.id}`}
                    onClick={() => { setCatOpen(false); setMenuOpen(false); }}
                    className="block text-sm text-gray-600 hover:text-gray-900 hover:underline transition"
                  >
                    {cat.name}
                    {cat._count && (
                      <span className="text-xs text-gray-400 ml-1">
                        ({cat._count.products})
                      </span>
                    )}
                  </Link>
                ))
              )}
            </div>
          )}
        </div>

        <Link href="/cart" onClick={() => setMenuOpen(false)} className="hover:underline">
          Carrito
        </Link>

        <Link href="/orders" onClick={() => setMenuOpen(false)} className="hover:underline">
          Mis órdenes
        </Link>

        {user?.role === "ADMIN" && (
          <>
            <Link href="/admin" onClick={() => setMenuOpen(false)} className="text-sm font-semibold text-blue-600 hover:underline">
              Panel Admin
            </Link>
            <Link href="/dropi" onClick={() => setMenuOpen(false)} className="hover:underline">
              Dropi
            </Link>
          </>
        )}

        {user ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{user.name}</span>
            <button onClick={() => handleLogoutClick(() => setMenuOpen(false))} className="text-sm text-red-500 hover:underline">
              Cerrar sesión
            </button>
          </div>
        ) : (
          <>
            <Link href="/login" onClick={() => setMenuOpen(false)} className="hover:underline">Login</Link>
            <Link href="/register" onClick={() => setMenuOpen(false)} className="hover:underline">Registro</Link>
          </>
        )}
      </div>

      <LogoutConfirmModal
        open={showLogoutConfirm}
        onConfirm={confirmLogout}
        onCancel={cancelLogout}
      />
    </nav>
  );
}
