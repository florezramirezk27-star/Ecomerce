"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getUser, serverLogout, isAuthenticated } from "@/lib/auth";
import { API_URL } from "@/lib/api";
import { getGuestCartCount } from "@/lib/guest-cart";

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

/* ------------------------------------------------------------------
   Contador del carrito
   ------------------------------------------------------------------
   Para un visitante sin sesion el carrito vive en `localStorage`
   (`guest_cart`), asi que el numero sale de ahi al instante. Para un
   usuario con sesion el carrito esta en el servidor: se pide una vez y se
   refresca cada vez que la pagina del carrito avisa con `cart-change`.

   El valor vive en una variable de modulo y los componentes se suscriben
   con `useSyncExternalStore`, el mismo patron que ya usa este archivo para
   el usuario. Con un `useState` + `useEffect` el numero apareceria un
   instante despues de pintar la pagina.

   El carrito del servidor se pide con `fetch` y no con `apiFetch` a
   proposito: `apiFetch` redirige a `/login` cuando la API responde 401, y
   un contador no puede expulsar al usuario de la pagina que esta
   viendo solo porque su sesion caduco. */
let serverCartCount = 0;
const cartCountListeners = new Set<() => void>();

function notifyCartCount() {
  cartCountListeners.forEach((listener) => listener());
}

