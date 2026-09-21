'use client';

import { useEffect, useMemo, useState, useCallback, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL, apiFetch } from '@/lib/api';
import { getUser } from '@/lib/auth';

interface DropiGallery {
  url: string | null;
  main: boolean;
  urlS3: string;
}

interface DropiUser {
  store_name: string;
  name: string;
  verified?: boolean;
  isVerified?: boolean;
  city?: string | null;
  plan?: {
    name: string;
    description: string | null;
    type: string;
  };
}

interface DropiWarehouse {
  id: number;
  stock: number;
  warehouse_id: number;
}

interface DropiVariation {
  id: number;
  sku: string;
  stock: number;
  sale_price: number;
  attribute_values: { id: number; value: string }[];
}

interface DropiProduct {
  id: number;
  sku: string | null;
  name: string;
  type: 'SIMPLE' | 'VARIABLE';
  sale_price: number;
  suggested_price: number | null;
  gallery: DropiGallery[];
  categories: { id?: number; name: string }[];
  category_id?: number;
  warehouse_product: DropiWarehouse[];
  variations: DropiVariation[];
  user: DropiUser;
  userVerified?: boolean;
  verified?: boolean;
  favorite?: boolean;
  privated_product?: boolean;
  description: string | null;
}

const DROPI_CDN = process.env.NEXT_PUBLIC_DROPI_CDN || 'https://d39ru7awumhhs2.cloudfront.net/';

const PLAN_PREMIUM_NAMES = ['premium', 'pro', 'oro', 'gold', 'diamante', 'diamond', 'vip', 'plus', 'verificado'];

