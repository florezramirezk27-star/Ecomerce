import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import "@fontsource-variable/inter";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Banner from "@/components/Banner";
import StoreChat from "@/components/chat/StoreChat";
import StorefrontPresence from "@/components/StorefrontPresence";
import FacebookPixel from "@/components/FacebookPixel";
import CookieConsent from "@/components/CookieConsent";

const FALLBACK_ICON = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="%232563eb"/><text x="16" y="24" text-anchor="middle" font-family="Arial,sans-serif" font-weight="bold" font-size="22" fill="white">K</text></svg>';

const API_URL = process.env.API_URL || "http://localhost:3001";

export async function generateMetadata(): Promise<Metadata> {
  let icon = FALLBACK_ICON;
  try {
    const res = await fetch(`${API_URL}/settings/logo`, {
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 60 },
    });
    const data = await res.json();
    if (data.logo) icon = data.logo;
  } catch {}

  return {
    title: "Kronio Market",
    description: "Kronio Market",
    icons: { icon },
  };
}

/**
 * Configuracion de viewport para movil.
 *
 * `viewportFit: "cover"` deja que el contenido llegue hasta los bordes de la
 * pantalla, que es lo que hace falta para que las barras fijas (carrito,
 * checkout, aviso de cookies) puedan usar `env(safe-area-inset-bottom)` y no
 * queden debajo del indicador de inicio del iPhone.
 *
 * `userScalable` se deja en su valor por defecto (true): bloquear el zoom
 * es un problema de accesibilidad y en iOS el zoom por foco en un campo de
 * texto de menos de 16px se evita con el tamano de la fuente, no con esto.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FCD116",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es-CO"
      className={`${GeistMono.variable} antialiased`}
    >
      <body className="flex min-h-dvh flex-col">
        <Navbar />
        <Banner />
        <div className="flex-1">{children}</div>
        {/* El pie va solo en la pagina de inicio, que lo dibuja `app/page.tsx`.
            Estando en el layout raiz salia en todas las paginas y en cada
            una era un bloque enorme de enlaces al final, muy por debajo del
            contenido util. */}
        <StorefrontPresence />
        <StoreChat />
        <FacebookPixel />
        {/* Al final del body: queda por encima en el orden del DOM y es lo
            ultimo que encuentra el tabulador. */}
        <CookieConsent />
      </body>
    </html>
  );
}
