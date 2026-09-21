"use client";

import Link from "next/link";

interface AuthShellProps {
  children: React.ReactNode;
}

const features = [
  {
    title: "Pago contra entrega",
    description: "Pagas solo cuando recibes tu pedido",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Envíos a todo Colombia",
    description: "Llevamos tu pedido hasta la puerta",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4z" />
      </svg>
    ),
  },
  {
    title: "Chat de ventas con IA",
    description: "Resuelve tus dudas al instante",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
];

export default function AuthShell({ children }: AuthShellProps) {
  return (
    <main className="min-h-screen bg-gray-50 lg:grid lg:grid-cols-2">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-blue-700 via-indigo-700 to-violet-800 lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-cyan-400/20 blur-3xl" />

        <div className="relative flex flex-col justify-between p-12 h-full min-h-screen">
          <Link href="/" className="flex items-center gap-3 w-fit">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-xl font-extrabold text-blue-700 shadow-lg">
              K
            </span>
            <span className="text-xl font-bold text-white tracking-tight">
              Kronio Market
            </span>
          </Link>

          <div className="max-w-md space-y-10">
            <h1 className="text-4xl font-extrabold leading-tight text-white tracking-tight">
              Comprar en Colombia{" "}
              <span className="bg-gradient-to-r from-cyan-300 to-blue-300 bg-clip-text text-transparent">
                nunca fue tan fácil
              </span>
            </h1>

            <div className="space-y-5">
              {features.map((f) => (
                <div key={f.title} className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-cyan-300 backdrop-blur">
                    {f.icon}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-white">{f.title}</p>
                    <p className="text-sm text-blue-100/80">{f.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-blue-100/70">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Todos los pagos protegidos · Pago contra entrega
          </div>
        </div>
      </section>

      {/* Form panel */}
      <section className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 flex items-center gap-2 text-gray-500 hover:text-gray-900 transition w-fit">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Volver a la tienda
          </Link>
          {children}
        </div>
      </section>
    </main>
  );
}