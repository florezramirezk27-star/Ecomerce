'use client';

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import ProductCarousel from "@/components/ProductCarousel";
import PromoGrid from "@/components/PromoGrid";
import VideoHero from "@/components/VideoHero";
import Footer from "@/components/Footer";

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

      <section className="bg-gradient-to-b from-white to-gray-50 border-t border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-16 md:py-20">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
              Nuestra Raz&oacute;n de Ser
            </h2>
            <p className="text-gray-500 max-w-lg mx-auto">
              Conoce lo que nos impulsa a ofrecerte el mejor servicio cada d&iacute;a.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Misi&oacute;n</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Democratizar el acceso a productos de calidad en Colombia, ofreciendo una
                experiencia de compra en l&iacute;nea segura, r&aacute;pida y confiable.
                Nos comprometemos a conectar a las personas con los mejores productos,
                brindando un servicio excepcional, precios justos y entregas oportunas en
                todo el territorio nacional.
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Visi&oacute;n</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Ser la plataforma de comercio electr&oacute;nico l&iacute;der en Colombia
                para 2030, reconocida por nuestra excelencia en servicio al cliente,
                innovaci&oacute;n tecnol&oacute;gica y compromiso con la satisfacci&oacute;n
                de cada comprador. Aspiramos a transformar la forma en que los colombianos
                compran en l&iacute;nea, creando un ecosistema de confianza que impulse el
                comercio digital en el pa&iacute;s.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