async function loadServerCartCount() {
  try {
    const response = await fetch(`${API_URL}/cart`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("No se pudo leer el carrito");
    const cart = await response.json();
    const items = Array.isArray(cart?.items) ? cart.items : [];
    serverCartCount = items.reduce(
      (sum: number, item: { quantity?: number }) =>
        sum + (Number(item?.quantity) || 0),
      0,
    );
  } catch {
    serverCartCount = 0;
  }
  notifyCartCount();
}

function getCartCountSnapshot(): number {
  if (typeof window === "undefined") return 0;
  if (!isAuthenticated()) return getGuestCartCount();
  return serverCartCount;
}

function subscribeCartCount(onStoreChange: () => void): () => void {
  cartCountListeners.add(onStoreChange);

  const refresh = () => {
    if (isAuthenticated()) {
      void loadServerCartCount();
    } else {
      serverCartCount = 0;
      notifyCartCount();
    }
  };

  window.addEventListener("cart-change", refresh);
  window.addEventListener("auth-change", refresh);

  // Al suscribirse se pide el carrito del servidor. Sin esto el contador de
  // un usuario con sesion se quedaria en cero hasta que tocara "agregar".
  if (isAuthenticated()) void loadServerCartCount();

  return () => {
    cartCountListeners.delete(onStoreChange);
    window.removeEventListener("cart-change", refresh);
    window.removeEventListener("auth-change", refresh);
  };
}

/** Chincheta con el numero de articulos del carrito. */
function CartBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-bold leading-none text-white"
      aria-label={`${count} ${count === 1 ? "artículo" : "artículos"} en el carrito`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
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
  const router = useRouter();
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
  const cartCount = useSyncExternalStore(
    subscribeCartCount,
    getCartCountSnapshot,
    () => 0,
  );
  const [logo, setLogo] = useState<string | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
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

  /* El menu se cierra solo al cambiar de ruta (por ejemplo al usar el boton
     "atras" del navegador, donde los enlaces no se ejecutan) y con la tecla
     Escape, que es lo que se espera de un menu lateral superpuesto.

     El cierre por ruta se hace ajustando el estado durante el render (el
     patron "derivar estado de una prop" de React) en vez de dentro de un
     efecto: un `setState` sincrono en un efecto dispara una cascada de
     renders y la regla `react-hooks/set-state-in-effect` lo marca como
     error. */
  const [rutaAnterior, setRutaAnterior] = useState(pathname);
  if (rutaAnterior !== pathname) {
    setRutaAnterior(pathname);
    setMenuOpen(false);
    setCatOpen(false);
    setSearchOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  /**
   * La busqueda de la cabecera lleva a la pagina de busqueda con el termino
   * en la URL (`/products/search?search=...`). La pagina de busqueda lo lee
   * al montarse y deja el campo con el texto ya escrito.
   */
  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const term = query.trim();
    setSearchOpen(false);
    router.push(
      term ? `/products/search?search=${encodeURIComponent(term)}` : "/products/search",
    );
  }

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
    <>
    {/* En movil la barra tiene altura fija (`h-16`) para que el menu lateral
       pueda anclarse debajo con `top-16` sin depender de un numero magico:
       antes usaba un desplazamiento fijo de 57px, cuando la barra real media
       81px, asi que el menu tapaba 24px del contenido. En escritorio
       vuelve a su altura automatica. */}
    <nav className="flex h-16 items-center justify-between border-b px-4 md:h-auto md:px-10 md:py-4 relative z-40">
      <Link href="/" className="font-bold text-lg shrink-0 flex items-center gap-3">
        {logo ? (
                  <Image
                    src={logo}
                    alt="Kronio Market"
                    width={180}
                    height={48}
                    priority
                    sizes="180px"
                    className="h-auto w-auto max-h-9 max-w-[180px] object-contain mix-blend-multiply md:max-h-12"
                  />
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

        <button
          type="button"
          onClick={() => { setSearchOpen((v) => !v); setMenuOpen(false); }}
          className="hover:underline cursor-pointer flex items-center gap-1"
          aria-label="Buscar productos"
          aria-expanded={searchOpen}
        >
          Buscar
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>

        <Link href="/cart" className="hover:underline inline-flex items-center">
          Carrito
          <CartBadge count={cartCount} />
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

      {/* Botones de la barra en movil: buscar y menu. Son mutuamente
          excluyentes: si los dos estuvieran abiertos a la vez, el menu
          lateral (anclado con `top-16`) se solaparia con el panel de
          busqueda. */}
      <div className="md:hidden -mr-2 flex items-center">
        <button
          type="button"
          onClick={() => { setSearchOpen((v) => !v); setMenuOpen(false); }}
          className="flex h-11 w-11 items-center justify-center cursor-pointer"
          aria-label={searchOpen ? "Cerrar búsqueda" : "Buscar productos"}
          aria-expanded={searchOpen}
          aria-controls="header-search"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>

        {/* Mobile hamburger */}
        <button
          onClick={() => { setMenuOpen((v) => !v); setSearchOpen(false); }}
          className="flex h-11 w-11 items-center justify-center cursor-pointer"
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {menuOpen ? (
              <path d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {menuOpen && (
        <div className="fixed inset-0 top-16 bg-black/40 z-30 md:hidden" onClick={() => setMenuOpen(false)} />
      )}

      {/* Mobile drawer.
          `top-16 bottom-0` en vez de una altura calculada: el menu ocupa
          exactamente desde el borde inferior de la barra hasta el final de la
          pantalla, sin depender de la altura real del viewport ni de que
          `100vh` sea mas alto que lo que se ve con la barra del navegador
          abierta. */}
      <div
        id="mobile-menu"
        aria-hidden={!menuOpen}
        className={`fixed top-16 bottom-0 right-0 w-[min(18rem,85vw)] bg-white border-l border-gray-200 shadow-2xl z-40 transform transition-[transform,opacity,visibility] duration-300 md:hidden flex flex-col gap-1 p-6 overflow-y-auto overscroll-contain pb-safe-bottom ${
          menuOpen
            ? "translate-x-0 opacity-100 visible"
            : "translate-x-full opacity-0 invisible pointer-events-none"
        }`}
      >
        <Link href="/" onClick={() => setMenuOpen(false)} className="block py-2.5 hover:underline">
          Inicio
        </Link>

        <div>
          <button
            onClick={() => setCatOpen(!catOpen)}
            className="hover:underline cursor-pointer flex items-center gap-1 py-2.5"
            aria-expanded={catOpen}
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
            <div className="pl-4 mt-2 space-y-1 border-l-2 border-gray-100">
              {categories.length === 0 ? (
                <p className="text-sm text-gray-400 py-1">Cargando...</p>
              ) : (
                categories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/products?categoryId=${cat.id}`}
                    onClick={() => { setCatOpen(false); setMenuOpen(false); }}
                    className="block py-2 text-sm text-gray-600 hover:text-gray-900 hover:underline transition"
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

        <Link href="/cart" onClick={() => setMenuOpen(false)} className="block py-2.5 hover:underline">
          Carrito
          <CartBadge count={cartCount} />
        </Link>

        <Link href="/orders" onClick={() => setMenuOpen(false)} className="block py-2.5 hover:underline">
          Mis órdenes
        </Link>

        {user?.role === "ADMIN" && (
          <>
            <Link href="/admin" onClick={() => setMenuOpen(false)} className="block py-2.5 text-sm font-semibold text-blue-600 hover:underline">
              Panel Admin
            </Link>
            <Link href="/dropi" onClick={() => setMenuOpen(false)} className="block py-2.5 hover:underline">
              Dropi
            </Link>
          </>
        )}

        {user ? (
          <div className="flex items-center gap-3 py-2.5">
            <span className="text-sm text-gray-500">{user.name}</span>
            <button onClick={() => handleLogoutClick(() => setMenuOpen(false))} className="text-sm text-red-500 hover:underline">
              Cerrar sesión
            </button>
          </div>
        ) : (
          <>
            <Link href="/login" onClick={() => setMenuOpen(false)} className="block py-2.5 hover:underline">Login</Link>
            <Link href="/register" onClick={() => setMenuOpen(false)} className="block py-2.5 hover:underline">Registro</Link>
          </>
        )}
      </div>

      <LogoutConfirmModal
        open={showLogoutConfirm}
        onConfirm={confirmLogout}
        onCancel={cancelLogout}
      />
    </nav>

    {/* Panel de busqueda. Va fuera del `<nav>` para que la barra conserve su
        altura fija de 64px en movil: el menu lateral se ancla con `top-16` y
        esa altura no puede depender de si el panel esta abierto. */}
    {searchOpen && (
      <div
        id="header-search"
        className="relative z-40 border-b border-gray-200 bg-white px-4 py-3 shadow-sm"
      >
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar productos..."
              autoFocus
              enterKeyHint="search"
              /* 16px en movil: con menos, iOS hace zoom al enfocar el campo. */
              className="w-full rounded-xl border border-gray-300 bg-gray-50 py-2.5 pl-10 pr-3 text-base text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <button
            type="submit"
            className="shrink-0 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Buscar
          </button>
        </form>
      </div>
    )}
    </>
  );
}
