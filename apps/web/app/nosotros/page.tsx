import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Nosotros | Kronio Market",
  description:
    "Conoce nuestra misión, visión y valores. Kronio Market, tu tienda en línea de confianza en Colombia.",
};

export default function AboutPage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-900 text-white">
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25px 25px, #fff 2px, transparent 0)",
            backgroundSize: "50px 50px",
          }}
        />
        <div className="relative max-w-5xl mx-auto px-4 py-20 md:py-28 text-center">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-4">
            Sobre Kronio Market
          </h1>
          <p className="text-lg md:text-xl text-blue-100 max-w-2xl mx-auto leading-relaxed">
            M&aacute;s que una tienda en l&iacute;nea, somos tu aliado de confianza para
            hacer tus compras m&aacute;s f&aacute;ciles, seguras y agradables desde
            cualquier lugar de Colombia.
          </p>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="max-w-6xl mx-auto px-4 -mt-10 relative z-10">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
            <div className="w-14 h-14 rounded-xl bg-blue-100 flex items-center justify-center mb-5">
              <svg
                className="w-7 h-7 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Misi&oacute;n</h2>
            <p className="text-gray-600 leading-relaxed">
              Democratizar el acceso a productos de calidad en Colombia, ofreciendo una
              experiencia de compra en l&iacute;nea segura, r&aacute;pida y confiable. Nos
              comprometemos a conectar a las personas con los mejores productos, brindando
              un servicio excepcional, precios justos y entregas oportunas en todo el
              territorio nacional.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
            <div className="w-14 h-14 rounded-xl bg-purple-100 flex items-center justify-center mb-5">
              <svg
                className="w-7 h-7 text-purple-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Visi&oacute;n</h2>
            <p className="text-gray-600 leading-relaxed">
              Ser la plataforma de comercio electr&oacute;nico l&iacute;der en Colombia
              para 2030, reconocida por nuestra excelencia en servicio al cliente,
              innovaci&oacute;n tecnol&oacute;gica y compromiso con la satisfacci&oacute;n
              de cada comprador. Aspiramos a transformar la forma en que los colombianos
              compran en l&iacute;nea, creando un ecosistema de confianza que impulse el
              comercio digital en el pa&iacute;s.
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="max-w-6xl mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            Nuestros Valores
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Principios que gu&iacute;an cada decisi&oacute;n y cada interacci&oacute;n
            con nuestros clientes.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <ValueCard
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            }
            title="Confianza"
            description="La base de nuestra relaci&oacute;n con los clientes. Garantizamos transparencia en cada transacci&oacute;n y protegemos tus datos con los m&aacute;s altos est&aacute;ndares de seguridad."
          />
          <ValueCard
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
              />
            }
            title="Calidad"
            description="Seleccionamos cuidadosamente cada producto para asegurarnos de que cumpla con los m&aacute;s altos est&aacute;ndares antes de llegar a tus manos."
          />
          <ValueCard
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            }
            title="Eficiencia"
            description="Optimizamos cada proceso para que recibas tus productos en el menor tiempo posible, con un seguimiento claro desde la compra hasta la entrega."
          />
          <ValueCard
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            }
            title="Innovaci&oacute;n"
            description="Buscamos constantemente nuevas formas de mejorar tu experiencia de compra, adoptando tecnolog&iacute;a de punta para ofrecerte un servicio cada vez mejor."
          />
          <ValueCard
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            }
            title="Compromiso"
            description="Estamos dedicados a tu satisfacci&oacute;n. Cada compra viene respaldada por nuestro equipo de servicio al cliente, listo para ayudarte en lo que necesites."
          />
          <ValueCard
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
              />
            }
            title="Servicio"
            description="Ponemos a las personas en el centro de todo. Te escuchamos, te entendemos y trabajamos para superar tus expectativas en cada interacci&oacute;n."
          />
        </div>
      </section>

      {/* Trust badges */}
      <section className="bg-gray-50 border-t border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">
              &iquest;Por qu&eacute; comprar en Kronio Market?
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              Razones por las que miles de clientes ya conf&iacute;an en nosotros.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <BadgeCard
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              }
              title="Pago Seguro"
              description="Tus datos financieros est&aacute;n protegidos con cifrado SSL de &uacute;ltima generaci&oacute;n."
            />
            <BadgeCard
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              }
              title="Env&iacute;o a Todo Colombia"
              description="Llegamos a cualquier ciudad y municipio del pa&iacute;s con aliados log&iacute;sticos de confianza."
            />
            <BadgeCard
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              }
              title="Devoluciones F&aacute;ciles"
              description="Derecho de retracto de 5 d&iacute;as h&aacute;biles. Si no est&aacute;s satisfecho, te devolvemos tu dinero."
            />
            <BadgeCard
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              }
              title="Soporte Dedicado"
              description="Nuestro equipo de atenci&oacute;n al cliente est&aacute; listo para ayudarte antes, durante y despu&eacute;s de tu compra."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-blue-600 to-indigo-700">
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <h2 className="text-3xl font-bold text-white mb-3">
            &iquest;Listo para empezar a comprar?
          </h2>
          <p className="text-blue-100 mb-8 max-w-lg mx-auto">
            &Uacute;nete a miles de clientes satisfechos. Descubre productos de calidad con
            la confianza que solo Kronio Market te ofrece.
          </p>
          <Link
            href="/products"
            className="inline-block bg-white text-blue-700 font-bold px-8 py-3.5 rounded-xl hover:bg-blue-50 transition shadow-lg hover:shadow-xl"
          >
            Ver productos
          </Link>
        </div>
      </section>
    </main>
  );
}

function ValueCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
      <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center mb-4">
        <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {icon}
        </svg>
      </div>
      <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
    </div>
  );
}

function BadgeCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
        <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {icon}
        </svg>
      </div>
      <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
    </div>
  );
}
