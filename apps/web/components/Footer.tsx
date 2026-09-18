"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

const SOCIAL = [
  {
    name: "Facebook",
    href: "https://www.facebook.com",
    hover: "hover:bg-[#1877F2]",
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
      </svg>
    ),
  },
  {
    name: "Instagram",
    href: "https://www.instagram.com",
    hover: "hover:bg-gradient-to-tr hover:from-[#F58529] hover:via-[#DD2A7B] hover:to-[#8134AF]",
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 016.11 2.525c.636-.247 1.363-.416 2.427-.465C8.83 2.013 9.175 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" />
      </svg>
    ),
  },
  {
    name: "TikTok",
    href: "https://www.tiktok.com",
    hover: "hover:bg-black",
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
      </svg>
    ),
  },
  {
    name: "WhatsApp",
    href: "https://wa.me/5715551234",
    hover: "hover:bg-[#25D366]",
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
  },
];

const LINKS = {
  tienda: [
    { label: "Inicio", href: "/" },
    { label: "Productos", href: "/products" },
    { label: "Nosotros", href: "/nosotros" },
    { label: "Mis órdenes", href: "/orders" },
    { label: "Carrito", href: "/cart" },
  ],
  ayuda: [
    { label: "Términos y Condiciones", href: "/terminos" },
    { label: "Política de Privacidad", href: "/privacidad" },
    { label: "Derecho de retracto", href: "/terminos#retracto" },
    { label: "Garantías", href: "/terminos#garantia-legal" },
    { label: "Cambios y devoluciones", href: "/terminos#cambios-devoluciones" },
  ],
};

const PAYMENTS = ["Contraentrega", "Efectivo"];

export default function Footer() {
  const [logo, setLogo] = useState<string | null>(null);

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

  return (
    <footer className="bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-16 md:px-10">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
          {/* Brand */}
          <div className="text-center lg:col-span-4 lg:text-left">
            <Link href="/" className="flex items-center justify-center gap-3 lg:justify-start">
              {logo ? (
                <img
                  src={logo}
                  alt="Kronio Market"
                  className="h-12 w-auto max-w-[180px] object-contain rounded-xl"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white shadow-lg shadow-blue-600/20">
                  K
                </div>
              )}
              <span className="text-xl font-bold text-white">Kronio Market</span>
            </Link>
            <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-slate-400 lg:mx-0">
              Tu tienda en l&iacute;nea de confianza en Colombia. Productos de calidad con
              env&iacute;os a todo el pa&iacute;s y compra 100% segura.
            </p>
            <div className="mt-6 flex justify-center gap-3 lg:justify-start">
              {SOCIAL.map((s) => (
                <a
                  key={s.name}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.name}
                  className={`flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition-all hover:-translate-y-0.5 hover:text-white ${s.hover}`}
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Links: Tienda */}
          <div className="text-center lg:col-span-2 lg:text-left">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white">Tienda</h3>
            <ul className="mt-4 space-y-3">
              {LINKS.tienda.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-sm text-slate-400 transition-colors hover:text-blue-400"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Links: Ayuda y legal */}
          <div className="text-center lg:col-span-3 lg:text-left">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
              Informaci&oacute;n legal
            </h3>
            <ul className="mt-4 space-y-3">
              {LINKS.ayuda.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-sm text-slate-400 transition-colors hover:text-blue-400"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="text-center lg:col-span-3 lg:text-left">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white">Contacto</h3>
            <ul className="mt-4 space-y-4">
              <li className="flex items-start justify-center gap-3 lg:justify-start">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <a href="mailto:kroniomarket@gmail.com" className="text-sm text-slate-400 hover:text-blue-400">
                  kroniomarket@gmail.com
                </a>
              </li>
              <li className="flex items-start justify-center gap-3 lg:justify-start">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span className="text-sm text-slate-400">
                  L&iacute;nea de atenci&oacute;n:<br />+57 (1) 555-1234
                </span>
              </li>
              <li className="flex items-start justify-center gap-3 lg:justify-start">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-sm text-slate-400">Bogot&aacute;, Colombia</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Payments + trust */}
        <div className="mt-12 flex flex-col gap-6 border-t border-slate-800 pt-8 text-center md:flex-row md:items-center md:justify-between md:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="mr-2 text-xs font-medium uppercase tracking-wider text-slate-500">
              Medios de pago
            </span>
            {PAYMENTS.map((p) => (
              <span
                key={p}
                className="rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs font-semibold text-slate-300"
              >
                {p}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Compra 100% segura
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              Env&iacute;os a Colombia
            </span>
            <a
              href="https://www.sic.gov.co"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-slate-500 transition-colors hover:text-blue-400"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              SIC &mdash; Protecci&oacute;n al consumidor
            </a>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-slate-800 pt-6 sm:flex-row">
          <p className="text-xs text-slate-500">
            &copy; {new Date().getFullYear()} Kronio Market. Todos los derechos reservados.
          </p>
          <p className="text-xs text-slate-600">
            NIT 000.000.000-0 &middot; Bogot&aacute;, Colombia
          </p>
        </div>
      </div>
    </footer>
  );
}