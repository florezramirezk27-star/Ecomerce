'use client';

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import ProductCarousel from "@/components/ProductCarousel";
import PromoGrid from "@/components/PromoGrid";
import VideoHero from "@/components/VideoHero";
import Footer from "@/components/Footer";
import {
  Banknote,
  Eye,
  Target,
  Truck,
} from "lucide-react";

interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  price: string | number;
  oldPrice?: string | number | null;
  image: string;
  stock: number;
  lowStockThreshold?: number;
  gallery?: string[];
  description?: string;
  category?: {
    id: string;
    name: string;
    slug: string;
  };
}

export default function Home() {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [data, saleProducts] = await Promise.all([
          apiFetch("/products") as Promise<ProductSummary[]>,
          apiFetch("/products?onSale=true") as Promise<ProductSummary[]>,
        ]);

        console.log("🔥 TODOS:", data);
        console.log("🔥 OFERTAS:", saleProducts);

        setProducts(data);
      } catch (err) {
        console.error("Error al cargar productos:", err);
        setError(
          err instanceof Error
            ? err.message
            : "No se pudieron cargar los productos.",
        );
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const recommended = products.slice(0, 8);
  const promotions = products
    .filter(
      (p) =>
        p.oldPrice !== null &&
        p.oldPrice !== undefined &&
        Number(p.oldPrice) > Number(p.price),
    )
    .sort(
      (a, b) =>
        Number(b.oldPrice) -
        Number(b.price) -
        (Number(a.oldPrice) - Number(a.price)),
    )
    .slice(0, 8);
  const homeProducts = products.filter(
    (p) => p.category?.slug === "hogar-y-decoracion",
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-orange-50 flex items-center justify-center">
        <p className="text-gray-500 text-lg">Cargando productos...</p>
      </main>
    );
  }

  return (
    <>
    <main className="min-h-screen bg-orange-50">
      <VideoHero />
      <div className="max-w-7xl mx-auto px-6 py-12 space-y-12">
        {error ? (
          <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 text-center">
            {error}
          </div>
        ) : (
          <>
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Productos Recomendados
              </h2>
              <ProductCarousel products={recommended} />
            </section>

            {promotions.length > 0 && (
              <PromoGrid products={promotions} />
            )}

            {homeProducts.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">
                  Productos del Hogar
                </h2>
                <ProductCarousel products={homeProducts} />
              </section>
            )}

            {products.length === 0 && (
              <div className="text-center py-20">
                <p className="text-gray-500 text-lg">
                  No hay productos disponibles
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <section className="relative overflow-hidden bg-white">
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-blue-100/50 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-orange-100/50 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-6 py-16 md:py-24">
          {/* Header */}
          <div className="mx-auto mb-14 max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-blue-700">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              Sobre nosotros
            </span>
            <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-gray-900 md:text-4xl">
              Nuestra{" "}
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                raz&oacute;n de ser
              </span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-gray-500">
              Una tienda en l&iacute;nea pensada para todos los colombianos: pagas al
              recibir tu pedido, en cualquier rinc&oacute;n del pa&iacute;s.
            </p>
          </div>

          {/* Images + Misión/Visión */}
          <div className="grid items-center gap-12 lg:grid-cols-2">
            {/* Image collage */}
            <div className="relative mx-auto w-full max-w-xl lg:mx-0">
              <div className="group block overflow-hidden rounded-3xl border border-gray-100 shadow-2xl shadow-gray-200/60">
                <img
                  src="https://aveonline.co/wp-content/uploads/2024/08/IMG_3016.jpeg"
                  alt="Env&iacute;os contra entrega en e-commerce"
                  className="aspect-[4/3] w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>

              <div className="absolute -bottom-10 -right-2 hidden w-44 overflow-hidden rounded-2xl border-4 border-white shadow-xl md:block lg:-right-8">
                <img
                  src="https://images.pexels.com/photos/6699397/pexels-photo-6699397.jpeg?auto=compress&cs=tinysrgb&w=600"
                  alt="Mensajero entregando un paquete"
                  className="aspect-square w-full object-cover transition-transform duration-500 hover:scale-105"
                />
              </div>

              <div className="absolute -top-5 right-1/2 hidden translate-x-1/2 rounded-full bg-white/95 px-4 py-1.5 text-xs font-semibold text-gray-700 shadow-lg shadow-gray-200/50 backdrop-blur md:block lg:right-6 lg:translate-x-0">
                Entrega confiable en todo el pa&iacute;s
              </div>

              <div className="absolute -top-5 left-6 flex items-center gap-3 rounded-2xl border border-gray-100 bg-white/95 px-4 py-3 shadow-lg shadow-gray-200/50 backdrop-blur">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                  <Banknote className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-gray-900">Pago contra entrega</p>
                  <p className="text-xs text-gray-500">No pagas hasta recibir</p>
                </div>
              </div>

              <div className="absolute -bottom-6 left-8 flex items-center gap-3 rounded-2xl border border-gray-100 bg-white/95 px-4 py-3 shadow-lg shadow-gray-200/50 backdrop-blur">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                  <Truck className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-gray-900">Env&iacute;os a todo el pa&iacute;s</p>
                  <p className="text-xs text-gray-500">Hasta la puerta de tu casa</p>
                </div>
              </div>
            </div>

            {/* Misión / Visión */}
            <div className="space-y-6">
              <div className="group relative overflow-hidden rounded-3xl border border-gray-100 bg-gradient-to-br from-blue-50/60 to-white p-8 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-100/60">
                <div className="mb-5 flex items-center gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/25 transition-transform group-hover:scale-105">
                    <Target className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                      Por qu&eacute; existimos
                    </p>
                    <h3 className="text-xl font-bold text-gray-900">Misi&oacute;n</h3>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-gray-600">
                  Democratizar el acceso a productos de calidad en Colombia con un modelo
                  de compra sencillo y de confianza: pago contra entrega, precios justos
                  y entregas oportunas en todo el territorio nacional, sin necesidad de
                  tarjeta ni pagos anticipados.
                </p>
              </div>

              <div className="group relative overflow-hidden rounded-3xl border border-gray-100 bg-gradient-to-br from-indigo-50/60 to-white p-8 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-100/60">
                <div className="mb-5 flex items-center gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 transition-transform group-hover:scale-105">
                    <Eye className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                      A d&oacute;nde vamos
                    </p>
                    <h3 className="text-xl font-bold text-gray-900">Visi&oacute;n</h3>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-gray-600">
                  Ser en 2030 la tienda en l&iacute;nea m&aacute;s confiable de Colombia,
                  reconocida por la cercan&iacute;a con cada comprador, la excelencia en el
                  servicio y la innovaci&oacute;n tecnol&oacute;gica, transformando la forma
                  en que los colombianos compran desde cualquier rinc&oacute;n del pa&iacute;s.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      </main>
      <Footer />
    </>
  );
}
