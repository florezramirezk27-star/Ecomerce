'use client';

import { useEffect, useState, useCallback, useSyncExternalStore } from 'react';
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
  categories: { name: string }[];
  warehouse_product: DropiWarehouse[];
  variations: DropiVariation[];
  user: DropiUser;
  description: string | null;
}

const DROPI_CDN = 'https://api.dropi.co/';

function getImageUrl(product: DropiProduct): string | null {
  const main =
    product.gallery?.find((g) => g.main) || product.gallery?.[0];
  if (main?.url) return `${DROPI_CDN}${main.url}`;
  if (main?.urlS3) return `${DROPI_CDN}${main.urlS3}`;
  return null;
}

function formatCOP(price: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

export default function DropiCatalogPage() {
  const router = useRouter();
  const [products, setProducts] = useState<DropiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [userVerified, setUserVerified] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [importing, setImporting] = useState<number | null>(null);
  const [importMsg, setImportMsg] = useState('');
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

  const loadCatalog = useCallback(async (opts?: { q?: string; verified?: boolean; fav?: boolean }) => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (opts?.q) params.set('search', opts.q);
      if (opts?.verified) params.set('userVerified', 'true');
      if (opts?.fav) params.set('favorite', 'true');
      params.set('pageSize', '50');
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
    params.set('pageSize', '50');
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
  }, [userVerified, favorite]);

  useEffect(() => {
    if (checkingAuth) {
      router.replace('/login');
    }
  }, [checkingAuth, router]);

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    loadCatalog({ q: search, verified: userVerified, fav: favorite });
  }

  async function handleImport(dropiProductId: number) {
    const user = getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    setImporting(dropiProductId);
    setImportMsg('');
    try {
      const product = await apiFetch('/dropi/import', {
        method: 'POST',
        body: JSON.stringify({ dropiProductId }),
      });

      setImportMsg(
        `✅ "${product.name}" importado exitosamente`,
      );
    } catch (err) {
      setImportMsg(
        `❌ ${err instanceof Error ? err.message : 'Error al importar'}`,
      );
    } finally {
      setImporting(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">
            Catálogo Dropi
          </h1>
          <p className="text-gray-600 mt-2">
            Explora productos de proveedores Dropi e impórtalos a tu tienda
          </p>
        </div>

        <form
          onSubmit={handleSearch}
          className="mb-4 flex gap-3"
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o ID..."
            className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition"
          >
            Buscar
          </button>
        </form>

        <div className="mb-6 flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={userVerified}
              onChange={(e) => setUserVerified(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">Verificados</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={favorite}
              onChange={(e) => setFavorite(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">Premium</span>
          </label>
        </div>

        {importMsg && (
          <div
            className={`mb-6 p-4 rounded-xl border ${
              importMsg.startsWith('✅')
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {importMsg}
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg">No se encontraron productos</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map((product) => {
              const img = getImageUrl(product);
              return (
                <div
                  key={product.id}
                  className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition cursor-pointer"
                  onClick={() => setSelectedProduct(product)}
                >
                  <div className="aspect-square bg-gray-100 relative overflow-hidden">
                    {img ? (
                      <img
                        src={img}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f3f4f6" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%239ca3af" font-size="12">Sin imagen</text></svg>';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <svg
                          className="w-16 h-16"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                    )}
                    {product.suggested_price && (
                      <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
                        -
                        {Math.round(
                          (1 -
                            product.sale_price /
                              product.suggested_price) *
                            100,
                        )}
                        %
                      </span>
                    )}
                  </div>

                  <div className="p-4">
                    <p className="text-xs text-gray-500 mb-1">
                      {product.user?.store_name ||
                        product.user?.name}
                    </p>
                    <h3 className="font-semibold text-gray-900 text-sm leading-tight mb-2 line-clamp-2">
                      {product.name}
                    </h3>

                    <div className="flex items-baseline gap-2 mb-3">
                      <span className="text-lg font-bold text-blue-600">
                        {formatCOP(product.sale_price)}
                      </span>
                      {product.suggested_price && (
                        <span className="text-sm text-gray-400 line-through">
                          {formatCOP(product.suggested_price)}
                        </span>
                      )}
                    </div>

                    <button
                      onClick={(e) => { e.stopPropagation(); handleImport(product.id); }}
                      disabled={importing === product.id}
                      className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm font-semibold rounded-lg transition flex items-center justify-center gap-2"
                    >
                      {importing === product.id ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Importando...
                        </>
                      ) : (
                        'Importar a tienda'
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedProduct(null)} />
          <div className="relative ml-auto w-full max-w-xl bg-white shadow-2xl h-full overflow-y-auto">
            <div className="sticky top-0 bg-white border-b z-10 flex items-center justify-between px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900 truncate pr-4">
                {selectedProduct.name}
              </h2>
              <button
                onClick={() => setSelectedProduct(null)}
                className="p-2 hover:bg-gray-100 rounded-full shrink-0"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="space-y-3">
                <div className="aspect-square bg-gray-100 rounded-xl overflow-hidden">
                  {(() => {
                    const mainImg = selectedProduct.gallery?.find(g => g.main) || selectedProduct.gallery?.[0];
                    const src = mainImg?.url ? `${DROPI_CDN}${mainImg.url}` : mainImg?.urlS3 ? `${DROPI_CDN}${mainImg.urlS3}` : null;
                    return src ? (
                      <img src={src} alt={selectedProduct.name} className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <svg className="w-20 h-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    );
                  })()}
                </div>
                {selectedProduct.gallery && selectedProduct.gallery.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {selectedProduct.gallery.map((g, i) => {
                      const thumbSrc = g.url ? `${DROPI_CDN}${g.url}` : g.urlS3 ? `${DROPI_CDN}${g.urlS3}` : null;
                      return thumbSrc ? (
                        <div key={i} className="w-16 h-16 rounded-lg overflow-hidden border shrink-0 bg-gray-100">
                          <img src={thumbSrc} alt="" className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                      ) : null;
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-baseline gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold text-gray-900 leading-tight">{selectedProduct.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {selectedProduct.user?.store_name || selectedProduct.user?.name}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-3xl font-bold text-blue-600 block">
                    {formatCOP(selectedProduct.sale_price)}
                  </span>
                  {selectedProduct.suggested_price ? (
                    <span className="text-sm text-gray-400 line-through block">
                      {formatCOP(selectedProduct.suggested_price)}
                    </span>
                  ) : null}
                </div>
              </div>

              {selectedProduct.suggested_price ? (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 flex items-center gap-2">
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
                    -{Math.round((1 - selectedProduct.sale_price / selectedProduct.suggested_price) * 100)}%
                  </span>
                  <span className="text-sm text-red-700">Descuento sobre precio sugerido</span>
                </div>
              ) : null}

              <div className="border-t border-gray-100" />

              <div>
                <h4 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Detalles
                </h4>
                <div className="bg-gray-50 rounded-xl p-4 space-y-1">
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {selectedProduct.name}
                    {selectedProduct.categories?.[0]?.name ? (
                      <> — producto de la categoría <strong>{selectedProduct.categories[0].name}</strong></>
                    ) : null}
                    {selectedProduct.type === 'VARIABLE' && selectedProduct.variations?.length > 0 ? (
                      <> disponible en {selectedProduct.variations.length} presentación{selectedProduct.variations.length > 1 ? 'es' : ''}: {[...new Set(selectedProduct.variations.flatMap(v => v.attribute_values?.map(av => av.value) || []))].join(', ')}.</>
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
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedProduct.categories.map((c, i) => (
                            <span key={i} className="bg-white border border-gray-200 text-gray-700 text-xs px-2 py-0.5 rounded-full">{c.name}</span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Garantías
                </h4>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm text-amber-800">
                    Este producto está respaldado por Dropi. Ante cualquier novedad con el envío o la calidad del producto, Dropi intermediará con el proveedor para garantizar tu satisfacción.
                  </p>
                  {selectedProduct.user?.plan?.description ? (
                    <div className="mt-2 pt-2 border-t border-amber-200 text-xs text-amber-700">
                      <span className="font-medium">Plan del proveedor:</span> {selectedProduct.user.plan.description}
                    </div>
                  ) : null}
                </div>
              </div>

              <div>
                <h4 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Recursos adicionales
                </h4>
                {selectedProduct.gallery && selectedProduct.gallery.length > 1 ? (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600">Imágenes del producto ({selectedProduct.gallery.length})</p>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {selectedProduct.gallery.map((g, i) => {
                        const src = g.url ? `${DROPI_CDN}${g.url}` : g.urlS3 ? `${DROPI_CDN}${g.urlS3}` : null;
                        return src ? (
                          <div key={i} className="w-20 h-20 rounded-lg overflow-hidden border shrink-0 bg-gray-100">
                            <img src={src} alt="" className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No hay recursos adicionales disponibles para este producto.</p>
                )}
              </div>

              <div className="border-t border-gray-100" />

              {selectedProduct.type === 'VARIABLE' && selectedProduct.variations && selectedProduct.variations.length > 0 && (
                <div>
                  <h4 className="text-base font-bold text-gray-900 mb-3">Variaciones ({selectedProduct.variations.length})</h4>
                  <div className="space-y-2">
                    {selectedProduct.variations.map((v, i) => (
                      <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                        <div>
                          <div className="flex gap-2 text-sm font-medium text-gray-800">
                            {v.attribute_values?.map((av, j) => (
                              <span key={j}>{av.value}</span>
                            ))}
                          </div>
                          {v.sku ? <p className="text-xs text-gray-400 mt-0.5">SKU: {v.sku}</p> : null}
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

              <div>
                <h4 className="text-base font-bold text-gray-900 mb-3">Stock en bodegas</h4>
                {selectedProduct.warehouse_product && selectedProduct.warehouse_product.length > 0 ? (
                  <div className="space-y-1">
                    {selectedProduct.warehouse_product.map((w, i) => (
                      <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2 text-sm">
                        <span className="text-gray-600">Bodega #{w.warehouse_id}</span>
                        <span className={`font-semibold ${w.stock > 0 ? 'text-green-600' : 'text-red-600'}`}>{w.stock} und</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-400 text-center">
                    {selectedProduct.type === 'VARIABLE' ? 'El stock se muestra por variación' : 'Sin información de stock'}
                  </div>
                )}
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); handleImport(selectedProduct.id); setSelectedProduct(null); }}
                disabled={importing === selectedProduct.id}
                className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 text-lg"
              >
                {importing === selectedProduct.id ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Importando...
                  </>
                ) : (
                  'Importar a tienda'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