function dropiImageUrl(raw?: string | null): string | null {
  if (!raw) return null;
  if (/^https?:\/\//.test(raw)) return raw;
  return `${DROPI_CDN}${raw}`;
}

function getImageUrl(product: DropiProduct): string | null {
  const main =
    product.gallery?.find((g) => g.main) || product.gallery?.[0];
  return dropiImageUrl(main?.url || main?.urlS3);
}

function formatCOP(price: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

function isVerified(p: DropiProduct): boolean {
  return Boolean(
    p.userVerified === true ||
      p.verified === true ||
      p.user?.verified === true ||
      p.user?.isVerified === true,
  );
}

function computeStock(p: DropiProduct): number {
  if (p.type === 'VARIABLE' && Array.isArray(p.variations) && p.variations.length > 0) {
    return p.variations.reduce((sum, v) => sum + (v.stock || 0), 0);
  }
  if (Array.isArray(p.warehouse_product) && p.warehouse_product.length > 0) {
    return p.warehouse_product.reduce((sum, w) => sum + (w.stock || 0), 0);
  }
  return 0;
}

function discountPct(p: DropiProduct): number {
  if (!p.suggested_price || p.suggested_price <= 0) return 0;
  return Math.round((1 - p.sale_price / p.suggested_price) * 100);
}

function prng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr: DropiProduct[], seed: number): DropiProduct[] {
  const rng = prng(seed || 1);
  const list = [...arr];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

type View = 'grid' | 'list';

const FALLBACK_IMG =
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f3f4f6" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%239ca3af" font-size="12">Sin imagen</text></svg>';

export default function DropiCatalogPage() {
  const router = useRouter();
  const [products, setProducts] = useState<DropiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [userVerified, setUserVerified] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [privated, setPrivated] = useState(false);

  const [supplierType, setSupplierType] = useState('all');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [onlyStock, setOnlyStock] = useState(false);
  const [category, setCategory] = useState('all');
  const [city, setCity] = useState('all');
  const [sortBy, setSortBy] = useState('random');
  const [view, setView] = useState<View>('grid');
  const [randSeed, setRandSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));

  const reshuffle = useCallback(() => {
    setRandSeed(Math.floor(Math.random() * 2 ** 31));
  }, []);

  const [importing, setImporting] = useState<number | null>(null);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<DropiProduct | null>(null);

  const checkingAuth = useSyncExternalStore(
    () => () => {},
    () => {
      const user = localStorage.getItem('user');
      if (!user) return true;
      try { return JSON.parse(user).role !== 'ADMIN'; } catch { return true; }
    },
    () => true,
  );

  const loadCatalog = useCallback(async (opts?: {
    q?: string;
    verified?: boolean;
    fav?: boolean;
    priv?: boolean;
  }) => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (opts?.q) params.set('search', opts.q);
      if (opts?.verified) params.set('userVerified', 'true');
      if (opts?.fav) params.set('favorite', 'true');
      if (opts?.priv) params.set('privated', 'true');
      params.set('pageSize', '60');
      const res = await fetch(
        `${API_URL}/dropi/catalog?${params}`,
        { credentials: 'include', cache: 'no-store' },
      );
      if (!res.ok) throw new Error('Error al cargar catálogo');
      const data = await res.json();
      setProducts(data.objects || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (userVerified) params.set('userVerified', 'true');
    if (favorite) params.set('favorite', 'true');
    if (privated) params.set('privated', 'true');
    params.set('pageSize', '60');
    fetch(`${API_URL}/dropi/catalog?${params}`, {
      credentials: 'include',
      cache: 'no-store',
    })
      .then((res) => {
        if (!res.ok) throw new Error('Error al cargar catálogo');
        return res.json();
      })
      .then((data) => setProducts(data.objects || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userVerified, favorite, privated]);

  useEffect(() => {
    if (checkingAuth) {
      router.replace('/login');
    }
  }, [checkingAuth, router]);

  const filtered = useMemo(() => {
    let list = [...products];

    if (supplierType !== 'all') {
      list = list.filter((p) => {
        const isStore = Boolean(p.user?.store_name);
        return supplierType === 'store' ? isStore : !isStore;
      });
    }

    if (priceMin) {
      const min = Number(priceMin);
      if (!isNaN(min)) list = list.filter((p) => p.sale_price >= min);
    }
    if (priceMax) {
      const max = Number(priceMax);
      if (!isNaN(max)) list = list.filter((p) => p.sale_price <= max);
    }

    if (onlyStock) list = list.filter((p) => computeStock(p) > 0);

    if (category !== 'all') {
      list = list.filter((p) =>
        p.categories?.some((c) => c.name === category),
      );
    }

    if (city !== 'all') {
      list = list.filter(
        (p) => (p.user?.city || '').toLowerCase() === city.toLowerCase(),
      );
    }

    switch (sortBy) {
      case 'price-asc':
        list.sort((a, b) => a.sale_price - b.sale_price);
        break;
      case 'price-desc':
        list.sort((a, b) => b.sale_price - a.sale_price);
        break;
      case 'discount':
        list.sort((a, b) => discountPct(b) - discountPct(a));
        break;
      case 'stock':
        list.sort((a, b) => computeStock(b) - computeStock(a));
        break;
      case 'name':
        list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
        break;
      default:
        list = seededShuffle(list, randSeed);
    }

    return list;
  }, [products, supplierType, priceMin, priceMax, onlyStock, category, city, sortBy, randSeed]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.categories?.forEach((c) => set.add(c.name)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [products]);

  const cities = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.user?.city) set.add(p.user.city);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [products]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    loadCatalog({ q: search, verified: userVerified, fav: favorite, priv: privated });
  }

  async function handleImport(dropiProductId: number) {
    const user = getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    setImporting(dropiProductId);
    setImportMsg(null);
    try {
      const product = await apiFetch('/dropi/import', {
        method: 'POST',
        body: JSON.stringify({ dropiProductId }),
      });

      setImportMsg({
        ok: true,
        text: `"${product.name}" importado exitosamente a tu tienda`,
      });
    } catch (err) {
      setImportMsg({
        ok: false,
        text: err instanceof Error ? err.message : 'Error al importar',
      });
    } finally {
      setImporting(null);
    }
  }

  const badgeCounts = useMemo(() => {
    const favoritos = products.filter((p) => p.favorite === true).length;
    const verificados = products.filter(isVerified).length;
    const conStock = products.filter((p) => computeStock(p) > 0).length;
    return { favoritos, verificados, conStock, total: products.length };
  }, [products]);

  const renderBadges = (p: DropiProduct) => (
    <div className="absolute left-2 top-2 z-10 flex flex-col items-start gap-1">
      {isVerified(p) && (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
          Verificado
        </span>
      )}
      {discountPct(p) > 0 && (
        <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
          -{discountPct(p)}%
        </span>
      )}
    </div>
  );

  const renderProvider = (p: DropiProduct) => {
    const provider = p.user?.store_name || p.user?.name || 'Proveedor';
    const isPremium = PLAN_PREMIUM_NAMES.some((n) =>
      (p.user?.plan?.name || '').toLowerCase().includes(n),
    );
    return (
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="truncate text-xs text-slate-500">{provider}</p>
        {isPremium && (
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            Premium
          </span>
        )}
      </div>
    );
  };

  const renderCard = (p: DropiProduct) => {
    const img = getImageUrl(p);
    const stock = computeStock(p);
    const price = formatCOP(p.sale_price);
    const suggested = p.suggested_price ? formatCOP(p.suggested_price) : null;
    const typeLabel = p.type === 'VARIABLE' ? 'Variable' : 'Simple';

    return (
      <div
        key={p.id}
        className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
      >
        <button
          type="button"
          onClick={() => setSelectedProduct(p)}
          className="relative block aspect-square w-full overflow-hidden bg-slate-50"
        >
          {renderBadges(p)}
          {p.favorite === true && (
            <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-amber-500 shadow-sm">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </span>
          )}
          {img ? (
            <img
              src={img}
              alt={p.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                (e.target as HTMLImageElement).src = FALLBACK_IMG;
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-300">
              <svg className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </button>

        <div className="flex flex-1 flex-col p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-blue-600">
              {p.categories?.[0]?.name || 'Sin categoría'}
            </p>
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
              {typeLabel}
            </span>
          </div>

          <h3 className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-slate-900">
            {p.name}
          </h3>

          {renderProvider(p)}

          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-base font-bold text-slate-900">{price}</span>
            {suggested && (
              <span className="text-xs text-slate-400 line-through">{suggested}</span>
            )}
          </div>

          <div className="mt-1.5 flex items-center gap-1 text-[11px] font-medium">
            <span
              className={
                stock > 0
                  ? 'text-emerald-600'
                  : 'text-red-500'
              }
            >
              {stock > 0 ? `● ${stock} en stock` : '● Sin stock'}
            </span>
            {stock > 0 && stock <= 3 && (
              <span className="text-amber-600">· ¡Últimas!</span>
            )}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleImport(p.id);
            }}
            disabled={importing === p.id || stock === 0}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {importing === p.id ? (
              <>
                <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent animate-spin rounded-full" />
                Importando...
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
                Importar a mi tienda
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="inline-block h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const sidebarItem =
    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-blue-700';

  return (
    <div className="min-h-screen bg-slate-50">
      {importMsg && (
        <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
          <div
            className={`rounded-xl border p-4 text-sm shadow-lg ${
              importMsg.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span>{importMsg.text}</span>
              <button onClick={() => setImportMsg(null)} className="shrink-0 text-slate-400 hover:text-slate-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 py-6 lg:px-8">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Filtros</h2>
              <button
                type="button"
                onClick={() => {
                  setSupplierType('all');
                  setPriceMin('');
                  setPriceMax('');
                  setOnlyStock(false);
                  setCategory('all');
                  setCity('all');
                  setSortBy('random');
                }}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                Limpiar
              </button>
            </div>

            <div className="space-y-4">
              {/* Toggles Dropi-style */}
              <div className="space-y-1">
                <label className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 transition hover:bg-slate-50">
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <svg className="h-4 w-4 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                    Favoritos
                    <span className="ml-auto rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500">
                      {badgeCounts.favoritos}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={favorite}
                    onChange={(e) => setFavorite(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="relative h-5 w-9 shrink-0 rounded-full bg-slate-200 transition peer-checked:bg-blue-600 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:after:translate-x-4" />
                </label>

                <label className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 transition hover:bg-slate-50">
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <svg className="h-4 w-4 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                    Solo verificados
                    <span className="ml-auto rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500">
                      {badgeCounts.verificados}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={userVerified}
                    onChange={(e) => setUserVerified(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="relative h-5 w-9 shrink-0 rounded-full bg-slate-200 transition peer-checked:bg-blue-600 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:after:translate-x-4" />
                </label>

                <label className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 transition hover:bg-slate-50">
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Privados
                  </span>
                  <input
                    type="checkbox"
                    checked={privated}
                    onChange={(e) => setPrivated(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="relative h-5 w-9 shrink-0 rounded-full bg-slate-200 transition peer-checked:bg-blue-600 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:after:translate-x-4" />
                </label>

                <label className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 transition hover:bg-slate-50">
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    Solo con stock
                    <span className="ml-auto rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500">
                      {badgeCounts.conStock}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={onlyStock}
                    onChange={(e) => setOnlyStock(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="relative h-5 w-9 shrink-0 rounded-full bg-slate-200 transition peer-checked:bg-blue-600 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:after:translate-x-4" />
                </label>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <p className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Tipo de proveedor
                </p>
                <div className="space-y-1">
                  {[
                    { value: 'all', label: 'Todos' },
                    { value: 'store', label: 'Tienda' },
                    { value: 'provider', label: 'Proveedor' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSupplierType(opt.value)}
                      className={`${sidebarItem} w-full ${
                        supplierType === opt.value
                          ? 'bg-blue-50 text-blue-700'
                          : ''
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <p className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Precio proveedor (COP)
                </p>
                <div className="flex items-center gap-2 px-3">
                  <input
                    type="number"
                    min={0}
                    value={priceMin}
                    onChange={(e) => setPriceMin(e.target.value)}
                    placeholder="Mín."
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                  <span className="text-slate-300">—</span>
                  <input
                    type="number"
                    min={0}
                    value={priceMax}
                    onChange={(e) => setPriceMax(e.target.value)}
                    placeholder="Máx."
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              {categories.length > 0 && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                    Categorías
                  </p>
                  <div className="px-1.5">
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="all">Todas</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {cities.length > 0 && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="mb-2 px-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                    Ciudad
                  </p>
                  <div className="px-1.5">
                    <select
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="all">Todas</option>
                      {cities.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1">
          <div className="mb-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 lg:text-3xl">
                  Catálogo de productos
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {filtered.length} producto{filtered.length !== 1 ? 's' : ''} · Proveedores Dropi verificados y premium
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setView('grid')}
                    className={`rounded-md p-1.5 transition ${
                      view === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'
                    }`}
                    aria-label="Vista grilla"
                  >
                    <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('list')}
                    className={`rounded-md p-1.5 transition ${
                      view === 'list' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'
                    }`}
                    aria-label="Vista lista"
                  >
                    <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="sort" className="text-sm text-slate-500">Ordenar:</label>
                  <select
                    id="sort"
                    value={sortBy}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSortBy(v);
                      if (v === 'random') reshuffle();
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="random">Aleatorio</option>
                    <option value="price-asc">Menor precio</option>
                    <option value="price-desc">Mayor precio</option>
                    <option value="discount">Mayor descuento</option>
                    <option value="stock">Mayor stock</option>
                    <option value="name">Nombre A-Z</option>
                  </select>
                  {sortBy === 'random' && (
                    <button
                      type="button"
                      onClick={reshuffle}
                      title="Re-mezclar"
                      aria-label="Re-mezclar resultados"
                      className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-blue-50 hover:text-blue-600"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 3h5v5" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 20 21 3" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 16v5h-5" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m15 15 6 6" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4l6 6" /></svg>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <form onSubmit={handleSearch} className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nombre o ID del producto..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                />
              </div>
              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
              >
                Buscar
              </button>
            </form>
          </div>

          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-28">
              <div className="flex flex-col items-center gap-3">
                <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
                <p className="text-sm text-slate-500">Cargando catálogo Dropi...</p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center">
              <svg className="h-14 w-14 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
              <p className="mt-4 text-lg font-semibold text-slate-700">No se encontraron productos</p>
              <p className="mt-1 text-sm text-slate-500">Prueba con otros filtros o cambia la búsqueda</p>
            </div>
          ) : view === 'grid' ? (
            <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map(renderCard)}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((p) => {
                const img = getImageUrl(p);
                const stock = computeStock(p);
                return (
                  <div
                    key={p.id}
                    className="flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedProduct(p)}
                      className="relative block h-28 w-28 shrink-0 bg-slate-50 sm:h-32 sm:w-32"
                    >
                      {renderBadges(p)}
                      {img ? (
                        <img
                          src={img}
                          alt={p.name}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = FALLBACK_IMG;
                          }}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-300">
                          <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </button>
                    <div className="flex flex-1 flex-col p-3 sm:p-4">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-blue-600">
                          {p.categories?.[0]?.name || 'Sin categoría'}
                        </p>
                        {p.type === 'VARIABLE' && (
                          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                            Variable
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">{p.name}</h3>
                      {renderProvider(p)}
                      <div className="mt-1 flex items-center gap-2 text-sm">
                        <span className="font-bold text-slate-900">{formatCOP(p.sale_price)}</span>
                        {p.suggested_price && (
                          <span className="text-xs text-slate-400 line-through">{formatCOP(p.suggested_price)}</span>
                        )}
                      </div>
                      <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                        <span className={`text-xs font-medium ${stock > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {stock > 0 ? `${stock} en stock` : 'Sin stock'}
                        </span>
                        <button
                          onClick={() => handleImport(p.id)}
                          disabled={importing === p.id || stock === 0}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {importing === p.id ? (
                            <>
                              <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent animate-spin rounded-full" />
                              Importando...
                            </>
                          ) : (
                            <>
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                              </svg>
Importar a mi tienda
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Mobile filters */}
      <div className="sticky bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setFavorite((v) => !v)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              favorite ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            ★ Favoritos
          </button>
          <button
            type="button"
            onClick={() => setUserVerified((v) => !v)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              userVerified ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            ✓ Verificados
          </button>
          <button
            type="button"
            onClick={() => setOnlyStock((v) => !v)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              onlyStock ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Con stock
          </button>
          <button
            type="button"
            onClick={() => setPrivated((v) => !v)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              privated ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Privados
          </button>
        </div>
      </div>

      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedProduct(null)} />
          <div className="relative ml-auto w-full max-w-xl bg-white shadow-2xl h-full overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
              <h2 className="truncate pr-4 text-lg font-bold text-gray-900">
                {selectedProduct.name}
              </h2>
              <button
                onClick={() => setSelectedProduct(null)}
                className="shrink-0 rounded-full p-2 hover:bg-gray-100"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6 p-6">
              <div className="space-y-3">
                <div className="relative aspect-square overflow-hidden rounded-xl bg-gray-100">
                  {(() => {
                    const mainImg = selectedProduct.gallery?.find((g) => g.main) || selectedProduct.gallery?.[0];
                    const src = dropiImageUrl(mainImg?.url || mainImg?.urlS3);
                    return src ? (
                      <>
                        {renderBadges(selectedProduct)}
                        <img
                          src={src}
                          alt={selectedProduct.name}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-400">
                        <svg className="h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    );
                  })()}
                </div>
                {selectedProduct.gallery && selectedProduct.gallery.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {selectedProduct.gallery.map((g, i) => {
                      const thumbSrc = dropiImageUrl(g.url || g.urlS3);
                      return thumbSrc ? (
                        <div
                          key={i}
                          className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-gray-100"
                        >
                          <img
                            src={thumbSrc}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      ) : null;
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-baseline gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-blue-600">
                      {selectedProduct.categories?.[0]?.name || 'Sin categoría'}
                    </span>
                    {selectedProduct.type === 'VARIABLE' && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                        Variable
                      </span>
                    )}
                    {isVerified(selectedProduct) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                        </svg>
                        Verificado
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1 text-xl font-bold leading-tight text-gray-900">
                    {selectedProduct.name}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {selectedProduct.user?.store_name || selectedProduct.user?.name}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="block text-3xl font-bold text-blue-600">
                    {formatCOP(selectedProduct.sale_price)}
                  </span>
                  {selectedProduct.suggested_price ? (
                    <span className="block text-sm text-gray-400 line-through">
                      {formatCOP(selectedProduct.suggested_price)}
                    </span>
                  ) : null}
                </div>
              </div>

              {discountPct(selectedProduct) > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2">
                  <span className="rounded bg-red-500 px-2 py-1 text-xs font-bold text-white">
                    -{discountPct(selectedProduct)}%
                  </span>
                  <span className="text-sm text-red-700">Descuento sobre precio sugerido</span>
                </div>
              )}

              <div className="border-t border-gray-100" />

              <div>
                <h4 className="mb-3 flex items-center gap-2 text-base font-bold text-gray-900">
                  <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Detalles
                </h4>
                <div className="space-y-1 rounded-xl bg-gray-50 p-4">
                  <p className="text-sm leading-relaxed text-gray-700">
                    {selectedProduct.name}
                    {selectedProduct.categories?.[0]?.name ? (
                      <> — producto de la categoría <strong>{selectedProduct.categories[0].name}</strong></>
                    ) : null}
                    {selectedProduct.type === 'VARIABLE' && selectedProduct.variations?.length > 0 ? (
                      <> disponible en {selectedProduct.variations.length} presentación{selectedProduct.variations.length > 1 ? 'es' : ''}: {[...new Set(selectedProduct.variations.flatMap((v) => v.attribute_values?.map((av) => av.value) || []))].join(', ')}.</>
                    ) : '.'}
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-3 text-sm">
                    <div>
                      <span className="text-gray-500">Tipo</span>
                      <p className="font-medium text-gray-800">{selectedProduct.type === 'VARIABLE' ? 'Variable' : 'Simple'}</p>
                    </div>
                    {selectedProduct.sku ? (
                      <div>
                        <span className="text-gray-500">SKU</span>
                        <p className="font-medium text-gray-800">{selectedProduct.sku}</p>
                      </div>
                    ) : null}
                    <div>
                      <span className="text-gray-500">ID Dropi</span>
                      <p className="font-medium text-gray-800">#{selectedProduct.id}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Proveedor</span>
                      <p className="font-medium text-gray-800">{selectedProduct.user?.store_name || selectedProduct.user?.name}</p>
                    </div>
                    {selectedProduct.categories && selectedProduct.categories.length > 0 ? (
                      <div className="col-span-2">
                        <span className="text-gray-500">Categorías</span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {selectedProduct.categories.map((c, i) => (
                            <span key={i} className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700">
                              {c.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="mb-3 flex items-center gap-2 text-base font-bold text-gray-900">
                  <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Garantías
                </h4>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm text-amber-800">
                    Este producto está respaldado por Dropi. Ante cualquier novedad con el envío o la calidad del producto, Dropi intermediará con el proveedor para garantizar tu satisfacción.
                  </p>
                  {selectedProduct.user?.plan?.description ? (
                    <div className="mt-2 border-t border-amber-200 pt-2 text-xs text-amber-700">
                      <span className="font-medium">Plan del proveedor:</span> {selectedProduct.user.plan.description}
                    </div>
                  ) : null}
                </div>
              </div>

              {selectedProduct.type === 'VARIABLE' && selectedProduct.variations && selectedProduct.variations.length > 0 && (
                <div>
                  <h4 className="mb-3 text-base font-bold text-gray-900">
                    Variaciones ({selectedProduct.variations.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedProduct.variations.map((v, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
                        <div>
                          <div className="flex gap-2 text-sm font-medium text-gray-800">
                            {v.attribute_values?.map((av, j) => (
                              <span key={j}>{av.value}</span>
                            ))}
                          </div>
                          {v.sku ? <p className="mt-0.5 text-xs text-gray-400">SKU: {v.sku}</p> : null}
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-blue-600">{formatCOP(v.sale_price)}</p>
                          <p className={`text-xs font-medium ${v.stock > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {v.stock > 0 ? `${v.stock} und` : 'Agotado'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => handleImport(selectedProduct.id)}
                disabled={importing === selectedProduct.id}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 text-lg font-bold text-white transition hover:bg-blue-700 disabled:bg-slate-300"
              >
                {importing === selectedProduct.id ? (
                  <>
                    <div className="h-5 w-5 border-2 border-white border-t-transparent animate-spin rounded-full" />
                    Importando...
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                    Importar a mi tienda
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}