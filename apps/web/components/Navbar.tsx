"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getToken, getUser, serverLogout } from "@/lib/auth";
import { API_URL } from "@/lib/api";

interface Category {
  id: string;
  name: string;
  slug: string;
  _count?: { products: number };
}

function getCurrentUser() {
  if (typeof window === "undefined") return null;
  const token = getToken();
  if (!token) return null;
  return getUser();
}

async function logout() {
  await serverLogout();
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
  const [user, setUser] = useState<ReturnType<typeof getCurrentUser>>(null);
  const [hydrated, setHydrated] = useState(false);
  const [logo, setLogo] = useState<string | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const catRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHydrated(true);
    setUser(getCurrentUser());

    function handleAuthChange() {
      setUser(getCurrentUser());
    }

    window.addEventListener("storage", handleAuthChange);
    window.addEventListener("auth-change", handleAuthChange);
    return () => {
      window.removeEventListener("storage", handleAuthChange);
      window.removeEventListener("auth-change", handleAuthChange);
    };
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/categories`)
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});
  }, []);

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
          <Link href="/admin" className="text-sm font-semibold text-blue-600 hover:underline">
            Panel Admin
          </Link>
        )}

        {user ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{user.name}</span>
            <button onClick={logout} className="text-sm text-red-500 hover:underline">
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
          <Link href="/admin" onClick={() => setMenuOpen(false)} className="text-sm font-semibold text-blue-600 hover:underline">
            Panel Admin
          </Link>
        )}

        {user ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{user.name}</span>
            <button onClick={async () => { await logout(); setMenuOpen(false); }} className="text-sm text-red-500 hover:underline">
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
    </nav>
  );
}
